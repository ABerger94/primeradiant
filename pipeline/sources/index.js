// Public, free data sources: GDELT DOC 2.0, Google News RSS, Polymarket Gamma API, and plain
// page fetches for resolution sources. Each is failure-tolerant: a dead source shrinks the
// day's ingest, it never crashes the run.
const UA = 'PrimeRadiant/1.0 (forecast record; +https://github.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const CATEGORY_QUERIES = {
  Geopolitics: '(ceasefire OR sanctions OR invasion OR treaty OR summit OR "peace talks" OR election)',
  'US Politics & Policy': '("Supreme Court" OR Congress OR Senate OR "executive order" OR "White House" OR legislation)',
  'Economy & Markets': '("Federal Reserve" OR inflation OR "interest rates" OR recession OR GDP OR tariffs OR unemployment)',
  'Tech & AI': '("artificial intelligence" OR semiconductor OR "AI model" OR antitrust OR SpaceX OR launch)',
  'Climate & Disasters': '(hurricane OR earthquake OR wildfire OR flood OR drought OR "heat wave" OR typhoon)',
  'Public Health': '(outbreak OR measles OR "bird flu" OR H5N1 OR cholera OR "World Health Organization" OR CDC OR vaccine)',
};

const GOOGLE_QUERIES = {
  Geopolitics: 'ceasefire OR sanctions OR summit OR treaty',
  'US Politics & Policy': 'Congress OR "Supreme Court" OR "executive order"',
  'Economy & Markets': '"Federal Reserve" OR inflation OR tariffs OR jobs report',
  'Tech & AI': '"artificial intelligence" OR semiconductor OR "AI regulation"',
  'Climate & Disasters': 'hurricane OR earthquake OR wildfire OR flood',
  'Public Health': 'outbreak OR measles OR "bird flu" OR WHO OR CDC',
};

export function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseRss(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag) => {
      const x = m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return x ? stripHtml(x[1].replace(/<!\[CDATA\[|\]\]>/g, '')) : '';
    };
    items.push({ title: get('title'), url: get('link'), date: get('pubDate'), source: get('source') });
  }
  return items;
}

/** Polymarket Gamma: probability of YES from outcomePrices/outcomes (both JSON strings). */
export function yesPrice(market) {
  try {
    const outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes;
    const prices = (typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices).map(Number);
    const i = outcomes.findIndex((o) => String(o).toLowerCase() === 'yes');
    if (i < 0 || !Number.isFinite(prices[i])) return null;
    return prices[i];
  } catch {
    return null;
  }
}

export function createSources({ fetchImpl = fetch, log = () => {}, gdeltSpacingMs = 5500 } = {}) {
  let lastGdelt = 0;

  async function get(url, { timeout = 20000, accept } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      return await fetchImpl(url, { headers: { 'User-Agent': UA, ...(accept ? { Accept: accept } : {}) }, signal: ctl.signal, redirect: 'follow' });
    } finally {
      clearTimeout(t);
    }
  }

  async function gdelt(query, { timespan = '1d', max = 40 } = {}) {
    const wait = lastGdelt + gdeltSpacingMs - Date.now();
    if (wait > 0) await sleep(wait); // GDELT asks for one request per 5s
    lastGdelt = Date.now();
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`${query} sourcelang:english`)}&mode=ArtList&format=json&sort=HybridRel&maxrecords=${max}&timespan=${timespan}`;
    try {
      const res = await get(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = JSON.parse(await res.text());
      return (data.articles || []).map((a) => ({ title: a.title, url: a.url, date: a.seendate, source: a.domain, via: 'gdelt' }));
    } catch (e) {
      log(`gdelt failed (${query.slice(0, 40)}…): ${e.message}`);
      return [];
    }
  }

  async function googleNews(query, { when = '1d' } = {}) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${when}`)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await get(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseRss(await res.text()).map((i) => ({ ...i, via: 'google-news' }));
    } catch (e) {
      log(`google news failed: ${e.message}`);
      return [];
    }
  }

  return {
    async categoryNews(category, { max = 25 } = {}) {
      const [a, b] = await Promise.all([gdelt(CATEGORY_QUERIES[category]), googleNews(GOOGLE_QUERIES[category])]);
      const seen = new Set();
      const out = [];
      for (const item of [...a, ...b]) {
        const key = (item.title || '').toLowerCase().slice(0, 80);
        if (!item.title || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= max) break;
      }
      return out;
    },

    async search(query, { days = 30 } = {}) {
      const timespan = `${Math.min(90, Math.max(1, Math.ceil(days)))}d`;
      const [a, b] = await Promise.all([
        gdelt(query, { timespan, max: 25 }),
        googleNews(query, { when: `${Math.min(365, Math.ceil(days))}d` }),
      ]);
      return [...a, ...b].slice(0, 30);
    },

    async markets({ pages = 3 } = {}) {
      const out = [];
      for (let p = 0; p < pages; p += 1) {
        const url = `https://gamma-api.polymarket.com/markets?active=true&closed=false&archived=false&limit=100&offset=${p * 100}&order=volume24hr&ascending=false`;
        try {
          const res = await get(url, { accept: 'application/json' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const batch = await res.json();
          out.push(...batch);
          if (batch.length < 100) break;
        } catch (e) {
          log(`polymarket list failed: ${e.message}`);
          break;
        }
      }
      return out
        .filter((m) => yesPrice(m) !== null && m.question)
        .map((m) => ({
          id: String(m.id),
          slug: m.slug,
          question: m.question,
          description: String(m.description || '').slice(0, 600),
          end_date: (m.endDate || '').slice(0, 10),
          yes: yesPrice(m),
          volume: Number(m.volume || 0),
          event_slug: m.events?.[0]?.slug || null,
        }));
    },

    /** Fresh snapshot of one market, taken at lock time. */
    async marketSnapshot(id) {
      const res = await get(`https://gamma-api.polymarket.com/markets/${encodeURIComponent(id)}`, { accept: 'application/json' });
      if (!res.ok) throw new Error(`polymarket ${id}: HTTP ${res.status}`);
      const m = await res.json();
      if (m.closed || m.active === false) throw new Error(`polymarket ${id}: market not active`);
      const yes = yesPrice(m);
      if (yes === null) throw new Error(`polymarket ${id}: no YES price`);
      return { id: String(m.id), slug: m.slug, question: m.question, end_date: (m.endDate || '').slice(0, 10), yes, event_slug: m.events?.[0]?.slug || null };
    },

    async pageText(url, { max = 12000 } = {}) {
      try {
        const res = await get(url, { timeout: 20000 });
        if (!res.ok) return { ok: false, status: res.status, text: '' };
        return { ok: true, status: res.status, text: stripHtml(await res.text()).slice(0, max) };
      } catch (e) {
        return { ok: false, status: 0, text: '', error: e.message };
      }
    },

    async reachable(url) {
      try {
        const res = await get(url, { timeout: 15000 });
        return res.status < 400 || res.status === 403 || res.status === 405; // 403/405: exists, bot-walled
      } catch {
        return false;
      }
    },
  };
}
