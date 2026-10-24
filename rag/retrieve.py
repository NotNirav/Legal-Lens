#!/usr/bin/env python3
"""
retrieve.py - Hybrid Retrieval Pipeline for Legal Lens.

Combines dense vector search (Ollama bge-m3 via ChromaDB) with sparse keyword search (BM25),
fuses rankings using Reciprocal Rank Fusion (RRF, vector 2x weight), and applies deterministic
explicit legal reference boosting (e.g. Article 21, Art. 14, अनुच्छेद २१, धारा ४१).

Usage:
    from rag.retrieve import retrieve
    results = retrieve("right to life and personal liberty", k=5)

CLI:
    python -m rag.retrieve "right to life and personal liberty" --k 5
"""

from __future__ import annotations

import argparse
import glob
import io
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import chromadb
import requests
from rank_bm25 import BM25Okapi

# Ensure UTF-8 stdout on Windows consoles
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")


# ==============================================================================
# Configuration & Constants
# ==============================================================================

PROCESSED_DIR = Path("data/processed")
CHROMA_PATH = Path("./chroma_db")
COLLECTION_NAME = "legal"
OLLAMA_URL = "http://localhost:11434"
EMBED_MODEL = "bge-m3"
EMBED_NUM_CTX = 8192

# Threshold below which a retrieval match is considered uncertain / out-of-scope
MIN_SIMILARITY: float = 0.52

# Devanagari digit translation table
DEV_TO_ARABIC = str.maketrans("०१२३४५६७८९", "0123456789")

# Common Hindi suffix letters mapping to English article suffixes (e.g. 21क -> 21A)
HINDI_SUFFIX_MAP = {
    "क": "A",
    "ख": "B",
    "ग": "C",
    "घ": "D",
    "ङ": "E",
    "च": "F",
    "छ": "G",
    "ज": "H",
    "झ": "I",
}


# ==============================================================================
# Text Tokenization & Extraction Helpers
# ==============================================================================

CANONICAL_SOURCES = [
    "Constitution of India",
    "The Maharashtra Rent Control Act, 1999",
    "The Code on Wages (Central) Rules, 2026",
]


def normalize_source_filter(sources: Optional[List[str]]) -> Optional[List[str]]:
    """Maps flexible source filter strings to canonical full source names."""
    if not sources:
        return None
    canonical_set: Set[str] = set()
    for s in sources:
        s_clean = s.strip()
        s_low = s_clean.lower()
        matched = False
        for c in CANONICAL_SOURCES:
            if s_low == c.lower() or s_low in c.lower():
                canonical_set.add(c)
                matched = True
        if not matched:
            if "rent" in s_low or "mrca" in s_low or "maharashtra" in s_low:
                canonical_set.add("The Maharashtra Rent Control Act, 1999")
            elif "wage" in s_low or "cow" in s_low:
                canonical_set.add("The Code on Wages (Central) Rules, 2026")
            elif "const" in s_low:
                canonical_set.add("Constitution of India")
            else:
                canonical_set.add(s_clean)
    return list(canonical_set) if canonical_set else None


def tokenize_text(text: str) -> List[str]:
    """Tokenizes text into lowercase word tokens for BM25 search."""
    return re.findall(r"\w+", text.lower())


def get_section_level_id(chunk_id: str) -> str:
    """Strips split part suffixes (e.g., 'mrca1999-s16-p1' -> 'mrca1999-s16')."""
    return re.sub(r"-p\d+$", "", chunk_id)


def get_part_index(chunk_id: str) -> int:
    """Extracts integer part number for ordering (e.g. '-p2' -> 2, non-split -> 0)."""
    m = re.search(r"-p(\d+)$", chunk_id)
    return int(m.group(1)) if m else 0


def detect_act_in_query(query: str) -> Optional[str]:
    """Detects whether query explicitly names or references a specific statute or act."""
    q = query.lower()
    if any(k in q for k in ["constitution", "संविधान", "coi"]):
        return "Constitution of India"
    if any(k in q for k in ["rent control", "mrca", "rent act", "maharashtra rent", "महाराष्ट्र किराया"]):
        return "The Maharashtra Rent Control Act, 1999"
    if any(k in q for k in ["code on wages", "wage rules", "wages rules", "cow rules", "वेतन नियम", "मजदूरी नियम"]):
        return "The Code on Wages (Central) Rules, 2026"
    return None


def extract_explicit_reference(query: str) -> Optional[Tuple[str, str]]:
    """
    Extracts explicit article/section/rule citations from English and Hindi queries.
    Handles:
      - 'Article 21', 'Art. 14', 'Article 21A', 'Art 21a'
      - 'Section 16', 'Sec. 16', 'Sec 16'
      - 'Rule 21', 'Rule 13', 'R. 21', 'R 21'
      - 'अनुच्छेद 21', 'अनुच्छेद २१', 'अनुच्छेद 21क', 'अनुच्छेद 14'
      - 'धारा 16', 'धारा १६', 'धारा 41'
      - 'नियम 21', 'नियम २१', 'नियम 13'
      - 'MRCA 16', 'COW 21'

    Returns:
      (ref_type, canonical_identifier) e.g. ('article', '21A'), ('section', '16'), ('rule', '21')
    """
    # Normalize Devanagari digits to standard ASCII digits
    q_norm = query.translate(DEV_TO_ARABIC)

    # 1. Match Article patterns (English & Hindi)
    m_art = re.search(
        r"(?:article|art\.?|अनुच्छेद)\s*([0-9]+)\s*([a-zA-Zक-झ]*)",
        q_norm,
        re.IGNORECASE,
    )
    if m_art:
        num = m_art.group(1)
        raw_suffix = m_art.group(2)
        suffix = HINDI_SUFFIX_MAP.get(raw_suffix, raw_suffix).upper()
        return ("article", f"{num}{suffix}")

    # 2. Match Section patterns (English & Hindi)
    m_sec = re.search(
        r"(?:section|sec\.?|धारा)\s*([0-9]+)\s*([a-zA-Zक-झ]*)",
        q_norm,
        re.IGNORECASE,
    )
    if m_sec:
        num = m_sec.group(1)
        raw_suffix = m_sec.group(2)
        suffix = HINDI_SUFFIX_MAP.get(raw_suffix, raw_suffix).upper()
        return ("section", f"{num}{suffix}")

    # 3. Match Rule patterns (English & Hindi)
    m_rule = re.search(
        r"(?:rule|r\.?|नियम)\s*([0-9]+)\s*([a-zA-Zक-झ]*)",
        q_norm,
        re.IGNORECASE,
    )
    if m_rule:
        num = m_rule.group(1)
        raw_suffix = m_rule.group(2)
        suffix = HINDI_SUFFIX_MAP.get(raw_suffix, raw_suffix).upper()
        return ("rule", f"{num}{suffix}")

    # 4. Act shorthand + number e.g. "MRCA 16" or "COW 21"
    m_mrca = re.search(r"\bmrca\s*([0-9]+)\b", q_norm, re.IGNORECASE)
    if m_mrca:
        return ("section", m_mrca.group(1))

    m_cow = re.search(r"\bcow\s*([0-9]+)\b", q_norm, re.IGNORECASE)
    if m_cow:
        return ("rule", m_cow.group(1))

    return None


# ==============================================================================
# Corpus & Index Initialization (Loaded once at import)
# ==============================================================================

def _init_corpus_and_indexes() -> Tuple[
    List[Dict[str, Any]],
    Dict[str, Dict[str, Any]],
    Dict[str, List[Dict[str, Any]]],
    BM25Okapi,
    chromadb.Collection,
]:
    """
    Loads all index=True records once across ALL data/processed/*.jsonl files,
    builds BM25 index over title + text, indexes by ID and Section name,
    and establishes persistent ChromaDB connection.
    """
    records: List[Dict[str, Any]] = []
    by_id: Dict[str, Dict[str, Any]] = {}
    by_section: Dict[str, List[Dict[str, Any]]] = {}

    # Load from processed JSONL files
    jsonl_files = sorted(PROCESSED_DIR.glob("*.jsonl"))
    for fpath in jsonl_files:
        with open(fpath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                item = json.loads(line)
                if item.get("index") is True:
                    records.append(item)
                    by_id[item["id"]] = item

                    # Section key normalized for lookup (e.g. "article 21a", "section 16", "rule 13")
                    sec_key = item.get("section", "").strip().lower()
                    if sec_key:
                        if sec_key not in by_section:
                            by_section[sec_key] = []
                        if item not in by_section[sec_key]:
                            by_section[sec_key].append(item)

                    # Also register parent_section if present (e.g. "section 16" for mrca1999-s16-p1)
                    parent_sec = item.get("parent_section", "").strip().lower()
                    if parent_sec and parent_sec != sec_key:
                        if parent_sec not in by_section:
                            by_section[parent_sec] = []
                        if item not in by_section[parent_sec]:
                            by_section[parent_sec].append(item)

    if not records:
        print(f"⚠️ Warning: No indexed records found in {PROCESSED_DIR}.")

    # Build BM25 index over title + text
    tokenized_corpus = [
        tokenize_text(f"{r.get('title', '')} {r.get('text', '')}")
        for r in records
    ]
    bm25 = BM25Okapi(tokenized_corpus)

    # Initialize ChromaDB collection connection
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    try:
        collection = chroma_client.get_collection(name=COLLECTION_NAME)
    except Exception:
        # Fallback if collection doesn't exist yet
        collection = chroma_client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    known_jurisdictions: Dict[str, str] = {}
    for r in records:
        jur = (r.get("jurisdiction") or "").strip()
        if jur:
            known_jurisdictions[jur.lower()] = jur

    return records, by_id, by_section, bm25, collection, known_jurisdictions


# Load corpus once at import
CORPUS_RECORDS, CORPUS_BY_ID, CORPUS_BY_SECTION, BM25_INDEX, CHROMA_COLLECTION, KNOWN_JURISDICTIONS = _init_corpus_and_indexes()


# ==============================================================================
# Filtering Helper
# ==============================================================================

def is_record_eligible(
    r: Dict[str, Any],
    sources: Optional[List[str]] = None,
    state: Optional[str] = None,
    tier: Optional[str] = None,
) -> bool:
    """
    Evaluates whether a corpus record meets the filtering criteria for
    sources, state jurisdiction, or a specific retrieval tier.
    """
    r_source = r.get("source", "")
    r_jur = (r.get("jurisdiction") or "").strip()
    r_jur_lower = r_jur.lower()

    if tier == "constitution":
        return r_source == "Constitution of India"
    elif tier == "central":
        return r_jur_lower == "india" and r_source != "Constitution of India"
    elif tier == "state":
        if not state:
            return False
        canon_state = KNOWN_JURISDICTIONS.get(state.strip().lower())
        if not canon_state or canon_state.lower() == "india":
            return False
        return r_jur_lower == canon_state.lower()
    else:
        # Standard retrieve() mode
        if sources:
            canonical_sources = normalize_source_filter(sources)
            if canonical_sources and r_source not in canonical_sources:
                return False
        if state is not None:
            target_state_lower = state.strip().lower()
            if r_jur_lower != target_state_lower and r_jur_lower != "india":
                return False
        return True


# ==============================================================================
# Vector Search Helper
# ==============================================================================

def embed_query_ollama(
    query: str,
    ollama_url: str = OLLAMA_URL,
    model: str = EMBED_MODEL,
    num_ctx: int = EMBED_NUM_CTX,
) -> List[float]:
    """Embeds query string via Ollama /api/embed."""
    endpoint = f"{ollama_url.rstrip('/')}/api/embed"
    payload = {
        "model": model,
        "input": [query],
        "options": {"num_ctx": num_ctx},
    }
    resp = requests.post(endpoint, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    embeddings = data.get("embeddings")
    if not embeddings:
        raise ValueError("Ollama returned empty embeddings for query.")
    return embeddings[0]


def vector_search(
    query: str,
    k_vec: int = 20,
    sources: Optional[List[str]] = None,
    state: Optional[str] = None,
    tier: Optional[str] = None,
) -> List[Tuple[str, int, float]]:
    """
    Performs dense vector retrieval against ChromaDB collection.
    Supports filtering by canonical sources, state jurisdiction, and retrieval tier.
    Returns: list of (doc_id, rank, cosine_dist) where rank is 1-indexed.
    """
    query_vector = embed_query_ollama(query)

    n_results = min(k_vec, len(CORPUS_RECORDS)) if CORPUS_RECORDS else k_vec
    canonical_sources = normalize_source_filter(sources)

    where_clauses: List[Dict[str, Any]] = []

    if tier == "constitution":
        where_clauses.append({"source": "Constitution of India"})
    elif tier == "central":
        where_clauses.append({"jurisdiction": "India"})
        where_clauses.append({"source": {"$ne": "Constitution of India"}})
    elif tier == "state":
        if not state:
            return []
        canon_state = KNOWN_JURISDICTIONS.get(state.strip().lower())
        if not canon_state or canon_state.lower() == "india":
            return []
        where_clauses.append({"jurisdiction": canon_state})
    else:
        # Standard retrieve() mode
        if canonical_sources:
            if len(canonical_sources) == 1:
                where_clauses.append({"source": canonical_sources[0]})
            else:
                where_clauses.append({"source": {"$in": canonical_sources}})
        if state is not None:
            canon_state = KNOWN_JURISDICTIONS.get(state.strip().lower(), state.strip())
            if canon_state.lower() == "india":
                where_clauses.append({"jurisdiction": "India"})
            else:
                where_clauses.append({"jurisdiction": {"$in": [canon_state, "India"]}})

    where_filter = None
    if len(where_clauses) == 1:
        where_filter = where_clauses[0]
    elif len(where_clauses) > 1:
        where_filter = {"$and": where_clauses}

    query_args: Dict[str, Any] = {
        "query_embeddings": [query_vector],
        "n_results": n_results,
        "include": ["distances"],
    }
    if where_filter:
        query_args["where"] = where_filter

    try:
        results = CHROMA_COLLECTION.query(**query_args)
    except Exception:
        return []

    doc_ids = results["ids"][0] if results["ids"] else []
    distances = results["distances"][0] if results["distances"] else []

    ranked_results: List[Tuple[str, int, float]] = []
    for rank, (doc_id, dist) in enumerate(zip(doc_ids, distances), 1):
        ranked_results.append((doc_id, rank, dist))

    return ranked_results


# ==============================================================================
# Keyword Search Helper (BM25)
# ==============================================================================

def bm25_search(
    query: str,
    k_bm25: int = 20,
    sources: Optional[List[str]] = None,
    state: Optional[str] = None,
    tier: Optional[str] = None,
) -> List[Tuple[str, int, float]]:
    """
    Performs BM25 search over corpus (title + text).
    Returns: list of (doc_id, rank, bm25_score) where rank is 1-indexed.
    """
    tokens = tokenize_text(query)
    if not tokens or not CORPUS_RECORDS:
        return []

    scores = BM25_INDEX.get_scores(tokens)

    # Filter by source, state, tier if requested
    filtered_indices = []
    for idx, r in enumerate(CORPUS_RECORDS):
        if not is_record_eligible(r, sources=sources, state=state, tier=tier):
            continue
        if scores[idx] > 0.0:
            filtered_indices.append((idx, scores[idx]))

    # Sort descending by BM25 score
    filtered_indices.sort(key=lambda x: x[1], reverse=True)
    top_indices = filtered_indices[:k_bm25]

    ranked_results: List[Tuple[str, int, float]] = []
    for rank, (idx, score) in enumerate(top_indices, 1):
        doc_id = CORPUS_RECORDS[idx]["id"]
        ranked_results.append((doc_id, rank, float(score)))

    return ranked_results


# ==============================================================================
# Main Hybrid Retrieval Functions
# ==============================================================================

def _retrieve_core(
    query: str,
    k: int = 5,
    sources: Optional[List[str]] = None,
    state: Optional[str] = None,
    tier: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Core hybrid vector + BM25 retrieval engine with RRF fusion, explicit reference
    boosting, and section-collapsing logic, parameterized by sources, state, and tier.
    """
    canonical_sources = normalize_source_filter(sources)

    # 1. Vector Search (top 20)
    vec_results = vector_search(query, k_vec=20, sources=canonical_sources, state=state, tier=tier)
    vec_ranks: Dict[str, int] = {doc_id: rank for doc_id, rank, _ in vec_results}
    vec_sims: Dict[str, float] = {doc_id: round(1.0 - dist, 4) for doc_id, _, dist in vec_results}

    # 2. Keyword Search (BM25 top 20)
    bm25_results = bm25_search(query, k_bm25=20, sources=canonical_sources, state=state, tier=tier)
    bm25_ranks: Dict[str, int] = {doc_id: rank for doc_id, rank, _ in bm25_results}

    # 3. Reciprocal Rank Fusion (RRF)
    rrf_k = 60.0
    weight_vector = 2.0
    weight_bm25 = 1.0

    all_candidate_ids = set(vec_ranks.keys()).union(set(bm25_ranks.keys()))
    rrf_scores: Dict[str, float] = {}

    for doc_id in all_candidate_ids:
        score = 0.0
        if doc_id in vec_ranks:
            score += weight_vector / (rrf_k + vec_ranks[doc_id])
        if doc_id in bm25_ranks:
            score += weight_bm25 / (rrf_k + bm25_ranks[doc_id])
        rrf_scores[doc_id] = score

    # Sort candidates by RRF score descending
    sorted_candidates = sorted(
        all_candidate_ids,
        key=lambda doc_id: rrf_scores[doc_id],
        reverse=True,
    )

    # 4. Multi-Source Explicit Reference Boost
    explicit_ref = extract_explicit_reference(query)
    detected_act = detect_act_in_query(query)

    if explicit_ref:
        ref_type, ref_num = explicit_ref
        target_section_key = f"{ref_type} {ref_num}".lower()
        matching_chunks = list(CORPUS_BY_SECTION.get(target_section_key, []))

        # Filter candidate matching chunks to eligible ones
        matching_chunks = [
            c for c in matching_chunks
            if is_record_eligible(c, sources=sources, state=state, tier=tier)
        ]

        # "Article N" boosts only the Constitution of India
        if ref_type == "article":
            matching_chunks = [c for c in matching_chunks if c.get("source") == "Constitution of India"]

        # If query explicitly named the act, filter candidates to that specific act
        if detected_act:
            matching_chunks = [c for c in matching_chunks if c.get("source") == detected_act]

        if matching_chunks:
            distinct_sources = {c.get("source") for c in matching_chunks}

            if len(distinct_sources) == 1 or detected_act is not None or len(matching_chunks) == 1:
                matching_chunks_sorted = sorted(matching_chunks, key=lambda x: x["id"])
                top_match_id = matching_chunks_sorted[0]["id"]

                if top_match_id in sorted_candidates:
                    sorted_candidates.remove(top_match_id)
                sorted_candidates.insert(0, top_match_id)

                max_curr_score = max(rrf_scores.values()) if rrf_scores else 0.05
                rrf_scores[top_match_id] = max_curr_score + 1.0

                for extra_part in matching_chunks_sorted[1:]:
                    part_id = extra_part["id"]
                    rrf_scores[part_id] = rrf_scores.get(part_id, 0.0) + 0.1
                    if part_id not in sorted_candidates:
                        sorted_candidates.append(part_id)
            else:
                moderate_boost = 0.025
                for c in matching_chunks:
                    cid = c["id"]
                    rrf_scores[cid] = rrf_scores.get(cid, 0.0) + moderate_boost

                sorted_candidates = sorted(
                    all_candidate_ids,
                    key=lambda doc_id: rrf_scores.get(doc_id, 0.0),
                    reverse=True,
                )

    # 5. Collapse Split Sections & Format Top K Results
    section_groups: Dict[Tuple[str, str], Dict[str, Any]] = {}
    ordered_sec_keys: List[Tuple[str, str]] = []

    for doc_id in sorted_candidates:
        record = CORPUS_BY_ID.get(doc_id)
        if not record:
            continue

        source_name = record.get("source", "Constitution of India")
        sec_level_id = get_section_level_id(doc_id)
        sec_key = (source_name, sec_level_id)

        sim_val = vec_sims.get(doc_id)
        score_val = rrf_scores.get(doc_id, 0.0)

        if sec_key not in section_groups:
            ordered_sec_keys.append(sec_key)
            base_title = re.sub(r"\s*\(Part\s*\d+\)$", "", record.get("title", ""))
            default_jur = "India" if source_name == "Constitution of India" else ""
            section_groups[sec_key] = {
                "id": sec_level_id,
                "source": source_name,
                "section": record.get("section", ""),
                "title": base_title,
                "part_title": record.get("part_title"),
                "parent_act": record.get("parent_act") or "",
                "status": record.get("status") or "",
                "text_as_on": record.get("text_as_on") or "",
                "jurisdiction": record.get("jurisdiction") or default_jur,
                "best_score": score_val,
                "best_sim": sim_val,
                "matched_parts": [doc_id],
            }
        else:
            group = section_groups[sec_key]
            group["matched_parts"].append(doc_id)
            if score_val > group["best_score"]:
                group["best_score"] = score_val
            if sim_val is not None:
                if group["best_sim"] is None or sim_val > group["best_sim"]:
                    group["best_sim"] = sim_val

    results: List[Dict[str, Any]] = []
    for sec_key in ordered_sec_keys[:k]:
        group = section_groups[sec_key]
        parts = group["matched_parts"]

        # Sort matched parts in natural part order
        parts_sorted = sorted(parts, key=get_part_index)

        # Concatenate matched parts text in order
        part_texts = [CORPUS_BY_ID[pid]["text"] for pid in parts_sorted if pid in CORPUS_BY_ID]
        merged_text = "\n\n".join(part_texts).strip()

        # Cap about 6000 chars
        if len(merged_text) > 6000:
            merged_text = merged_text[:6000].rstrip() + "..."

        source_name = group["source"]
        section_name = group["section"]
        citation_str = f"{source_name}, {section_name}" if section_name else source_name

        sim_val = group["best_sim"]
        is_confident = (sim_val is not None and sim_val >= MIN_SIMILARITY)

        result_item = {
            "id": group["id"],
            "source": source_name,
            "section": section_name,
            "title": group["title"],
            "part_title": group["part_title"],
            "parent_act": group["parent_act"],
            "status": group["status"],
            "text_as_on": group["text_as_on"],
            "jurisdiction": group["jurisdiction"],
            "text": merged_text,
            "score": round(group["best_score"], 6),
            "similarity": sim_val,
            "confident": is_confident,
            "citation": citation_str,
            "matched_parts": parts_sorted,
        }
        results.append(result_item)

    return results


def retrieve(
    query: str,
    k: int = 5,
    sources: Optional[List[str]] = None,
    state: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieves top k legal documents using hybrid vector + BM25 search,
    weighted Reciprocal Rank Fusion, safe multi-source explicit citation boosting,
    and full canonical metadata enrichment.

    Args:
        query: User search query in English or Hindi.
        k: Number of top results to return (default: 5).
        sources: Optional list of source strings to filter.
        state: Optional state name (e.g. 'Maharashtra'). When given, only records
               with jurisdiction == state or 'India' are eligible. When None,
               keeps default behaviour (no jurisdiction filter), preserving eval compatibility.

    Returns:
        List of dicts: id, source, section, title, text, score, similarity, confident,
                       citation, parent_act, status, text_as_on, jurisdiction.
    """
    return _retrieve_core(query=query, k=k, sources=sources, state=state, tier=None)


def retrieve_tiered(
    query: str,
    state: Optional[str] = None,
    k_const: int = 2,
    k_central: int = 3,
    k_state: int = 3,
    k_qa: int = 2,
) -> Dict[str, Any]:
    """
    Executes tiered hybrid retrieval partitioned by legal authority:
      - "constitution": Constitution of India records (top k_const)
      - "central": jurisdiction 'India', excluding Constitution of India (top k_central)
      - "state": jurisdiction == state (excluding India; empty if state not covered) (top k_state)
      - "qa": community/extracted QA pairs (if available; empty if skipped) (top k_qa)
      - "any_confident": True if any result across all tiers meets confidence threshold

    Each tier applies dedicated hybrid ranking and section-collapsing logic.
    Returns:
        Dict with keys: "constitution", "central", "state", "qa", "any_confident".
    """
    const_res = _retrieve_core(query=query, k=k_const, tier="constitution")
    central_res = _retrieve_core(query=query, k=k_central, tier="central")
    state_res = _retrieve_core(query=query, k=k_state, state=state, tier="state") if state else []
    qa_res: List[Dict[str, Any]] = []

    all_results = const_res + central_res + state_res + qa_res
    any_confident = any(r.get("confident", False) for r in all_results)

    return {
        "constitution": const_res,
        "central": central_res,
        "state": state_res,
        "qa": qa_res,
        "any_confident": any_confident,
    }


# ==============================================================================
# CLI Interface
# ==============================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="Legal Lens Hybrid RAG Retrieval CLI.")
    parser.add_argument("query", type=str, help="Search query string (English or Hindi)")
    parser.add_argument("--k", type=int, default=5, help="Number of results to return (default: 5)")
    parser.add_argument(
        "--source",
        type=str,
        action="append",
        dest="sources",
        default=None,
        help="Optional source filter (can be specified multiple times)",
    )
    parser.add_argument(
        "--state",
        type=str,
        default=None,
        help="Optional state jurisdiction filter (e.g. 'Maharashtra')",
    )
    parser.add_argument(
        "--tiered",
        action="store_true",
        help="Execute tiered retrieval (constitution, central, state, qa)",
    )
    parser.add_argument(
        "--preview-len",
        type=int,
        default=200,
        help="Length of text snippet to preview in CLI output (default: 200)",
    )

    args = parser.parse_args()

    t0 = time.time()
    if args.tiered:
        tiered_res = retrieve_tiered(query=args.query, state=args.state)
        elapsed = time.time() - t0

        print(f"\n{'='*75}")
        print(f"🔍 Tiered Query: \"{args.query}\" | State: {args.state or 'None'}")
        print(f"⏱️ Retrieval Time: {elapsed:.3f} seconds | Any Confident: {tiered_res['any_confident']}")
        print(f"{'='*75}")

        for tier_name in ["constitution", "central", "state", "qa"]:
            tier_items = tiered_res.get(tier_name, [])
            print(f"\n📂 Tier: [{tier_name.upper()}] ({len(tier_items)} results)")
            print("-" * 75)
            if not tier_items:
                print("   (No matching records in this tier)")
                continue

            for rank, res in enumerate(tier_items, 1):
                clean_text = res["text"].replace("\n", " ").strip()
                if len(clean_text) > args.preview_len:
                    clean_text = clean_text[:args.preview_len] + "..."

                sim_str = f"{res['similarity']:.4f}" if res["similarity"] is not None else "N/A"
                conf_str = "✅ Confident" if res["confident"] else "⚠️ Low Confidence"
                parts_info = f" [Merged parts: {', '.join(res['matched_parts'])}]" if len(res.get("matched_parts", [])) > 1 else ""

                print(f"[{rank}] {res['citation']} (RRF: {res['score']}, Sim: {sim_str}) [{conf_str}]{parts_info}")
                print(f"    Jurisdiction: {res.get('jurisdiction')}")
                print(f"    ID          : {res['id']}")
                print(f"    Title       : {res['title']}")
                print(f"    Snippet     : {clean_text}")
                print("-" * 50)
    else:
        results = retrieve(query=args.query, k=args.k, sources=args.sources, state=args.state)
        elapsed = time.time() - t0

        print(f"\n{'='*75}")
        print(f"🔍 Query: \"{args.query}\" | State Filter: {args.state or 'None'}")
        print(f"⏱️ Retrieval Time: {elapsed:.3f} seconds | Returned: {len(results)} results")
        print(f"{'='*75}")

        for rank, res in enumerate(results, 1):
            clean_text = res["text"].replace("\n", " ").strip()
            if len(clean_text) > args.preview_len:
                clean_text = clean_text[:args.preview_len] + "..."

            sim_str = f"{res['similarity']:.4f}" if res["similarity"] is not None else "N/A (BM25 only)"
            conf_str = "✅ Confident" if res["confident"] else "⚠️ Low Confidence"
            parts_info = f" [Merged parts: {', '.join(res['matched_parts'])}]" if len(res.get("matched_parts", [])) > 1 else ""

            print(f"[{rank}] {res['citation']} (RRF: {res['score']}, Sim: {sim_str}) [{conf_str}]{parts_info}")
            print(f"    Jurisdiction: {res.get('jurisdiction')}")
            print(f"    ID          : {res['id']}")
            print(f"    Part        : {res.get('part_title')}")
            print(f"    Title       : {res['title']}")
            print(f"    Snippet     : {clean_text}")
            print("-" * 75)


if __name__ == "__main__":
    main()

