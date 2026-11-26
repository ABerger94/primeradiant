import { getDb, migrate } from '../lib/db.js';
import { loadConfig } from './config.js';
import { createGemini } from './gemini.js';
import { createSources } from './sources/index.js';

export function log(...a) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
}

export async function createContext({ dryRun = false, needLlm = true } = {}) {
  const config = loadConfig();
  const db = getDb();
  await migrate(db);
  const llm = needLlm
    ? createGemini({ apiKey: config.geminiApiKey, model: config.geminiModel, minIntervalMs: config.geminiMinIntervalMs, log })
    : null;
  return { db, llm, sources: createSources({ log }), config, log, now: new Date(), dryRun };
}
