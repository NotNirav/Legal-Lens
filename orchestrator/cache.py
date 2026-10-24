#!/usr/bin/env python3
"""
cache.py - Persistent answer caching and request trace logging for Legal Lens.

Stores pre-generated and real-time answers in cache/answers.json, keyed by
sha1(normalized query + state + lang). Supports CACHE_ONLY=1 mode to bypass
external model calls, and logs execution traces to logs/requests.jsonl.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

CACHE_DIR = PROJECT_ROOT / "cache"
CACHE_FILE = CACHE_DIR / "answers.json"

LOGS_DIR = PROJECT_ROOT / "logs"
REQUESTS_LOG_FILE = LOGS_DIR / "requests.jsonl"

_CACHE_LOCK = threading.Lock()
_LOG_LOCK = threading.Lock()
_CACHE_MEMORY: Optional[Dict[str, Dict[str, Any]]] = None


def is_cache_only() -> bool:
    """Returns True if CACHE_ONLY environment variable is set to '1'."""
    return os.getenv("CACHE_ONLY", "0").strip() == "1"


def compute_cache_key(query: str, state: Optional[str] = None, lang: Optional[str] = None) -> str:
    """
    Computes a deterministic SHA-1 hash key from normalized query, state, and language.
    """
    q_norm = " ".join((query or "").strip().lower().split())
    s_norm = (state or "").strip().lower()
    l_norm = (lang or "en").strip().lower()
    raw = f"{q_norm}|||{s_norm}|||{l_norm}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _ensure_cache_loaded() -> Dict[str, Dict[str, Any]]:
    """Loads cache/answers.json into memory under a thread lock."""
    global _CACHE_MEMORY
    with _CACHE_LOCK:
        if _CACHE_MEMORY is not None:
            return _CACHE_MEMORY

        _CACHE_MEMORY = {}
        if CACHE_FILE.exists():
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        _CACHE_MEMORY = data
            except Exception:
                _CACHE_MEMORY = {}
        return _CACHE_MEMORY


def get_cached_answer(
    query: str,
    state: Optional[str] = None,
    lang: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Retrieves cached answer dictionary if present, else returns None.
    """
    cache = _ensure_cache_loaded()
    key = compute_cache_key(query, state, lang)
    with _CACHE_LOCK:
        item = cache.get(key)
        if item:
            # Return deepcopy or copy to prevent mutation
            return dict(item)
    return None


def set_cached_answer(
    query: str,
    state: Optional[str],
    lang: Optional[str],
    data: Dict[str, Any],
) -> None:
    """
    Persists answer payload to memory and writes out to cache/answers.json.
    """
    cache = _ensure_cache_loaded()
    key = compute_cache_key(query, state, lang)

    with _CACHE_LOCK:
        cache[key] = {
            "query": query,
            "state": state,
            "lang": lang,
            "cached_at": time.time(),
            **data,
        }
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            temp_file = CACHE_DIR / "answers.json.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False, indent=2)
            temp_file.replace(CACHE_FILE)
        except Exception:
            pass


def get_cache_count() -> int:
    """Returns the total number of cached entries."""
    cache = _ensure_cache_loaded()
    with _CACHE_LOCK:
        return len(cache)


def log_request_trace(
    endpoint: str,
    query: str,
    trace: List[Dict[str, Any]],
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Appends execution trace to logs/requests.jsonl.
    """
    with _LOG_LOCK:
        try:
            LOGS_DIR.mkdir(parents=True, exist_ok=True)
            record = {
                "timestamp": round(time.time(), 3),
                "datetime": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "endpoint": endpoint,
                "query": query,
                "trace": trace,
            }
            if extra:
                record.update(extra)
            with open(REQUESTS_LOG_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        except Exception:
            pass


if __name__ == "__main__":
    test_q = "can my landlord throw me out without notice"
    k = compute_cache_key(test_q, "Maharashtra", "en")
    print(f"Sample Cache Key for '{test_q}': {k}")
    print(f"Total cache entries: {get_cache_count()}")
    print(f"CACHE_ONLY mode: {is_cache_only()}")
