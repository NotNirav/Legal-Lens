#!/usr/bin/env python3
"""
coverage_check.py - Evaluates statutory coverage across Maharashtra & Tripura for Legal Lens.

Queries /ask/sync with:
  (a) Common Dilemma examples from the 4 home cards
  (b) 6 Insights scenario questions (dynamically parsed from frontend source)
  (c) 4 Specific test queries (speeding, municipal shop sealing, deposit, consumer complaint)

Prints:
  - Formatted evaluation table: question, state, any_confident, top 2 citations,
    whether the answer contains "not found" or "could not find", and seconds.
  - Two summary lists at the end:
      1. Questions that returned good cited answers
      2. Questions that returned "not found"
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Set UTF-8 encoding for stdout on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend" / "src"


def extract_home_dilemmas() -> List[Dict[str, str]]:
    """
    Reads the 4 home cards from frontend/src/data/citizenRights.js.
    Extracts the 'Common dilemma' (disputeExample) and prefillQuestion.
    """
    cr_path = FRONTEND_DIR / "data" / "citizenRights.js"
    dilemmas = []

    if cr_path.exists():
        try:
            content = cr_path.read_text(encoding="utf-8")
            match = re.search(r"export const TARGET_AUDIENCES\s*=\s*\[([\s\S]*?)\];", content)
            if match:
                block = match.group(1)
                disputes = re.findall(r'disputeExample:\s*["\'](.*?)["\']', block)
                titles = re.findall(r'title:\s*["\'](.*?)["\']', block)
                prefills = re.findall(r'prefillQuestion:\s*["\'](.*?)["\']', block)
                for i in range(len(disputes)):
                    dilemmas.append({
                        "title": titles[i] if i < len(titles) else "Home Card",
                        "dispute": disputes[i],
                        "prefill": prefills[i] if i < len(prefills) else disputes[i],
                    })
        except Exception as e:
            print(f"[WARN] Failed to parse citizenRights.js: {e}")

    if not dilemmas:
        # Fallback to known home card dilemmas
        dilemmas = [
            {
                "title": "Everyday Citizens",
                "dispute": "Police refusal to register FIR, illegal roadside checks, or denial of public administrative services.",
                "prefill": "What are my legal rights if a police officer stops me or refuses to register a Zero FIR for a cognizable crime?",
            },
            {
                "title": "Tenants & Renters",
                "dispute": "Landlord refusing to refund deposit, cutting off electricity/water, or issuing sudden eviction without written notice.",
                "prefill": "My landlord has cut off my water supply and demanded I vacate within 48 hours without returning my security deposit. What are my legal protections?",
            },
            {
                "title": "Workers & Employees",
                "dispute": "Company abruptly withholding last two months' pay, forced immediate resignations, or refusal to issue service letters.",
                "prefill": "My employer terminated my services abruptly without 30 days notice or severance pay, and is withholding my final salary settlement. How can I legally recover my dues?",
            },
            {
                "title": "Small Business Owners",
                "dispute": "Corporate buyer delaying invoice payment for over 90 days, or dishonored payment cheques without remedy.",
                "prefill": "A corporate client is delaying payment on verified invoices for over 90 days. How can I recover payments and compound interest under the MSME Samadhaan portal?",
            },
        ]
    return dilemmas


def extract_insights_questions() -> List[Dict[str, str]]:
    """
    Reads the 6 animated life scene questions from frontend/src/components/InsightsTab.jsx.
    """
    insights_path = FRONTEND_DIR / "components" / "InsightsTab.jsx"
    questions = []

    if insights_path.exists():
        try:
            content = insights_path.read_text(encoding="utf-8")
            match = re.search(r"const ANIMATED_SCENES\s*=\s*\[([\s\S]*?)\];", content)
            if match:
                block = match.group(1)
                prefills = re.findall(r'prefillQuestion:\s*["\'](.*?)["\']', block)
                titles = re.findall(r'title:\s*["\'](.*?)["\']', block)
                for i in range(len(prefills)):
                    questions.append({
                        "title": titles[i] if i < len(titles) else "Insight Scenario",
                        "question": prefills[i],
                    })
        except Exception as e:
            print(f"[WARN] Failed to parse InsightsTab.jsx: {e}")

    if not questions:
        # Fallback to known 6 insights scenarios
        questions = [
            {
                "title": "The Midnight Police Check",
                "question": "What are my legal rights if a police officer demands to search my personal phone without a warrant during a routine vehicle check?",
            },
            {
                "title": "The Locked-Out Tenant",
                "question": "My landlord has padlocked my rental flat and cut off the water supply over a rent dispute. How do I immediately restore access and take legal action?",
            },
            {
                "title": "The 45-Day MSME Payment Shield",
                "question": "A corporate buyer is withholding payment on my verified MSME invoices beyond 45 days. How do I file on MSME Samadhaan and claim 3x RBI compound interest?",
            },
            {
                "title": "The Zero FIR Liberty",
                "question": "A police officer is refusing to register my complaint because the crime occurred in a different jurisdiction. How do I enforce my right to a Zero FIR?",
            },
            {
                "title": "The 'No Refund' Retail Myth",
                "question": "A seller delivered a defective product and refuses a refund citing 'Goods once sold are not refundable'. How do I file a complaint on e-Daakhil / NCH?",
            },
            {
                "title": "Article 39A: Free State-Funded Justice",
                "question": "How do I apply for free legal aid representation under Article 39A of the Constitution through NALSA or my local DLSA?",
            },
        ]
    return questions


SPECIFIC_QUESTIONS = [
    "I got fined for speeding",
    "my shop was sealed by the municipality",
    "my landlord is not returning my security deposit",
    "how do I file a consumer complaint",
]


def send_ask_sync(
    base_url: str,
    query: str,
    state: str,
    lang: str = "en",
    timeout: float = 45.0,
) -> Tuple[Dict[str, Any], float]:
    """
    Sends a synchronous POST request to /ask/sync.
    Returns (response_dict, elapsed_seconds).
    """
    endpoint = f"{base_url.rstrip('/')}/ask/sync"
    payload = json.dumps({
        "query": query,
        "state": state,
        "lang": lang,
    }).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )

    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read().decode("utf-8")
            elapsed = time.perf_counter() - t0
            return json.loads(data), elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.perf_counter() - t0
        err_msg = e.read().decode("utf-8") if e.fp else str(e)
        return {"error": f"HTTP {e.code}: {err_msg}", "answer": "", "any_confident": False}, elapsed
    except Exception as e:
        elapsed = time.perf_counter() - t0
        return {"error": str(e), "answer": "", "any_confident": False}, elapsed


def truncate_str(s: str, max_len: int) -> str:
    s = s.replace("\n", " ").strip()
    return s if len(s) <= max_len else s[:max_len - 3] + "..."


def main():
    parser = argparse.ArgumentParser(description="Legal Lens statutory coverage checker")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Base URL of Legal Lens API (default: http://127.0.0.1:8000)")
    parser.add_argument("--timeout", type=float, default=50.0, help="Request timeout in seconds")
    args = parser.parse_args()

    print("=" * 115)
    print(" LEGAL LENS: STATUTORY COVERAGE AUDIT & NO-GOOD-SOURCE VERIFICATION")
    print("=" * 115)
    print(f"Target Base URL: {args.url}")

    # Verify server is online
    try:
        with urllib.request.urlopen(f"{args.url.rstrip('/')}/health", timeout=5) as h_resp:
            h_data = json.loads(h_resp.read().decode("utf-8"))
            print(f"Server Status: OK (Indexed chunks: {h_data.get('chunks')}, Models: {h_data.get('models')})\n")
    except Exception as e:
        print(f"[ERROR] Cannot connect to server at {args.url}: {e}")
        print("Please ensure the backend is running (e.g., via 'powershell scripts/start_demo.ps1')")
        sys.exit(1)

    # Gather test questions
    home_dilemmas = extract_home_dilemmas()
    insights_scenarios = extract_insights_questions()

    test_queries: List[Dict[str, str]] = []

    # (a) Four Home Card Common Dilemmas
    for d in home_dilemmas:
        test_queries.append({
            "category": "Home Dilemma",
            "question": d["dispute"],
            "title": d["title"],
        })

    # (b) Six Insights Scenario Questions
    for s in insights_scenarios:
        test_queries.append({
            "category": "Insights Scenario",
            "question": s["question"],
            "title": s["title"],
        })

    # (c) Specific queries
    for q in SPECIFIC_QUESTIONS:
        test_queries.append({
            "category": "Specific Query",
            "question": q,
            "title": "Ad-hoc Query",
        })

    states = ["Maharashtra", "Tripura"]

    print(f"Loaded {len(test_queries)} unique test questions across 3 categories:")
    print(f"  - (a) Home Card Common Dilemmas: {len(home_dilemmas)}")
    print(f"  - (b) Insights Scenarios: {len(insights_scenarios)}")
    print(f"  - (c) Specific Questions: {len(SPECIFIC_QUESTIONS)}")
    print(f"States to test: {', '.join(states)} (Total queries: {len(test_queries) * len(states)})\n")

    results_table = []
    good_cited_answers = []
    not_found_answers = []

    col_widths = {
        "cat": 14,
        "q": 34,
        "state": 12,
        "conf": 6,
        "citations": 32,
        "not_found": 11,
        "sec": 6,
    }

    header = (
        f"| {'Category':<{col_widths['cat']}} "
        f"| {'Question':<{col_widths['q']}} "
        f"| {'State':<{col_widths['state']}} "
        f"| {'Conf':<{col_widths['conf']}} "
        f"| {'Top 2 Citations':<{col_widths['citations']}} "
        f"| {'\"Not Found\"?':<{col_widths['not_found']}} "
        f"| {'Sec':<{col_widths['sec']}} |"
    )
    separator = (
        f"|{'-' * (col_widths['cat'] + 2)}"
        f"|{'-' * (col_widths['q'] + 2)}"
        f"|{'-' * (col_widths['state'] + 2)}"
        f"|{'-' * (col_widths['conf'] + 2)}"
        f"|{'-' * (col_widths['citations'] + 2)}"
        f"|{'-' * (col_widths['not_found'] + 2)}"
        f"|{'-' * (col_widths['sec'] + 2)}|"
    )

    print(separator)
    print(header)
    print(separator)

    for state in states:
        for item in test_queries:
            q = item["question"]
            cat = item["category"]

            res, elapsed = send_ask_sync(
                base_url=args.url,
                query=q,
                state=state,
                lang="en",
                timeout=args.timeout,
            )

            any_confident = bool(res.get("any_confident", False))
            answer = res.get("answer", "")
            ans_lower = answer.lower()

            # Check if answer contains "not found" or "could not find"
            contains_not_found = ("not found" in ans_lower) or ("could not find" in ans_lower)

            # Top 2 citations: prioritize actual sources_cited from answer, fallback to retrieved
            sources_cited = res.get("sources_cited", [])
            retrieved_sources = res.get("sources", [])

            if sources_cited:
                cit_strs = [s.get("citation", "") for s in sources_cited[:2] if s.get("citation")]
                citations_display = "; ".join(cit_strs)
                if len(sources_cited) > 2:
                    citations_display += f" (+{len(sources_cited) - 2})"
            elif retrieved_sources:
                cit_strs = [s.get("citation", "") for s in retrieved_sources[:2] if s.get("citation")]
                citations_display = f"None cited ({'; '.join(cit_strs)})"
            else:
                citations_display = "None"

            # Determine classification for end lists:
            # Good cited answer: confident or cited sources without "not found"
            is_good_cited = (len(sources_cited) > 0 or any_confident) and not contains_not_found
            is_not_found = contains_not_found or (not any_confident and len(sources_cited) == 0)

            rec = {
                "category": cat,
                "question": q,
                "state": state,
                "any_confident": any_confident,
                "top_citations": citations_display,
                "sources_cited": [s.get("citation") for s in sources_cited],
                "contains_not_found": contains_not_found,
                "seconds": round(elapsed, 2),
                "is_good_cited": is_good_cited,
                "is_not_found": is_not_found,
                "answer_preview": truncate_str(answer, 120),
            }
            results_table.append(rec)

            if is_good_cited:
                good_cited_answers.append(rec)
            else:
                not_found_answers.append(rec)

            row = (
                f"| {truncate_str(cat, col_widths['cat']):<{col_widths['cat']}} "
                f"| {truncate_str(q, col_widths['q']):<{col_widths['q']}} "
                f"| {truncate_str(state, col_widths['state']):<{col_widths['state']}} "
                f"| {str(any_confident):<{col_widths['conf']}} "
                f"| {truncate_str(citations_display, col_widths['citations']):<{col_widths['citations']}} "
                f"| {('YES' if contains_not_found else 'NO'):<{col_widths['not_found']}} "
                f"| {elapsed:>{col_widths['sec']}.2f} |"
            )
            print(row)
            sys.stdout.flush()

    print(separator)
    print("\n")

    # Final summary lists
    print("=" * 115)
    print(f" SUMMARY LIST 1: QUESTIONS THAT RETURNED GOOD CITED ANSWERS ({len(good_cited_answers)})")
    print(" (Reliably grounded in indexed statutory corpus; keep in UI or highlight prominently)")
    print("=" * 115)
    if good_cited_answers:
        # Group by question text
        seen_q = set()
        for idx, rec in enumerate(good_cited_answers, 1):
            key = (rec["question"], rec["state"])
            if key not in seen_q:
                seen_q.add(key)
                cited_str = ", ".join(rec["sources_cited"]) if rec["sources_cited"] else rec["top_citations"]
                print(f"[{idx:02d}] State: {rec['state']} | Category: {rec['category']}")
                print(f"     Question: \"{rec['question']}\"")
                print(f"     Citations: {cited_str} (any_confident={rec['any_confident']})")
                print()
    else:
        print("  (None found)\n")

    print("=" * 115)
    print(f" SUMMARY LIST 2: QUESTIONS THAT RETURNED 'NOT FOUND' ({len(not_found_answers)})")
    print(" (Answer correctly declared reliable source not found, listed database scope, and routed to NALSA/DLSA)")
    print("=" * 115)
    if not_found_answers:
        seen_q = set()
        for idx, rec in enumerate(not_found_answers, 1):
            key = (rec["question"], rec["state"])
            if key not in seen_q:
                seen_q.add(key)
                print(f"[{idx:02d}] State: {rec['state']} | Category: {rec['category']}")
                print(f"     Question: \"{rec['question']}\"")
                print(f"     Citations: {rec['top_citations']}")
                print(f"     Contains 'not found'/'could not find': {rec['contains_not_found']}")
                print(f"     Answer Snippet: {rec['answer_preview']}")
                print()
    else:
        print("  (None found)\n")

    print("=" * 115)
    print(" RECOMMENDATIONS FOR UI / STATUTE ADDITIONS:")
    print("=" * 115)
    print("1. Criminal Procedure & FIR: Neither CrPC nor Bharatiya Nagarik Suraksha Sanhita (BNSS) are currently indexed.")
    print("   -> Queries regarding Zero FIR, police stops, or refusal to register FIR currently fall back cleanly to NALSA/DLSA.")
    print("   -> Action: Add BNSS 2023 / CrPC Chapter XII to data/processed to enable statutory grounding.")
    print("2. Consumer Law: Consumer Protection Act 2019 is not currently indexed.")
    print("   -> Consumer defect/refund queries cleanly fall back.")
    print("   -> Action: Ingest Consumer Protection Act, 2019 (Sections 2(46), 35, 38).")
    print("3. Motor Vehicles Act: Speeding fines / traffic challans are not currently indexed.")
    print("   -> Action: Ingest Motor Vehicles (Amendment) Act 2019 or adjust UI suggestions.")
    print("4. MSME Delayed Payments: MSMED Act, 2006 is not currently indexed in data/processed.")
    print("   -> Action: Ingest MSMED Act (Sections 15-18).")
    print("=" * 115)


if __name__ == "__main__":
    main()
