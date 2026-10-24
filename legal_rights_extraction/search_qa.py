"""
Search and Query Tool for Extracted Legal Q&As
-----------------------------------------------
Enables quick semantic/keyword search over the extracted legal Q&A dataset.
Shows how RAG pipelines query and retrieve relevant legal provisions.
"""

import os
import sys
import json
import re


def search_dataset(query: str, top_k: int = 5):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(base_dir)
    candidates = [
        os.path.join(root_dir, "data", "extracted_qa", "legal_qa_dataset.jsonl"),
        os.path.join(root_dir, "data", "extracted_qa", "legal_qa_dataset.json"),
        os.path.join(base_dir, "output", "legal_qa_dataset.jsonl"),
        os.path.join(base_dir, "output", "legal_qa_dataset.json"),
        os.path.join(root_dir, "output", "legal_qa_dataset.jsonl"),
        os.path.join(root_dir, "output", "legal_qa_dataset.json"),
    ]
    json_path = None
    for cand in candidates:
        if os.path.exists(cand):
            json_path = cand
            break

    if not json_path:
        print(f"Error: Dataset not found. Please run demo.py or extract_legal_qa.py first.")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        if json_path.endswith('.jsonl'):
            data = [json.loads(line) for line in f if line.strip()]
        else:
            data = json.load(f)

    keywords = [kw.lower() for kw in re.findall(r'\b[a-zA-Z0-9_]+\b', query) if len(kw) > 2]
    if not keywords:
        print("Please provide search keywords.")
        return

    scored_results = []
    for item in data:
        score = 0
        searchable_text = f"{item['question']} {item['answer']} {' '.join(item.get('legal_references', []))} {item.get('category', '')} {item.get('cluster_tag', '')}".lower()
        for kw in keywords:
            if kw in item['question'].lower():
                score += 5
            if any(kw in ref.lower() for ref in item.get('legal_references', [])):
                score += 4
            if kw in item.get('cluster_tag', '').lower():
                score += 3
            if kw in searchable_text:
                score += 1

        if score > 0:
            scored_results.append((score, item))

    scored_results.sort(key=lambda x: -x[0])
    top_results = scored_results[:top_k]

    print("=" * 70)
    print(f"  SEARCH RESULTS FOR: '{query}' ({len(top_results)} found)")
    print(f"  Source: {json_path}")
    print("=" * 70)

    if not top_results:
        print("No matching legal Q&As found for this query.")
        return

    for idx, (score, item) in enumerate(top_results, start=1):
        print(f"\n[Result #{idx}] Score: {score} | Domain: {item['category']}")
        print(f"Cluster: {item['cluster_tag']}")
        print(f"Q: {item['question']}")
        print(f"A: {item['answer']}")
        if item.get('legal_references'):
            print(f"Provisions: {', '.join(item['legal_references'])}")
        print("-" * 70)


if __name__ == '__main__':
    search_query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Article 136 Special Leave Appeal"
    search_dataset(search_query)
