#!/usr/bin/env python3
"""
ingest.py - Ingestion script for Legal Lens RAG pipeline.

Reads normalized legal records from data/processed/*.jsonl, filters indexable records
(index == True), embeds them using local Ollama bge-m3 with num_ctx=8192, and upserts
into a persistent ChromaDB collection ('legal') with cosine distance.

Usage:
    python rag/ingest.py
    python rag/ingest.py --source constitution
"""

from __future__ import annotations

import argparse
import glob
import io
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import chromadb
import requests
from tqdm import tqdm

# Ensure UTF-8 stdout for console compatibility
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")


# ==============================================================================
# Ollama Embedding Client
# ==============================================================================

def embed_texts_ollama(
    texts: List[str],
    ollama_url: str = "http://localhost:11434",
    model: str = "bge-m3",
    num_ctx: int = 8192,
    max_retries: int = 3,
) -> List[List[float]]:
    """
    Calls Ollama /api/embed endpoint to embed a batch of texts using bge-m3.
    Passes options={"num_ctx": num_ctx} to ensure long texts are not truncated.
    """
    endpoint = f"{ollama_url.rstrip('/')}/api/embed"
    payload = {
        "model": model,
        "input": texts,
        "options": {
            "num_ctx": num_ctx,
        },
    }

    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.post(endpoint, json=payload, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            embeddings = data.get("embeddings")
            if not embeddings or len(embeddings) != len(texts):
                raise ValueError(
                    f"Expected {len(texts)} embeddings, received {len(embeddings) if embeddings else 0}"
                )
            return embeddings
        except Exception as e:
            if attempt == max_retries:
                raise RuntimeError(
                    f"Failed to embed batch with Ollama after {max_retries} attempts: {e}"
                ) from e
            time.sleep(2 * attempt)

    return []


# ==============================================================================
# Ingestion Logic
# ==============================================================================

def load_records(
    processed_dir: Path,
    source_filter: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Loads all records with index == True from data/processed/*.jsonl.
    Optionally filters by source name or file stem.
    """
    jsonl_files = sorted(processed_dir.glob("*.jsonl"))
    if not jsonl_files:
        raise FileNotFoundError(f"No .jsonl files found in {processed_dir}")

    all_records: List[Dict[str, Any]] = []
    file_stats: Dict[str, int] = {}

    for fpath in jsonl_files:
        # Check source filter against filename stem
        if source_filter and source_filter.lower() not in fpath.stem.lower():
            continue

        file_indexed = 0
        with open(fpath, "r", encoding="utf-8") as f:
            for line_idx, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                record = json.loads(line)

                # Filter by record source field if filter provided and file stem didn't match strictly
                if source_filter:
                    rec_source = record.get("source", "").lower()
                    if source_filter.lower() not in rec_source and source_filter.lower() not in fpath.stem.lower():
                        continue

                # Filter ONLY records marked index: true
                if record.get("index") is True:
                    all_records.append(record)
                    file_indexed += 1

        file_stats[fpath.name] = file_indexed

    # Check text lengths
    longest_record = max(all_records, key=lambda r: len(r.get("text", "")), default={})
    longest_len = len(longest_record.get("text", "")) if longest_record else 0

    stats = {
        "files_scanned": [f.name for f in jsonl_files],
        "file_stats": file_stats,
        "total_indexed": len(all_records),
        "longest_id": longest_record.get("id"),
        "longest_section": longest_record.get("section"),
        "longest_length_chars": longest_len,
        "is_truncated": longest_len > 30000,  # ~8192 tokens can hold ~30k-35k characters
    }

    return all_records, stats


def ingest_to_chroma(
    records: List[Dict[str, Any]],
    chroma_path: Path,
    collection_name: str = "legal",
    ollama_url: str = "http://localhost:11434",
    model: str = "bge-m3",
    batch_size: int = 16,
    num_ctx: int = 8192,
) -> chromadb.Collection:
    """
    Embeds records in batches and upserts into ChromaDB collection with cosine distance.
    """
    # 1. Initialize persistent Chroma client & collection
    client = chromadb.PersistentClient(path=str(chroma_path))
    collection = client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )

    total_records = len(records)
    print(f"\n📦 Starting ChromaDB Ingestion:")
    print(f"   • Target Collection : '{collection_name}' (cosine distance)")
    print(f"   • Database Path     : {chroma_path.resolve()}")
    print(f"   • Total to Ingest   : {total_records} records")
    print(f"   • Batch Size        : {batch_size}")
    print(f"   • Embedding Model   : {model} via {ollama_url} (num_ctx={num_ctx})")

    # 2. Batch processing with progress bar
    num_batches = (total_records + batch_size - 1) // batch_size
    with tqdm(total=total_records, desc="Ingesting Batches", unit="rec") as pbar:
        for b_idx in range(num_batches):
            start_i = b_idx * batch_size
            end_i = min(start_i + batch_size, total_records)
            batch = records[start_i:end_i]

            batch_ids: List[str] = []
            batch_docs: List[str] = []
            batch_embed_inputs: List[str] = []
            batch_metadatas: List[Dict[str, Any]] = []

            for r in batch:
                batch_ids.append(r["id"])
                batch_docs.append(r["text"])

                # Embed string format: f"{source} | {title}\n{text}"
                embed_text = f"{r.get('source', '')} | {r.get('title', '')}\n{r.get('text', '')}"
                batch_embed_inputs.append(embed_text)

                # Metadata formatting (Chroma allows str, int, float, bool)
                tags = r.get("tags")
                tags_str = ", ".join(tags) if isinstance(tags, list) else str(tags or "")

                meta = {
                    "id": str(r["id"]),
                    "source": str(r.get("source", "")),
                    "section": str(r.get("section", "")),
                    "title": str(r.get("title", "")),
                    "lang": str(r.get("lang", "en")),
                    "type": str(r.get("type", "article")),
                    "part_title": str(r.get("part_title") or ""),
                    "tags": tags_str,
                    "plain_summary": str(r.get("plain_summary") or ""),
                    "parent_act": str(r.get("parent_act") or ""),
                    "status": str(r.get("status") or ""),
                    "text_as_on": str(r.get("text_as_on") or ""),
                }
                batch_metadatas.append(meta)

            # Generate embeddings via Ollama bge-m3
            batch_embeddings = embed_texts_ollama(
                texts=batch_embed_inputs,
                ollama_url=ollama_url,
                model=model,
                num_ctx=num_ctx,
            )

            # Idempotent upsert into ChromaDB
            collection.upsert(
                ids=batch_ids,
                documents=batch_docs,
                embeddings=batch_embeddings,
                metadatas=batch_metadatas,
            )

            pbar.update(len(batch))

    return collection


# ==============================================================================
# Vector-Only Search Tests
# ==============================================================================

def run_test_queries(
    collection: chromadb.Collection,
    ollama_url: str = "http://localhost:11434",
    model: str = "bge-m3",
    num_ctx: int = 8192,
    queries: Optional[List[str]] = None,
) -> None:
    """
    Runs quick vector-only validation queries against the collection.
    """
    if queries is None:
        queries = [
            "right to life and personal liberty",
            "arrest and detention rights",
            "अभिव्यक्ति की स्वतंत्रता",
        ]

    print(f"\n{'='*75}")
    print("🔎 Running Quick Vector-Only Test Queries:")
    print(f"{'='*75}")

    for q_idx, query in enumerate(queries, 1):
        print(f"\nQuery #{q_idx}: \"{query}\"")
        # 1. Embed query text
        q_emb = embed_texts_ollama([query], ollama_url=ollama_url, model=model, num_ctx=num_ctx)[0]

        # 2. Query Chroma
        results = collection.query(
            query_embeddings=[q_emb],
            n_results=3,
            include=["metadatas", "documents", "distances"],
        )

        ids = results["ids"][0]
        metadatas = results["metadatas"][0]
        distances = results["distances"][0]
        docs = results["documents"][0]

        for rank, (doc_id, meta, dist, doc) in enumerate(zip(ids, metadatas, distances, docs), 1):
            # Cosine similarity = 1 - cosine distance
            similarity = 1.0 - dist
            preview = doc.replace("\n", " ").strip()
            if len(preview) > 120:
                preview = preview[:120] + "..."
            print(
                f"  [{rank}] {meta.get('section', doc_id)}: {meta.get('title')} "
                f"(cosine dist: {dist:.4f}, sim: {similarity:.4f})"
            )
            print(f"      Text: {preview}")


# ==============================================================================
# Main Runner
# ==============================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest legal records into ChromaDB with Ollama bge-m3.")
    parser.add_argument(
        "--source",
        type=str,
        default=None,
        help="Optional source name or substring to filter ingestion (e.g., 'constitution')",
    )
    parser.add_argument(
        "--processed-dir",
        type=Path,
        default=Path("data/processed"),
        help="Path to directory containing processed JSONL files (default: data/processed)",
    )
    parser.add_argument(
        "--chroma-path",
        type=Path,
        default=Path("./chroma_db"),
        help="Path for persistent ChromaDB storage (default: ./chroma_db)",
    )
    parser.add_argument(
        "--collection",
        type=str,
        default="legal",
        help="ChromaDB collection name (default: 'legal')",
    )
    parser.add_argument(
        "--ollama-url",
        type=str,
        default="http://localhost:11434",
        help="Ollama base API URL (default: http://localhost:11434)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="bge-m3",
        help="Ollama embedding model name (default: bge-m3)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Batch size for embedding calls (default: 16)",
    )
    parser.add_argument(
        "--num-ctx",
        type=int,
        default=8192,
        help="Context window size for embedding model (default: 8192)",
    )
    parser.add_argument(
        "--skip-tests",
        action="store_true",
        help="Skip running test queries after ingestion",
    )

    args = parser.parse_args()

    start_time = time.time()

    # 1. Load records with index: true
    records, stats = load_records(
        processed_dir=args.processed_dir,
        source_filter=args.source,
    )

    print(f"\n{'='*75}")
    print("📖 Legal Lens Dataset Ingestion")
    print(f"{'='*75}")
    print(f"Files scanned : {stats['files_scanned']}")
    print(f"Records loaded: {stats['total_indexed']} (index=True records only)")
    print(f"Breakdown     : {stats['file_stats']}")
    print(f"Longest text  : {stats['longest_section']} [{stats['longest_id']}] -> {stats['longest_length_chars']:,} chars")
    print(f"Truncated?    : {'YES (Exceeds context)' if stats['is_truncated'] else 'NO (Fits within num_ctx=8192)'}")

    if not records:
        print("⚠️ No records found to ingest. Exiting.")
        return

    # 2. Ingest into ChromaDB
    collection = ingest_to_chroma(
        records=records,
        chroma_path=args.chroma_path,
        collection_name=args.collection,
        ollama_url=args.ollama_url,
        model=args.model,
        batch_size=args.batch_size,
        num_ctx=args.num_ctx,
    )

    total_time = time.time() - start_time
    collection_count = collection.count()

    print(f"\n{'='*75}")
    print("🏁 Ingestion Complete")
    print(f"{'='*75}")
    print(f"• Total records embedded : {len(records)}")
    print(f"• Collection total count : {collection_count}")
    print(f"• Total execution time   : {total_time:.2f} seconds ({total_time / 60:.2f} minutes)")
    print(f"• Throughput             : {len(records) / total_time:.2f} records/second")

    # 3. Test queries
    if not args.skip_tests:
        run_test_queries(
            collection=collection,
            ollama_url=args.ollama_url,
            model=args.model,
            num_ctx=args.num_ctx,
        )


if __name__ == "__main__":
    main()
