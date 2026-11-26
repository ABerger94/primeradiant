import { getDb } from '../lib/db.js';

export function db() {
  return getDb();
}

export function send(res, status, body, { cache = 120 } = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', `public, s-maxage=${cache}, stale-while-revalidate=600`);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

export function handle(fn) {
  return async (req, res) => {
    if (req.method !== 'GET') return send(res, 405, { error: 'read-only' }, { cache: 0 });
    try {
      const url = new URL(req.url, 'http://local');
      await fn(Object.fromEntries(url.searchParams), res);
    } catch (e) {
      console.error(e);
      send(res, 500, { error: 'internal error' }, { cache: 0 });
    }
  };
}
