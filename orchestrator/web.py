#!/usr/bin/env python3
"""
web.py - Grounded web search evidence module for Legal Lens.

Performs live Google Search Grounding using gemma-4-26b-a4b-it to discover:
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
from typing import Any, Dict, List
from urllib.parse import urlparse

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from google.genai import types
from orchestrator.llm import get_client

WEB_SEARCH_SYSTEM_PROMPT = (
    "Find what CURRENT official sources say about this Indian legal question: "
    "whether the relevant law has been amended, repealed or replaced, and practical "
    "steps (where to file, helplines, official portals). Report only facts found; "
    "list sources; do not give legal advice."
)

OFFICIAL_ALLOWLIST = {
    "indiacode.nic.in",
    "sci.gov.in",
    "main.sci.gov.in",
    "egazette.gov.in",
    "legislative.gov.in",
    "nalsa.gov.in",
    "doj.gov.in",
    "consumerhelpline.gov.in",
    "edaakhil.nic.in",
}

HARD_TIMEOUT_SECONDS = 10.0


def _extract_domain(title: str, uri: str) -> str:
    """
    Extracts the source domain from grounding metadata.

    Google GenAI search grounding typically sets title to the source domain
    (e.g., 'pib.gov.in') when uri is a vertex redirect link, or uri contains
    the direct hostname.
    """
    # 1. Check uri netloc if not google redirect
    if uri:
        try:
            parsed = urlparse(uri)
            netloc = parsed.netloc.lower()
            if netloc and not netloc.endswith("google.com"):
                if ":" in netloc:
                    netloc = netloc.split(":")[0]
                return netloc
        except Exception:
            pass

    # 2. Check title
    t = (title or "").strip().lower()
    if t:
        # Strip scheme / path if title was formatted as a URL
        t_clean = t.replace("http://", "").replace("https://", "").split("/")[0].strip()
        if ":" in t_clean:
            t_clean = t_clean.split(":")[0]
        if "." in t_clean and " " not in t_clean:
            return t_clean
        # Search for domain pattern in title words
        for word in t.split():
            w = word.strip("(),;:'\"[]{}")
            if "." in w and (w.endswith(".in") or w.endswith(".org") or w.endswith(".com") or w.endswith(".net") or w.endswith(".edu")):
                if ":" in w:
                    w = w.split(":")[0]
                return w
        return t_clean

    return ""


def _is_official_domain(domain: str) -> bool:
    """
    Validates if a domain ends in .gov.in, .nic.in, or matches the official allowlist.
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
    lang: str = "en",
    timeout: float = HARD_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    """
    Fetches official web evidence using Gemma 4 with Google Search Grounding.

    Returns:
    {
        "findings": str,                  # Grounded factual findings (untrusted data)
        "sources": [{"title", "url", "domain"}], # Kept official sources (.gov.in, .nic.in, allowlist)
        "dropped_sources": [...],         # Filtered out non-official sources (for debugging)
        "ok": bool                        # True if successful, False on timeout / error
    }
    """
    start_time = time.perf_counter()

    try:
        client = get_client()

        # Build config with Google Search tool and hard timeout
        # Using ThinkingLevel.MINIMAL minimizes thinking latency to fit within timeout
        cfg = types.GenerateContentConfig(
            system_instruction=WEB_SEARCH_SYSTEM_PROMPT,
            tools=[types.Tool(google_search=types.GoogleSearch())],
            http_options=types.HttpOptions(timeout=int(timeout * 1000)),
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL),
            temperature=0.1,
        )

        user_content = query if lang != "hi" else f"{query}\n(Please respond in Hindi while citing official Indian portals/statutes)"

        response = client.models.generate_content(
            model="gemma-4-26b-a4b-it",
            contents=user_content,
            config=cfg,
        )

        elapsed = time.perf_counter() - start_time
        if elapsed > timeout:
            # Enforce timeout boundary
            return {
                "findings": "",
                "sources": [],
                "dropped_sources": [],
                "ok": False,
            }

        findings_text = (response.text or "").strip()

        # Parse grounding metadata
        grounding_meta = None
        if response.candidates:
            grounding_meta = getattr(response.candidates[0], "grounding_metadata", None)

        kept_sources: List[Dict[str, str]] = []
        dropped_sources: List[Dict[str, str]] = []
        seen_urls = set()

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

                # Deduplicate by url/title
                key = (domain, raw_uri)
                if key in seen_urls:
                    continue
                seen_urls.add(key)

                if _is_official_domain(domain):
                    kept_sources.append(source_item)
                else:
                    dropped_sources.append(source_item)

        return {
            "findings": findings_text,
            "sources": kept_sources,
            "dropped_sources": dropped_sources,
            "ok": True,
        }

    except Exception:
        # On timeout (504 DEADLINE_EXCEEDED) or any client error, fail cleanly
        return {
            "findings": "",
            "sources": [],
            "dropped_sources": [],
            "ok": False,
        }


if __name__ == "__main__":
    test_q = "has the Indian Penal Code been replaced"
    print(f"Testing web_evidence for: \"{test_q}\"")
    res = web_evidence(test_q)
    print("OK:", res["ok"])
    print("Kept sources:", len(res["sources"]))
    print("Dropped sources:", len(res["dropped_sources"]))
    print("Findings (preview):", res["findings"][:200])
