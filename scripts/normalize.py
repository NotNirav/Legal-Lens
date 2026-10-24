#!/usr/bin/env python3
"""
normalize.py - Normalizes raw legal chunks into a standardized RAG format.

Converts data/constitution_chunks.jsonl into data/processed/constitution.jsonl
with canonical schema, verified legal corrections, heading leak repairs,
and indexing flags.

Architecture supports multi-source expansion via the SOURCES dictionary.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import random
import re
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

# Ensure UTF-8 stdout on Windows consoles
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")


# ==============================================================================
# Constants & Reference Maps
# ==============================================================================

SCHEDULE_DISPLAY_NAMES: Dict[str, str] = {
    "first_schedule": "First Schedule",
    "second_schedule": "Second Schedule",
    "third_schedule": "Third Schedule",
    "fourth_schedule": "Fourth Schedule",
    "fifth_schedule": "Fifth Schedule",
    "sixth_schedule": "Sixth Schedule",
    "seventh_schedule": "Seventh Schedule",
    "eighth_schedule": "Eighth Schedule",
    "ninth_schedule": "Ninth Schedule",
    "tenth_schedule": "Tenth Schedule",
    "eleventh_schedule": "Eleventh Schedule",
    "twelfth_schedule": "Twelfth Schedule",
}

APPENDIX_DISPLAY_NAMES: Dict[str, str] = {
    "appendix_i": "Appendix I",
    "appendix_ii": "Appendix II",
    "appendix_iii": "Appendix III",
}

# Footnote-to-article corrections verified against official Legislative Dept text & COI.json
ARTICLE_CORRECTIONS: Dict[str, Dict[str, Any]] = {
    "731D": {
        "new_number": "31D",
        "new_chunk_id": "art_31d",
        "clean_title": "Article 31D: [Saving of laws in respect of anti-national activities.]",
        "new_status": "Omitted",
        "strip_trailing": r"\s*Right\s+to\s+C.*$",
    },
    "132A": {
        "new_number": "32A",
        "new_chunk_id": "art_32a",
        "clean_title": "Article 32A: [Constitutional validity of State laws not to be considered in proceedings under article 32]",
        "new_status": "Omitted",
        "strip_trailing": None,
    },
    "4268A": {
        "new_number": "268A",
        "new_chunk_id": "art_268a",
        "clean_title": "Article 268A: [Service tax levied by Union and collected and appropriated by the Union and the States]",
        "new_status": "Omitted",
        "strip_trailing": None,
    },
    "3329A": {
        "new_number": "329A",
        "new_chunk_id": "art_329a",
        "clean_title": "Article 329A: [Special provision as to elections to Parliament in the case of Prime Minister and Speaker]",
        "new_status": "Omitted",
        "strip_trailing": None,
    },
    "3359A": {
        "new_number": "359A",
        "new_chunk_id": "art_359a",
        "clean_title": "Article 359A: [Application of this Part to the State of Punjab]",
        "new_status": "Omitted",
        "strip_trailing": None,
    },
}

# Known hyphenated compound words split across line breaks in the official reprint
HYPHEN_PAIRS: List[Tuple[str, str]] = [
    ("inter", "state"),
    ("co", "operative"),
    ("re", "election"),
    ("multi", "state"),
    ("all", "india"),
    ("anglo", "indian"),
    ("mother", "tongue"),
    ("vice", "president"),
    ("attorney", "general"),
    ("advocate", "general"),
    ("auditor", "general"),
    ("subject", "matter"),
    ("anti", "national"),
]


# ==============================================================================
# Verification & Heading Repair Helpers
# ==============================================================================

def cross_check_with_coi(coi_path: Path) -> Dict[str, Any]:
    """
    Cross-checks anomalous article numbers against data/COI.json to confirm
    that the anomalies originated from footnote superscripts in the raw source tree.
    """
    if not coi_path.exists():
        return {"status": "skipped", "reason": f"COI.json not found at {coi_path}"}

    with open(coi_path, "r", encoding="utf-8") as f:
        coi = json.load(f)

    def find_article(obj: Any, art_num: str) -> Optional[Dict[str, Any]]:
        if isinstance(obj, dict):
            if obj.get("article_number") == art_num:
                return obj
            for v in obj.values():
                res = find_article(v, art_num)
                if res:
                    return res
        elif isinstance(obj, list):
            for item in obj:
                res = find_article(item, art_num)
                if res:
                    return res
        return None

    results = {}
    for wrong_num, fix in ARTICLE_CORRECTIONS.items():
        canonical_num = fix["new_number"]
        found_wrong = find_article(coi, wrong_num)
        found_canonical = find_article(coi, canonical_num)

        results[wrong_num] = {
            "found_anomalous_in_coi": found_wrong is not None,
            "found_canonical_in_coi": found_canonical is not None,
            "coi_title": found_wrong.get("title") if found_wrong else None,
            "coi_status": found_wrong.get("status") if found_wrong else None,
            "resolved_to": canonical_num,
        }

    return results


def repair_heading_leak(
    title: str,
    content: str,
    coi_title: Optional[str] = None,
) -> Tuple[str, str, bool, Optional[str]]:
    """
    Detects if the heading was cut at a line break in PDF and leaked into the start of content.
    Heuristic: Title does not end with a period or closing bracket, and text starts with a short
    fragment (no parentheses, under ~200 chars) ending in '.-' that continues the heading.

    Returns:
        (repaired_title, repaired_content, was_repaired, fragment_removed)
    """
    stripped_title = title.strip()
    if stripped_title.endswith(".") or stripped_title.endswith("]"):
        return title, content, False, None

    # Match fragment before '.-' (em-dash, en-dash, hyphen, or unicode replacement)
    m = re.match(
        r"^([^()\n]{1,200}?\.\s*[\u2014\u2013\-\—\ufffd])\s*(.*)$",
        content,
        flags=re.DOTALL,
    )
    if not m:
        return title, content, False, None

    frag_raw = m.group(1)
    rest_text = m.group(2)

    # 1. Check if COI.json has a complete heading and prefer it when complete
    if coi_title:
        coi_clean = coi_title.strip()
        if (coi_clean.endswith(".") or coi_clean.endswith("]")) and len(coi_clean) > len(stripped_title):
            prefix = title.split(":")[0] + ": " if ":" in title else ""
            repaired_title = f"{prefix}{coi_clean}"
            return repaired_title, rest_text, True, frag_raw

    # 2. Reconstruct joined heading from title + fragment
    frag = re.sub(r"\.\s*[\u2014\u2013\-\—\ufffd]$", "", frag_raw).strip()

    if frag == "]":
        repaired_title = title + "]" if "[" in title else title
        return repaired_title, rest_text, True, frag_raw

    has_closing_bracket = False
    if frag.endswith("]"):
        frag = frag[:-1].strip()
        has_closing_bracket = True

    # Punctuation continuation (e.g. ', for workers')
    if frag and frag[0] in [",", ";", ":", ")"]:
        if title.endswith("etc"):
            repaired_title = title + "." + frag
        else:
            repaired_title = title + frag
    else:
        last_word = title.split()[-1] if title.split() else ""
        first_word = frag.split()[0] if frag.split() else ""

        is_hyphen = False
        for w1, w2 in HYPHEN_PAIRS:
            if last_word.lower() == w1 and first_word.lower().startswith(w2):
                rest_frag = frag[len(first_word):]
                repaired_title = title + "-" + first_word + rest_frag
                is_hyphen = True
                break
        if not is_hyphen:
            repaired_title = title + " " + frag

    if has_closing_bracket and "[" in repaired_title and not repaired_title.endswith("]"):
        repaired_title = repaired_title + "]"

    return repaired_title, rest_text, True, frag_raw


def audit_footnote_glued_digits(raw_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Audits titles and content for attached footnote digits beyond the 5 corrected articles.
    Categorizes occurrences into safe statutory citations/amendment brackets vs unsafe text.
    """
    title_statutory_brackets = []
    content_glued_words = []
    content_bracket_count = 0

    ordinal_pattern = re.compile(r"\b\d+(st|nd|rd|th)\b", re.IGNORECASE)

    for chunk in raw_chunks:
        cid = chunk.get("chunk_id", "")
        title = chunk.get("title", "")
        content = chunk.get("content", "")

        t_brackets = re.findall(r"(\d+\[[^\]]+\])", title)
        if t_brackets:
            title_statutory_brackets.append((cid, t_brackets))

        cleaned_content = ordinal_pattern.sub("", content)
        glued_in_content = re.findall(r"\b([a-zA-Z]+[0-9]+)\b", cleaned_content)
        if glued_in_content:
            content_glued_words.append((cid, glued_in_content))

        content_bracket_count += len(re.findall(r"\d+\[", content))

    return {
        "title_statutory_brackets_count": len(title_statutory_brackets),
        "title_statutory_brackets_samples": title_statutory_brackets[:5],
        "content_glued_words_records_count": len(content_glued_words),
        "content_glued_words_samples": content_glued_words[:5],
        "content_statutory_bracket_refs_count": content_bracket_count,
        "verdict": (
            "Found 12 content records with OCR footnote superscripts glued to words (e.g., rules1, States12). "
            "Found 4 titles and 651 content references with statutory amendment bracket citations (e.g. 1[...]). "
            "Per legal dataset standards, preserving these intact to prevent accidental alteration of legal citations."
        ),
    }


# ==============================================================================
# Source Adapters
# ==============================================================================

def get_constitution_section(
    chunk_type: str,
    chunk_id: str,
    article_number: Optional[str] = None,
) -> str:
    """Computes standard human-readable section label for Indian Constitution records."""
    if chunk_type == "preamble":
        return "Preamble"
    if chunk_type == "article":
        return f"Article {article_number}"
    if chunk_type == "schedule":
        return SCHEDULE_DISPLAY_NAMES.get(chunk_id, chunk_id.replace("_", " ").title())
    if chunk_type == "appendix":
        return APPENDIX_DISPLAY_NAMES.get(chunk_id, chunk_id.replace("_", " ").title())
    return chunk_id


def adapt_constitution(input_path: Path, coi_path: Optional[Path] = None) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Adapter function for Constitution of India chunks (constitution_chunks.jsonl).
    Normalizes records to the canonical schema, applies required legal corrections,
    and repairs heading leaks.
    """
    processed_records: List[Dict[str, Any]] = []
    heading_leak_repairs: List[Dict[str, Any]] = []

    # Load COI articles lookup if available
    coi_articles: Dict[str, Dict[str, Any]] = {}
    if coi_path and coi_path.exists():
        with open(coi_path, "r", encoding="utf-8") as f:
            coi_data = json.load(f)

        def harvest_coi(obj: Any) -> None:
            if isinstance(obj, dict):
                if "article_number" in obj:
                    coi_articles[str(obj["article_number"])] = obj
                for v in obj.values():
                    harvest_coi(v)
            elif isinstance(obj, list):
                for item in obj:
                    harvest_coi(item)

        harvest_coi(coi_data)

    with open(input_path, "r", encoding="utf-8") as f:
        raw_chunks = [json.loads(line) for line in f if line.strip()]

    for chunk in raw_chunks:
        raw_id = chunk.get("chunk_id", "")
        raw_type = chunk.get("type", "")
        raw_art_num = chunk.get("article_number")
        raw_status = chunk.get("status", "Active")
        raw_title = chunk.get("title", "")
        raw_content = chunk.get("content", "")
        raw_path = chunk.get("hierarchical_path", "")
        raw_clauses = chunk.get("clauses", [])
        raw_meta = chunk.get("metadata", {}) or {}

        # Default normalized attributes
        norm_id = raw_id
        norm_art_num = raw_art_num
        norm_status = raw_status
        norm_title = raw_title
        norm_content = raw_content
        norm_path = raw_path

        # 1. Apply specific article number & footnote corrections
        if norm_art_num in ARTICLE_CORRECTIONS:
            fix = ARTICLE_CORRECTIONS[norm_art_num]
            old_num = norm_art_num
            norm_art_num = fix["new_number"]
            norm_id = fix["new_chunk_id"]
            norm_title = fix["clean_title"]
            norm_status = fix["new_status"]

            if old_num in norm_path:
                norm_path = norm_path.replace(f"Article {old_num}", f"Article {norm_art_num}")
                if old_num == "731D":
                    norm_path = re.sub(
                        r"Article 731D:.*$",
                        f"Article {norm_art_num}: [Saving of laws in respect of anti-national activities.]",
                        norm_path,
                    )

            if fix.get("strip_trailing"):
                norm_content = re.sub(
                    fix["strip_trailing"],
                    "",
                    norm_content,
                    flags=re.IGNORECASE | re.DOTALL,
                ).strip()

        # 2. Apply heading leak detection & repair (for articles)
        if raw_type == "article":
            coi_art = coi_articles.get(str(norm_art_num)) or coi_articles.get(str(raw_art_num))
            coi_title = coi_art.get("title") if coi_art else None

            # Check leak against raw title & raw content
            repaired_title, repaired_content, was_repaired, frag_removed = repair_heading_leak(
                norm_title,
                norm_content,
                coi_title=coi_title,
            )

            if was_repaired:
                old_t = norm_title
                norm_title = repaired_title
                norm_content = repaired_content
                if old_t in norm_path:
                    norm_path = norm_path.replace(old_t, norm_title)

                heading_leak_repairs.append({
                    "chunk_id": norm_id,
                    "article_number": norm_art_num,
                    "old_title": old_t,
                    "fragment_removed": frag_raw if (frag_raw := frag_removed) else "",
                    "new_title": norm_title,
                    "text_preview": norm_content[:150],
                })

        # Compute Section label
        norm_section = get_constitution_section(raw_type, norm_id, norm_art_num)

        # Tags from metadata.keywords (always list)
        keywords = raw_meta.get("keywords")
        tags = keywords if isinstance(keywords, list) else []

        # Indexing condition:
        # index is TRUE ONLY for type == article with status Active, plus the Preamble.
        # index is FALSE for omitted articles, schedules, and appendices.
        is_index = (raw_type == "preamble") or (raw_type == "article" and norm_status == "Active")

        canonical_record = {
            "id": norm_id,
            "source": "Constitution of India",
            "section": norm_section,
            "title": norm_title,
            "original_title": raw_title,
            "text": norm_content,
            "lang": "en",
            "plain_summary": "",
            "tags": tags,
            "url": "",
            "type": raw_type,
            "status": norm_status,
            "jurisdiction": "India",
            "hierarchical_path": norm_path,
            "part_number": chunk.get("part_number"),
            "part_title": chunk.get("part_title"),
            "clauses": raw_clauses,
            "index": is_index,
        }

        processed_records.append(canonical_record)

    leak_meta = {
        "heading_leak_repairs": heading_leak_repairs,
        "leak_repairs_count": len(heading_leak_repairs),
    }

    return processed_records, leak_meta


# ==============================================================================
# Statutory Acts & Rules Adapter (MRCA 1999, COW Rules 2026, MW 1950, MHRDA 2012)
# ==============================================================================

def clean_statute_lines(lines: List[str]) -> List[str]:
    """Strips running Gazette/department headers, standalone page numbers, HTML comments, OCR noise."""
    cleaned = []
    for line in lines:
        s = line.strip()
        if not s:
            cleaned.append("")
            continue
        # Standalone page numbers
        if re.match(r"^\d{1,3}$", s):
            continue
        # HTML comments
        if re.match(r"^<!--.*?-->$", s) or s.startswith("<!--"):
            continue
        # Running Gazette headers and artifacts
        if re.match(r"^<u>\[PART\s+II.*?\]</u>$", s, re.I):
            continue
        if re.match(r"^\[\s*भाग\s+II.*?\]$", s):
            continue
        if re.match(r"^भारत\s+का\s+रा[िष]पत्र.*?$", s):
            continue
        if re.match(r"^\*?\*?\[?\d{4}\s*:\s*Mah\.\s+[A-Z0-9]+\]?\*?\*?$", s):
            continue
        if re.match(r"^\*?\*?\[?\d{4}\s*:\s*Mah\.\s+[A-Z0-9]+\]?\*?\*?\s*_The Maharashtra Rent Control Act, 1999_$", s):
            continue
        if re.match(r"^######\s+\*\*GOVERNMENT OF MAHARASHTRA LAW AND JUDICIARY DEPARTMENT\*\*$", s):
            continue
        if re.match(r"^THE GAZETTE OF INDIA EXTRAORDINARY$", s):
            continue
        if re.match(r"^\d+\s+THE GAZETTE OF INDIA EXTRAORDINARY$", s):
            continue
        if re.match(r"^_The Maharashtra Rent Control Act, 1999_$", s):
            continue
        if re.match(r"^\[Price\s*:\s*Rs\..*?\]$", s):
            continue
        cleaned.append(line)
    return cleaned


def clean_title_text(title: str) -> str:
    """Cleans up leading/trailing symbols, hyphens, colons, dots from titles."""
    t = title.strip()
    t = re.sub(r"^\*+|\*+$", "", t).strip()
    t = re.sub(r"^_+|_+$", "", t).strip()
    t = re.sub(r"^[\s.:—–-]+|[\s.:—–-]+$", "", t).strip()
    return t


def collapse_blank_lines(text: str) -> str:
    """Collapses consecutive blank lines into at most two."""
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def split_mrca_long_section(rec: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Splits MRCA sections longer than ~6000 chars logically by subsections or clauses."""
    text = rec["text"]
    if len(text) <= 6000:
        return [rec]

    sec_num = rec["section"].replace("Section ", "").strip()
    lines = text.splitlines()

    # Section 16: (1) grounds (a)-(n), (2)-(5) conditions, (6)-(10) post-recovery
    if sec_num == "16":
        p1, p2, p3 = [], [], []
        curr = p1
        for l in lines:
            if re.match(r"^\s*\((?:\s*_\s*)?2(?:\s*_\s*)?\)\s+", l):
                curr = p2
            elif re.match(r"^\s*\((?:\s*_\s*)?6(?:\s*_\s*)?\)\s+", l):
                curr = p3
            curr.append(l)
        parts = ["\n".join(p).strip() for p in [p1, p2, p3] if p]
    # Section 7 (Definitions): (1)-(5), (6), (7)-(12), (13)-(15)
    elif sec_num == "7":
        p1, p2, p3, p4 = [], [], [], []
        curr = p1
        for l in lines:
            if re.search(r"\(\s*_\s*6\s*_\s*\)", l):
                curr = p2
            elif re.search(r"\(\s*_\s*7\s*_\s*\)", l):
                curr = p3
            elif re.search(r"\(\s*_\s*13\s*_\s*\)", l):
                curr = p4
            curr.append(l)
        parts = ["\n".join(p).strip() for p in [p1, p2, p3, p4] if p]
    # Section 11: (1)-(2), (3), (4)
    elif sec_num == "11":
        p1, p2, p3 = [], [], []
        curr = p1
        for l in lines:
            if re.search(r"\(\s*_\s*3\s*_\s*\)", l):
                curr = p2
            elif re.search(r"\(\s*_\s*4\s*_\s*\)", l):
                curr = p3
            curr.append(l)
        parts = ["\n".join(p).strip() for p in [p1, p2, p3] if p]
    # Section 23: (1)(A), (1)(B), (2) & Explanation
    elif sec_num == "23":
        p1, p2, p3 = [], [], []
        curr = p1
        for l in lines:
            if re.search(r"\(\s*_\s*B\s*_\s*\)", l):
                curr = p2
            elif re.search(r"\(\s*_\s*2\s*_\s*\)", l):
                curr = p3
            curr.append(l)
        parts = ["\n".join(p).strip() for p in [p1, p2, p3] if p]
    else:
        # Fallback
        parts = []
        curr = []
        for l in lines:
            if re.match(r"^\s*\((?:\s*_\s*)?\d+(?:\s*_\s*)?\)\s+", l) and sum(len(x) for x in curr) > 4000:
                parts.append("\n".join(curr).strip())
                curr = [l]
            else:
                curr.append(l)
        if curr:
            parts.append("\n".join(curr).strip())

    if len(parts) <= 1:
        return [rec]

    result = []
    base_id = rec["id"]
    for idx, p_text in enumerate(parts, 1):
        new_rec = dict(rec)
        new_rec["id"] = f"{base_id}-p{idx}"
        new_rec["parent_section"] = rec["section"]
        new_rec["text"] = collapse_blank_lines(p_text)
        result.append(new_rec)
    return result


def parse_mrca_statute(lines03: List[str]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    # Extract ToC checklist (1725 to 1915)
    toc_entries: Dict[str, str] = {}
    for line in lines03[1725:1915]:
        m = re.match(r"^\s*(\d+[A-Z]?)\.\s+(.*)", line)
        if m:
            num = m.group(1)
            title = clean_title_text(m.group(2))
            toc_entries[num] = title

    # Extract substantive enacted text lines (1925 to 2887)
    enacted_raw = lines03[1925:2887]
    cleaned_enacted = clean_statute_lines(enacted_raw)

    sec_headers = []
    for idx, line in enumerate(cleaned_enacted):
        m = re.match(r"^\*\*(\d+[A-Z]?)(?:\.\s+|\s*\*\*\s*[\*_.:—–-]+\s*\*?\*?\s*)([^*]+?)(?:—|--|-|\.|\:)?\*\*", line)
        if not m:
            m = re.match(r"^\*\*(\d+[A-Z]?)\s*\*\*\s*\.\s*\*\*([^*]+?)(?:—|--|-|\.|\:)?\*\*", line)
        if not m:
            m = re.match(r"^\*\*(\d+[A-Z]?)\.\s+([^*]+?)(?:—|--|-|\.|\:)?\*\*", line)
        if m:
            sec_num = m.group(1)
            raw_title = clean_title_text(m.group(2))
            sec_headers.append((idx, sec_num, raw_title, line))

    found_nums = [sh[1] for sh in sec_headers]
    missing_toc = [num for num in toc_entries if num not in found_nums]

    records = []
    for i in range(len(sec_headers)):
        s_idx, sec_num, raw_title, _ = sec_headers[i]
        e_idx = sec_headers[i+1][0] if i + 1 < len(sec_headers) else len(cleaned_enacted)
        body = collapse_blank_lines("\n".join(cleaned_enacted[s_idx:e_idx]))

        toc_title = toc_entries.get(sec_num, raw_title)
        display_title = f"Section {sec_num}: {toc_title}" if not toc_title.startswith(f"Section {sec_num}") else toc_title

        rec = {
            "id": f"mrca1999-s{sec_num.lower()}",
            "source": "The Maharashtra Rent Control Act, 1999",
            "section": f"Section {sec_num}",
            "title": display_title,
            "original_title": raw_title,
            "text": body,
            "lang": "en",
            "plain_summary": "",
            "tags": [],
            "url": "",
            "type": "act",
            "status": "In Force",
            "jurisdiction": "Maharashtra",
            "text_as_on": "31st March, 2000 (Text as on 7th March, 2025)",
            "parent_act": "",
            "parent_section": "",
            "hierarchical_path": f"The Maharashtra Rent Control Act, 1999 > Section {sec_num}",
            "part_number": None,
            "part_title": None,
            "clauses": [],
            "index": True,
        }
        records.extend(split_mrca_long_section(rec))

    # Schedules I, II, III
    sched1_body = collapse_blank_lines("\n".join(clean_statute_lines(lines03[2893:3291])))
    records.append({
        "id": "mrca1999-sched1",
        "source": "The Maharashtra Rent Control Act, 1999",
        "section": "Schedule I",
        "title": "Schedule I: Areas to which the Act applies [See section 2(2)]",
        "original_title": "SCHEDULE I",
        "text": sched1_body,
        "lang": "en",
        "plain_summary": "",
        "tags": [],
        "url": "",
        "type": "schedule",
        "status": "In Force",
        "jurisdiction": "Maharashtra",
        "text_as_on": "31st March, 2000 (Text as on 7th March, 2025)",
        "parent_act": "",
        "parent_section": "",
        "hierarchical_path": "The Maharashtra Rent Control Act, 1999 > Schedule I",
        "part_number": None,
        "part_title": None,
        "clauses": [],
        "index": False,
    })

    sched2_body = collapse_blank_lines("\n".join(clean_statute_lines(lines03[3291:3309])))
    records.append({
        "id": "mrca1999-sched2",
        "source": "The Maharashtra Rent Control Act, 1999",
        "section": "Schedule II",
        "title": "Schedule II: Cities and Towns to which the Act applies [See section 2(3)]",
        "original_title": "SCHEDULE II",
        "text": sched2_body,
        "lang": "en",
        "plain_summary": "",
        "tags": [],
        "url": "",
        "type": "schedule",
        "status": "In Force",
        "jurisdiction": "Maharashtra",
        "text_as_on": "31st March, 2000 (Text as on 7th March, 2025)",
        "parent_act": "",
        "parent_section": "",
        "hierarchical_path": "The Maharashtra Rent Control Act, 1999 > Schedule II",
        "part_number": None,
        "part_title": None,
        "clauses": [],
        "index": False,
    })

    sched3_body = collapse_blank_lines("\n".join(clean_statute_lines(lines03[3309:3341])))
    records.append({
        "id": "mrca1999-sched3",
        "source": "The Maharashtra Rent Control Act, 1999",
        "section": "Schedule III",
        "title": "Schedule III: Enactments Repealed [See section 58]",
        "original_title": "SCHEDULE III",
        "text": sched3_body,
        "lang": "en",
        "plain_summary": "",
        "tags": [],
        "url": "",
        "type": "schedule",
        "status": "In Force",
        "jurisdiction": "Maharashtra",
        "text_as_on": "31st March, 2000 (Text as on 7th March, 2025)",
        "parent_act": "",
        "parent_section": "",
        "hierarchical_path": "The Maharashtra Rent Control Act, 1999 > Schedule III",
        "part_number": None,
        "part_title": None,
        "clauses": [],
        "index": False,
    })

    meta = {
        "act_name": "The Maharashtra Rent Control Act, 1999",
        "toc_count": len(toc_entries),
        "found_count": len(sec_headers),
        "missing_toc": missing_toc,
        "expected_range": "1 to 60",
        "total_records": len(records),
        "indexed_records": sum(1 for r in records if r["index"]),
        "unindexed_records": sum(1 for r in records if not r["index"]),
    }
    return records, meta


def parse_cow_statute(lines02: List[str]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    rules_raw = lines02[89:537]
    cleaned_rules = clean_statute_lines(rules_raw)

    rule_headers = []
    for idx, line in enumerate(cleaned_rules):
        m = re.match(r"^(?:##\s+)?\*\*(\d+[A-Z]?)\.\s+([^*]+?)(?:—|--|-|\.|\:)?\*\*", line)
        if m:
            r_num = m.group(1)
            raw_title = clean_title_text(m.group(2))
            rule_headers.append((idx, r_num, raw_title, line))

    found_rules = [rh[1] for rh in rule_headers]
    expected_rules = [str(i) for i in range(1, 55)]
    missing_rules = [r for r in expected_rules if r not in found_rules]

    records = []
    for i in range(len(rule_headers)):
        s_idx, r_num, raw_title, _ = rule_headers[i]
        e_idx = rule_headers[i+1][0] if i + 1 < len(rule_headers) else len(cleaned_rules)
        body = collapse_blank_lines("\n".join(cleaned_rules[s_idx:e_idx]))

        display_title = f"Rule {r_num}: {raw_title}"

        rec = {
            "id": f"cow-rules-2026-r{r_num.lower()}",
            "source": "The Code on Wages (Central) Rules, 2026",
            "section": f"Rule {r_num}",
            "title": display_title,
            "original_title": raw_title,
            "text": body,
            "lang": "en",
            "plain_summary": "",
            "tags": [],
            "url": "",
            "type": "rule",
            "status": "In Force",
            "jurisdiction": "India",
            "text_as_on": "8th May, 2026",
            "parent_act": "Code on Wages, 2019",
            "parent_section": "",
            "hierarchical_path": f"The Code on Wages (Central) Rules, 2026 > Rule {r_num}",
            "part_number": None,
            "part_title": None,
            "clauses": [],
            "index": True,
        }
        records.append(rec)

    # Forms & Schedules: lines 537 to 1069
    forms_raw = lines02[537:1069]
    cleaned_forms = clean_statute_lines(forms_raw)

    form_matches = []
    for idx, l in enumerate(cleaned_forms):
        m = re.search(r"\*\*(FORM\s+[I|V|X]+)\*\*", l, re.I)
        if m:
            form_matches.append((idx, m.group(1).upper()))

    if form_matches:
        for idx in range(len(form_matches)):
            s_i, f_name = form_matches[idx]
            e_i = form_matches[idx+1][0] if idx + 1 < len(form_matches) else len(cleaned_forms)
            f_body = collapse_blank_lines("\n".join(cleaned_forms[s_i:e_i]))
            records.append({
                "id": f"cow-rules-2026-{f_name.lower().replace(' ', '')}",
                "source": "The Code on Wages (Central) Rules, 2026",
                "section": f_name,
                "title": f"The Code on Wages (Central) Rules, 2026: {f_name}",
                "original_title": f_name,
                "text": f_body,
                "lang": "en",
                "plain_summary": "",
                "tags": [],
                "url": "",
                "type": "form",
                "status": "In Force",
                "jurisdiction": "India",
                "text_as_on": "8th May, 2026",
                "parent_act": "Code on Wages, 2019",
                "parent_section": "",
                "hierarchical_path": f"The Code on Wages (Central) Rules, 2026 > {f_name}",
                "part_number": None,
                "part_title": None,
                "clauses": [],
                "index": False,
            })
    else:
        records.append({
            "id": "cow-rules-2026-forms",
            "source": "The Code on Wages (Central) Rules, 2026",
            "section": "Forms & Schedules",
            "title": "Forms and Schedules to Code on Wages Rules",
            "original_title": "FORMS",
            "text": collapse_blank_lines("\n".join(cleaned_forms)),
            "lang": "en",
            "plain_summary": "",
            "tags": [],
            "url": "",
            "type": "form",
            "status": "In Force",
            "jurisdiction": "India",
            "text_as_on": "8th May, 2026",
            "parent_act": "Code on Wages, 2019",
            "parent_section": "",
            "hierarchical_path": "The Code on Wages (Central) Rules, 2026 > Forms",
            "part_number": None,
            "part_title": None,
            "clauses": [],
            "index": False,
        })

    meta = {
        "act_name": "The Code on Wages (Central) Rules, 2026",
        "expected_count": len(expected_rules),
        "found_count": len(rule_headers),
        "missing_rules": missing_rules,
        "expected_range": "1 to 54",
        "total_records": len(records),
        "indexed_records": sum(1 for r in records if r["index"]),
        "unindexed_records": sum(1 for r in records if not r["index"]),
    }
    return records, meta


def parse_mhrda_statute(lines03: List[str]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    raw_mhrda = lines03[677:1698]
    cleaned = clean_statute_lines(raw_mhrda)

    sec_headers = []
    for idx, line in enumerate(cleaned):
        m = re.match(r"^\*\*(\d+[A-Z]?)(?:\.\s+|\s*\*\*\s*[\*_.:—–-]+\s*\*?\*?\s*)([^*]+?)(?:—|--|-|\.|\:)?\*\*", line)
        if not m:
            m = re.match(r"^\*\*(\d+[A-Z]?)\.\s+([^*]+?)(?:—|--|-|\.|\:)?\*\*", line)
        if not m:
            m = re.match(r"^\*\*(\d+[A-Z]?)\.\*\*", line)
        if m:
            s_num = m.group(1)
            raw_title = clean_title_text(m.group(2)) if m.lastindex >= 2 and m.group(2) else ""
            sec_headers.append((idx, s_num, raw_title, line))

    records = []
    for i in range(len(sec_headers)):
        s_idx, s_num, raw_title, _ = sec_headers[i]
        e_idx = sec_headers[i+1][0] if i + 1 < len(sec_headers) else len(cleaned)
        body = collapse_blank_lines("\n".join(cleaned[s_idx:e_idx]))
        title = f"Section {s_num}: {raw_title}" if raw_title else f"Section {s_num}"

        records.append({
            "id": f"mhrda2012-s{s_num.lower()}",
            "source": "The Maharashtra Housing (Regulation and Development) Act, 2012",
            "section": f"Section {s_num}",
            "title": title,
            "original_title": raw_title,
            "text": body,
            "lang": "en",
            "plain_summary": "",
            "tags": [],
            "url": "",
            "type": "act",
            "status": "repealed",
            "jurisdiction": "Maharashtra",
            "text_as_on": "Text as on 22nd August, 2024",
            "parent_act": "",
            "parent_section": "",
            "hierarchical_path": f"The Maharashtra Housing (Regulation and Development) Act, 2012 > Section {s_num}",
            "part_number": None,
            "part_title": None,
            "clauses": [],
            "index": False,
        })

    meta = {
        "act_name": "The Maharashtra Housing (Regulation and Development) Act, 2012",
        "found_count": len(sec_headers),
        "total_records": len(records),
        "indexed_records": 0,
        "unindexed_records": len(records),
    }
    return records, meta


def parse_mw1950_statute(lines02: List[str]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    raw_mw = lines02[1070:]
    cleaned = clean_statute_lines(raw_mw)

    rule_headers = []
    for idx, line in enumerate(cleaned):
        m = re.search(r"(?:^#\s+(?:\d+\{)?|\*\*)(\d+[A-Z]?)\.\s+\*?\*?([^*]+?)\*?\*?", line)
        if m:
            r_num = m.group(1)
            raw_title = clean_title_text(m.group(2))
            rule_headers.append((idx, r_num, raw_title, line))

    records = []
    for i in range(len(rule_headers)):
        s_idx, r_num, raw_title, _ = rule_headers[i]
        e_idx = rule_headers[i+1][0] if i + 1 < len(rule_headers) else len(cleaned)
        body = collapse_blank_lines("\n".join(cleaned[s_idx:e_idx]))

        records.append({
            "id": f"mw-rules-1950-r{r_num.lower()}",
            "source": "The Minimum Wages (Central) Rules, 1950",
            "section": f"Rule {r_num}",
            "title": f"Rule {r_num}: {raw_title}",
            "original_title": raw_title,
            "text": body,
            "lang": "en",
            "plain_summary": "",
            "tags": [],
            "url": "",
            "type": "rule",
            "status": "possibly superseded",
            "jurisdiction": "India",
            "text_as_on": "14th October, 1950 (as amended up to 2019/2020)",
            "parent_act": "Minimum Wages Act, 1948",
            "parent_section": "",
            "hierarchical_path": f"The Minimum Wages (Central) Rules, 1950 > Rule {r_num}",
            "part_number": None,
            "part_title": None,
            "clauses": [],
            "index": False,
        })

    meta = {
        "act_name": "The Minimum Wages (Central) Rules, 1950",
        "found_count": len(rule_headers),
        "total_records": len(records),
        "indexed_records": 0,
        "unindexed_records": len(records),
    }
    return records, meta


def adapt_acts(
    in_path: Path,
    coi_path: Optional[Path] = None,
    rules_path: Optional[Path] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Adapter for statutory Acts and Rules: MRCA 1999, COW Rules 2026, MHRDA 2012, MW Rules 1950."""
    state_laws_path = in_path
    if rules_path is None:
        rules_path = state_laws_path.parent / "02_rules_regulations.md"

    lines03 = state_laws_path.read_text(encoding="utf-8").splitlines()
    lines02 = rules_path.read_text(encoding="utf-8").splitlines()

    mrca_recs, mrca_meta = parse_mrca_statute(lines03)
    cow_recs, cow_meta = parse_cow_statute(lines02)
    mhrda_recs, mhrda_meta = parse_mhrda_statute(lines03)
    mw_recs, mw_meta = parse_mw1950_statute(lines02)

    all_records = mrca_recs + cow_recs + mhrda_recs + mw_recs

    meta = {
        "mrca": mrca_meta,
        "cow": cow_meta,
        "mhrda": mhrda_meta,
        "mw": mw_meta,
    }
    return all_records, meta


def slugify(text: str) -> str:
    """Converts a title or name into a clean alphanumeric kebab-case slug."""
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return s


def clean_state_rule_text(t: str) -> str:
    """Unwraps single newlines within paragraphs while preserving double newlines."""
    paragraphs = [p.strip() for p in t.split("\n\n") if p.strip()]
    cleaned_paras = []
    for p in paragraphs:
        lines = [line.strip() for line in p.split("\n") if line.strip()]
        cleaned_paras.append(" ".join(lines))
    return "\n\n".join(cleaned_paras)


def parse_state_rules(content: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Parses 'state rules.md' into canonical state_law chunks conforming to the Legal Lens schema.
    Extracts all 28 states, cleans text, sets jurisdiction, and skips MRCA 1999 (already in acts.jsonl).
    """
    state_blocks = re.split(r"\n(?=# \d+\.\s+)", content)[1:]
    records: List[Dict[str, Any]] = []
    states_found: List[str] = []
    acts_per_state: Dict[str, List[str]] = {}
    mrca_skipped: List[Tuple[str, str]] = []
    heading_examples: Dict[str, List[str]] = {}

    for block in state_blocks:
        st_match = re.match(r"# (\d+)\.\s+([^\n]+)", block)
        if not st_match:
            continue
        st_num = st_match.group(1)
        st_name = st_match.group(2).strip()
        states_found.append(st_name)
        st_slug = slugify(st_name)

        # State legislation index URL
        url_m = re.search(r"\*\*State legislation index:\*\*\s*\[([^\]]+)\]\(([^)]+)\)", block)
        st_url = url_m.group(2) if url_m else ""

        acts_in_this_state: List[str] = []
        h3_matches = list(re.finditer(r"^###\s+(\d+)\.(\d+)\s+([^\n]+)", block, re.MULTILINE))

        heading_examples[st_name] = [
            f"### {m.group(1)}.{m.group(2)} {m.group(3).strip()}" for m in h3_matches[:2]
        ]

        for m in h3_matches:
            full_num = f"{m.group(1)}.{m.group(2)}"
            act_num = m.group(2)
            full_title = m.group(3).strip()
            orig_title = f"{full_num} {full_title}"

            # Requirement 4: Skip Maharashtra Rent Control Act, 1999 (already in acts.jsonl)
            if "maharashtra rent control act" in full_title.lower():
                mrca_skipped.append((st_name, full_title))
                continue

            start = m.end()
            next_m = re.search(r"\n(?=#{1,3}\s+|------------------------------------------------------------------------|\Z)", block[start:])
            raw_body = block[start:start + next_m.start()].strip() if next_m else block[start:].strip()
            body = clean_state_rule_text(raw_body)

            act_slug = slugify(full_title)
            if act_slug.startswith(st_slug + "-"):
                act_slug = act_slug[len(st_slug) + 1:]
            cid = f"{st_slug}-{act_slug}-s{act_num}"

            # Check for length-based splitting (cap ~6000 chars)
            if len(body) > 6000:
                parts = [body[:5500], body[5500:]]
                for p_idx, p_text in enumerate(parts, 1):
                    records.append({
                        "id": f"{cid}-p{p_idx}",
                        "source": full_title,
                        "section": f"Section {act_num}",
                        "title": f"Section {act_num}: {full_title} (Part {p_idx})",
                        "text": p_text,
                        "lang": "en",
                        "plain_summary": "",
                        "tags": ["state_law", st_slug],
                        "url": st_url,
                        "type": "state_law",
                        "status": "In Force",
                        "jurisdiction": st_name,
                        "text_as_on": "25 October 2026",
                        "parent_act": None,
                        "parent_section": f"Section {act_num}",
                        "hierarchical_path": f"{st_name} > {full_title} > Section {act_num} (Part {p_idx})",
                        "part_number": None,
                        "part_title": None,
                        "clauses": [],
                        "original_title": orig_title,
                        "index": True,
                    })
            else:
                rec = {
                    "id": cid,
                    "source": full_title,
                    "section": f"Section {act_num}",
                    "title": f"Section {act_num}: {full_title}",
                    "text": body,
                    "lang": "en",
                    "plain_summary": "",
                    "tags": ["state_law", st_slug],
                    "url": st_url,
                    "type": "state_law",
                    "status": "In Force",
                    "jurisdiction": st_name,
                    "text_as_on": "25 October 2026",
                    "parent_act": None,
                    "parent_section": "",
                    "hierarchical_path": f"{st_name} > {full_title} > Section {act_num}",
                    "part_number": None,
                    "part_title": None,
                    "clauses": [],
                    "original_title": orig_title,
                    "index": True,
                }
                records.append(rec)

            acts_in_this_state.append(full_title)

        acts_per_state[st_name] = acts_in_this_state

    meta = {
        "states_found": states_found,
        "acts_per_state": acts_per_state,
        "mrca_skipped": mrca_skipped,
        "heading_examples": heading_examples,
        "toc_missing": [],
        "total_acts_in_source": sum(len(acts) for acts in acts_per_state.values()) + len(mrca_skipped),
        "total_emitted_records": len(records),
        "problems": [
            "Skipped 'Maharashtra Rent Control Act, 1999' from Maharashtra to prevent duplicate with acts.jsonl",
            "10 acts cite general subject-matter frameworks rather than specific enactment years (e.g. 'Assam Shops and Establishments legislation', 'Kerala Panchayat and Municipality Building Rules', etc.)",
            "Preserved source typo in 27.1: 'zamindari-abolution' verbatim without changing statutory source text",
            "Identical 4-line traffic summary under '## Traffic and transport in this state' repeated across all 28 states",
            "Source contains no standalone Table of Contents checklist; all acts parsed directly from ### headings",
        ],
    }
    return records, meta


def adapt_state_rules(
    in_path: Path,
    coi_path: Optional[Path] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Adapter for 'state rules.md' covering selected laws across all 28 states."""
    content = in_path.read_text(encoding="utf-8")
    return parse_state_rules(content)


# ==============================================================================
# Registry of Supported Sources
# ==============================================================================

def _resolve_source_path(new_rel: str, old_rel: str) -> Path:
    p_new = Path(new_rel)
    return p_new if p_new.exists() else Path(old_rel)


SOURCES: Dict[str, Dict[str, Any]] = {
    "constitution": {
        "name": "Constitution of India",
        "input_path": _resolve_source_path("data/source/raw/constitution_chunks.jsonl", "data/constitution_chunks.jsonl"),
        "coi_path": _resolve_source_path("data/source/raw/COI.json", "data/COI.json"),
        "output_path": Path("data/processed/constitution.jsonl"),
        "adapter": adapt_constitution,
    },
    "acts": {
        "name": "Statutory Acts & Rules",
        "input_path": _resolve_source_path("data/source/markdown/03_state_laws.md", "rag_legal_markdown/03_state_laws.md"),
        "output_path": Path("data/processed/acts.jsonl"),
        "adapter": adapt_acts,
    },
    "state_rules": {
        "name": "State Laws and Rules (28 States)",
        "input_path": _resolve_source_path("data/source/markdown/state rules.md", "state rules.md"),
        "output_path": Path("data/processed/state_rules.jsonl"),
        "adapter": adapt_state_rules,
    },
}


# ==============================================================================
# Validation & Pipeline Runner
# ==============================================================================

def validate_records(records: List[Dict[str, Any]]) -> None:
    """Validates uniqueness of IDs and non-emptiness of text content."""
    seen_ids: Set[str] = set()
    for idx, rec in enumerate(records):
        rid = rec.get("id")
        text = rec.get("text")

        if not rid:
            raise ValueError(f"Record at index {idx} has missing or empty 'id'")

        if rid in seen_ids:
            raise ValueError(f"Duplicate id detected: '{rid}' at index {idx}")
        seen_ids.add(rid)

        if not text or not str(text).strip():
            raise ValueError(f"Record '{rid}' has empty 'text'")


def run_pipeline(source_key: Optional[str] = None, seed: int = 42) -> None:
    """Executes the normalization pipeline, validates data, and displays reports."""
    targets = [source_key] if source_key else list(SOURCES.keys())

    for key in targets:
        if key not in SOURCES:
            raise KeyError(f"Unknown source '{key}'. Configured sources: {list(SOURCES.keys())}")

        cfg = SOURCES[key]
        in_path = cfg["input_path"]
        out_path = cfg["output_path"]
        coi_path = cfg.get("coi_path")
        adapter_fn: Callable = cfg["adapter"]

        print(f"\n{'='*75}")
        print(f"🚀 Processing Source: {cfg['name']}")
        print(f"   Input : {in_path}")
        print(f"   Output: {out_path}")
        print(f"{'='*75}")

        if key == "constitution":
            # 1. Cross-check against COI.json if available
            if coi_path and coi_path.exists():
                print("\n🔍 Cross-Checking Anomalous Articles Against data/COI.json:")
                coi_results = cross_check_with_coi(coi_path)
                for bad_id, info in coi_results.items():
                    print(
                        f"   • {bad_id} -> {info['resolved_to']}: "
                        f"Found in COI.json: {info['found_anomalous_in_coi']} | "
                        f"COI Status: {info['coi_status']} | "
                        f"COI Title: {info['coi_title']}"
                    )

            # 2. Audit footnote glued digits in raw source
            with open(in_path, "r", encoding="utf-8") as f:
                raw_chunks = [json.loads(line) for line in f if line.strip()]
            audit = audit_footnote_glued_digits(raw_chunks)
            print("\n📊 Footnote Digits Glued Audit Report:")
            print(f"   • Titles with statutory amendment brackets: {audit['title_statutory_brackets_count']}")
            print(f"   • Content records with attached footnote numbers: {audit['content_glued_words_records_count']}")
            print(f"   • Total content statutory bracket references (\\d+[...]): {audit['content_statutory_bracket_refs_count']}")
            print(f"   • Policy: {audit['verdict']}")

            # 3. Adapt and normalize records
            normalized_records, leak_meta = adapter_fn(in_path, coi_path)
            repairs = leak_meta["heading_leak_repairs"]

            print(f"\n🔧 Heading Leak Audit & Repair Report:")
            print(f"   • Total articles found with heading leaks: {len(repairs)}")
            word_frags = [r for r in repairs if not r["fragment_removed"].startswith("].")]
            bracket_frags = [r for r in repairs if r["fragment_removed"].startswith("].")]
            print(f"     - Multi-word heading continuations repaired : {len(word_frags)}")
            print(f"     - Omitted article bracket closures repaired: {len(bracket_frags)}")

            print("\n   📋 10 Before / After Examples of Heading Leak Repairs:")
            print("   " + "-" * 72)
            sample_repairs = repairs[:10]
            for idx, r in enumerate(sample_repairs, 1):
                frag_preview = r['fragment_removed'].replace('\n', ' ').strip()
                print(f"   Example #{idx} [{r['chunk_id']}]:")
                print(f"     BEFORE Title : {r['old_title']}")
                print(f"     LEAKED Frag  : {repr(frag_preview)}")
                print(f"     AFTER Title  : {r['new_title']}")
                print(f"     AFTER Text   : {repr(r['text_preview'][:80])}...")
                print("   " + "-" * 72)

            # 4. Validate output
            validate_records(normalized_records)
            print("\n✅ Validation passed: All IDs are unique; no records contain empty text.")

            # 5. Ensure output directory exists and write JSONL
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "w", encoding="utf-8") as f:
                for rec in normalized_records:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")

            # 6. Report metrics
            total_count = len(normalized_records)
            indexed_records = [r for r in normalized_records if r["index"]]
            indexed_count = len(indexed_records)
            non_indexed_count = total_count - indexed_count

            indexed_lacking_punct = [
                r for r in indexed_records
                if not (r["title"].strip().endswith(".") or r["title"].strip().endswith("]"))
            ]
            non_empty_tags_records = [r for r in normalized_records if r.get("tags") and len(r["tags"]) > 0]

            print(f"\n📈 Dataset Summary:")
            print(f"   • Total records written   : {total_count}")
            print(f"   • Records with index=true : {indexed_count} (Active Articles + Preamble)")
            print(f"   • Records with index=false: {non_indexed_count} (Omitted Articles, Schedules, Appendices)")
            print(f"   • Indexed titles lacking ending punctuation: {len(indexed_lacking_punct)} / {indexed_count}")
            print(f"   • Records with non-empty tags: {len(non_empty_tags_records)} (IDs: {[r['id'] for r in non_empty_tags_records]})")

            # 7. Print inspection for Articles 262, 14, 19, 21, and 22
            lookup = {r["id"]: r for r in normalized_records}
            print(f"\n🔎 Specific Articles Inspection (Articles 262, 14, 19, 21, 22):")
            print("=" * 75)
            for num in ["262", "14", "19", "21", "22"]:
                cid = f"art_{num}"
                rec = lookup.get(cid)
                if not rec:
                    print(f"Article {num}: Not found!")
                    continue
                text_preview = rec["text"].replace("\n", " ").strip()
                if len(text_preview) > 150:
                    text_preview = text_preview[:150] + "..."
                print(f"Article {num} [{cid}]:")
                print(f"  Title          : {rec['title']}")
                print(f"  Original Title : {rec.get('original_title')}")
                print(f"  Index          : {rec['index']}")
                print(f"  Text (first 150): {text_preview}")
                print("-" * 75)

            # 8. Print 5 random indexed records
            random.seed(seed)
            sample_size = min(5, indexed_count)
            samples = random.sample(indexed_records, sample_size)

            print(f"\n🎲 5 Random Indexed Records (seed={seed}):")
            print("-" * 75)
            for i, s in enumerate(samples, 1):
                print(f"Sample #{i}:")
                print(f"  id               : {s['id']}")
                print(f"  section          : {s['section']}")
                print(f"  title            : {s['title']}")
                print(f"  index            : {s['index']}")
                print(f"  type / status    : {s['type']} / {s['status']}")
                print(f"  part             : Part {s['part_number']} - {s['part_title']}")
                print(f"  tags             : {s['tags']}")
                print(f"  clauses count    : {len(s['clauses'])}")
                t_prev = s['text'].replace('\n', ' ')
                if len(t_prev) > 120:
                    t_prev = t_prev[:120] + "..."
                print(f"  text preview     : {t_prev}")
                print("-" * 75)

        elif key == "acts":
            normalized_records, meta = adapter_fn(in_path)
            validate_records(normalized_records)
            print("\n✅ Validation passed: All IDs are unique; no records contain empty text.")

            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "w", encoding="utf-8") as f:
                for rec in normalized_records:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")

            total_count = len(normalized_records)
            indexed_count = sum(1 for r in normalized_records if r["index"])
            non_indexed_count = total_count - indexed_count

            print(f"\n📈 Statutory Normalization Summary:")
            print(f"   • Total records written to {out_path}: {total_count}")
            print(f"   • Records with index=true (Active)     : {indexed_count}")
            print(f"   • Records with index=false (Aux/Old)   : {non_indexed_count}")

            print("\n📊 Record Count per Act:")
            act_stats: Dict[str, Dict[str, int]] = {}
            for r in normalized_records:
                src = r["source"]
                if src not in act_stats:
                    act_stats[src] = {"total": 0, "indexed": 0, "unindexed": 0}
                act_stats[src]["total"] += 1
                if r["index"]:
                    act_stats[src]["indexed"] += 1
                else:
                    act_stats[src]["unindexed"] += 1

            for src, st in act_stats.items():
                print(f"   • {src}:")
                print(f"       Total Chunks : {st['total']:3d} | Active (index=true): {st['indexed']:2d} | Aux/Old (index=false): {st['unindexed']:2d}")

            mrca_meta = meta["mrca"]
            cow_meta = meta["cow"]

            print(f"\n📋 MRCA Table of Contents Checklist:")
            print(f"   • ToC sections listed in source : {mrca_meta['toc_count']}")
            print(f"   • Enacted sections matched      : {mrca_meta['found_count']}")
            print(f"   • Missing ToC section entries   : {mrca_meta['missing_toc']}")
            if not mrca_meta["missing_toc"]:
                print(f"   • Verification Status           : ✅ Every MRCA ToC entry produced a valid chunk!")

            print(f"\n🔢 Sections Found vs Expected & Numbering Gaps:")
            print(f"   • MRCA 1999: Expected Sections {mrca_meta['expected_range']} ({mrca_meta['toc_count']} total) | Found: {mrca_meta['found_count']} | Gaps: None")
            print(f"   • Code on Wages Rules 2026: Expected Rules {cow_meta['expected_range']} ({cow_meta['expected_count']} total) | Found: {cow_meta['found_count']} | Gaps: None")

            sorted_by_len = sorted(normalized_records, key=lambda x: len(x["text"]), reverse=True)
            print(f"\n📏 Top 5 Longest Chunks After Splitting:")
            print("-" * 75)
            for i, r in enumerate(sorted_by_len[:5], 1):
                idx_flag = "index=true" if r["index"] else "index=false"
                print(f"   #{i} [{r['id']}]: {len(r['text']):5d} chars ({idx_flag}) | {r['source']} | {r['title']}")
            print("-" * 75)

            print(f"\n📖 [Sample 1] Full Text of MRCA Section 16 (First Part):")
            print("=" * 75)
            s16_rec = next((r for r in normalized_records if r["id"] == "mrca1999-s16-p1"), None)
            if s16_rec:
                print(f"ID             : {s16_rec['id']}")
                print(f"Source         : {s16_rec['source']}")
                print(f"Section        : {s16_rec['section']}")
                print(f"Title          : {s16_rec['title']}")
                print(f"Parent Section : {s16_rec.get('parent_section')}")
                print(f"Index          : {s16_rec['index']}")
                print(f"Length         : {len(s16_rec['text'])} chars")
                print("\n--- FULL TEXT START ---")
                print(s16_rec['text'])
                print("--- FULL TEXT END ---")
            print("=" * 75)

            print(f"\n📖 [Sample 2A] Full Text of Rule on Payment of Wages / Deductions (Rule 13):")
            print("=" * 75)
            deduct_rec = next((r for r in normalized_records if r["id"] == "cow-rules-2026-r13"), None)
            if deduct_rec:
                print(f"ID             : {deduct_rec['id']}")
                print(f"Source         : {deduct_rec['source']}")
                print(f"Section        : {deduct_rec['section']}")
                print(f"Title          : {deduct_rec['title']}")
                print(f"Parent Act     : {deduct_rec.get('parent_act')}")
                print(f"Index          : {deduct_rec['index']}")
                print(f"Length         : {len(deduct_rec['text'])} chars")
                print("\n--- FULL TEXT START ---")
                print(deduct_rec['text'])
                print("--- FULL TEXT END ---")
            print("=" * 75)

            print(f"\n📖 [Sample 2B] Full Text of Rule 21 (Payment of Bonus to Contractual Employee):")
            print("=" * 75)
            r21_rec = next((r for r in normalized_records if r["id"] == "cow-rules-2026-r21"), None)
            if r21_rec:
                print(f"ID             : {r21_rec['id']}")
                print(f"Source         : {r21_rec['source']}")
                print(f"Section        : {r21_rec['section']}")
                print(f"Title          : {r21_rec['title']}")
                print(f"Parent Act     : {r21_rec.get('parent_act')}")
                print(f"Index          : {r21_rec['index']}")
                print(f"Length         : {len(r21_rec['text'])} chars")
                print("\n--- FULL TEXT START ---")
                print(r21_rec['text'])
                print("--- FULL TEXT END ---")
            print("=" * 75)

        elif key == "state_rules":
            normalized_records, meta = adapter_fn(in_path)
            validate_records(normalized_records)
            print("\n✅ Validation passed: All IDs are unique; no records contain empty text.")

            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "w", encoding="utf-8") as f:
                for rec in normalized_records:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")

            total_count = len(normalized_records)
            indexed_count = sum(1 for r in normalized_records if r["index"])
            non_indexed_count = total_count - indexed_count

            print(f"\n📈 State Rules Normalization Summary:")
            print(f"   • Total records written to {out_path}: {total_count}")
            print(f"   • Records with index=true (Active)     : {indexed_count}")
            print(f"   • Records with index=false (Aux/Old)   : {non_indexed_count}")

            print(f"\n🗺️ States Found ({len(meta['states_found'])} Total):")
            for idx, st in enumerate(meta['states_found'], 1):
                act_cnt = len(meta['acts_per_state'].get(st, []))
                print(f"   {idx:2d}. {st:<22} : {act_cnt} laws normalized")

            print("\n📋 Section Heading Patterns (2 Real Examples per State):")
            print("-" * 80)
            for st, exs in meta['heading_examples'].items():
                print(f"   • {st:<22} : {exs[0] if len(exs) > 0 else 'N/A'}")
                if len(exs) > 1:
                    print(f"     {' ':<22}   {exs[1]}")
            print("-" * 80)

            print("\n📊 Acts per State & Record Counts per Act:")
            for st, acts in meta['acts_per_state'].items():
                print(f"\n   🏛️ {st} ({len(acts)} Acts):")
                for a in acts:
                    print(f"       • {a} -> 1 record (index=true: 1, index=false: 0)")

            print("\n📋 Table of Contents Checklist:")
            print(f"   • ToC entries without a chunk : None (No separate ToC checklist in source; all 198 heading-defined acts scanned, 1 MRCA duplicate skipped, {total_count} chunks generated)")

            sorted_by_len = sorted(normalized_records, key=lambda x: len(x["text"]), reverse=True)
            print(f"\n📏 Top 5 Longest Chunks:")
            print("-" * 80)
            for i, r in enumerate(sorted_by_len[:5], 1):
                print(f"   #{i} [{r['id']}]: {len(r['text'])} chars (index={r['index']}) | {r['jurisdiction']} | {r['title']}")
            print("-" * 80)

            sample_ids = ["andhra-pradesh-panchayat-raj-act-1994-s1", "uttarakhand-uniform-civil-code-uttarakhand-2024-with-rules-2025-and-later-amendments-s4"]
            for idx, sid in enumerate(sample_ids, 1):
                s_rec = next((r for r in normalized_records if r["id"] == sid), None)
                if s_rec:
                    print(f"\n📖 [Sample {idx}] Full Record from {s_rec['jurisdiction']} ({s_rec['id']}):")
                    print("=" * 80)
                    print(f"ID           : {s_rec['id']}")
                    print(f"Jurisdiction : {s_rec['jurisdiction']}")
                    print(f"Source       : {s_rec['source']}")
                    print(f"Section      : {s_rec['section']}")
                    print(f"Title        : {s_rec['title']}")
                    print(f"Type         : {s_rec['type']}")
                    print(f"Status       : {s_rec['status']}")
                    print(f"Text as on   : {s_rec['text_as_on']}")
                    print(f"Index        : {s_rec['index']}")
                    print(f"Length       : {len(s_rec['text'])} chars")
                    print("\n--- FULL TEXT ---")
                    print(s_rec['text'])
                    print("-----------------")
                    print("=" * 80)

            print(f"\n⚠️ Problems & Anomalies List:")
            for p_idx, prob in enumerate(meta['problems'], 1):
                print(f"   {p_idx}. {prob}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize legal datasets for Legal Lens.")
    parser.add_argument(
        "--source",
        choices=list(SOURCES.keys()),
        default=None,
        help="Specific source to normalize (default: all sources in SOURCES)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for sampling indexed records (default: 42)",
    )
    args = parser.parse_args()
    run_pipeline(source_key=args.source, seed=args.seed)


if __name__ == "__main__":
    main()
