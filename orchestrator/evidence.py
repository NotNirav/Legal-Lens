#!/usr/bin/env python3
"""
evidence.py - Evidence aggregation layer for Legal Lens.

Calls tiered retrieval (rag.retrieve.retrieve_tiered), aggregates statutory,
constitutional, state law, Q&A, grounded web, and uploaded document facts into
a tagged flat evidence list:
  [C1].. Constitution of India
  [L1].. Central statutory law
  [S1].. State-specific statutory law
  [Q1].. Authoritative Q&A / Case summaries
  [W1].. Grounded web findings
  [D1].. Uploaded user document facts
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from rag.retrieve import retrieve_tiered


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


def _truncate_text(text: str, max_chars: int = 1500) -> str:
    """Truncates text cleanly to approximately max_chars."""
    s = (text or "").strip()
    if len(s) > max_chars:
        return s[:max_chars].rstrip() + "..."
    return s


class EvidenceList(list):
    """
    Flat list of evidence items with backwards-compatible dictionary access
    and convenience metadata attributes (any_confident, lang, state).
    """

    def __init__(
        self,
        items: Optional[List[Dict[str, Any]]] = None,
        any_confident: bool = False,
        lang: str = "en",
        state: Optional[str] = None,
        tiered_raw: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(items or [])
        self.any_confident = any_confident
        self.lang = lang
        self.state = state
        self.tiered_raw = tiered_raw or {}

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except (KeyError, TypeError):
            return default

    def __getitem__(self, item: Any) -> Any:
        if isinstance(item, str):
            if item == "any_confident":
                return self.any_confident
            if item == "lang":
                return self.lang
            if item == "state":
                return self.state
            if item == "law":
                return [x for x in self if str(x.get("tag", "")).startswith(("[C", "[L", "[S"))]
            if item == "constitution":
                return [x for x in self if str(x.get("tag", "")).startswith("[C")]
            if item == "central":
                return [x for x in self if str(x.get("tag", "")).startswith("[L")]
            if item == "state_law":
                return [x for x in self if str(x.get("tag", "")).startswith("[S")]
            if item == "qa":
                return [x for x in self if str(x.get("tag", "")).startswith("[Q")]
            if item == "web":
                return [x for x in self if str(x.get("tag", "")).startswith("[W")]
            if item == "doc":
                return [x for x in self if str(x.get("tag", "")).startswith("[D")]
            raise KeyError(f"Invalid EvidenceList key: {item}")
        return super().__getitem__(item)


def format_tiered_evidence(
    tiered: Dict[str, Any],
    web: Any = None,
    doc: Any = None,
    state: Optional[str] = None,
    lang: str = "en",
) -> EvidenceList:
    """
    Transforms raw tiered retrieval results and web/doc findings into a flat EvidenceList.
    """
    flat_items: List[Dict[str, Any]] = []

    # 1. Constitution [C1]..
    for idx, r in enumerate(tiered.get("constitution", []), 1):
        source = r.get("source") or "Constitution of India"
        section = r.get("section") or ""
        citation = r.get("citation") or f"{source}, {section}".strip(", ")
        flat_items.append({
            "tag": f"[C{idx}]",
            "source": source,
            "section": section,
            "citation": citation,
            "text": _truncate_text(r.get("text", "")),
            "status": r.get("status") or "In Force",
            "text_as_on": r.get("text_as_on") or "",
            "jurisdiction": r.get("jurisdiction") or "India",
            "url": r.get("url") or "",
            "part_title": r.get("part_title"),
            "confident": bool(r.get("confident", False)),
            "similarity": r.get("similarity"),
            "tier": "constitution",
        })

    # 2. Central Law [L1]..
    for idx, r in enumerate(tiered.get("central", []), 1):
        source = r.get("source") or "Central Act"
        section = r.get("section") or ""
        citation = r.get("citation") or f"{source}, {section}".strip(", ")
        flat_items.append({
            "tag": f"[L{idx}]",
            "source": source,
            "section": section,
            "citation": citation,
            "text": _truncate_text(r.get("text", "")),
            "status": r.get("status") or "In Force",
            "text_as_on": r.get("text_as_on") or "",
            "jurisdiction": r.get("jurisdiction") or "India",
            "url": r.get("url") or "",
            "part_title": r.get("part_title"),
            "confident": bool(r.get("confident", False)),
            "similarity": r.get("similarity"),
            "tier": "central",
        })

    # 3. State Law [S1]..
    for idx, r in enumerate(tiered.get("state", []), 1):
        source = r.get("source") or "State Act"
        section = r.get("section") or ""
        citation = r.get("citation") or f"{source}, {section}".strip(", ")
        flat_items.append({
            "tag": f"[S{idx}]",
            "source": source,
            "section": section,
            "citation": citation,
            "text": _truncate_text(r.get("text", "")),
            "status": r.get("status") or "In Force",
            "text_as_on": r.get("text_as_on") or "",
            "jurisdiction": r.get("jurisdiction") or (state or "State"),
            "url": r.get("url") or "",
            "part_title": r.get("part_title"),
            "confident": bool(r.get("confident", False)),
            "similarity": r.get("similarity"),
            "tier": "state",
        })

    # 4. Authoritative Q&A [Q1]..
    for idx, r in enumerate(tiered.get("qa", []), 1):
        qa_text = r.get("text") or f"Q: {r.get('question', '')}\nA: {r.get('answer', '')}"
        source = r.get("case_title") or r.get("source") or "Authoritative Q&A"
        citation = r.get("citation") or f"{source} {idx}"
        flat_items.append({
            "tag": f"[Q{idx}]",
            "source": source,
            "section": r.get("section") or "",
            "citation": citation,
            "text": _truncate_text(qa_text),
            "status": r.get("status") or "Authoritative Q&A",
            "text_as_on": r.get("text_as_on") or "",
            "jurisdiction": r.get("jurisdiction") or "India",
            "url": r.get("url") or "",
            "part_title": r.get("part_title"),
            "tier": "qa",
        })

    # 5. Web Findings [W1]..
    if web:
        if isinstance(web, dict):
            findings = web.get("findings", "")
            sources = web.get("sources", [])
            if findings:
                url = sources[0].get("url", "") if sources else ""
                cit = sources[0].get("title", "Official Web Search") if sources else "Official Web Search"
                flat_items.append({
                    "tag": "[W1]",
                    "source": "Official Web Search",
                    "section": "",
                    "citation": cit,
                    "text": _truncate_text(findings),
                    "status": "Untrusted Web Data",
                    "text_as_on": "Current",
                    "jurisdiction": "Web",
                    "url": url,
                    "tier": "web",
                })
        elif isinstance(web, list):
            for idx, w in enumerate(web, 1):
                if isinstance(w, dict):
                    cit = w.get("citation") or w.get("title") or f"Web Source {idx}"
                    txt = w.get("text") or w.get("snippet") or w.get("findings") or ""
                    status = w.get("status") or "Untrusted Web Data"
                    text_as_on = w.get("text_as_on") or ""
                    jur = w.get("jurisdiction") or "Web"
                    url = w.get("url") or ""
                else:
                    cit = f"Web Source {idx}"
                    txt = str(w)
                    status = "Untrusted Web Data"
                    text_as_on = ""
                    jur = "Web"
                    url = ""
                flat_items.append({
                    "tag": f"[W{idx}]",
                    "source": "Official Web Search",
                    "section": "",
                    "citation": cit,
                    "text": _truncate_text(txt),
                    "status": status,
                    "text_as_on": text_as_on,
                    "jurisdiction": jur,
                    "url": url,
                    "tier": "web",
                })
        elif isinstance(web, str) and web.strip():
            flat_items.append({
                "tag": "[W1]",
                "source": "Official Web Search",
                "section": "",
                "citation": "Official Web Search",
                "text": _truncate_text(web),
                "status": "Untrusted Web Data",
                "text_as_on": "Current",
                "jurisdiction": "Web",
                "url": "",
                "tier": "web",
            })

    # 6. Uploaded Document Facts [D1]..
    if doc:
        if isinstance(doc, list):
            for idx, d in enumerate(doc, 1):
                if isinstance(d, dict):
                    cit = d.get("citation") or d.get("title") or f"Document Fact {idx}"
                    txt = d.get("text") or d.get("fact") or ""
                    status = d.get("status") or "User Document Data"
                    text_as_on = d.get("text_as_on") or ""
                    jur = d.get("jurisdiction") or "User Document"
                    url = d.get("url") or ""
                else:
                    cit = f"Document Fact {idx}"
                    txt = str(d)
                    status = "User Document Data"
                    text_as_on = ""
                    jur = "User Document"
                    url = ""
                flat_items.append({
                    "tag": f"[D{idx}]",
                    "source": "Uploaded Document",
                    "section": "",
                    "citation": cit,
                    "text": _truncate_text(txt),
                    "status": status,
                    "text_as_on": text_as_on,
                    "jurisdiction": jur,
                    "url": url,
                    "tier": "doc",
                })
        elif isinstance(doc, (str, bytes)):
            txt = doc.decode("utf-8", errors="replace") if isinstance(doc, bytes) else doc
            if txt.strip():
                flat_items.append({
                    "tag": "[D1]",
                    "source": "Uploaded Document",
                    "section": "",
                    "citation": "Uploaded Document",
                    "text": _truncate_text(txt),
                    "status": "User Document Data",
                    "text_as_on": "",
                    "jurisdiction": "User Document",
                    "url": "",
                    "tier": "doc",
                })

    any_confident = bool(tiered.get("any_confident", False))

    return EvidenceList(
        items=flat_items,
        any_confident=any_confident,
        lang=lang,
        state=state,
        tiered_raw=tiered,
    )


def build_evidence(
    query: str,
    state: Optional[str] = None,
    web: Any = None,
    doc: Any = None,
    **kwargs: Any,
) -> EvidenceList:
    """
    Builds the flat structured evidence list for Legal Lens reasoning.
    """
    # Guard against legacy positional calls passing k as state
    if isinstance(state, int):
        state = None

    lang = detect_query_language(query)
    tiered = retrieve_tiered(query=query, state=state)

    return format_tiered_evidence(
        tiered=tiered,
        web=web,
        doc=doc,
        state=state,
        lang=lang,
    )


if __name__ == "__main__":
    test_q = "can my landlord throw me out without notice"
    evidence = build_evidence(test_q, state="Maharashtra")
    print(f"Query: \"{test_q}\"")
    print(f"Detected Lang: {evidence.lang} | Any Confident: {evidence.any_confident}")
    print(f"Flat items returned: {len(evidence)}")
    for item in evidence:
        print(f"  {item['tag']} ({item['jurisdiction']}): {item['citation']} | {item['source']} | {item['section']}")
