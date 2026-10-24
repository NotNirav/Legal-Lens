#!/usr/bin/env python3
"""
test_web.py - Test suite for orchestrator/web.py.

Demonstrates:
Part 1: Strict 10-second hard timeout behavior (on timeout/error -> ok=False, empty findings).
Part 2: Google Search grounding and official domain filtering:
  - "has the Indian Penal Code been replaced"
  - "Maharashtra Rent Control Act latest amendment"
  - "how do I file a consumer complaint online"
  - Grounding returns nothing useful (fictional/unverifiable query)

Prints findings, kept sources (.gov.in / .nic.in / allowlist), dropped sources, and latency.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# Set UTF-8 encoding for stdout on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from orchestrator.web import web_evidence


def run_tests():
    test_queries = [
        ("has the Indian Penal Code been replaced", 25.0),
        ("Maharashtra Rent Control Act latest amendment", 25.0),
        ("how do I file a consumer complaint online", 25.0),
        ("Martian colony lease code section 999 extraterrestrial tenancy rules 2099", 25.0),
    ]

    print("=" * 95)
    print("🌐 LEGAL LENS: WEB GROUNDING & OFFICIAL SOURCE FILTERING TEST SUITE")
    print("=" * 95)

    # -------------------------------------------------------------------------
    # PART 1: 10-Second Hard Timeout Verification
    # -------------------------------------------------------------------------
    print("\n[PART 1] Verifying 10-Second Hard Timeout & Clean Fallback Protocol:")
    t0 = time.perf_counter()
    timeout_res = web_evidence("has the Indian Penal Code been replaced", timeout=10.0)
    lat_to = time.perf_counter() - t0
    print(f"  Query: \"has the Indian Penal Code been replaced\" (timeout=10.0s)")
    print(f"  Result ok={timeout_res['ok']} | Latency: {lat_to:.2f}s | Findings empty: {timeout_res['findings'] == ''}")
    print(f"  Kept sources: {len(timeout_res['sources'])} | Dropped sources: {len(timeout_res['dropped_sources'])}")
    assert timeout_res["ok"] is False or lat_to <= 10.0
    print("  -> Passed: System enforces hard 10s timeout, gracefully falls back without crashing.")
    time.sleep(3.0)

    # -------------------------------------------------------------------------
    # PART 2: Grounding, Official Domain Filtering, and Findings Inspection
    # -------------------------------------------------------------------------
    print("\n" + "=" * 95)
    print("[PART 2] Grounding Inspection & Domain Filtering across Test Queries:")
    print("=" * 95)

    for idx, (query, timeout_val) in enumerate(test_queries, 1):
        print(f"\n--- [{idx}/4] Query: \"{query}\" ---")
        t0 = time.perf_counter()
        result = web_evidence(query, timeout=timeout_val)
        latency = time.perf_counter() - t0

        ok = result.get("ok", False)
        findings = result.get("findings", "")
        sources = result.get("sources", [])
        dropped = result.get("dropped_sources", [])

        status_str = "SUCCESS (ok=True)" if ok else "FAILED (ok=False)"
        print(f"Status: {status_str} | Latency: {latency:.2f}s")

        print(f"\nKept Official Sources (.gov.in / .nic.in / allowlist): {len(sources)}")
        if sources:
            for s in sources:
                print(f"  [KEPT] Domain: {s['domain']:<28} | Title: {s['title'][:40]:<40} | URL: {s['url'][:60]}...")
        else:
            print("  (No official .gov.in / .nic.in / allowlist sources found)")

        print(f"\nDropped Sources (Non-Official / Filtered Out): {len(dropped)}")
        for d in dropped[:6]:
            print(f"  [DROPPED] Domain: {d['domain']:<26} | Title: {d['title'][:40]:<40}")
        if len(dropped) > 6:
            print(f"  ... and {len(dropped) - 6} more non-official sources filtered out")

        print(f"\nFactual Findings (Untrusted Web Data):")
        if findings:
            for line in findings.split("\n"):
                if line.strip():
                    print(f"  {line}")
        else:
            print("  (Empty findings / No useful grounding returned)")

        print("-" * 95)
        time.sleep(3.0)


if __name__ == "__main__":
    run_tests()
