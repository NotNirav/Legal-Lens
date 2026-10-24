# Legal Lens — Statutory & Constitutional Datasets (`data/`)

This directory houses the foundational legal knowledge base for **Legal Lens**, encompassing the complete, authoritative text of the **Constitution of India** (updated through the 106th Constitutional Amendment Act, 2023), alongside normalized state and central statutory corpora in `data/processed/`.

---

## 📁 Dataset Directory Overview

| File / Folder | Format | Records / Size | Description |
| :--- | :--- | :--- | :--- |
| **`data/COI.json`** | Hierarchical JSON | ~1.48 MB | Complete structured tree of the Constitution: Preamble, 25 Parts, 23 Chapters, 503 Articles (with structured clauses and footnotes), 12 Schedules, and 3 Appendices. |
| **`data/constitution_chunks.jsonl`** | JSON Lines | 519 chunks (~2.52 MB) | Raw RAG chunks extracted from the official PDF with hierarchical path metadata and raw search text. |
| **`data/constitution_of_india.md`** | Master Markdown | ~0.89 MB | Full master text formatted with GitHub Flavored Markdown headings, blockquotes, tables, and amendment notes. |
| **`data/markdown/`** | Modular Markdown | 41 files (~850 KB) | Granular markdown files split by section: Preamble (`00_preamble.md`), 25 Parts, 12 Schedules, and 3 Appendices. |
| **`data/processed/constitution.jsonl`** | Canonical JSONL | 519 records (475 indexed) | **Production Constitutional Corpus**. Schema-normalized, footnote-repaired, with 70 line-break heading leaks fixed and active vs omitted flags. |
| **`data/processed/acts.jsonl`** | Canonical JSONL | 218 records (123 indexed) | **Production Statutory Corpus**. Contains *The Maharashtra Rent Control Act, 1999* (MRCA) and *The Code on Wages (Central) Rules, 2026*, chunked by section/rule and subparts. |

---

## 🏛 Structural & Corpus Statistics

### 1. Constitution of India (`data/processed/constitution.jsonl`)
- **Source**: Ministry of Law and Justice (Legislative Department) pocket edition (As on 1st May, 2024).
- **Total Articles Extracted**: 503 Articles (475 Active + 28 Omitted/Repealed with statutory history).
- **Total Parts**: 25 (Parts I through XXII, including Parts IVA, IX, IXA, IXB, XIVA).
- **Total Schedules & Appendices**: 12 Schedules, 3 Appendices (LBA 2015, C.O. 272, C.O. 273).
- **Active Searchable Chunks (`index: true`)**: **475 records** (Preamble + active Articles).

### 2. Multi-Statute Expansion (`data/processed/acts.jsonl`)
- **The Maharashtra Rent Control Act, 1999 (MRCA)**:
  - Jurisdiction: `Maharashtra` | Type: `act` | Status: `in_force`
  - 60 statutory sections + subparts for long procedural sections (e.g., Section 7 standard rent, Section 16 eviction grounds, Section 23 repair obligations).
  - Act-level Schedules I–III set to `index: false` for pure legal retrieval.
  - Active Searchable Chunks: **68 records**.
- **The Code on Wages (Central) Rules, 2026**:
  - Jurisdiction: `India` | Type: `rules` | Parent Act: `Code on Wages, 2019` | Status: `in_force`
  - 55 substantive rules covering minimum wage calculation, floor wage, hours of work, overtime, and authorized deductions.
  - Procedural Form templates (Forms I to VII) preserved with `index: false`.
  - Active Searchable Chunks: **55 records**.

**Total Active Indexed Records in ChromaDB**: **598 chunks** (475 Constitutional + 123 Statutory).

---

## 📋 Canonical Data Schema (`data/processed/*.jsonl`)

Every record in `data/processed/` conforms to the unified Legal Lens canonical schema:

```json
{
  "id": "mrca1999-s16-p1",
  "source": "The Maharashtra Rent Control Act, 1999",
  "section": "Section 16",
  "title": "Section 16: When landlord may recover possession (Part 1)",
  "text": "(1) Notwithstanding anything contained in this Act, a landlord shall be entitled to recover possession of any premises if the Court is satisfied...",
  "lang": "en",
  "plain_summary": "",
  "tags": ["rent_control", "eviction", "landlord_tenant", "maharashtra"],
  "url": "",
  "type": "act",
  "status": "in_force",
  "jurisdiction": "Maharashtra",
  "text_as_on": "31-03-2000",
  "parent_act": null,
  "original_title": "16. When landlord may recover possession",
  "index": true
}
```

### Key Field Definitions:
- `id`: Globally unique slug across all corpuses (`coi-art-21`, `mrca1999-s16`, `cow-rules-2026-r21`).
- `source`: Official canonical name of the statute or instrument.
- `section`: Standardized citation identifier (`Article 21`, `Section 16`, `Rule 21`).
- `title`: Human-readable heading including section/rule number.
- `text`: Verbatim, unadulterated statutory text cleaned of running gazette headers and page numbers.
- `index`: Boolean flag. When `false`, chunks are preserved for completeness but excluded from vector and BM25 search (e.g. omitted articles, blank schedules, forms).
- `parent_act`: For subordinate legislation (Rules/Regulations), indicates the enabling parent statute (e.g. `Code on Wages, 2019`).

---

## 🚀 Quickstart: Loading Datasets

### 1. Ingestion via Built-in Ingestion Pipeline
The primary RAG pipeline automatically scans and embeds all `data/processed/*.jsonl` files where `index=true`:

```bash
# Embeds all active chunks into persistent ChromaDB using Ollama bge-m3
python rag/ingest.py
```

### 2. Loading into Python / Pandas / Custom Scripts
```python
import json
import glob

records = []
for file_path in glob.glob("data/processed/*.jsonl"):
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            item = json.loads(line)
            if item.get("index", False):
                records.append(item)

print(f"Loaded {len(records)} active legal chunks across all statutes.")
```

### 3. Loading with LangChain
```python
import json
from langchain_core.documents import Document

documents = []
with open("data/processed/constitution.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        item = json.loads(line)
        if not item.get("index", False):
            continue
        doc = Document(
            page_content=f"{item['title']}\n\n{item['text']}",
            metadata={
                "id": item["id"],
                "source": item["source"],
                "section": item["section"],
                "jurisdiction": item["jurisdiction"],
                "status": item["status"]
            }
        )
        documents.append(doc)
```
