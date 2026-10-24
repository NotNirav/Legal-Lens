# Legal Lens — Repository Files & Architecture Directory

This document provides a comprehensive structural directory and description of all files, datasets, scripts, and modules in the **Legal Lens** repository. It reflects both the core constitutional RAG pipeline and the newly added statutory markdown texts, Supreme Court extraction tools, and Q&A datasets.

---

## 🌳 Repository Tree Structure

```text
Legal-Lens/
├── README.md                                       # Master repository documentation & architecture overview
├── .gitignore                                      # Git ignore rules (chroma_db, .parquet, python caches)
├── LICENSE                                         # Project open-source license
├── requirements.txt                                # Python runtime dependencies
├── files.md                                        # Repository file index & architectural documentation
│
├── api/                                            # REST API Service (FastAPI)
│   ├── __init__.py                                 # API package export
│   └── main.py                                     # FastAPI app (/health, /sources, /retrieve), CORS & fail-safes
│
├── data/                                           # Raw & structured Constitutional source documents
│   ├── COI.json                                    # Master hierarchical tree of the Constitution (JSON)
│   ├── Indian Constitution.pdf                     # Official Ministry of Law & Justice pocket edition (PDF)
│   ├── README.md                                   # Documentation for Constitutional dataset
│   ├── constitution_chunks.jsonl                   # 519 raw RAG chunk records
│   ├── constitution_of_india.md                    # Master markdown document of the complete Constitution
│   ├── markdown/                                   # 41 section-level markdown documents
│   │   ├── 00_preamble.md                          # Preamble to the Constitution
│   │   ├── part_i_the_union_and_its_territory.md   # Part I (Articles 1–4)
│   │   ├── part_ii_citizenship.md                  # Part II (Articles 5–11)
│   │   ├── part_iii_fundamental_rights.md          # Part III (Articles 12–35)
│   │   ├── part_iv_directive_principles_of_state_policy.md # Part IV (Articles 36–51)
│   │   ├── part_iva_fundamental_duties.md          # Part IVA (Article 51A)
│   │   ├── part_v_the_union.md                     # Part V (Articles 52–151)
│   │   ├── part_vi_the_states_1.md                 # Part VI (Articles 152–237)
│   │   ├── part_viii_the_union_territories.md      # Part VIII (Articles 239–242)
│   │   ├── part_ix_the_panchayats.md               # Part IX (Articles 243–243O)
│   │   ├── part_ixa_the_municipalities.md          # Part IXA (Articles 243P–243ZG)
│   │   ├── part_ixb_the_co_operative_societies.md  # Part IXB (Articles 243ZH–243ZT)
│   │   ├── part_x_the_scheduled_and_tribal_areas.md# Part X (Articles 244–244A)
│   │   ├── part_xi_relations_between_the_union_and_the_states.md # Part XI (Articles 245–263)
│   │   ├── part_xii_finance_property_contracts_and_suits.md # Part XII (Articles 264–300A)
│   │   ├── part_xiii_trade_commerce_and_intercourse_within_the_territory_of_india.md # Part XIII (Articles 301–307)
│   │   ├── part_xiv_services_under_the_union_and_the_states.md # Part XIV (Articles 308–323)
│   │   ├── part_xiva_tribunals.md                  # Part XIVA (Articles 323A–323B)
│   │   ├── part_xv_elections.md                    # Part XV (Articles 324–329A)
│   │   ├── part_xvi_special_provisions_relating_to_certain_classes.md # Part XVI (Articles 330–342A)
│   │   ├── part_xvii_official_language.md          # Part XVII (Articles 343–351)
│   │   ├── part_xviii_emergency_provisions.md      # Part XVIII (Articles 352–360)
│   │   ├── part_xix_miscellaneous.md               # Part XIX (Articles 361–367)
│   │   ├── part_xx_amendment_of_the_constitution.md# Part XX (Article 368)
│   │   ├── part_xxi_temporary_transitional_and_special_provisions.md # Part XXI (Articles 369–392)
│   │   ├── part_xxii_short_title_commencement_1_authoritative_text_in_hindi_and_repeals.md # Part XXII (Articles 393–395)
│   │   ├── schedule_01_the_states_and_union_territories.md to schedule_12... # Schedules 1 to 12
│   │   └── appendix_01.md to appendix_03.md        # Appendices I to III
│   └── processed/                                  # Normalized RAG-ready datasets
│       ├── constitution.jsonl                      # 519 normalized records with heading/article fixes (475 indexed)
│       └── acts.jsonl                              # 218 normalized statutory records: MRCA 1999 & COW Rules 2026 (123 indexed)
│
├── rag/                                            # Core RAG Retrieval & Ingestion Pipeline
│   ├── __init__.py                                 # Package export for retrieve function
│   ├── ingest.py                                   # Batch embedding (Ollama bge-m3) & ChromaDB upsert
│   └── retrieve.py                                 # Hybrid search (Dense Vector + BM25 + 2x RRF + Section Collapsing)
│
├── orchestrator/                                   # Answer Assembly & Prompt Generation Layer
│   ├── __init__.py                                 # Module export
│   ├── evidence.py                                 # Evidence aggregator, Devanagari language detector, [L#] tagger
│   ├── prompt.py                                   # Grounded prompt builder, anti-hallucination rules, fallback logic
│   └── show_prompt.py                              # Benchmark prompt demonstration CLI (no LLM calls)
│
├── eval/                                           # Retrieval Evaluation Benchmark
│   ├── questions.jsonl                             # 28 benchmark questions (14 EN, 12 HI, 2 Out-of-Scope)
│   └── run_eval.py                                 # Automated Hit@1/3/5 metrics & threshold evaluator
│
├── scripts/                                        # Processing & Utility Scripts
│   ├── normalize.py                                # Raw chunk cleaner, schema validator, heading leak repairer
│   └── test_retrieval.py                           # CLI evaluation script for 9 standard user queries
│
├── rag_legal_markdown/                             # [NEW] Statutory Acts, Rules, State Laws & Metadata
│   ├── 01_central_acts.md                          # Primary Parliamentary Acts (Industrial Relations Code, RERA)
│   ├── 02_rules_regulations.md                     # Central Subordinate Legislation (Code on Wages Rules, E-Commerce Rules)
│   ├── 03_state_laws.md                            # State & Tenancy Laws (Maharashtra Ownership Flats Act MOFA)
│   └── 04_amendments_metadata.md                   # Master Central Acts Directory (Acts 1 to 891) & Amendment History
│
├── legal_rights_extraction/                        # [NEW] Court Decisions Legal Q&A Extraction Engine
│   ├── demo.py                                     # Interactive demo script for Supreme Court extraction
│   ├── extract_legal_qa.py                         # Parser extracting ratio decidendi & Q&A pairs from court decisions
│   └── search_qa.py                                # Keyword / semantic search CLI over extracted legal Q&As
│
└── output/                                         # [NEW] Extracted Case Law Q&A Datasets & Summaries
    ├── README.md                                   # Overview & documentation for Supreme Court Q&A corpus
    ├── dataset_summary.json                        # Metadata aggregate summary and domain distribution statistics
    ├── legal_qa_dataset.json                       # 1,104 verified Supreme Court Q&A pairs (JSON array)
    └── legal_qa_dataset.jsonl                      # 1,104 verified Supreme Court Q&A pairs (JSON Lines format)
```

---

## 📄 File Details & Functional Descriptions

### 1. Root Configuration & Dependencies

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`README.md`** | ~8.5 KB | ~195 | Master project documentation featuring overview, system architecture diagram, benchmark metrics, quickstart instructions, and schema definitions. |
| **`.gitignore`** | 313 B | 29 | Excludes local vector storage (`chroma_db/`), large raw datasets (`*.parquet`), Python bytecode caches (`__pycache__/`, `*.pyc`), environment configurations (`.env`), and IDE settings. |
| **`LICENSE`** | 1.08 KB | 21 | Open-source MIT software license governing usage of the Legal Lens application and data utilities. |
| **`requirements.txt`** | 98 B | 6 | Declares core Python runtime dependencies: `chromadb>=1.5.0`, `requests>=2.31.0`, `tqdm>=4.66.0`, `rank_bm25>=0.2.2`, `fastapi>=0.110.0`, and `uvicorn>=0.28.0`. |
| **`files.md`** | 17.5 KB | 195 | Current master file indexing all directories, files, schemas, and pipeline responsibilities. |
| **`api/main.py`** | 4.8 KB | 135 | FastAPI application exposing `/health`, `/sources`, and `/retrieve` endpoints with CORS and Ollama error handling. |
| **`orchestrator/evidence.py`** | 3.2 KB | 88 | Aggregates legal retrieval chunks, tags evidence with `[L1]..[L5]`, detects query language (Devanagari ratio > 0.3), and calculates confidence flags. |
| **`orchestrator/prompt.py`** | 6.8 KB | 170 | Constructs strictly grounded system and user prompts enforcing evidence hierarchy (LAW > QA > WEB), Part IV directive principles guidance, and low-confidence fallback. |
| **`orchestrator/llm.py`** | 5.8 KB | 196 | Lightweight wrapper around `google-genai` SDK for model `gemma-4-26b-a4b-it`, reading `GEMINI_API_KEY` from `.env` without printing. Implements `generate`, `generate_stream`, single retry on 429/500/504 with 3s pause, and clean `LLMError`. |
| **`orchestrator/web.py`** | 7.4 KB | 228 | Web evidence module querying `gemma-4-26b-a4b-it` with Google Search tool. Reads URLs exclusively from grounding metadata, filters sources to `.gov.in`, `.nic.in` and allowlist, logs dropped sources, and enforces 10s hard timeout. |
| **`orchestrator/show_prompt.py`** | 3.1 KB | 85 | CLI demonstration tool showing fully assembled prompts across 5 English, Hindi, and out-of-scope benchmark queries without invoking an LLM. |
| **`scripts/latency_test.py`** | 6.5 KB | 185 | Latency benchmark running 3 iterations across Non-streaming, Streaming (measuring TTFT), and Minimal Thinking (`ThinkingLevel.MINIMAL`) on real grounded prompts. |
| **`scripts/test_web.py`** | 4.5 KB | 115 | Grounded web search test harness testing 10s hard timeout enforcement and domain allowlist filtering on legal query benchmarks. |

---

### 2. Core Constitutional Data (`data/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`data/COI.json`** | 1.48 MB | 12,637 | Hierarchical structured JSON tree of the *Constitution of India* (as on May 1, 2024). Contains metadata, preamble, 25 parts, 23 chapters, 503 articles (with structured clauses and footnotes), 12 schedules, and 3 appendices. |
| **`data/Indian Constitution.pdf`** | 2.30 MB | 29,974 | Official Ministry of Law & Justice (Legislative Department) pocket edition source PDF (402 pages) up to the 106th Constitutional Amendment Act, 2023. |
| **`data/README.md`** | 4.18 KB | 113 | Detailed documentation outlining the Constitutional dataset structure, extraction statistics, footnote mapping, and LangChain/ChromaDB loading examples. |
| **`data/constitution_chunks.jsonl`** | 2.52 MB | 519 | 519 raw RAG chunk records extracted from the Constitution. Each line contains chunk ID, hierarchical path, content, clauses, footnotes, and metadata. |
| **`data/constitution_of_india.md`** | 906 KB | 17,754 | Master single-file Markdown document containing the complete, formatted constitutional text with headings, blockquotes, and tables. |
| **`data/markdown/`** *(41 files)* | ~850 KB | 18,247 | Modular section-level markdown files split into: `00_preamble.md`, 25 Part files (`part_i` to `part_xxii`), 12 Schedule files (`schedule_01` to `schedule_12`), and 3 Appendix files (`appendix_01` to `appendix_03`). |
| **`data/processed/constitution.jsonl`** | 1.29 MB | 519 | **Production Constitutional Corpus** generated by `scripts/normalize.py`. Features 519 records with verified article fixes (`31D`, `32A`, `268A`, `329A`, `359A`), repaired line-break heading leaks, and active vs omitted indexing flags (`475` indexable records). |
| **`data/processed/acts.jsonl`** | 536 KB | 218 | **Production Statutory Corpus** generated by `scripts/normalize.py`. Features 218 records (123 indexable): *The Maharashtra Rent Control Act, 1999* (68 indexed chunks) and *The Code on Wages (Central) Rules, 2026* (55 indexed chunks). |

---

### 3. RAG Pipeline (`rag/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`rag/__init__.py`** | 300 B | 10 | Package initialization module exposing `retrieve(...)` with lazy loading to prevent CLI runpy import collisions. |
| **`rag/ingest.py`** | 13.5 KB | 401 | Vector database ingestion script. Reads `data/processed/*.jsonl`, filters `index: true` records (475 items), embeds them using local Ollama `bge-m3` in batches of 16 (`num_ctx: 8192`), and performs idempotent upserts into persistent ChromaDB (`./chroma_db`, collection `"legal"`). |
| **`rag/retrieve.py`** | 15.3 KB | 454 | **Hybrid Retrieval Engine**. Combines dense vector retrieval (Ollama `bge-m3` top-20) and sparse keyword retrieval (BM25 top-20), fuses them via Reciprocal Rank Fusion (vector weighted 2x BM25), applies regex-based deterministic boosts for explicit article/section citations (in English & Hindi), and marks low-confidence queries below `MIN_SIMILARITY = 0.52`. Includes a full CLI interface. |

---

### 4. Evaluation Benchmark (`eval/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`eval/questions.jsonl`** | 6.5 KB | 28 | Benchmark dataset containing 28 test questions: 14 English in-scope, 12 Hindi in-scope (arrest rights, free speech, equality, life/liberty, religion, education, legal aid, untouchability, tenancy eviction, minimum wage, salary deductions), and 2 out-of-scope layperson queries (consumer refund, phone theft). |
| **`eval/run_eval.py`** | 8.8 KB | 215 | Automated evaluation harness measuring Hit@1, Hit@3, and Hit@5 metrics overall and per language. Identifies failure cases and compares cosine similarity distributions between in-scope hits and out-of-scope queries to validate the confidence threshold. |

---

### 5. Scripts & Utilities (`scripts/`)

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`scripts/normalize.py`** | 24.7 KB | 640 | Normalization and cleaning pipeline. Converts raw `constitution_chunks.jsonl` into canonical schema, cross-checks against `COI.json`, corrects anomalous footnote numbers, repairs 70 line-break heading leaks, and sets indexing flags. Extensible via a `SOURCES` adapter dictionary. |
| **`scripts/test_retrieval.py`** | 1.91 KB | 58 | Lightweight test script running 9 benchmark queries across English legal terms, Hindi legal terms, and layperson phrasing to verify retrieval behavior. |

---

### 6. Statutory Acts & Rules Markdown (`rag_legal_markdown/`) *(Newly Pulled)*

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`01_central_acts.md`** | 350.8 KB | 3,577 | Complete verbatim text of primary Parliamentary Central Acts, including **The Industrial Relations Code, 2020 (Act 35 of 2020)** and **The Real Estate (Regulation and Development) Act, 2016 (RERA, Act 16 of 2016)**, structured with Chapters, Sections, Subsections, Provisos, and RAG chunk metadata. |
| **`02_rules_regulations.md`** | 138.3 KB | 2,120 | Central subordinate legislation and regulatory frameworks, including **The Code on Wages (Central) Rules, 2020** (wage calculation, minimum wage fixation, overtime, deductions) and **Consumer Protection (E-Commerce) Rules, 2020**. |
| **`03_state_laws.md`** | 299.5 KB | 3,386 | Major State enactments and tenancy statutes, prominently featuring **The Maharashtra Ownership Flats Act, 1963 (MOFA)** and state housing regulations detailing promoter liabilities, conveyance, and tenant protections. |
| **`04_amendments_metadata.md`** | 76.0 KB | 1,027 | Master alphabetical reference index of **891 Central Acts** (Act No., Year, Enactment Date, Amendment Status, Repeals, and Legislative Subject Classifications) linking statutory references across the legal corpus. |

---

### 7. Supreme Court Legal Rights Extraction (`legal_rights_extraction/`) *(Newly Pulled)*

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`extract_legal_qa.py`** | 21.8 KB | 467 | Core automated NLP extraction engine. Streams Supreme Court of India judgments from HuggingFace dataset (`overthelex/indian-court-decisions` parquet), identifies legal rights, constitutional interpretations, and *ratio decidendi*, clusters them by topic, and produces formatted Q&A pairs. |
| **`demo.py`** | 2.80 KB | 69 | Demonstration workflow that checks for a local Supreme Court decision parquet file (`sc_test.parquet`), falls back to downloading the test split, runs the extraction pipeline, and prints category summaries. |
| **`search_qa.py`** | 2.75 KB | 80 | CLI search utility over the extracted case law dataset. Performs multi-field keyword matching across questions, answers, case titles, legal references, and cluster tags. |

---

### 8. Extracted Court Q&A Dataset (`output/`) *(Newly Pulled)*

| File | Size | Lines | Purpose / Description |
| :--- | :---: | :---: | :--- |
| **`legal_qa_dataset.json`** | 1.53 MB | 16,790 | Master structured JSON array of **1,104 verified Supreme Court Q&A pairs**. Fields include `id`, `category`, `cluster_tag`, `question`, `answer` (containing the ratio decidendi and citation), `legal_references`, `case_title`, `year`, `court`, and `confidence_score`. |
| **`legal_qa_dataset.jsonl`** | 1.45 MB | 1,104 | Line-delimited JSON Lines version of the 1,104 Q&A pairs, formatted for high-speed streaming, batch processing, and vector database ingestion. |
| **`dataset_summary.json`** | 810 B | 23 | JSON summary detailing aggregate corpus statistics: total cases scanned, total Q&As extracted, and domain distribution across 11 key legal categories. |
| **`output/README.md`** | 3.59 KB | 79 | Documentation for the court decisions Q&A dataset, specifying schema fields, sample records, domain distribution, and LangChain ingestion instructions. |

---

## 📊 Summary Statistics Across Datasets

- **Total Tracked Repositories / Modules**: 7 directories (`data/`, `data/processed/`, `rag/`, `eval/`, `scripts/`, `rag_legal_markdown/`, `legal_rights_extraction/`, `output/`).
- **Total Indexed Records in ChromaDB**: **598 records** (475 active constitutional articles + 123 active statutory sections from MRCA & Code on Wages Rules).
- **Verified Statutory Markdown Lines**: 10,110 lines across 4 files covering Central Codes, Rules, State Housing Acts, and 891 Central Acts metadata.
- **Extracted Supreme Court Q&A Pairs**: 1,104 structured case law questions and answers across 11 legal domains.
- **Retrieval Performance Benchmark**: **92.3% Hit@1, 96.2% Hit@3, 100.0% Hit@5** across 26 test questions (100% Hit@1 English, 83.3% Hit@1 Hindi) with `MIN_SIMILARITY = 0.52`.
