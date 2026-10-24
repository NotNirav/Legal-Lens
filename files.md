# Legal Lens — Repository Files & Architecture Directory

This document provides a comprehensive structural directory and description of all files, datasets, scripts, and modules in the **Legal Lens** repository. It reflects the unified data hub architecture, production RAG pipeline, FastAPI REST service, Gemma 4 answer assembly layer, and Supreme Court legal rights extraction tools.

---

## 🌳 Repository Tree Structure

```text
Legal-Lens/
├── README.md                                       # Master repository documentation & architecture overview
├── files.md                                        # Master repository file index & architectural catalog
├── requirements.txt                                # Python runtime dependencies
├── LICENSE                                         # MIT open-source license
├── .gitignore                                      # Git ignore rules (chroma_db, pycache, .env, parquet)
│
├── api/                                            # REST API Service (FastAPI)
│   ├── __init__.py                                 # Package export
│   └── main.py                                     # FastAPI app (/health, /sources, /retrieve), CORS & fail-safes
│
├── orchestrator/                                   # Answer Assembly & Reasoning Layer
│   ├── __init__.py                                 # Package export
│   ├── evidence.py                                 # Evidence aggregator, Devanagari language detector, [L#] tagger
│   ├── prompt.py                                   # Grounded prompt builder, anti-hallucination rules, fallback logic
│   ├── llm.py                                      # Gemma 4 LLM client (streaming, retry, thinking level control)
│   ├── web.py                                      # Official Google Search grounding (.gov.in/.nic.in allowlist)
│   └── show_prompt.py                              # Benchmark prompt demonstration CLI (no LLM calls)
│
├── rag/                                            # Core Hybrid RAG Retrieval & Ingestion Pipeline
│   ├── __init__.py                                 # Package export for retrieve function
│   ├── ingest.py                                   # Batch embedding (Ollama bge-m3) & ChromaDB upsert
│   └── retrieve.py                                 # Hybrid search (Dense Vector + BM25 + 2x RRF + Section Collapsing)
│
├── eval/                                           # Retrieval Evaluation & Benchmarking
│   ├── questions.jsonl                             # 28 benchmark evaluation questions (14 EN, 12 HI, 2 Out-of-Scope)
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
    └── test_retrieval.py                           # CLI evaluation script for 9 standard user queries
```

---

## 📄 File Details & Functional Descriptions

### 1. Root Configuration & Dependencies

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`README.md`** | 17.7 KB | 385 | Master project documentation featuring overview, system architecture diagram, benchmark metrics, quickstart instructions, and schema definitions. |
| **`.gitignore`** | 313 B | 29 | Excludes local vector storage (`chroma_db/`), large raw datasets (`*.parquet`), Python bytecode caches (`__pycache__/`, `*.pyc`), environment configurations (`.env`), and IDE settings. |
| **`LICENSE`** | 1.08 KB | 21 | Open-source MIT software license governing usage of the Legal Lens application and data utilities. |
| **`requirements.txt`** | 116 B | 7 | Declares core Python runtime dependencies: `chromadb>=1.5.0`, `requests>=2.31.0`, `tqdm>=4.66.0`, `rank_bm25>=0.2.2`, `fastapi>=0.110.0`, `uvicorn>=0.28.0`, and `google-genai>=1.0.0`. |
| **`files.md`** | ~20 KB | ~200 | Current master architectural file indexing all directories, files, schemas, and pipeline responsibilities. |

---

### 2. REST API Service (`api/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`api/__init__.py`** | 47 B | 3 | Package export for the REST API module. |
| **`api/main.py`** | 5.6 KB | 171 | Production FastAPI service exposing `/health`, `/sources`, and `/retrieve` endpoints. Features CORS middleware, graceful Ollama error handling, and multi-part section collapsing. |

---

### 3. Answer Assembly & Orchestrator (`orchestrator/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`orchestrator/__init__.py`** | 270 B | 10 | Package export for answer assembly modules (`build_evidence`, `build_prompt`, `generate`, `generate_stream`, `web_evidence`). |
| **`orchestrator/evidence.py`** | 3.5 KB | 104 | Aggregates legal retrieval chunks, tags evidence with `[L1]..[L5]`, detects query language (Devanagari ratio > 0.3), and calculates confidence flags without making LLM calls. |
| **`orchestrator/prompt.py`** | 8.5 KB | 172 | Constructs strictly grounded system and user prompts enforcing evidence hierarchy (LAW > QA > WEB), Part IV directive principles guidance, and low-confidence fallback. |
| **`orchestrator/llm.py`** | 5.8 KB | 198 | Lightweight wrapper around `google-genai` SDK for model `gemma-4-26b-a4b-it`, reading `GEMINI_API_KEY` from `.env` without printing. Implements `generate`, `generate_stream`, single retry on 429/500/504 with 3s pause, and clean `LLMError`. |
| **`orchestrator/web.py`** | 7.4 KB | 227 | Grounded web evidence module querying `gemma-4-26b-a4b-it` with Google Search tool. Reads URLs exclusively from grounding metadata, filters sources to `.gov.in`, `.nic.in` and allowlist, logs dropped sources, and enforces 10s hard timeout. |
| **`orchestrator/show_prompt.py`** | 3.1 KB | 87 | CLI demonstration tool showing fully assembled prompts across 5 English, Hindi, and out-of-scope benchmark queries without invoking an LLM. |

---

### 4. RAG Retrieval & Ingestion Pipeline (`rag/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`rag/__init__.py`** | 300 B | 10 | Package initialization module exposing `retrieve(...)` with lazy loading to prevent CLI runpy import collisions. |
| **`rag/ingest.py`** | 14.0 KB | 404 | Vector database ingestion script. Reads `data/processed/*.jsonl`, filters `index: true` records, embeds them using local Ollama `bge-m3` in batches of 16 (`num_ctx: 8192`), and performs idempotent upserts into persistent ChromaDB (`./chroma_db`, collection `"legal"`). |
| **`rag/retrieve.py`** | 24.7 KB | 655 | **Hybrid Retrieval Engine**. Combines dense vector retrieval (Ollama `bge-m3` top-20) and sparse keyword retrieval (BM25 top-20), fuses them via Reciprocal Rank Fusion (vector weighted 2x BM25), applies regex-based deterministic boosts for explicit article/section citations, collapses split multi-part sections (`-p1`, `-p2`) into consolidated records, and enforces confidence cutoff `MIN_SIMILARITY = 0.52`. |

---

### 5. Evaluation Benchmark (`eval/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`eval/questions.jsonl`** | 6.3 KB | 28 | Benchmark dataset containing 28 test questions: 14 English in-scope, 12 Hindi in-scope, and 2 out-of-scope layperson queries (consumer refund, phone theft). |
| **`eval/run_eval.py`** | 9.2 KB | 217 | Automated evaluation harness measuring Hit@1, Hit@3, and Hit@5 metrics overall and per language, supporting section-level hit counting. |

---

### 6. Legal Rights Extraction Engine (`legal_rights_extraction/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`legal_rights_extraction/extract_legal_qa.py`** | 22.5 KB | 468 | Automated NLP extraction engine. Streams Supreme Court judgments from parquet, identifies legal rights, constitutional interpretations, and *ratio decidendi*, clusters them by topic, and produces canonical Q&A pairs into `data/extracted_qa/`. |
| **`legal_rights_extraction/demo.py`** | 2.9 KB | 70 | Demonstration workflow downloading the test split, running the extraction pipeline, and saving results to `data/extracted_qa/`. |
| **`legal_rights_extraction/search_qa.py`** | 3.2 KB | 87 | Fast keyword and semantic search CLI over the extracted case law dataset, supporting both `.jsonl` and `.json` files. |

---

### 7. Unified Legal Data Hub (`data/`)

#### A. Source Materials & Reference Texts (`data/source/`) — "Just Data"
| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`data/source/raw/Indian Constitution.pdf`** | 2.41 MB | 29,974 | Official Ministry of Law & Justice pocket edition source PDF (402 pages) up to the 106th Constitutional Amendment Act, 2023. |
| **`data/source/raw/COI.json`** | 1.55 MB | 12,637 | Complete structured JSON tree of the Constitution: Preamble, 25 Parts, 23 Chapters, 503 Articles, 12 Schedules, 3 Appendices. |
| **`data/source/raw/constitution_chunks.jsonl`** | 2.64 MB | 519 | Raw intermediate RAG chunks extracted from the official PDF with hierarchical path metadata and raw search text. |
| **`data/source/markdown/constitution_of_india.md`** | 928 KB | 17,754 | Master single-file Markdown document containing the complete, formatted constitutional text with headings, blockquotes, and tables. |
| **`data/source/markdown/01_central_acts.md`** | 359 KB | 3,577 | Complete verbatim text of primary Parliamentary Central Acts, including **The Industrial Relations Code, 2020** and **RERA, 2016**. |
| **`data/source/markdown/02_rules_regulations.md`** | 142 KB | 2,120 | Central subordinate legislation, including **The Code on Wages (Central) Rules, 2020** and **Consumer Protection (E-Commerce) Rules, 2020**. |
| **`data/source/markdown/03_state_laws.md`** | 307 KB | 3,386 | Major State enactments and tenancy statutes: **The Maharashtra Rent Control Act, 1999** and **MOFA, 1963**. |
| **`data/source/markdown/04_amendments_metadata.md`** | 77.8 KB | 1,027 | Master alphabetical reference index of **891 Central Acts** (Act No., Year, Enactment Date, Amendment Status, Repeals, Subject Classifications). |

#### B. Production RAG-Indexed Datasets (`data/processed/`) — "Final Output"
| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`data/processed/constitution.jsonl`** | 1.35 MB | 519 | **Production Constitutional Corpus** generated by `scripts/normalize.py`. Features 519 records with verified article fixes, repaired line-break heading leaks, and active vs omitted indexing flags (`475` indexable records). |
| **`data/processed/acts.jsonl`** | 485 KB | 218 | **Production Statutory Corpus** generated by `scripts/normalize.py`. Features 218 records (123 indexable): *The Maharashtra Rent Control Act, 1999* (68 indexed chunks) and *The Code on Wages (Central) Rules, 2026* (55 indexed chunks). |

#### C. Extracted Court Decisions Q&A Corpus (`data/extracted_qa/`) — "Final Output"
| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`data/extracted_qa/legal_qa_dataset.jsonl`** | 1.52 MB | 1,104 | Master structured JSON Lines file of **1,104 verified Supreme Court Q&A pairs** across 11 key legal domains. |
| **`data/extracted_qa/dataset_summary.json`** | 810 B | 23 | JSON summary detailing aggregate corpus statistics: total cases scanned, total Q&As extracted, and domain distribution. |
| **`data/extracted_qa/README.md`** | 3.18 KB | 78 | Documentation for the court decisions Q&A dataset, specifying schema fields, sample records, domain distribution, and LangChain ingestion instructions. |

---

### 8. Scripts & Utilities (`scripts/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`scripts/normalize.py`** | 52.9 KB | 1,308 | Normalization and cleaning pipeline. Converts raw constitution and statutory markdown files into canonical schema, cross-checks against `COI.json`, repairs heading leaks, and sets indexing flags. |
| **`scripts/latency_test.py`** | 7.2 KB | 187 | Latency benchmark running 3 iterations across Non-streaming, Streaming (measuring TTFT), and Minimal Thinking (`ThinkingLevel.MINIMAL`) on real grounded prompts. |
| **`scripts/smoke_gemma.py`** | 15.2 KB | 375 | 6-point Gemma capability smoke test harness testing English, Hindi, image reading, JSON, tool calling, and search grounding. |
| **`scripts/test_web.py`** | 4.4 KB | 107 | Grounded web search test harness testing 10s hard timeout enforcement and domain allowlist filtering on legal query benchmarks. |
| **`scripts/test_retrieval.py`** | 1.96 KB | 58 | Lightweight test script running 9 benchmark queries across English legal terms, Hindi legal terms, and layperson phrasing to verify retrieval behavior. |

---

## 📊 Summary Statistics Across Datasets

- **Total Tracked Repositories / Modules**: 7 clean modular directories (`api/`, `orchestrator/`, `rag/`, `eval/`, `legal_rights_extraction/`, `data/`, `scripts/`).
- **Total Indexed Records in ChromaDB**: **598 records** (475 active constitutional articles + 123 active statutory sections from MRCA & Code on Wages Rules).
- **Verified Statutory Markdown Lines**: 10,110 lines across 4 files covering Central Codes, Rules, State Housing Acts, and 891 Central Acts metadata.
- **Extracted Supreme Court Q&A Pairs**: 1,104 structured case law questions and answers across 11 legal domains.
- **Retrieval Performance Benchmark**: **92.3% Hit@1, 96.2% Hit@3, 100.0% Hit@5** across 26 test questions (100% Hit@1 English, 83.3% Hit@1 Hindi) with `MIN_SIMILARITY = 0.52`.
