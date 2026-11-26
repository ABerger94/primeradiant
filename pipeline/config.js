import { CATEGORIES } from '../lib/categories.js';

const list = (s) =>
  String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function loadConfig(env = process.env) {
  const min = Number(env.FORECASTS_PER_DAY_MIN || 3);
  const max = Number(env.FORECASTS_PER_DAY_MAX || 5);
  const disabled = list(env.DISABLED_CATEGORIES);
  return {
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
    geminiMinIntervalMs: Number(env.GEMINI_MIN_INTERVAL_MS || 7000), // free tier ≈ 10 RPM
    perDayMin: min,
    perDayMax: Math.max(min, max),
    candidateMultiplier: Number(env.CANDIDATE_MULTIPLIER || 3),
    disabledCategories: disabled,
    activeCategories: CATEGORIES.filter((c) => !disabled.includes(c)),
    resolutionMode: env.RESOLUTION_MODE === 'review' ? 'review' : 'auto', // auto applies high-confidence YES/NO only
    earlyChecksPerRun: Number(env.EARLY_CHECKS_PER_RUN || 4),
    marketDeadlineToleranceDays: Number(env.MARKET_DEADLINE_TOLERANCE_DAYS || 3),
    // Void-rate guard: a category whose recent resolutions void too often stops drafting.
    voidGuardWindow: Number(env.VOID_GUARD_WINDOW || 20),
    voidGuardMaxRate: Number(env.VOID_GUARD_MAX_RATE || 0.2),
  };
}
