# AI Interview Prep Kit

Turns a job description, a company URL, and a day count into a personalized, editable
interview prep kit: company research, categorized questions, flashcards, a study
schedule, and a requirement-coverage report.

## Overview

- **Frontend:** Next.js 14 (App Router) + React + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Database:** MongoDB
- **LLM:** any OpenAI-compatible chat-completions endpoint, configured via env vars

## Architecture

```
/
  backend/
    src/
      crawl/       SSRF-safe fetcher, robots.txt, HTML extraction, link ranking, crawler
      llm/         OpenAI-compatible client: retries, backoff, JSON-schema validation
      pipeline/    requirement extraction, company research, question/flashcard gen,
                   role breakdown, public-interview research, dedupe hash, orchestrator
      services/    coverage check, schedule builder, kit validator, edit-state merge
      domain/      zod schemas / types — the single source of truth for the Kit shape
      db/          MongoDB connection, indexes, document types
      auth/        argon2 password hashing, session tokens
      api/         Express routers (auth, kits)
      evaluate.ts  batch evaluator CLI (npm run evaluate)
    tests/         vitest unit + integration tests
  frontend/
    app/           Next.js routes: login, register, dashboard, kits/new, kits/[id], .../practice
    components/    panels for each kit section, generation progress, auth form
    lib/           typed API client, shared types, session hook, debounced-save hook
  examples/cases.json   sample batch-evaluator input
```

## Generation pipeline (20 stages)

`validate input → extract requirements → fetch homepage → clean page → extract links →
rank links → fetch useful pages → discover hiring info → search public interview
discussion → build research context → generate company brief → generate role breakdown →
generate categorized questions → generate flashcards → run coverage check → generate
missing questions → run coverage check again → allocate schedule → validate kit → save.`

Each stage is a separate backend module (see `src/pipeline/orchestrator.ts`). A failure in
one LLM-backed stage (bad JSON, rate limit, timeout) degrades that section to empty rather
than crashing the whole pipeline; a failure in the crawler is recorded per-page in
`crawl.failures` and the pipeline continues.

### Company crawling

Starting from the given company URL, the crawler fetches the homepage, extracts and
ranks same-site links (interview/hiring/careers/engineering/culture/about score highest;
login/legal/asset links are excluded), and follows up to `CRAWL_MAX_PAGES` of the
highest-ranked links — no hardcoded path list. It respects `robots.txt`, per-request
timeouts, exponential backoff on retryable errors, a max response size, and an allowed
content-type list. A page that can't be fetched is recorded in `failures` and the crawl
continues.

### Coverage algorithm (deterministic, no LLM)

`findUncovered(requirements, questions)` returns every requirement ID with zero
questions referencing it — plain code, in `src/services/coverage.ts`.

### Second-pass algorithm

`closeCoverageGaps` re-runs generation only for uncovered requirements, leaves existing
questions untouched, strips any requirement ID the LLM invents, and stops after 3 passes
or once every must-have requirement is covered. The pass count is recorded in
`coverage.passes`.

### Schedule algorithm (deterministic, no LLM)

`buildSchedule` orders questions by (touches a must-have requirement, difficulty,
original order) so hard/high-priority material lands earlier, then splits them into
exactly `days_available` contiguous, near-equal chunks. Days beyond the question count
become review days. Every question ID appears in the schedule exactly once.

### Edit/pinned state model

Every question and flashcard carries an `editState`: `generated` (safe to overwrite),
`edited` (the user changed it — never overwritten by regeneration), or `pinned` (the
user explicitly locked it). Regenerating a question category replaces only that
category's `generated` questions; `edited`/`pinned` ones are kept as-is regardless of
category (`src/services/editState.ts`).

### Practice algorithm

Confidence is stored per flashcard (1 = very weak … 5 = very strong). The practice queue
sorts by lowest confidence first (never-seen cards first), then by staleness, so weak and
overdue cards resurface earlier.

### Public interview research

`src/pipeline/interviewResearch.ts` takes a pluggable search provider. With none
configured (or on a search error) it returns an honest "no reliable public information
was found" note rather than fabricating anything; a real provider can be wired in via the
`InterviewSearchProvider` type.

## Security

- **SSRF:** `src/crawl/urlGuard.ts` resolves every hostname and rejects loopback,
  private (RFC1918/RFC6598), link-local, and unspecified addresses, for both IPv4 and
  IPv6, on the initial request and every redirect hop. Set `ALLOW_PRIVATE_HOSTS=true`
  only for local evaluation/testing, where the evaluator intentionally targets
  `localhost`.
- Only `http`/`https` are allowed; URLs with embedded credentials are rejected.
- Response size, content-type, and duration are all capped; oversized or non-HTML
  responses are rejected without crashing the pipeline.
- Crawled page text is explicitly treated as **untrusted data** in every LLM prompt.
  Lines that look like prompt-injection attempts (e.g. "ignore previous instructions")
  are stripped during extraction (`removeInjectionLines`), and prompts instruct the
  model never to follow instructions found in page content.
- Passwords are hashed with argon2id; sessions are random 256-bit tokens with a Mongo
  TTL index, `httpOnly`/`sameSite=lax` cookies.
- Every kit route is scoped by `{ _id, userId }` — a kit that isn't the caller's returns
  404, so existence isn't leaked.
- Centralized error handler never returns stack traces or internals to the client.

## LLM robustness

All LLM output is parsed as JSON and validated against a zod schema
(`src/llm/client.ts`); malformed JSON, missing fields, or invalid enum/ID values are
caught before they reach the pipeline. 429s and 5xx/timeouts/network errors are retried
with exponential backoff; other errors fail fast. Prompts are scoped per-section — one
call per question category, one for the company brief, etc. — never the whole
application state in a single call.

## Installation

```bash
git clone <this-repo>
cd ai-interview-prep-kit
npm install --workspaces
```

## Environment variables

Backend (`backend/.env`, see `backend/.env.example`):

| Variable | Purpose |
|---|---|
| `LLM_BASE_URL` | Base URL of an OpenAI-compatible `/chat/completions` endpoint |
| `LLM_API_KEY` | API key for that provider |
| `LLM_MODEL` | Model name |
| `MONGODB_URI` | MongoDB connection string |
| `SESSION_SECRET` | Reserved for future signed-cookie use |
| `ALLOW_PRIVATE_HOSTS` | `true` only for local eval/testing with `localhost` company URLs |
| `PORT` | API port (default 4000) |

Frontend (`frontend/.env`, see `frontend/.env.example`):

| Variable | Purpose |
|---|---|
| `BACKEND_URL` | Where the frontend proxies `/api/*` to (default `http://localhost:4000`) |

### LLM setup

Any OpenAI-compatible provider works. Free-tier options: Groq
(`https://api.groq.com/openai/v1`, e.g. `llama-3.3-70b-versatile`), or Google's
Gemini OpenAI-compatible endpoint. Set the three `LLM_*` variables accordingly — no code
changes needed.

### Database setup

Run MongoDB locally (`mongodb://localhost:27017/interview-prep`) or point
`MONGODB_URI` at Atlas or another hosted instance. Indexes (unique email, session TTL,
per-user kit lookup) are created automatically on first connection.

## Local development

```bash
# terminal 1
cd backend && npm run dev      # http://localhost:4000

# terminal 2
cd frontend && npm run dev     # http://localhost:3000, proxies /api to the backend
```

## Testing

```bash
cd backend && npm test         # vitest: coverage, schedule, validation, crawler,
                                # pipeline, edit-state, and API/auth/isolation tests
npm run typecheck              # in backend/ and frontend/
```

`tests/api.test.ts` uses `mongodb-memory-server`, so no external database is required to
run it.

## Batch evaluator

```bash
cd backend
npm run evaluate -- --input ../examples/cases.json --output kits.json
```

Runs every case through the **exact same** `generateKit()` used by the web app, continues
past individual failures, and writes one JSON file:

```json
{ "version": "1.0", "generated_at": "...", "kits": [
  { "id": "case-01", "status": "ok", "kit": { ... }, "error": null }
] }
```

A case that fails to produce a usable kit gets `status: "failed"` with a `{ code,
message }` error and `kit: null`; a partially-researched-but-valid kit is still `"ok"`.

## v2 additions

Beyond the original 20-stage generation pipeline, the kit now includes:

- **Mock interview mode.** Pick any generated question, type (or paste) an answer, and
  get LLM-scored feedback: a 1–5 score, concrete strengths and gaps, what a stronger
  answer would add (not a full rewrite), and a natural interviewer follow-up question.
  Every attempt is saved to the kit's history. The candidate's answer text is treated as
  untrusted input the same way crawled pages are (see Security) — injection-looking
  lines are stripped and the model is told never to follow directives found inside it.
  (`backend/src/pipeline/mockInterview.ts`, `POST/GET /api/kits/:id/mock-interview`)

- **Resume-to-requirement gap analysis.** Paste a resume and get a per-requirement
  report classifying each one as covered / partial / missing, with a paraphrased
  excerpt of supporting evidence and a concrete suggestion for closing the gap. One LLM
  call compares the whole resume against every requirement at once; if it fails, the
  report degrades to an honest "could not be analyzed" entry for the requirements it
  couldn't classify — every requirement still gets exactly one entry. Resume text itself
  is never persisted, only the resulting report. (`backend/src/pipeline/resumeGap.ts`,
  `POST /api/kits/:id/resume-gap`)

- **Real spaced repetition (SM-2).** Flashcard practice now runs the classic SM-2
  algorithm instead of a raw confidence sort: each grade updates an ease factor and
  interval, and the practice queue surfaces whatever is actually due (or never-seen)
  first. The public API still speaks in 1–5 "confidence"; it's mapped onto SM-2's 0–5
  quality scale internally. (`backend/src/services/spacedRepetition.ts`)

- **Background job queue for generation.** `POST /:id/generate` used to block the HTTP
  request for the entire ~20-stage pipeline. It now enqueues the work on a small
  bounded-concurrency in-memory queue and returns `202` immediately; existing
  `stage`/`status` polling via `GET /:id` (or the lighter `GET /:id/generate`) is
  unchanged from the client's point of view. (`backend/src/jobs/queue.ts`) This queue is
  intentionally in-memory and per-process — swap it for a durable queue (BullMQ/Redis,
  SQS, etc.) behind the same two functions for a multi-instance deployment.

- **Multi-provider LLM fallback.** An optional second OpenAI-compatible provider
  (`LLM_FALLBACK_BASE_URL`/`LLM_FALLBACK_API_KEY`/`LLM_FALLBACK_MODEL`) is tried only
  after the primary provider has exhausted its own retries, so a primary-provider outage
  or hard rate-limit degrades a stage rather than failing it outright.
  (`backend/src/llm/client.ts`)

- **Rate limiting.** Kit creation/generation, section regeneration, and the new
  mock-interview/resume-gap endpoints are rate-limited per authenticated user (falling
  back to IP for unauthenticated requests), on top of a coarse global per-IP limit for
  all `/api` routes. (`backend/src/middleware/rateLimit.ts`)

- **Docker + CI.** `docker-compose.yml` runs Mongo, the backend, and the frontend
  together for local or small deployments; `.github/workflows/ci.yml` runs typecheck,
  build, and tests for both workspaces on every push/PR.



## Deployment

- **Backend:** deploy `backend/` as a standard Node service (Render, Fly.io, Railway,
  etc.). Build with `npm run build`, run with `npm start`. Set all backend env vars in
  the platform's secret store — `ALLOW_PRIVATE_HOSTS` should be unset/`false` in
  production. Point `MONGODB_URI` at a managed MongoDB instance.
- **Frontend:** deploy `frontend/` to Vercel or any Node host. Set `BACKEND_URL` to the
  deployed backend's public URL. Cookies are `sameSite=lax`; if frontend and backend are
  on different top-level domains, adjust CORS/cookie settings accordingly (not needed if
  Vercel rewrites keep same-origin).
- Never commit `.env` files; `.env.example` in each workspace documents required keys.
- **Docker:** `docker compose up --build` runs Mongo, backend, and frontend together
  (see `docker-compose.yml`); set `LLM_*` env vars in a `.env` file at the repo root
  before starting, or export them in your shell.

## Known limitations

- The public-interview-research stage ships with no default search provider wired in
  (to avoid a hardcoded, possibly non-free API dependency) — it returns an honest "not
  found" result until a real `InterviewSearchProvider` is plugged in.
- Reordering in the UI uses up/down controls rather than drag-and-drop, for simpler
  keyboard/mobile accessibility.
- No email verification, password reset, or role hierarchy, by design (see spec).
- The evaluator and generation pipeline run sequentially per case; there's no
  parallel-case throttling against LLM rate limits beyond the client's own backoff.
