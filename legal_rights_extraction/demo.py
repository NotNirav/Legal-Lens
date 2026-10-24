"""
Legal-Lens: Court Decisions Legal Q&A Extraction Demo
-----------------------------------------------------
Loads the Indian Court Decisions dataset safely without memory overflow,
extracts authoritative legal Q&As (ratio decidendi, statutory interpretations,
and constitutional rights), and saves them in a separate output directory.
"""

import os
import json
from extract_legal_qa import process_dataset


def main():
    print("=" * 70)
    print("        LEGAL-LENS: COURT DECISIONS LEGAL Q&A EXTRACTION        ")
    print("=" * 70)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    local_sc_parquet = os.path.join(base_dir, "sc_test.parquet")
    output_dir = os.path.join(base_dir, "output")

    # 1. Dataset Selection
    if os.path.exists(local_sc_parquet):
        parquet_source = local_sc_parquet
        print(f"\n[+] Using local Supreme Court decisions dataset:")
        print(f"    Path: {local_sc_parquet}")
    else:
        print("\n[+] Downloading Supreme Court decisions dataset (~56 MB)...")
        parquet_source = "https://huggingface.co/datasets/overthelex/indian-court-decisions/resolve/main/supreme_court/test.parquet"

    # 2. Extract Legal Q&As into separate output directory
    print(f"\n[+] Scanning and extracting legal Q&As into output folder: {output_dir}")
    summary = process_dataset(
        parquet_path=parquet_source,
        output_dir=output_dir
    )

    print("\n" + "=" * 70)
    print("                       EXTRACTION SUMMARY                       ")
    print("=" * 70)
    print(f"Total Cases Scanned:  {summary['total_cases_scanned']}")
    print(f"Total Q&As Extracted: {summary['total_qa_extracted']}")
    print("\nCategory Breakdown:")
    for cat, count in sorted(summary['categories_breakdown'].items(), key=lambda x: -x[1]):
        print(f"  * {cat:<42}: {count:>4} pairs")

    print(f"\n[+] Output Directory:                {output_dir}")
    print(f"    - JSON Dataset:                  {summary['json_path']}")
    print(f"    - JSONL (RAG / Embeddings):      {summary['jsonl_path']}")
    print(f"    - Dataset Summary Metadata:      {summary['summary_path']}")

    # 3. Demonstration Sample Retrieval
    print("\n" + "=" * 70)
    print("             DEMO: SAMPLE RAG RETRIEVAL (TOP 3 Q&As)            ")
    print("=" * 70)
    with open(summary['json_path'], 'r', encoding='utf-8') as f:
        data = json.load(f)

    for i, item in enumerate(data[:3]):
        print(f"\n[Q&A #{i+1}] [{item['category']}] (Cluster: {item['cluster_tag']})")
        print(f"QUESTION: {item['question']}")
        print(f"ANSWER:   {item['answer']}")
        print(f"PROVISIONS: {', '.join(item['legal_references']) if item['legal_references'] else 'None'}")
        print("-" * 70)


if __name__ == '__main__':
    main()