// Step 3 — Dedupe: reject candidates that duplicate an open forecast, re-ask a resolved one in
// disguise, or duplicate each other. Lexical screen first, then an LLM check for paraphrases.
import { publicId } from '../../lib/categories.js';
import { jaccard, tokens } from '../../lib/scope.js';
import { S } from '../gemini.js';

export const LEXICAL_THRESHOLD = 0.55;

export async function dedupe(ctx, candidates, existing) {
  const { llm, log } = ctx;
  const rejected = [];
  const kept = [];
  const existingTok = existing.map((e) => ({ ...e, tok: tokens(e.question) }));

  for (const c of candidates) {
    const t = tokens(c.question);
    const hit = existingTok.find((e) => jaccard(t, e.tok) >= LEXICAL_THRESHOLD);
    if (hit) {
      rejected.push({ candidate: c, reasons: [`near-duplicate of ${publicId(hit.id)}`], stage: 'dedupe:lexical' });
      continue;
    }
    const twin = kept.find((k) => jaccard(t, tokens(k.question)) >= LEXICAL_THRESHOLD);
    if (twin) {
      rejected.push({ candidate: c, reasons: ['duplicates another candidate in this batch'], stage: 'dedupe:lexical' });
      continue;
    }
    kept.push(c);
  }
  if (!kept.length || !existing.length) return { passed: kept, rejected };

  const ex = existing
    .slice(-250)
    .map((e) => `${e.id}: ${e.question} (deadline ${e.deadline}, ${e.status})`)
    .join('\n');
  const cs = kept.map((c, i) => `[${i}] ${c.question} (deadline ${c.deadline})`).join('\n');
  const out = await llm.json({
    system:
      'You detect duplicate forecast questions. A candidate is a duplicate if it asks about substantively the same event as an existing question — including a re-ask of a resolved question with new wording, a shifted deadline, or a trivially different threshold. Different events that merely share a topic are NOT duplicates.',
    prompt: `Existing questions (id: question):\n${ex}\n\nCandidates:\n${cs}\n\nFor each candidate return duplicate_of = the existing id, or 0 if it is new.`,
    schema: S.obj({
      results: S.arr(S.obj({ index: S.int(''), duplicate_of: S.int('Existing id or 0'), reason: S.str('') }), ''),
    }),
    temperature: 0,
  });
  const dup = new Map((out.results || []).filter((r) => r.duplicate_of > 0).map((r) => [r.index, r]));
  const passed = [];
  kept.forEach((c, i) => {
    const d = dup.get(i);
    if (d && existing.some((e) => e.id === d.duplicate_of)) {
      rejected.push({ candidate: c, reasons: [`re-asks ${publicId(d.duplicate_of)}: ${d.reason}`], stage: 'dedupe:semantic' });
    } else passed.push(c);
  });
  log(`dedupe: ${passed.length} new, ${rejected.length} duplicates`);
  return { passed, rejected };
}
