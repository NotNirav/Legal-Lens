#!/usr/bin/env python3
"""
warm_cache.py - Pre-generate and cache answers for golden demo questions.

Loads evaluation test cases from eval/golden_demo.json, runs the synchronous
answer generation pipeline (run_pipeline_sync), and persists the output to
cache/answers.json.

Usage:
    python scripts/warm_cache.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from orchestrator.cache import get_cache_count, get_cached_answer, set_cached_answer
from orchestrator.pipeline import run_pipeline_sync

GOLDEN_DEMO_FILE = PROJECT_ROOT / "eval" / "golden_demo.json"


async def warm_cache(golden_path: Path = GOLDEN_DEMO_FILE, delay_between: float = 1.5) -> None:
    if not golden_path.exists():
        print(f"[!] Golden demo file not found: {golden_path}")
        sys.exit(1)

    with open(golden_path, "r", encoding="utf-8") as f:
        cases = json.load(f)

    total = len(cases)
    print("=" * 70)
    print(f"[*] Legal Lens Cache Warming Script")
    print(f"[*] Loaded {total} golden questions from {golden_path.name}")
    print(f"[*] Target Cache File: cache/answers.json")
    print("=" * 70)

    cached_before = get_cache_count()
    print(f"[*] Initial cache count: {cached_before} entries\n")

    for idx, case in enumerate(cases, start=1):
        q = case["query"]
        state = case.get("state", "Maharashtra")
        lang = case.get("lang", "en")
        topic = case.get("topic", "general")

        print(f"[{idx}/{total}] Processing ({lang.upper()} | {state}): \"{q[:60]}...\"")
        
        # Check if already cached
        existing = get_cached_answer(query=q, state=state, lang=lang)
        if existing and not existing.get("fallback"):
            print(f"       -> Already in cache. Skipping.")
            continue

        t0 = time.perf_counter()
        try:
            res = await run_pipeline_sync(query=q, state=state, lang=lang)
            elapsed = time.perf_counter() - t0
            ans_len = len(res.get("answer", ""))
            sources_count = len(res.get("sources_cited", []))
            fallback = res.get("fallback", False)
            fb_tag = " (FALLBACK)" if fallback else ""

            # Ensure answer is persisted
            set_cached_answer(query=q, state=state, lang=lang, data=res)
            print(f"       -> Cached in {elapsed:.2f}s | {ans_len} chars | {sources_count} citations{fb_tag}")
        except Exception as exc:
            print(f"       -> [ERROR] Failed to warm cache for query: {exc}")

        if idx < total and delay_between > 0:
            await asyncio.sleep(delay_between)

    cached_after = get_cache_count()
    print("\n" + "=" * 70)
    print(f"[+] Cache warming finished. Total entries: {cached_after} (added: {cached_after - cached_before})")
    print("=" * 70)


def main() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(warm_cache())
    finally:
        loop.close()


if __name__ == "__main__":
    main()
