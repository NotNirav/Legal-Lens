# Legal Lens — Repository Files & Architecture Directory

This document provides a comprehensive structural directory and description of all files, datasets, scripts, and modules in the **Legal Lens** repository. It reflects the unified data hub architecture, production RAG pipeline, FastAPI REST service, Gemma 4 answer assembly layer, caching and document vision subsystems, and state rules catalog.

---

## 🌳 Repository Tree Structure

```text
Legal-Lens/
├── README.md                                       # Master repository documentation & architecture overview
├── files.md                                        # Master repository file index & architectural catalog (this file)
├── state rules.md                                  # State-wise guide to important statutory laws & rules across all 28 Indian States
├── requirements.txt                                # Python runtime dependencies
├── .env.example                                    # Environment variable template with variable names only
├── LICENSE                                         # MIT open-source license
├── .gitignore                                      # Git ignore rules (chroma_db/, cache/, logs/, pycache, .env)
│
├── api/                                            # REST API Service (FastAPI)
│   ├── __init__.py                                 # Package export
│   └── main.py                                     # FastAPI application routes (/health, /states, /retrieve, /ask, /review, etc.)
│
├── docs/                                           # Project Technical Documentation
│   ├── API.md                                      # Comprehensive frontend API integration guide & SSE reader
│   └── BUILD_NOTES.md                              # Chronological engineering log, assumptions & implementation notes
│
├── orchestrator/                                   # Answer Assembly & Reasoning Layer (Gemma 4)
│   ├── __init__.py                                 # Package export
│   ├── config.py                                   # Model constants (WRITER_MODEL, VISION_MODEL, REVIEWER_MODEL) & timeouts
│   ├── llm.py                                      # Google GenAI wrapper with streaming, retry, and thinking level control
│   ├── evidence.py                                 # Multi-tiered evidence aggregator & [C#],[L#],[S#],[Q#],[W#],[D#] tagger
│   ├── prompt.py                                   # Grounded prompt builder enforcing 12 core anti-hallucination rules
│   ├── web.py                                      # Official Google Search grounding with .gov.in/.nic.in domain filtering
│   ├── pipeline.py                                 # Core async streaming pipeline (/ask, /ask/sync) with semaphore & cache
│   ├── reviewer.py                                 # Off-critical-path claim auditor using REVIEWER_MODEL (Gemma 4 31B)
│   ├── document.py                                 # Multimodal legal document parser (JPG/PNG/WEBP) with VISION_MODEL
│   ├── cache.py                                    # Persistent answer caching (cache/answers.json) & trace logger (logs/requests.jsonl)
│   └── show_prompt.py                              # Benchmark prompt demonstration CLI (no LLM calls)
│
├── rag/                                            # Core Hybrid RAG Retrieval & Ingestion Pipeline
│   ├── __init__.py                                 # Package export for retrieve function
│   ├── ingest.py                                   # Batch embedding (Ollama bge-m3) & ChromaDB upsert
│   └── retrieve.py                                 # Hybrid search (Dense Vector + BM25 + 2x RRF + Section Collapsing)
│
├── eval/                                           # Retrieval Evaluation & Benchmarking
│   ├── questions.jsonl                             # 28 benchmark evaluation questions (14 EN, 12 HI, 2 Out-of-Scope)
│   ├── golden_demo.json                            # 11 golden demo questions (5 EN, 5 HI for Maharashtra + 1 out-of-scope)
│   └── run_eval.py                                 # Automated Hit@1/3/5 metrics & threshold evaluator
│
├── legal_rights_extraction/                        # Supreme Court Legal Rights Extraction Pipeline
│   ├── demo.py                                     # Interactive demo script for Supreme Court extraction
│   ├── extract_legal_qa.py                         # Parser extracting ratio decidendi & Q&A pairs from court decisions
│   └── search_qa.py                                # Keyword / semantic search CLI over extracted legal Q&As
│
├── data/                                           # Unified Legal Data Hub
│   ├── README.md                                   # Documentation for data hub, schemas & ingestion guides
│   │
│   ├── source/                                     # Source Materials & Reference Texts ("just data")
│   │   ├── raw/                                    # Master source files & raw extractions
│   │   │   ├── Indian Constitution.pdf             # Official Ministry of Law & Justice pocket edition (PDF)
│   │   │   ├── COI.json                            # Master hierarchical structured JSON tree of the Constitution
│   │   │   └── constitution_chunks.jsonl           # 519 raw extracted intermediate chunk records
│   │   │
│   │   └── markdown/                               # Verbatim statutory & constitutional markdown
│   │       ├── constitution_of_india.md            # Complete single-file formatted text of the Constitution
│   │       ├── 01_central_acts.md                  # Primary Parliamentary Acts (IRC 2020, RERA 2016)
│   │       ├── 02_rules_regulations.md             # Central Subordinate Legislation (Code on Wages Rules 2026)
│   │       ├── 03_state_laws.md                    # State & Tenancy Laws (Maharashtra Rent Control Act 1999)
│   │       └── 04_amendments_metadata.md           # Master Central Acts Directory (Acts 1 to 891) & Status
│   │
│   ├── processed/                                  # Production RAG-Indexed Datasets (Final Output)
│   │   ├── constitution.jsonl                      # 519 normalized constitutional records (475 indexed)
│   │   └── acts.jsonl                              # 218 normalized statutory records (123 indexed)
│   │
│   └── extracted_qa/                               # Extracted Court Decisions Q&A Corpus (Final Output)
│       ├── legal_qa_dataset.jsonl                  # 1,104 verified Supreme Court Q&A pairs (canonical JSONL)
│       ├── dataset_summary.json                    # Metadata aggregate summary and domain distribution
│       └── README.md                               # Court decisions Q&A dataset documentation
│
└── scripts/                                        # Processing, Benchmarking & Utility Scripts
    ├── normalize.py                                # Raw chunk cleaner, schema validator, heading leak repairer
    ├── latency_test.py                             # Gemma 4 latency benchmark (streaming TTFT vs thinking)
    ├── smoke_gemma.py                              # 6-point Gemma capability smoke test harness
    ├── test_web.py                                 # Grounded web search & domain allowlist test suite
    ├── test_retrieval.py                           # CLI evaluation script for 9 standard user queries
    ├── warm_cache.py                               # Pre-generates and caches answers for eval/golden_demo.json
    └── start_demo.ps1                              # Demonstration startup script (Ollama check, uvicorn, tunnel reminder)
```

---

## 📄 File Details & Functional Descriptions

### 1. Root Configuration & Documentation

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`README.md`** | ~20 KB | ~450 | Master project documentation featuring overview, system architecture diagram, benchmark metrics, demo quickstart instructions, and troubleshooting matrix. |
| **`files.md`** | ~22 KB | ~250 | Master architectural file indexing all directories, files, schemas, and pipeline responsibilities (this file). |
| **`state rules.md`** | ~91 KB | 2,387 | Comprehensive state-by-state compendium detailing key statutory acts, tenancy rules, municipal powers, and transport regulations across all 28 Indian States. |
| **`.env.example`** | ~500 B | ~20 | Environment variable template with variable names only (`GEMINI_API_KEY`, model names, timeouts, `CACHE_ONLY`, `NEXT_PUBLIC_API_URL`). |
| **`.gitignore`** | ~450 B | ~38 | Excludes local vector storage (`chroma_db/`), persistent cache (`cache/`), logs (`logs/`), Python bytecode caches (`__pycache__/`, `*.pyc`), and private environment configurations (`.env`). |
| **`LICENSE`** | 1.08 KB | 21 | Open-source MIT software license governing usage of the Legal Lens application and data utilities. |
| **`requirements.txt`** | ~180 B | 10 | Declares core Python runtime dependencies: `chromadb`, `requests`, `tqdm`, `rank_bm25`, `fastapi`, `uvicorn`, `google-genai`, `pillow`, `pydantic`. |

---

### 2. Documentation Suite (`docs/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`docs/API.md`** | ~17 KB | ~430 | Complete frontend API specification for `/health`, `/states`, `/retrieve`, `/retrieve/tiered`, `/ask`, `/ask/sync`, `/ask/document`, and `/review`. Documents all 6 SSE event types (`document`, `sources`, `trace`, `token`, `done`, `error`) and includes a copy-pasteable JavaScript reader. |
| **`docs/BUILD_NOTES.md`** | ~8 KB | ~120 | Chronological engineering log documenting architectural decisions, model configurations, RAG fallbacks, and integration notes. |

---

### 3. REST API Service (`api/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`api/__init__.py`** | 47 B | 3 | Package export for the REST API module. |
| **`api/main.py`** | ~22 KB | ~540 | Production FastAPI service exposing health monitoring, jurisdiction metadata with coverage flags, hybrid retrieval, streaming Server-Sent Events guidance (`/ask`), multimodal document analysis (`/ask/document`), and post-generation review (`/review`). Equipped with open CORS. |

---

### 4. Answer Assembly & Orchestrator (`orchestrator/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`orchestrator/__init__.py`** | 270 B | 10 | Package export for answer assembly modules. |
| **`orchestrator/config.py`** | 1.8 KB | 52 | Model constants (`WRITER_MODEL`, `VISION_MODEL`, `REVIEWER_MODEL`) and configurable timeouts (45s, 45s, 70s). |
| **`orchestrator/llm.py`** | 7.2 KB | 215 | Lightweight wrapper around `google-genai` SDK with retry logic on 429/500/503/504, minimal thinking level control, tool calling, and multimodal image support. |
| **`orchestrator/evidence.py`** | 7.5 KB | 225 | Tiered retrieval aggregator and formatter. Tags citations as `[C#]` (Constitution), `[L#]` (Central), `[S#]` (State), `[Q#]` (QA), `[W#]` (Web), and `[D#]` (Document). |
| **`orchestrator/prompt.py`** | 8.5 KB | 172 | System prompt generator implementing 12 strict anti-hallucination, grounding, and formatting guidelines. |
| **`orchestrator/web.py`** | 7.4 KB | 227 | Grounded web search using Gemma 4 with Google Search tool. Reads URLs exclusively from grounding metadata and filters to `.gov.in`/`.nic.in` domains with a 10s hard timeout. |
| **`orchestrator/pipeline.py`** | ~17 KB | ~440 | Core async pipeline coordinating parallel retrieval + web search, semaphore concurrency control (max 3), token streaming, tag extraction, RAG-only fallback, and SHA-1 caching. |
| **`orchestrator/reviewer.py`** | 6.8 KB | 185 | Off-critical-path claim auditor using `REVIEWER_MODEL` (`gemma-4-31b-it`) and JSON schema. Returns `{ok: false}` gracefully on any timeout or failure without crashing. |
| **`orchestrator/document.py`** | ~17 KB | ~430 | Multimodal document vision analyzer. Resizes images (max 1600px), extracts legal metadata into `[D1]`.. evidence items using `VISION_MODEL`, and streams SSE guidance. |
| **`orchestrator/cache.py`** | 4.8 KB | 162 | SHA-1 answer caching (`cache/answers.json`) with `CACHE_ONLY=1` support, and execution trace logging (`logs/requests.jsonl`). |
| **`orchestrator/show_prompt.py`** | 3.1 KB | 87 | Benchmark prompt demonstration CLI (no model calls). |

---

### 5. RAG Retrieval & Ingestion Pipeline (`rag/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`rag/__init__.py`** | 300 B | 10 | Package initialization exposing `retrieve` and `retrieve_tiered`. |
| **`rag/ingest.py`** | 14.0 KB | 404 | Vector database ingestion script. Embeds `data/processed/*.jsonl` using local Ollama `bge-m3` in batches of 16 into ChromaDB. |
| **`rag/retrieve.py`** | 24.7 KB | 655 | **Hybrid Retrieval Engine**. Combines dense vector retrieval (`bge-m3`), sparse keyword retrieval (BM25), 2x RRF weighting, citation boosting, and section collapsing. |

---

### 6. Evaluation Benchmark (`eval/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`eval/questions.jsonl`** | 6.3 KB | 28 | Benchmark dataset containing 28 test questions: 14 English in-scope, 12 Hindi in-scope, and 2 out-of-scope layperson queries. |
| **`eval/golden_demo.json`** | 3.2 KB | 78 | 11 golden demo questions (5 English, 5 Hindi for Maharashtra covering eviction, utility cutting, salary deductions, unpaid overtime, arrest rights; plus 1 out-of-scope query). |
| **`eval/run_eval.py`** | 9.2 KB | 217 | Automated evaluation harness measuring Hit@1, Hit@3, and Hit@5 metrics overall and per language. |

---

### 7. Legal Rights Extraction Engine (`legal_rights_extraction/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`legal_rights_extraction/extract_legal_qa.py`** | 22.5 KB | 468 | Automated NLP extraction engine extracting ratio decidendi and Q&A pairs from Supreme Court decisions. |
| **`legal_rights_extraction/demo.py`** | 2.9 KB | 70 | Interactive demo workflow downloading test splits and producing Q&A pairs into `data/extracted_qa/`. |
| **`legal_rights_extraction/search_qa.py`** | 3.2 KB | 87 | Fast keyword and semantic search CLI over the extracted case law dataset. |

---

### 8. Unified Legal Data Hub (`data/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`data/source/raw/Indian Constitution.pdf`** | 2.41 MB | 29,974 | Official Ministry of Law & Justice pocket edition source PDF (402 pages). |
| **`data/source/raw/COI.json`** | 1.55 MB | 12,637 | Complete structured JSON tree of the Constitution: Preamble, 25 Parts, 23 Chapters, 503 Articles, 12 Schedules. |
| **`data/source/raw/constitution_chunks.jsonl`** | 2.64 MB | 519 | Raw intermediate RAG chunks extracted from the official PDF. |
| **`data/source/markdown/constitution_of_india.md`** | 928 KB | 17,754 | Master single-file Markdown document containing the complete constitutional text. |
| **`data/source/markdown/01_central_acts.md`** | 359 KB | 3,577 | Complete verbatim text of primary Parliamentary Central Acts (IRC 2020, RERA 2016). |
| **`data/source/markdown/02_rules_regulations.md`** | 142 KB | 2,120 | Central subordinate legislation (Code on Wages Central Rules, E-Commerce Consumer Rules). |
| **`data/source/markdown/03_state_laws.md`** | 307 KB | 3,386 | Major State enactments: The Maharashtra Rent Control Act, 1999 and MOFA, 1963. |
| **`data/source/markdown/04_amendments_metadata.md`** | 77.8 KB | 1,027 | Master reference index of 891 Central Acts (Act No., Year, Enactment Date, Status, Repeals). |
| **`data/processed/constitution.jsonl`** | 1.35 MB | 519 | Production Constitutional Corpus normalized by `scripts/normalize.py` (475 indexed). |
| **`data/processed/acts.jsonl`** | 485 KB | 218 | Production Statutory Corpus normalized by `scripts/normalize.py` (123 indexed). |
| **`data/extracted_qa/legal_qa_dataset.jsonl`** | 1.52 MB | 1,104 | Master structured JSON Lines file of 1,104 verified Supreme Court Q&A pairs. |
| **`data/extracted_qa/dataset_summary.json`** | 810 B | 23 | JSON summary detailing aggregate corpus statistics and domain distribution. |
| **`data/extracted_qa/README.md`** | 3.18 KB | 78 | Documentation for the court decisions Q&A dataset. |

---

### 9. Scripts & Utilities (`scripts/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`scripts/normalize.py`** | 52.9 KB | 1,308 | Normalization and cleaning pipeline. Converts raw markdown files into canonical RAG schema. |
| **`scripts/warm_cache.py`** | 3.4 KB | 95 | Pre-generates and caches answers for all 11 golden demo questions in `eval/golden_demo.json`. |
| **`scripts/start_demo.ps1`** | 1.8 KB | 52 | Demo startup PowerShell script performing Ollama and `bge-m3` checks, starting Uvicorn, and printing Cloudflare tunnel reminder. |
| **`scripts/latency_test.py`** | 7.2 KB | 187 | Latency benchmark running 3 iterations across Non-streaming, Streaming (TTFT), and Minimal Thinking. |
| **`scripts/smoke_gemma.py`** | 15.2 KB | 375 | 6-point Gemma capability smoke test harness testing English, Hindi, image reading, JSON, tool calling, and search grounding. |
| **`scripts/test_web.py`** | 4.4 KB | 107 | Grounded web search test harness testing 10s hard timeout enforcement and domain allowlist filtering. |
| **`scripts/test_retrieval.py`** | 1.96 KB | 58 | Lightweight test script running 9 benchmark queries across English, Hindi, and layperson phrasing. |
