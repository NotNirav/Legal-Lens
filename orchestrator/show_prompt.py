#!/usr/bin/env python3
"""
show_prompt.py - Demonstration script showing fully assembled system and user prompts.

Runs the answer-assembly pipeline (evidence retrieval + prompt formatting) without
invoking any LLM, for 5 benchmark questions across English, Hindi, and out-of-scope domains.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Ensure UTF-8 console output for Windows PowerShell
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from orchestrator.evidence import build_evidence
from orchestrator.prompt import build_prompt


DEMO_QUERIES = [
    # 1. Tenancy Eviction (English, in-scope)
    ("English Tenancy", "can my landlord throw me out without notice"),

    # 2. Wage Deductions (English, in-scope)
    ("English Wages", "salary deducted without telling me"),

    # 3. Police Arrest (English, in-scope)
    ("English Arrest Rights", "police arrested me without telling me why"),

    # 4. Tenancy Eviction (Hindi, in-scope)
    ("Hindi Tenancy", "क्या मकान मालिक मुझे बिना नोटिस के कमरे से निकाल सकता है"),

    # 5. Defective Phone Refund (English, out-of-scope)
    ("Out-of-Scope Consumer", "how do I get a refund for a defective phone"),
]


def display_prompts_for_query(index: int, category: str, query: str) -> None:
    """Builds evidence and prompt for a query, then displays system + user prompts."""
    print("=" * 90)
    print(f"📌 [{index}/5] QUERY: \"{query}\" ({category})")
    print("=" * 90)

    # 1. Build Evidence (Retrieve top-k distinct law chunks)
    evidence = build_evidence(query, k=5)

    print(f"🔍 RETRIEVAL SUMMARY:")
    print(f"   • Language Detected : {evidence['lang'].upper()}")
    print(f"   • Any Confident     : {evidence['any_confident']}")
    print(f"   • Law Chunks Loaded : {len(evidence['law'])}")
    for chunk in evidence["law"]:
        sim_val = f"{chunk['similarity']:.4f}" if chunk["similarity"] is not None else "N/A"
        print(f"     - {chunk['tag']}: {chunk['citation']} (Sim: {sim_val}, Confident: {chunk['confident']})")

    # 2. Build Formatted System and User Prompts
    prompts = build_prompt(query, evidence)

    print("\n" + "-" * 40 + " [SYSTEM PROMPT] " + "-" * 40)
    print(prompts["system"])

    print("\n" + "-" * 40 + " [USER PROMPT] " + "-" * 42)
    print(prompts["user"])
    print("\n" + "=" * 90 + "\n")


def main() -> None:
    print("\n" + "#" * 90)
    print("🏛️ Legal Lens — Answer Assembly Layer Demonstration (No LLM Call)")
    print("#" * 90 + "\n")

    for idx, (cat, q) in enumerate(DEMO_QUERIES, 1):
        display_prompts_for_query(idx, cat, q)


if __name__ == "__main__":
    main()
