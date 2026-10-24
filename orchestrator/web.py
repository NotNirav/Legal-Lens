#!/usr/bin/env python3
"""
web.py - Grounded web search evidence module for Legal Lens.

Performs live Google Search Grounding using gemma-4-26b-a4b-it via orchestrator/llm.py to discover:
- Current legal amendments, repeals, and replacements
- Practical official steps, helplines, and government portals

Enforces strict domain allowlists (.gov.in, .nic.in, and official legal registries),
reads URLs exclusively from grounding metadata, applies a hard 10-second timeout,
and treats all web findings as untrusted reference data.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from google.genai import types
from orchestrator.llm import generate

WEB_SEARCH_SYSTEM_PROMPT = (
    "Find what CURRENT official Indian sources say about this legal question: "
    "whether the relevant law was amended, repealed or replaced, and practical "
    "steps (where to file, official portals). Report only facts found, list sources, "
    "do not give legal advice."
)

OFFICIAL_ALLOWLIST = {
    "indiacode.nic.in",
    "sci.gov.in",
    "egazette.gov.in",
    "legislative.gov.in",
    "nalsa.gov.in",
    "doj.gov.in",
    "consumerhelpline.gov.in",
    "edaakhil.nic.in",
}

HARD_TIMEOUT_SECONDS = 10.0

# Kept in memory for debugging inspection only, never returned in user output
LAST_DROPPED_SOURCES: List[Dict[str, str]] = []


def _extract_domain(title: str, uri: str) -> str:
    """
    Extracts the source domain from grounding metadata.

    Google GenAI search grounding sets title to the source domain (e.g., 'pib.gov.in')
    when uri is a vertex redirect link, or uri contains the direct hostname.
    """
    if uri:
        try:
            parsed = urlparse(uri)
            netloc = parsed.netloc.lower()
            if "google.com" in netloc and "/url" in parsed.path:
                qs = parse_qs(parsed.query)
                if "q" in qs and qs["q"]:
                    target = urlparse(qs["q"][0]).netloc.lower()
                    if target:
                        netloc = target
            if netloc and not netloc.endswith("google.com"):
                if ":" in netloc:
                    netloc = netloc.split(":")[0]
                return netloc
        except Exception:
            pass

    t = (title or "").strip().lower()
    if t:
        t_clean = t.replace("http://", "").replace("https://", "").split("/")[0].strip()
        if ":" in t_clean:
            t_clean = t_clean.split(":")[0]
        if "." in t_clean and " " not in t_clean:
            return t_clean
        for word in t.split():
            w = word.strip("(),;:'\"[]{}")
            if "." in w and (w.endswith(".in") or w.endswith(".gov") or w.endswith(".org") or w.endswith(".nic")):
                if ":" in w:
                    w = w.split(":")[0]
                return w
        return t_clean

    return ""


def _is_official_domain(domain: str) -> bool:
    """
    Validates if a domain ends in .gov.in, .nic.in, or matches the official allowlist:
    indiacode.nic.in, sci.gov.in, egazette.gov.in, legislative.gov.in,
    nalsa.gov.in, doj.gov.in, consumerhelpline.gov.in, edaakhil.nic.in.
    """
    d = domain.lower().strip()
    if not d:
        return False
    if ":" in d:
        d = d.split(":")[0]

    # Check ends with .gov.in or .nic.in
    if d.endswith(".gov.in") or d.endswith(".nic.in"):
        return True

    # Check explicit allowlist
    for allowed in OFFICIAL_ALLOWLIST:
        if d == allowed or d.endswith("." + allowed):
            return True

    return False


def web_evidence(
    query: str,
    state: Optional[str] = None,
    lang: str = "en",
    timeout: float = HARD_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    """
    Fetches official web evidence using gemma-4-26b-a4b-it via orchestrator/llm.py
    with the Google Search tool.

    URLs are extracted exclusively from grounding metadata, never from model text.
    Filters sources to official .gov.in, .nic.in and allowlist domains.
    Applies a hard timeout (10 seconds default). On timeout, error or empty result,
    returns ok=False with empty findings so the pipeline continues without web.

    Returns:
    {
        "ok": bool,
        "findings": str,
        "sources": [{"title": str, "url": str, "domain": str}],
        "latency": float
    }
    """
    global LAST_DROPPED_SOURCES
    start_time = time.perf_counter()

    # Backwards compatibility: handle if 2nd positional arg was lang (e.g. 'en', 'hi')
    if state in ["en", "hi"] and lang == "en":
        lang = state
        state = None

    effective_timeout = float(timeout) if timeout else HARD_TIMEOUT_SECONDS

    try:
        user_content = query
        if state:
            user_content = f"{query}\nState jurisdiction: {state}"
        if lang == "hi":
            user_content += "\n(Please respond in simple Hindi while citing official Indian portals/statutes)"

        search_tool = types.Tool(google_search=types.GoogleSearch())

        response = generate(
            model="gemma-4-26b-a4b-it",
            system=WEB_SEARCH_SYSTEM_PROMPT,
            user=user_content,
            tools=[search_tool],
            timeout=int(effective_timeout),
            thinking_level=None,
            temperature=0.1,
            return_raw=True,
        )

        elapsed = time.perf_counter() - start_time
        if elapsed > effective_timeout or response is None:
            return {
                "ok": False,
                "findings": "",
                "sources": [],
                "latency": round(elapsed, 3),
            }

        findings_text = (response.text or "").strip()
        if not findings_text:
            return {
                "ok": False,
                "findings": "",
                "sources": [],
                "latency": round(elapsed, 3),
            }

        grounding_meta = None
        if response.candidates:
            grounding_meta = getattr(response.candidates[0], "grounding_metadata", None)

        kept_sources: List[Dict[str, str]] = []
        dropped_sources: List[Dict[str, str]] = []
        seen_keys = set()

        if grounding_meta:
            chunks = getattr(grounding_meta, "grounding_chunks", []) or []
            for chunk in chunks:
                web = getattr(chunk, "web", None)
                if not web:
                    continue

                raw_title = getattr(web, "title", "") or ""
                raw_uri = getattr(web, "uri", "") or ""
                domain = _extract_domain(raw_title, raw_uri)

                source_item = {
                    "title": raw_title,
                    "url": raw_uri,
                    "domain": domain,
                }

                key = (domain, raw_uri)
                if key in seen_keys:
                    continue
                seen_keys.add(key)

                if _is_official_domain(domain):
                    kept_sources.append(source_item)
                else:
                    dropped_sources.append(source_item)

        LAST_DROPPED_SOURCES = dropped_sources

        return {
            "ok": True,
            "findings": findings_text,
            "sources": kept_sources,
            "latency": round(elapsed, 3),
        }

    except Exception:
        elapsed = time.perf_counter() - start_time
        return {
            "ok": False,
            "findings": "",
            "sources": [],
            "latency": round(elapsed, 3),
        }


if __name__ == "__main__":
    test_q = "has the Indian Penal Code been replaced"
    print(f"Testing web_evidence for: \"{test_q}\"")
    res = web_evidence(test_q)
    print("ok:", res["ok"])
    print("kept domains:", [s["domain"] for s in res["sources"]])
    print("latency:", res["latency"])
