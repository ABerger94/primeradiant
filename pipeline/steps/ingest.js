// Step 1 — Ingest: the day's news per category (GDELT + Google News) and Polymarket's active markets.
export async function ingest(ctx) {
  const { sources, config, log } = ctx;
  const digest = {};
  for (const category of config.activeCategories) {
    digest[category] = await sources.categoryNews(category);
    log(`ingest: ${category}: ${digest[category].length} items`);
  }
  const markets = await sources.markets();
  log(`ingest: polymarket: ${markets.length} active markets`);
  return { digest, markets };
}

export function digestText(digest, { perCategory = 20 } = {}) {
  return Object.entries(digest)
    .map(([cat, items]) => {
      const lines = items.slice(0, perCategory).map((i) => `- ${i.title} (${i.source || i.via}${i.date ? `, ${i.date}` : ''}) <${i.url}>`);
      return `## ${cat}\n${lines.join('\n') || '- (no items today)'}`;
    })
    .join('\n\n');
}
