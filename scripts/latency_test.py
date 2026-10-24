#!/usr/bin/env python3
"""
latency_test.py - Benchmarks latency across generation variants for Gemma 4.

Compares:
1. Non-streaming (Default Thinking): Total latency
2. Streaming (Default Thinking): Time to First Token (TTFT) and Total latency
3. Streaming (Minimal Thinking via ThinkingLevel.MINIMAL): TTFT and Total latency
4. Non-streaming (Minimal Thinking): Total latency

Runs each variant 3 times and computes Min, Median, and Max latency.
Prints a formatted comparison table and sample answer texts for quality evaluation.
"""

from __future__ import annotations

import os
import sys
import time
import statistics
from pathlib import Path
from typing import List, Dict, Any, Tuple

# Set UTF-8 encoding for stdout on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from google.genai import types
from orchestrator.evidence import build_evidence
from orchestrator.prompt import build_prompt
from orchestrator.llm import generate, generate_stream, LLMError


def run_benchmark():
    query = "can my landlord throw me out without notice"
    print(f"==================================================================")
    print(f" LEGAL LENS: GEMMA 4 LATENCY & THINKING BENCHMARK")
    print(f"==================================================================")
    print(f"Query: \"{query}\"")
    print(f"Retrieving grounded statutory evidence...")

    evidence = build_evidence(query, k=5)
    print(f"Evidence retrieved: {len(evidence['law'])} statutory chunks | Any Confident: {evidence['any_confident']}")
    for chunk in evidence["law"]:
        print(f"  - {chunk['tag']} {chunk['citation']} (sim: {chunk['similarity']:.4f})")

    prompt_bundle = build_prompt(query, evidence)
    system_prompt = prompt_bundle["system"]
    user_prompt = prompt_bundle["user"]

    print(f"Prompt prepared: System length = {len(system_prompt)} chars | User length = {len(user_prompt)} chars")
    print("-" * 66)

    # Containers for results
    # Each entry: { "variant": str, "metric": str, "runs": [float, float, float] }
    metrics: Dict[str, Dict[str, List[float]]] = {
        "1. Non-streaming (Default Thinking)": {"Total Time": []},
        "2. Streaming (Default Thinking)": {"TTFT": [], "Total Time": []},
        "3. Minimal Thinking (Streaming)": {"TTFT": [], "Total Time": []},
    }

    sample_answers: Dict[str, str] = {}

    ROUNDS = 3

    def safe_run(func, description: str):
        for attempt in range(3):
            try:
                return func()
            except Exception as e:
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    print(f"\n    [Rate limit pause: waiting 25s for token quota window...] ", end="", flush=True)
                    time.sleep(25.0)
                    continue
                raise

    # Variant 1: Non-streaming (Default Thinking)
    print("\n[1/3] Running Variant 1: Non-streaming (Default Thinking)...")
    for r in range(1, ROUNDS + 1):
        print(f"  Run {r}/{ROUNDS}...", end="", flush=True)
        def call_v1():
            t0 = time.perf_counter()
            ans = generate(system=system_prompt, user=user_prompt, thinking_level=None)
            elapsed = time.perf_counter() - t0
            return elapsed, ans

        elapsed, ans = safe_run(call_v1, "V1")
        metrics["1. Non-streaming (Default Thinking)"]["Total Time"].append(elapsed)
        print(f" Done ({elapsed:.3f}s)")
        if "Default" not in sample_answers:
            sample_answers["Default"] = ans
        time.sleep(2.0)

    # Variant 2: Streaming (Default Thinking)
    print("\n[2/3] Running Variant 2: Streaming (Default Thinking)...")
    for r in range(1, ROUNDS + 1):
        print(f"  Run {r}/{ROUNDS}...", end="", flush=True)
        def call_v2():
            t0 = time.perf_counter()
            ttft = None
            chunks = []
            for chunk in generate_stream(system=system_prompt, user=user_prompt, thinking_level=None):
                if ttft is None:
                    ttft = time.perf_counter() - t0
                chunks.append(chunk)
            total = time.perf_counter() - t0
            if ttft is None:
                ttft = total
            return ttft, total, "".join(chunks)

        ttft, total, ans = safe_run(call_v2, "V2")
        metrics["2. Streaming (Default Thinking)"]["TTFT"].append(ttft)
        metrics["2. Streaming (Default Thinking)"]["Total Time"].append(total)
        print(f" Done (TTFT: {ttft:.3f}s, Total: {total:.3f}s)")
        time.sleep(2.0)

    # Variant 3: Minimal Thinking (Streaming)
    print("\n[3/3] Running Variant 3: Minimal Thinking (ThinkingLevel.MINIMAL)...")
    for r in range(1, ROUNDS + 1):
        print(f"  Run {r}/{ROUNDS}...", end="", flush=True)
        def call_v3():
            t0 = time.perf_counter()
            ttft = None
            chunks = []
            for chunk in generate_stream(
                system=system_prompt,
                user=user_prompt,
                thinking_level=types.ThinkingLevel.MINIMAL,
            ):
                if ttft is None:
                    ttft = time.perf_counter() - t0
                chunks.append(chunk)
            total = time.perf_counter() - t0
            if ttft is None:
                ttft = total
            return ttft, total, "".join(chunks)

        ttft, total, ans = safe_run(call_v3, "V3")
        metrics["3. Minimal Thinking (Streaming)"]["TTFT"].append(ttft)
        metrics["3. Minimal Thinking (Streaming)"]["Total Time"].append(total)
        print(f" Done (TTFT: {ttft:.3f}s, Total: {total:.3f}s)")
        if "Minimal" not in sample_answers:
            sample_answers["Minimal"] = ans
        time.sleep(2.0)

    # Print Latency Results Table
    print("\n" + "=" * 88)
    print(f" LATENCY EXPERIMENT RESULTS (3 Runs Each)")
    print("=" * 88)
    header = f"{'Variant':<36} | {'Metric':<12} | {'Run 1':>7} | {'Run 2':>7} | {'Run 3':>7} | {'Min':>7} | {'Median':>7} | {'Max':>7}"
    print(header)
    print("-" * len(header))

    for variant_name, v_metrics in metrics.items():
        for metric_name, runs in v_metrics.items():
            min_val = min(runs)
            med_val = statistics.median(runs)
            max_val = max(runs)
            r1, r2, r3 = runs[0], runs[1], runs[2]
            print(
                f"{variant_name:<36} | {metric_name:<12} | {r1:>6.3f}s | {r2:>6.3f}s | {r3:>6.3f}s | {min_val:>6.3f}s | {med_val:>6.3f}s | {max_val:>6.3f}s"
            )

    print("=" * 88)

    # Print Sample Answer
    print("\n" + "=" * 88)
    print(" FINAL ANSWER TEXT (Default Thinking):")
    print("=" * 88)
    print(sample_answers.get("Default", "(No answer recorded)"))
    print("=" * 88)

    if "Minimal" in sample_answers:
        print("\n" + "=" * 88)
        print(" FINAL ANSWER TEXT (Minimal Thinking):")
        print("=" * 88)
        print(sample_answers.get("Minimal", "(No answer recorded)"))
        print("=" * 88)


if __name__ == "__main__":
    run_benchmark()
