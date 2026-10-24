# Build Notes

## Task: Orchestrator Gemma 4 & Tiered Evidence Refactor (2026-10-25)

### 1. `orchestrator/config.py`
- Added default model constants:
  - `WRITER_MODEL = os.getenv("WRITER_MODEL", "gemma-4-26b-a4b-it")`
  - `VISION_MODEL = os.getenv("VISION_MODEL", "gemma-4-26b-a4b-it")`
  - `REVIEWER_MODEL = os.getenv("REVIEWER_MODEL", "gemma-4-31b-it")`
- Added configurable timeouts:
  - `WRITER_TIMEOUT = int(os.getenv("WRITER_TIMEOUT", "45"))`
  - `VISION_TIMEOUT = int(os.getenv("VISION_TIMEOUT", "45"))`
  - `REVIEWER_TIMEOUT = int(os.getenv("REVIEWER_TIMEOUT", "70"))`
  - Exported `TIMEOUTS` mapping dictionary and `DEFAULT_MODEL`.

### 2. `orchestrator/llm.py`
- Rewrote `generate` and `generate_stream` with signature:
  `generate(model, system, user, json_schema=None, images=None, temperature=0.2, timeout=...)`
- Maintained backward compatibility for legacy callers calling `generate(system, user)` positionally or via keyword arguments (`generate(system=..., user=...)`).
- Implemented thinking config inspection via `google.genai.types.ThinkingConfig` and `ThinkingLevel.MINIMAL` / `ThinkingLevel.LOW` for writer model.
- Read API keys from `GEMINI_API_KEY`, `gemma_api_key`, `GEMMA_API_KEY`, and `gemma_api_key_2` from environment or `.env` without printing or logging.
- Retries once on 429/500/504 errors with 3-second sleep, raising clean `LLMError`.

### 3. `orchestrator/evidence.py`
- Implemented `build_evidence(query, state=None, web=None, doc=None)` which calls `rag.retrieve.retrieve_tiered(query, state)`.
- Returns flat `EvidenceList` (subclass of `list`) with tagged items:
  - `[C1]..` Constitution of India
  - `[L1]..` Central statutory law
  - `[S1]..` State-specific statutory law
  - `[Q1]..` Authoritative Q&A / Case summaries
  - `[W1]..` Grounded web findings
  - `[D1]..` Uploaded document facts
- Every evidence item preserves: `tag`, `citation`, `text` (truncated to ~1500 chars), `status`, `text_as_on`, `jurisdiction`, and `url`.
- Maintained dict-like accessor compatibility (`evidence["lang"]`, `evidence["any_confident"]`, `evidence["law"]`) to prevent regressions in external scripts.

### 4. `orchestrator/prompt.py`
- Updated `build_prompt(query, state, lang, evidence, any_confident) -> {"system", "user"}`.
- System prompt incorporates all 12 operational guidelines:
  1. Plain language explanation; educational only; not a lawyer.
  2. Grounding to evidence with tags (`[S2]`, etc.); no invented numbers/dates/fees.
  3. No statute text pasting; simple explanations with short quotes.
  4. Practical next steps; clearly labeled non-specific general guidance.
  5. Clear coverage boundary statements.
  6. Hierarchy: State [S] > Central [L] > Constitution [C] > Q&A [Q] / Web [W]; state database gap notice.
  7. Part IV Directive Principles non-justiciability notice.
  8. Statute status warnings and consolidation date mentions.
  9. Untrusted data boundary for Web [W] and Document [D].
  10. Low-confidence fallback to NALSA/DLSA without fabricated numbers.
  11. Language localization (Hindi with English Act/Section names).
  12. Format constraints (direct answer, what law says, what to do next, under ~220 words, disclaimer).
- Preserved `SYSTEM_PROMPT_TEMPLATE` and `format_evidence_block` for API route compatibility.

### 5. `orchestrator/web.py`
- Implemented `web_evidence(query, state, lang) -> {"ok": bool, "findings": str, "sources": [{"title", "url", "domain"}], "latency": float}`.
- Calls `gemma-4-26b-a4b-it` via `orchestrator.llm.generate` with `types.Tool(google_search=types.GoogleSearch())`.
- URLs are taken exclusively from `response.candidates[0].grounding_metadata.grounding_chunks`.
- Filters domains strictly: keeps only `.gov.in`, `.nic.in`, or explicit allowlist (`indiacode.nic.in`, `sci.gov.in`, `egazette.gov.in`, `legislative.gov.in`, `nalsa.gov.in`, `doj.gov.in`, `consumerhelpline.gov.in`, `edaakhil.nic.in`).
- Dropped sources are kept in memory (`LAST_DROPPED_SOURCES`) for debugging only, never included in the output dictionary.
- Hard timeout of 10s enforced; on timeout, error, or empty result returns `ok=False` and empty findings without failing the pipeline.

### 6. `orchestrator/pipeline.py` & Endpoints in `api/main.py`
- Implemented `orchestrator/pipeline.py` with:
  - Semaphore concurrency control (`GENERATION_SEMAPHORE = asyncio.Semaphore(3)`): at most 3 generations run simultaneously.
  - Step 1: Parallel asynchronous retrieval (`retrieve_tiered` + `web_evidence` capped at 10s) using thread executors.
  - Step 2: Evidence synthesis and prompt generation; initial SSE event `sources` emitted immediately before model generation.
  - Step 3: SSE event `token` streaming from `WRITER_MODEL` (`gemma-4-26b-a4b-it`).
  - Step 4: Code-level tag extraction (`[C#]`, `[L#]`, `[S#]`, etc.) mapped to verified source metadata; drops hallucinated tags and records warnings in trace.
  - Step 5: Final SSE event `done` emitting `{answer, sources_cited, trace, any_confident, state, lang, fallback}`.
  - Fallback protocol: If model fails or times out, produces a structured RAG-only answer in code (`fallback=True`).
- Added endpoints in `api/main.py`:
  - `POST /ask`: Server-Sent Events (SSE) via `StreamingResponse` for fetch-based frontend consumption.
  - `POST /ask/sync`: Synchronous endpoint returning the full pipeline response as JSON.
- Preserved existing endpoints (`/api/query`, `/query`, `/retrieve`, `/retrieve/tiered`, `/health`, `/sources`, `/states`, `/`).

### 7. `orchestrator/reviewer.py` & `POST /review`
- Implemented `orchestrator/reviewer.py` using `REVIEWER_MODEL` (`gemma-4-31b-it`) with Pydantic JSON schema (`ReviewSchema`):
  - Output JSON: `{"verdict": "supported|partly_supported|unsupported", "claims": [{"claim", "tag", "supported"}], "missing": [str], "caveat": str}`.
  - Off-critical-path execution: audited answer is checked against verified legal evidence.
  - In-memory SHA-256 caching by `(question, answer hash)` to prevent redundant calls.
  - Enforces a 70s timeout.
- Added endpoint in `api/main.py`:
  - `POST /review`: accepts `{query, answer, evidence_tags?, state?, evidence?}`.
  - Fail-safe design: on any model error, timeout, or exception, catches cleanly and returns HTTP 200 with `{"ok": false, "latency": ...}` so the frontend can hide the verification card gracefully without raising errors.

### 9. Answer Cache, Warm Cache, Demo Startup & Trace Logging
- Implemented `orchestrator/cache.py`:
  - Persistent SHA-1 caching in `cache/answers.json`, keyed by `sha1(normalized query + state + lang)`.
  - Thread-safe memory cache and disk write (`compute_cache_key`, `get_cached_answer`, `set_cached_answer`, `get_cache_count`).
  - Implemented `is_cache_only()` checking env flag `CACHE_ONLY=1`. When active, skips all model calls and streams/returns deterministic code-built RAG excerpts.
  - Implemented `log_request_trace(endpoint, query, trace, extra)` persisting each execution trace to `logs/requests.jsonl` (gitignored).
- Updated `orchestrator/pipeline.py` & `orchestrator/document.py`:
  - Checked answer cache first; on a hit, replays cached answer as SSE events (`sources`, `trace`, `token` in ~40 char chunks with tiny delay, `done` with `"cached": true`).
  - Emits all 6 SSE events: `document`, `sources`, `trace`, `token`, `done`, `error`.
- Created `eval/golden_demo.json`:
  - 11 demo questions: 5 English and 5 Hindi questions for Maharashtra (eviction without notice, cutting water/electricity, salary deductions, unpaid overtime, arrest rights) plus 1 out-of-scope query.
- Created `scripts/warm_cache.py`:
  - Iterates over `eval/golden_demo.json` and fills `cache/answers.json` using `run_pipeline_sync`. Not run during implementation.
- Updated `GET /health` in `api/main.py`:
  - Returns `{"status": "ok", "chunks": ..., "models": {"writer", "vision", "reviewer"}, "cache_entries": ...}`.
- Updated `GET /states` in `api/main.py`:
  - Returns all Indian states with `covered: true` for indexed jurisdictions and `covered: false, note: 'Central law only'` for unindexed states.
- Created `scripts/start_demo.ps1`:
  - Verifies Ollama is responsive on `localhost:11434` and that `bge-m3` model is installed.
  - Starts Uvicorn server: `python -m uvicorn api.main:app --host 0.0.0.0 --port 8000`.
  - Displays reminder to launch Cloudflare tunnel (`cloudflared tunnel --url http://localhost:8000`).

### 10. Frontend Developer Documentation (`docs/API.md`)
- Created comprehensive `docs/API.md` covering all backend endpoints:
  - Documented methods, request bodies, realistic response JSONs, timeouts, and error shapes for `/health`, `/states`, `/retrieve`, `/retrieve/tiered`, `/ask`, `/ask/sync`, `/ask/document`, and `/review`.
  - Documented all 6 SSE event types (`document`, `sources`, `trace`, `token`, `done`, `error`) with example payloads.
  - Provided copy-pasteable JavaScript client using `fetch` + `ReadableStream` handling multiline buffering and SSE line parsing.
  - Provided UI integration recipes for building the State dropdown, calling `/review` off-critical-path, and displaying fallback/confidence badges.
  - Included 10-line UI connection checklist.

### 11. Repo Documentation, Demo Run Guide & Gitignore Refinement
- Updated [README.md](file:///d:/Computer%20Programming/Hackathons/Upcomming/Hacktober/NST%20-%20ADYPU/Legal-Lens/README.md) with architecture diagram, model descriptions, "How to Run the Demo" step-by-step commands (Ollama, `start_demo.ps1`, `cloudflared`, frontend API URL), and an "If Something Breaks" troubleshooting matrix (Ollama down, Gemma timeout, web search fail, tunnel change).
- Updated [files.md](file:///d:/Computer%20Programming/Hackathons/Upcomming/Hacktober/NST%20-%20ADYPU/Legal-Lens/files.md) reflecting all new directories, datasets, orchestrator modules, endpoints, and utilities.
- Added [.env.example](file:///d:/Computer%20Programming/Hackathons/Upcomming/Hacktober/NST%20-%20ADYPU/Legal-Lens/.env.example) containing variable names and placeholders without sensitive keys.
- Verified [.gitignore](file:///d:/Computer%20Programming/Hackathons/Upcomming/Hacktober/NST%20-%20ADYPU/Legal-Lens/.gitignore) properly ignores `.env`, `chroma_db/`, `cache/`, `logs/`, `__pycache__/`, while exempting `.env.example`.
