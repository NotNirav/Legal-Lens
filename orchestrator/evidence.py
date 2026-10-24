#!/usr/bin/env python3
"""
evidence.py - Evidence aggregation layer for Legal Lens.

Retrieves verified legal chunks, detects query language, tags evidence sources,
and flags confidence status without making any LLM calls.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from rag.retrieve import retrieve


def detect_query_language(text: str) -> str:
    """
    Detects if query is in Hindi or English based on Devanagari character ratio.
    A Devanagari character ratio > 0.3 classifies the query as Hindi ('hi').
    Otherwise returns English ('en').
    """
    non_ws = [c for c in text if not c.isspace()]
    if not non_ws:
        return "en"

    dev_count = sum(1 for c in non_ws if "\u0900" <= c <= "\u097F")
    ratio = dev_count / len(non_ws)
    return "hi" if ratio > 0.3 else "en"


def build_evidence(query: str, k: int = 5, sources: list[str] | None = None) -> Dict[str, Any]:
    """
    Builds the structured evidence payload for answer assembly.

    Calls rag.retrieve.retrieve(query, k=k) and returns:
    {
        "lang": "hi" or "en",
        "law": [chunks tagged [L1], [L2]...],
        "qa": [],
        "web": [],
        "any_confident": bool
    }

    Each chunk in law preserves:
      - tag: "[L1]", "[L2]", ...
      - id: section-level ID
      - citation: canonical citation string
      - title: section title
      - text: verbatim/concatenated statutory text
      - status: statutory status (e.g. 'In Force')
      - text_as_on: consolidation date
      - part_title: part / chapter title (e.g. 'Part III - Fundamental Rights')
      - confident: boolean indicating if similarity >= MIN_SIMILARITY
      - similarity: float cosine similarity or None
      - score: RRF score
      - matched_parts: list of individual chunk part IDs
    """
    lang = detect_query_language(query)
    raw_results = retrieve(query=query, k=k, sources=sources)

    law_chunks: List[Dict[str, Any]] = []
    for idx, r in enumerate(raw_results, 1):
        chunk = {
            "tag": f"[L{idx}]",
            "id": r.get("id"),
            "citation": r.get("citation"),
            "title": r.get("title"),
            "text": r.get("text", ""),
            "status": r.get("status") or "In Force",
            "text_as_on": r.get("text_as_on") or "",
            "part_title": r.get("part_title"),
            "confident": bool(r.get("confident", False)),
            "similarity": r.get("similarity"),
            "score": r.get("score"),
            "matched_parts": r.get("matched_parts", []),
        }
        law_chunks.append(chunk)

    any_confident = any(c["confident"] for c in law_chunks)

    return {
        "lang": lang,
        "law": law_chunks,
        "qa": [],
        "web": [],
        "any_confident": any_confident,
    }


if __name__ == "__main__":
    test_q = "can my landlord throw me out without notice"
    evidence = build_evidence(test_q)
    print(f"Query: \"{test_q}\"")
    print(f"Detected Lang: {evidence['lang']} | Any Confident: {evidence['any_confident']}")
    print(f"Law chunks retrieved: {len(evidence['law'])}")
    for chunk in evidence["law"]:
        print(f"  {chunk['tag']}: {chunk['citation']} | Confident: {chunk['confident']} | Sim: {chunk['similarity']}")
