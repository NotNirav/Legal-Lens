#!/usr/bin/env python3
"""
test_retrieval.py - Runs the 9 test queries across English, Hindi, and Layperson categories.
"""

from __future__ import annotations

import sys
import io
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from rag.retrieve import retrieve

TEST_QUERIES = [
    # 1. English
    ("English", "right to life and personal liberty"),
    ("English", "arrest and detention rights"),
    ("English", "Article 21A"),

    # 2. Hindi
    ("Hindi", "अभिव्यक्ति की स्वतंत्रता"),
    ("Hindi", "गिरफ्तारी के समय क्या अधिकार हैं"),
    ("Hindi", "अनुच्छेद 14"),

    # 3. Layperson
    ("Layperson", "can my landlord throw me out without notice"),
    ("Layperson", "police arrested me without telling me why"),
    ("Layperson", "my employer is not paying me minimum wage"),
]

def main():
    print(f"{'='*80}")
    print("🧪 Running 9 Evaluation Queries on Hybrid Legal Lens Retriever")
    print(f"{'='*80}\n")

    for idx, (cat, q) in enumerate(TEST_QUERIES, 1):
        print(f"[{idx}/9] [{cat.upper()}] Query: \"{q}\"")
        results = retrieve(q, k=3)
        for rank, res in enumerate(results, 1):
            clean_text = res["text"].replace("\n", " ").strip()
            if len(clean_text) > 130:
                clean_text = clean_text[:130] + "..."
            print(f"  Rank {rank}: {res['citation']} (Score: {res['score']})")
            print(f"         Title  : {res['title']}")
            print(f"         Snippet: {clean_text}")
        print("-" * 80)

if __name__ == "__main__":
    main()
