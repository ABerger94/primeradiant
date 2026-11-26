# Prime Radiant

*AI forecasting, run like psychohistory: predictions about systems, locked in public, scored without mercy.*

The product is the record. Every forecast is locked at publication, timestamped, uneditable, and scored in public — wins and losses both. Three lanes price the same questions: **the Forecaster** (Gemini, base rate first), **the Market** (Polymarket, snapshotted at the lock), and **the Actuary** (the reference-class base rate, computed in code).

Categories: Geopolitics · US Politics & Policy · Economy & Markets · Tech & AI · Climate & Disasters · **Public Health**.

## Layout

| Path | What it is |
|---|---|
| `lib/` | Shared core: categories, scope rules, Brier/calibration/head-to-head scoring, Actuary math, schema, hash lock |
| `pipeline/` | The engine room. `run.js` is the daily pipeline; `steps/` holds one file per stage; `cli/` holds the human tools |
| `api/` | Vercel serverless functions. Read-only |
| `src/` | React + Vite + Tailwind site: Today, The Vault, Scoreboard, Resolved, The Mule, Method, forecast pages |
| `test/` | `npm test`: scoring, scope, immutability, hash chain, and an end-to-end pipeline run with a fake Gemini |

## How the record stays honest

- **The database refuses edits.** SQLite triggers abort any `UPDATE` or `DELETE` on `forecasts`, `resolutions`, `notes` and `mule_entries`. Corrections go in as new, dated notes.
- **Hash chain.** Each forecast's locked fields are hashed with SHA-256, and each hash is chained to the previous one. `npm run verify` (or `npm run verify -- https://<site>/api/export`) recomputes them all.
- **Resolutions can't come before the lock**, and each forecast resolves once.
- **Scores are never stored.** Every number on the scoreboard is recomputed from the records on each request.
- **The Forecaster never sees the market price.** The Actuary's number comes from code, not from the model.

## The daily pipeline (`npm run pipeline`)

1. **Ingest**: news per category from the GDELT DOC API and Google News RSS, plus Polymarket's active markets.
2. **Draft**: Gemini proposes about 3× the day's open slots. Each candidate must pass the scope rules in code (`lib/scope.js`) *and* a separate strict LLM review. Then both its resolution-source URL and its base-rate URL must be reachable.
3. **Dedupe**: a word-overlap screen, then an LLM check for re-asks in disguise.
4. **Price**: the Forecaster call is structured so it has to go reference class → base rate → for and against → probability, and it is rejected if it skips a step. The Actuary computes `proportion`, or `1 − e^(−rate·days/365)` for an event rate. A Polymarket match counts only when it is the same event, threshold and deadline (within 3 days).
5. **Publish**: picks a spread of categories and deadline horizons, snapshots the market price, stamps the time, hashes, and writes. That write is the lock.
6. **Resolution sweep**: checks every forecast past its deadline, plus a few early ones. High-confidence YES/NO with an evidence link is applied automatically (`RESOLUTION_MODE=auto`). Everything else, every void, and any NO before the deadline waits for review.
7. **Mule watch**: flags major events that no forecast touched.

It holds 3–5 forecasts a day. Re-running the same day won't go over the cap, and if fewer candidates pass, fewer publish. A category whose recent resolutions void more than 20% of the time stops drafting automatically. That is the quality gate for Public Health and every other category.

Gemini usage is roughly 15–25 calls a day, spaced to fit the free tier.

### Human tools

```bash
npm run resolve -- list                       # pending resolution proposals
npm run resolve -- approve 12                 # apply proposal #12 (method: reviewed)
npm run resolve -- reject 12
npm run resolve -- manual PR-0007 no --evidence https://… --explanation "…"
npm run note -- PR-0007 "Source page moved to …"   # dated correction; the record is untouched
npm run mule -- list | publish 3 | dismiss 3  # Gemini drafts the post-mortem unless --postmortem "…"
npm run verify
```

## Setup

```bash
npm install
cp .env.example .env            # fill in Turso + Gemini
npm run db:migrate
npm run pipeline:dry            # full run, writes nothing
npm run pipeline
npm run dev                     # site at localhost:5173; /api served from the same handlers Vercel uses
```

Local UI work without real data: `npm run seed:demo && TURSO_DATABASE_URL=file:demo.db npm run dev`. The seed only ever writes to `demo.db`, and every record in it is labelled `[DEMO]`.

**Turso**: `turso db create prime-radiant`. For Vercel, make a read-only token with `turso db tokens create prime-radiant --read-only`. Give the pipeline a full-access token.

**Vercel**: import the repo. The framework is detected as Vite. Set `TURSO_DATABASE_URL` and the read-only `TURSO_AUTH_TOKEN`.

**Scheduling**: Milk runs `npm run pipeline` once a day with the pipeline environment. `.github/workflows/daily.yml` is a fallback scheduler: add the three secrets to use it, or disable it if Milk owns the schedule.

**Unlisted by default**: `robots.txt` disallows everything, plus there's a `noindex` meta tag and an `X-Robots-Tag` header. To go public, remove all three.
