# Constitution of India — RAG-Ready Dataset

Processed and extracted from the official **Government of India, Ministry of Law and Justice (Legislative Department)** pocket edition of the *Constitution of India* (As on 1st May, 2024), incorporating all amendments up to the **Constitution (One Hundred and Sixth Amendment) Act, 2023**.

---

## 📁 Dataset Files Overview

| File / Folder | Format | Size | Description |
| :--- | :--- | :--- | :--- |
| **`data/COI.json`** | Hierarchical JSON | ~1.48 MB | Complete structured tree: Metadata, Preface, Abbreviations, Preamble, 25 Parts, 23 Chapters, 503 Articles (with structured clauses and footnotes), 12 Schedules, and 3 Appendices. |
| **`data/constitution_chunks.jsonl`** | JSON Lines | ~2.52 MB | **519 production-ready RAG chunks** (Preamble + 503 Articles + 12 Schedules + 3 Appendices) with hierarchical search context, dense/sparse retrieval text, and metadata for filtering. |
| **`data/constitution_of_india.md`** | Master Markdown | ~0.89 MB | Full master text formatted with GitHub Flavored Markdown headings, blockquotes, tables, and amendment notes. |
| **`data/markdown/`** | Modular Markdown | 41 files | Granular markdown files split by section: Preamble (`00_preamble.md`), 25 Parts, 12 Schedules, and 3 Appendices. |

---

## 🏛 Structural Summary

- **Total PDF Pages Processed**: 402
- **Total Parts**: 25 (Parts I to XXII, including Parts IVA, IX, IXA, IXB, XIVA)
- **Total Chapters**: 23
- **Total Articles Extracted**: 503 (475 Active + 28 Omitted/Repealed with statutory history)
- **Total Schedules**: 12 (First to Twelfth Schedule)
- **Total Appendices**: 3
  - *Appendix I*: Constitution (One Hundredth Amendment) Act, 2015 (India–Bangladesh Land Boundary Agreement)
  - *Appendix II*: The Constitution (Application to Jammu and Kashmir) Order, 2019 (C.O. 272)
  - *Appendix III*: Declaration under Article 370(3) of the Constitution (C.O. 273)
- **Footnotes & Amendments**: Verbatim amendment history and commencement dates mapped to every article and schedule.

---

## 🚀 Quickstart RAG Usage Examples

### 1. Ingestion with LangChain

```python
import json
from langchain_core.documents import Document

documents = []
with open("data/constitution_chunks.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        item = json.loads(line)
        doc = Document(
            page_content=item["search_text"],
            metadata=item["metadata"]
        )
        documents.append(doc)

print(f"Loaded {len(documents)} chunks for vector indexing.")
```

### 2. Loading into ChromaDB with Local Ollama Embeddings

```python
import json
import chromadb
from chromadb.utils.embedding_functions import OllamaEmbeddingFunction

client = chromadb.PersistentClient(path="./chroma_db")
embed_fn = OllamaEmbeddingFunction(
    url="http://localhost:11434/api/embeddings",
    model_name="nomic-embed-text"  # or mxbai-embed-large / llama3
)

collection = client.get_or_create_collection(
    name="indian_constitution",
    embedding_function=embed_fn
)

ids, docs, metadatas = [], [], []
with open("data/constitution_chunks.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        item = json.loads(line)
        ids.append(item["chunk_id"])
        docs.append(item["search_text"])
        metadatas.append(item["metadata"])

collection.add(ids=ids, documents=docs, metadatas=metadatas)
print("Vector indexing complete!")
```

### 3. Querying by Metadata Filtering (e.g., Fundamental Rights)

```python
results = collection.query(
    query_texts=["freedom of speech and reasonable restrictions"],
    where={"part_number": "III"},  # Filter only Fundamental Rights!
    n_results=3
)
```

### 4. Fast Direct Article Lookup using `COI.json`

```python
import json

with open("data/COI.json", "r", encoding="utf-8") as f:
    coi = json.load(f)

# Build quick lookup index:
article_index = {}
for part in coi["parts"]:
    for chap in part["chapters"]:
        for art in chap["articles"]:
            article_index[art["article_number"]] = art

# Instant retrieval:
art21 = article_index["21"]
print(f"Article {art21['article_number']}: {art21['title']}")
print(art21["full_text"])
```
