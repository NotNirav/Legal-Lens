#!/usr/bin/env python3
"""
run_eval.py - Evaluation harness for Legal Lens retrieval pipeline.

Evaluates in-scope questions for Hit@1, Hit@3, Hit@5 overall and per language (EN/HI).
Evaluates out-of-scope queries for top-1 similarity, compares distributions,
and validates the confidence threshold (MIN_SIMILARITY).
"""

from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Ensure UTF-8 stdout
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from rag.retrieve import retrieve, MIN_SIMILARITY


QUESTIONS_FILE = PROJECT_ROOT / "eval" / "questions.jsonl"


def load_evaluation_dataset() -> List[Dict[str, Any]]:
    """Loads evaluation items from eval/questions.jsonl."""
    if not QUESTIONS_FILE.exists():
        raise FileNotFoundError(f"Missing evaluation file: {QUESTIONS_FILE}")

    items = []
    with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


def run_evaluation() -> None:
    items = load_evaluation_dataset()
    in_scope_items = [item for item in items if item.get("in_scope") is True]
    out_scope_items = [item for item in items if item.get("in_scope") is False]

    print(f"\n{'='*80}")
    print(f"📊 Legal Lens Retrieval Evaluation Harness")
    print(f"{'='*80}")
    n_en = sum(1 for it in in_scope_items if it.get("lang") == "en")
    n_hi = sum(1 for it in in_scope_items if it.get("lang") == "hi")
    print(f"Loaded {len(items)} questions:")
    print(f"  • In-scope questions     : {len(in_scope_items)} ({n_en} English + {n_hi} Hindi)")
    print(f"  • Out-of-scope questions : {len(out_scope_items)} (Layperson unindexed domains)")
    print(f"  • Configured MIN_SIMILARITY threshold: {MIN_SIMILARITY}")

    # Track in-scope metrics
    in_scope_sims: List[float] = []
    failures: List[Dict[str, Any]] = []

    # Category trackers
    results_by_lang: Dict[str, Dict[str, int]] = {
        "overall": {"total": 0, "hit1": 0, "hit3": 0, "hit5": 0},
        "en": {"total": 0, "hit1": 0, "hit3": 0, "hit5": 0},
        "hi": {"total": 0, "hit1": 0, "hit3": 0, "hit5": 0},
    }

    print(f"\n{'='*80}")
    print("▶️ 1. Evaluating In-Scope Questions (Hit@K)")
    print(f"{'='*80}")

    for idx, item in enumerate(in_scope_items, 1):
        q = item["question"]
        lang = item.get("lang", "en")
        expected_ids = set(item.get("expected_ids", []))

        # Retrieve top 5
        retrieved = retrieve(q, k=5)
        retrieved_ids = [r["id"] for r in retrieved]

        # Check hits
        hit1 = int(any(doc_id in expected_ids for doc_id in retrieved_ids[:1]))
        hit3 = int(any(doc_id in expected_ids for doc_id in retrieved_ids[:3]))
        hit5 = int(any(doc_id in expected_ids for doc_id in retrieved_ids[:5]))

        # Update stats
        results_by_lang["overall"]["total"] += 1
        results_by_lang["overall"]["hit1"] += hit1
        results_by_lang["overall"]["hit3"] += hit3
        results_by_lang["overall"]["hit5"] += hit5

        if lang in results_by_lang:
            results_by_lang[lang]["total"] += 1
            results_by_lang[lang]["hit1"] += hit1
            results_by_lang[lang]["hit3"] += hit3
            results_by_lang[lang]["hit5"] += hit5

        top_sim = retrieved[0]["similarity"] if retrieved and retrieved[0]["similarity"] is not None else 0.0
        in_scope_sims.append(top_sim)

        status_marker = "✅ PASS" if hit1 else ("⚠️ HIT@3/5" if hit5 else "❌ FAIL")
        print(f"[{idx:02d}/{len(in_scope_items):02d}] [{lang.upper()}] {status_marker} | Hit@1: {hit1} | Top-1 Sim: {top_sim:.4f}")
        print(f"      Q: \"{q}\"")
        top_match = retrieved[0] if retrieved else {}
        print(f"      Matched Top-1: {top_match.get('citation')} (Expected: {list(expected_ids)})")

        if not hit1:
            failures.append({
                "question": q,
                "lang": lang,
                "expected": list(expected_ids),
                "hit1": hit1,
                "hit3": hit3,
                "hit5": hit5,
                "top3": retrieved[:3],
            })

    # Summary table for in-scope
    print(f"\n{'-'*80}")
    print("📈 In-Scope Retrieval Performance Summary:")
    print(f"{'-'*80}")
    print(f"{'Category':<15} | {'Count':<8} | {'Hit@1':<12} | {'Hit@3':<12} | {'Hit@5':<12}")
    print(f"{'-'*15}-+-{'-'*8}-+-{'-'*12}-+-{'-'*12}-+-{'-'*12}")
    for cat in ["overall", "en", "hi"]:
        data = results_by_lang[cat]
        tot = max(1, data["total"])
        h1_pct = (data["hit1"] / tot) * 100
        h3_pct = (data["hit3"] / tot) * 100
        h5_pct = (data["hit5"] / tot) * 100
        cat_title = "Overall (All)" if cat == "overall" else ("English" if cat == "en" else "Hindi")
        print(
            f"{cat_title:<15} | {data['total']:<8} | "
            f"{data['hit1']}/{tot} ({h1_pct:5.1f}%) | "
            f"{data['hit3']}/{tot} ({h3_pct:5.1f}%) | "
            f"{data['hit5']}/{tot} ({h5_pct:5.1f}%)"
        )

    # Failures / Non-Hit@1 Reporting
    if failures:
        print(f"\n{'-'*80}")
        print(f"⚠️ Queries Not Achieving Hit@1 ({len(failures)} item(s)):")
        print(f"{'-'*80}")
        for idx, f_item in enumerate(failures, 1):
            print(f"Failure #{idx}: \"{f_item['question']}\" (Lang: {f_item['lang']})")
            print(f"  Expected ID(s) : {f_item['expected']}")
            print(f"  Retrieved Top 3:")
            for r_idx, r in enumerate(f_item["top3"], 1):
                sim_str = f"{r['similarity']:.4f}" if r["similarity"] is not None else "N/A"
                print(f"    [{r_idx}] {r['citation']} (RRF: {r['score']}, Sim: {sim_str})")
                print(f"        Title: {r['title']}")
    else:
        print("\n🎉 Perfect In-Scope Hit@1: 100% of in-scope questions matched expected provision at Rank 1!")

    # 2. Evaluating Out-of-Scope Questions
    print(f"\n{'='*80}")
    print("🚫 2. Evaluating Out-of-Scope Questions (Unindexed Domains)")
    print(f"{'='*80}")

    out_scope_sims: List[float] = []
    print(f"{'#':<3} | {'Top-1 Sim':<10} | {'Confidence':<15} | {'Top-1 Citation':<30} | {'Query'}")
    print(f"{'-'*3}-+-{'-'*10}-+-{'-'*15}-+-{'-'*30}-+-{'-'*25}")
    for idx, item in enumerate(out_scope_items, 1):
        q = item["question"]
        retrieved = retrieve(q, k=1)
        if retrieved:
            top_rec = retrieved[0]
            sim = top_rec["similarity"] if top_rec["similarity"] is not None else 0.0
            out_scope_sims.append(sim)
            conf_str = "Confident" if top_rec["confident"] else "Low Confidence"
            print(f"{idx:<3} | {sim:<10.4f} | {conf_str:<15} | {top_rec['citation'][:28]:<30} | \"{q[:35]}...\"")
        else:
            print(f"{idx:<3} | {'N/A':<10} | {'No Results':<15} | {'N/A':<30} | \"{q[:35]}...\"")

    # 3. Similarity Comparison & Threshold Justification
    print(f"\n{'='*80}")
    print("⚖️ 3. Cosine Similarity Distribution & Threshold Comparison")
    print(f"{'='*80}")

    avg_in = sum(in_scope_sims) / len(in_scope_sims) if in_scope_sims else 0.0
    min_in = min(in_scope_sims) if in_scope_sims else 0.0
    max_in = max(in_scope_sims) if in_scope_sims else 0.0

    avg_out = sum(out_scope_sims) / len(out_scope_sims) if out_scope_sims else 0.0
    min_out = min(out_scope_sims) if out_scope_sims else 0.0
    max_out = max(out_scope_sims) if out_scope_sims else 0.0

    gap = min_in - max_out

    print(f"{'Cohort':<22} | {'Min Sim':<10} | {'Mean Sim':<10} | {'Max Sim':<10}")
    print(f"{'-'*22}-+-{'-'*10}-+-{'-'*10}-+-{'-'*10}")
    print(f"{'In-Scope (Expected)':<22} | {min_in:<10.4f} | {avg_in:<10.4f} | {max_in:<10.4f}")
    print(f"{'Out-of-Scope (Fallbacks)':<22} | {min_out:<10.4f} | {avg_out:<10.4f} | {max_out:<10.4f}")
    print(f"\nSeparation Gap (Min In-Scope - Max Out-of-Scope): {gap:+.4f}")
    print(f"Configured MIN_SIMILARITY threshold: {MIN_SIMILARITY}")
    if min_in >= MIN_SIMILARITY > max_out:
        print(f"🎯 Threshold Verdict: OPTIMAL! Cleanly separates all in-scope hits from out-of-scope queries with zero overlap.")
    else:
        print(f"ℹ️ Recommended Threshold: {((min_in + max_out) / 2):.2f}")


if __name__ == "__main__":
    run_evaluation()
