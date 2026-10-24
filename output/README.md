# Legal Q&A Corpus (Indian Court Decisions)

This directory contains the extracted, cleaned, and categorized legal Questions and Answers derived from authoritative Supreme Court of India decisions, optimized specifically for **RAG (Retrieval-Augmented Generation)** pipelines, legal search engines, and compliance assistants.

---

## 📁 Files in this Directory

| File | Format | Description |
| :--- | :--- | :--- |
| [`legal_qa_dataset.json`](file:///c:/Users/Khushi%20Kolhe/OneDrive/Documents/Hackathon/Hacktoberfest%202026/Legal-Lens/legal_rights_extraction/output/legal_qa_dataset.json) | JSON Array | Complete structured dataset with all metadata, categories, and references. |
| [`legal_qa_dataset.jsonl`](file:///c:/Users/Khushi%20Kolhe/OneDrive/Documents/Hackathon/Hacktoberfest%202026/Legal-Lens/legal_rights_extraction/output/legal_qa_dataset.jsonl) | JSON Lines | Line-delimited JSON format for batch embedding and vector DB ingestion. |
| [`dataset_summary.json`](file:///c:/Users/Khushi%20Kolhe/OneDrive/Documents/Hackathon/Hacktoberfest%202026/Legal-Lens/legal_rights_extraction/output/dataset_summary.json) | JSON | Aggregate metadata summary and domain distribution. |

---

## 📊 Domain Distribution (1,104 Verified Q&A Pairs)

- **Constitutional Law & Fundamental Rights**: 346 pairs
- **General Legal Principles & Jurisprudence**: 206 pairs
- **Criminal Law & Procedure**: 162 pairs
- **Taxation & Revenue**: 116 pairs
- **Property & Tenancy Law**: 87 pairs
- **Civil Procedure & Execution**: 59 pairs
- **Contract & Specific Relief**: 41 pairs
- **Labor, Employment & Service Law**: 35 pairs
- **Corporate, Commercial & Arbitration**: 28 pairs
- **Family & Succession Law**: 17 pairs
- **Evidence & Trial Procedure**: 7 pairs

---

## 🔍 Data Schema Example

```json
{
  "id": "legal_qa_1951_4_1",
  "category": "Constitutional Law & Fundamental Rights",
  "cluster_tag": "constitutional_law:article_22__5__constitution_of_india",
  "question": "What are the legal requirements and rights regarding the communication of grounds in preventive detention cases under Indian law?",
  "answer": "In view of the fact that a large number of cases had to be dealt with on the passing of the Preventive Detention Act, it cannot be said that the grounds were not communicated to the appellants 'as soon as may be' within the meaning of Art. 22 (5).\n\n(Authoritative Ruling: State of Bombay v. Atma Ram Sridhar Vaidya, 1951 [Statutory Provisions: Article 22 (5) Constitution of India])",
  "legal_references": [
    "Article 22 (5) Constitution of India"
  ],
  "case_title": "State of Bombay v. Atma Ram Sridhar Vaidya",
  "year": 1951,
  "court": "Supreme Court of India",
  "confidence_score": 0.95
}
```

---

## 🚀 How to Ingest into RAG / Vector Stores

### Python / LangChain Example:
```python
import json
from langchain_core.documents import Document

documents = []
with open("legal_rights_extraction/output/legal_qa_dataset.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        data = json.loads(line)
        doc = Document(
            page_content=f"Question: {data['question']}\nAnswer: {data['answer']}",
            metadata={
                "id": data["id"],
                "category": data["category"],
                "cluster_tag": data["cluster_tag"],
                "references": ", ".join(data.get("legal_references", [])),
                "year": data.get("year", 1950),
                "case_title": data.get("case_title", "")
            }
        )
        documents.append(doc)

# Embed and store in Chroma, Pinecone, FAISS, etc.
```
