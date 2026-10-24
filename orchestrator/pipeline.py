#!/usr/bin/env python3
"""
pipeline.py - Core Orchestration Pipeline for Legal Lens.

Coordinates parallel hybrid tiered retrieval and web search, prompt synthesis,
concurrency-limited LLM streaming generation with WRITER_MODEL, citation
extraction and hallucination pruning in code, and structured fallback recovery.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from orchestrator.cache import (
    get_cached_answer,
    is_cache_only,
    log_request_trace,
    set_cached_answer,
)
from orchestrator.config import WRITER_MODEL, WRITER_TIMEOUT
from orchestrator.evidence import detect_query_language, format_tiered_evidence
from orchestrator.llm import generate_stream
from orchestrator.prompt import build_prompt
from orchestrator.web import web_evidence
from rag.retrieve import retrieve_tiered

# Concurrency control: at most 3 generations run at once
GENERATION_SEMAPHORE = asyncio.Semaphore(3)


def sse_pack(event: str, data: Any) -> str:
    """Formats an event and payload into standard Server-Sent Events (SSE) wire format."""
    if isinstance(data, (dict, list)):
        payload = json.dumps(data, ensure_ascii=False)
    else:
        payload = str(data)
    return f"event: {event}\ndata: {payload}\n\n"


def build_rag_fallback_answer(evidence: List[Dict[str, Any]], lang: str = "en") -> Tuple[str, List[Dict[str, Any]]]:
    """
    Constructs a deterministic RAG-only structured answer when the LLM writer fails or times out.
    """
    lang_is_hi = (lang == "hi")
    header = "कानूनी प्रावधान (सीधे स्रोतों से):" if lang_is_hi else "Showing the relevant law directly:"
    direct_ans = (
        "सीधा उत्तर: उपलब्ध आधिकारिक कानूनी रिकॉर्ड के अनुसार आपकी स्थिति से संबंधित प्राथमिक प्रावधान नीचे दिए गए हैं।"
        if lang_is_hi
        else "Direct Answer: Based on verified statutory records, here are the direct legal provisions applicable to your situation."
    )

    lines = [direct_ans, "", header]
    fallback_sources_cited: List[Dict[str, Any]] = []

    for item in evidence[:4]:
        tag = item.get("tag", "")
        cit = item.get("citation", "")
        raw_text = (item.get("text") or "").strip()
        txt = raw_text[:350].strip() + ("..." if len(raw_text) > 350 else "")
        lines.append(f"- {tag} {cit}: {txt}")
        fallback_sources_cited.append({
            "tag": tag,
            "citation": cit,
            "source": item.get("source") or cit,
            "section": item.get("section", ""),
            "status": item.get("status", "In Force"),
            "text_as_on": item.get("text_as_on", ""),
            "jurisdiction": item.get("jurisdiction", "India"),
            "text": item.get("text", ""),
            "url": item.get("url", ""),
            "domain": item.get("domain", ""),
        })

    disclaimer = (
        "अस्वीकरण: यह जानकारी केवल सामान्य शैक्षिक उद्देश्यों के लिए है और औपचारिक कानूनी सलाह नहीं है।"
        if lang_is_hi
        else "Disclaimer: This information is for general educational purposes only, does not constitute legal advice, and does not create an attorney-client relationship."
    )
    lines.extend(["", disclaimer])
    return "\n".join(lines), fallback_sources_cited


def extract_sources_cited(
    answer: str,
    evidence: List[Dict[str, Any]],
    trace: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Extracts [C#], [L#], [S#], [Q#], [W#], [D#] tags from the generated answer in code.
    Maps tags to evidence metadata and drops hallucinated tags that do not exist in evidence,
    recording a warning in the trace log.
    """
    t0 = time.perf_counter()
    matches = re.findall(r"\[([cClLsSqQwWdD]\d+)\]", answer)
    seen_tags = set()
    ordered_tags = []
    for m in matches:
        t = f"[{m.upper()}]"
        if t not in seen_tags:
            seen_tags.add(t)
            ordered_tags.append(t)

    evidence_by_tag = {item["tag"]: item for item in evidence}
    sources_cited = []

    for tag in ordered_tags:
        if tag in evidence_by_tag:
            item = evidence_by_tag[tag]
            raw_url = item.get("url", "")
            raw_domain = item.get("domain", "")
            if not raw_domain and raw_url and "//" in raw_url:
                try:
                    raw_domain = raw_url.split("//")[1].split("/")[0]
                except Exception:
                    raw_domain = ""
            sources_cited.append({
                "tag": tag,
                "citation": item.get("citation", ""),
                "source": item.get("source") or item.get("citation", ""),
                "section": item.get("section", ""),
                "status": item.get("status", "In Force"),
                "text_as_on": item.get("text_as_on", ""),
                "jurisdiction": item.get("jurisdiction", "India"),
                "text": item.get("text", ""),
                "url": raw_url,
                "domain": raw_domain,
            })
        else:
            trace.append({
                "step": "sources_cited_validation",
                "ms": round((time.perf_counter() - t0) * 1000, 2),
                "ok": False,
                "warning": f"Model hallucinated tag {tag} not found in retrieved evidence (dropped)",
            })

    trace.append({
        "step": "extract_sources_cited",
        "ms": round((time.perf_counter() - t0) * 1000, 2),
        "ok": True,
    })
    return sources_cited


async def execute_retrieval_and_evidence(
    query: str,
    state: Optional[str] = None,
    lang: Optional[str] = None,
) -> Tuple[Any, Dict[str, str], List[Dict[str, Any]], str, bool]:
    """
    Step 1 & 2: Runs tiered retrieval and web search in parallel, formats evidence,
    and builds the assembly prompt.
    """
    if not lang:
        lang = detect_query_language(query)

    trace: List[Dict[str, Any]] = []
    loop = asyncio.get_running_loop()

    # Step 1: Parallel retrieval (tiered RAG + official web grounding)
    t_start = time.perf_counter()
    tiered_fut = loop.run_in_executor(None, lambda: retrieve_tiered(query=query, state=state))
    web_fut = loop.run_in_executor(None, lambda: web_evidence(query=query, state=state, lang=lang, timeout=10.0))

    tiered_raw, web_raw = await asyncio.gather(tiered_fut, web_fut, return_exceptions=True)

    # Process tiered RAG results
    if isinstance(tiered_raw, Exception):
        trace.append({
            "step": "retrieve_tiered",
            "ms": round((time.perf_counter() - t_start) * 1000, 2),
            "ok": False,
            "error": str(tiered_raw),
        })
        tiered_res: Dict[str, Any] = {
            "constitution": [],
            "central": [],
            "state": [],
            "qa": [],
            "any_confident": False,
        }
    else:
        trace.append({
            "step": "retrieve_tiered",
            "ms": round((time.perf_counter() - t_start) * 1000, 2),
            "ok": True,
        })
        tiered_res = tiered_raw

    # Process web grounding results
    if isinstance(web_raw, Exception):
        trace.append({
            "step": "web_evidence",
            "ms": round((time.perf_counter() - t_start) * 1000, 2),
            "ok": False,
            "error": str(web_raw),
        })
        web_res: Dict[str, Any] = {"ok": False, "findings": "", "sources": [], "latency": 10.0}
    else:
        trace.append({
            "step": "web_evidence",
            "ms": round(web_raw.get("latency", 0.0) * 1000, 2),
            "ok": bool(web_raw.get("ok", False)),
        })
        web_res = web_raw

    # Step 2: Build Evidence List and Prompt
    t_ev = time.perf_counter()
    evidence = format_tiered_evidence(
        tiered=tiered_res,
        web=web_res,
        state=state,
        lang=lang,
    )
    any_confident = bool(evidence.any_confident)

    prompt_bundle = build_prompt(
        query=query,
        state=state,
        lang=lang,
        evidence=evidence,
        any_confident=any_confident,
    )
    trace.append({
        "step": "build_evidence_and_prompt",
        "ms": round((time.perf_counter() - t_ev) * 1000, 2),
        "ok": True,
    })

    return evidence, prompt_bundle, trace, lang, any_confident


async def stream_pipeline_sse(
    query: str,
    state: Optional[str] = None,
    lang: Optional[str] = None,
) -> AsyncIterator[str]:
    """
    Asynchronous generator yielding Server-Sent Events (SSE):
      - 'sources': Initial retrieved citations metadata
      - 'token': Streamed token chunks from WRITER_MODEL (or replayed from cache in ~40 char chunks)
      - 'done': Final JSON payload with answer, sources_cited, trace, etc.
      - 'error': Sent if a fatal unrecoverable pipeline failure occurs
    """
    try:
        detected_lang = lang or detect_query_language(query)

        # 1. Check answer cache first
        cached_data = get_cached_answer(query=query, state=state, lang=detected_lang)
        if cached_data is not None:
            t_hit = time.perf_counter()
            sources_meta = cached_data.get("sources", cached_data.get("sources_cited", []))
            yield sse_pack("sources", {"sources": sources_meta})

            trace = list(cached_data.get("trace", []))
            trace.append({
                "step": "cache_hit",
                "ms": round((time.perf_counter() - t_hit) * 1000, 2),
                "ok": True,
                "cached": True,
            })
            for tr in trace:
                tr["cached"] = True

            yield sse_pack("trace", {"step": "cache_hit", "trace": trace})

            # Replay stored answer tokens in chunks of ~40 chars with a tiny delay
            ans_text = cached_data.get("answer", "")
            chunk_size = 40
            for i in range(0, len(ans_text), chunk_size):
                chunk = ans_text[i : i + chunk_size]
                yield sse_pack("token", {"token": chunk})
                await asyncio.sleep(0.015)

            done_payload = dict(cached_data)
            done_payload["trace"] = trace
            done_payload["cached"] = True
            yield sse_pack("done", done_payload)
            log_request_trace("/ask", query, trace, {"cached": True, "state": state, "lang": detected_lang})
            return

        # 2. Check CACHE_ONLY flag: if enabled, never call any model
        if is_cache_only():
            t_start = time.perf_counter()
            trace = [{
                "step": "cache_lookup",
                "ms": 0.1,
                "ok": False,
                "cached": False,
                "info": "CACHE_ONLY=1 active - skipping all model calls",
            }]
            loop = asyncio.get_running_loop()
            tiered_res = await loop.run_in_executor(None, lambda: retrieve_tiered(query=query, state=state))
            trace.append({
                "step": "retrieve_tiered",
                "ms": round((time.perf_counter() - t_start) * 1000, 2),
                "ok": True,
                "cached": False,
            })
            evidence = format_tiered_evidence(tiered=tiered_res, web=None, state=state, lang=detected_lang)
            fallback_ans, fallback_sources = build_rag_fallback_answer(evidence, lang=detected_lang)

            sources_meta = [
                {
                    "tag": item.get("tag", ""),
                    "citation": item.get("citation", ""),
                    "source": item.get("source", ""),
                    "section": item.get("section", ""),
                    "status": item.get("status", "In Force"),
                    "jurisdiction": item.get("jurisdiction", "India"),
                    "url": item.get("url", ""),
                }
                for item in evidence
            ]
            yield sse_pack("sources", {"sources": sources_meta})

            chunk_size = 40
            for i in range(0, len(fallback_ans), chunk_size):
                chunk = fallback_ans[i : i + chunk_size]
                yield sse_pack("token", {"token": chunk})
                await asyncio.sleep(0.015)

            done_payload = {
                "answer": fallback_ans,
                "sources": sources_meta,
                "sources_cited": fallback_sources,
                "trace": trace,
                "any_confident": bool(evidence.any_confident),
                "state": state,
                "lang": detected_lang,
                "fallback": True,
                "cached": False,
            }
            yield sse_pack("done", done_payload)
            log_request_trace("/ask", query, trace, {"cached": False, "cache_only": True, "state": state, "lang": detected_lang})
            return

        # 3. Normal execution (cache miss, not CACHE_ONLY)
        evidence, prompt_bundle, trace, detected_lang, any_confident = await execute_retrieval_and_evidence(
            query=query,
            state=state,
            lang=lang,
        )

        # Emit initial SSE event 'sources' immediately after retrieval
        sources_meta = [
            {
                "tag": item.get("tag", ""),
                "citation": item.get("citation", ""),
                "source": item.get("source", ""),
                "section": item.get("section", ""),
                "status": item.get("status", "In Force"),
                "jurisdiction": item.get("jurisdiction", "India"),
                "url": item.get("url", ""),
            }
            for item in evidence
        ]
        yield sse_pack("sources", {"sources": sources_meta})
        yield sse_pack("trace", {"step": "retrieval", "trace": trace})

        # Step 3: Stream answer from WRITER_MODEL under semaphore
        full_answer = ""
        fallback = False
        t_gen = time.perf_counter()

        try:
            async with GENERATION_SEMAPHORE:
                queue: asyncio.Queue[Any] = asyncio.Queue()
                loop = asyncio.get_running_loop()

                def _stream_worker():
                    try:
                        for chunk in generate_stream(
                            model=WRITER_MODEL,
                            system=prompt_bundle["system"],
                            user=prompt_bundle["user"],
                            temperature=0.2,
                            timeout=WRITER_TIMEOUT,
                        ):
                            loop.call_soon_threadsafe(queue.put_nowait, chunk)
                        loop.call_soon_threadsafe(queue.put_nowait, None)
                    except Exception as gen_err:
                        loop.call_soon_threadsafe(queue.put_nowait, gen_err)

                loop.run_in_executor(None, _stream_worker)

                while True:
                    val = await queue.get()
                    if val is None:
                        break
                    if isinstance(val, Exception):
                        raise val
                    full_answer += val
                    yield sse_pack("token", {"token": val})

            trace.append({
                "step": "writer_generation",
                "ms": round((time.perf_counter() - t_gen) * 1000, 2),
                "ok": True,
                "cached": False,
            })

        except Exception as exc:
            # Fallback protocol if writer fails or times out
            fallback = True
            trace.append({
                "step": "writer_generation",
                "ms": round((time.perf_counter() - t_gen) * 1000, 2),
                "ok": False,
                "error": str(exc),
                "cached": False,
            })
            full_answer, fallback_sources = build_rag_fallback_answer(evidence, lang=detected_lang)
            # Emit token event with fallback text if nothing had been streamed yet
            yield sse_pack("token", {"token": full_answer})

        # Step 4: Extract and validate cited sources
        if fallback:
            _, sources_cited = build_rag_fallback_answer(evidence, lang=detected_lang)
        else:
            sources_cited = extract_sources_cited(full_answer, evidence, trace)

        for tr in trace:
            if "cached" not in tr:
                tr["cached"] = False

        # Step 5: Final SSE event 'done'
        done_payload = {
            "answer": full_answer,
            "sources": sources_meta,
            "sources_cited": sources_cited,
            "trace": trace,
            "any_confident": any_confident,
            "state": state,
            "lang": detected_lang,
            "fallback": fallback,
            "cached": False,
        }

        # Persist answer to cache on successful generation
        if not fallback and full_answer:
            set_cached_answer(query, state, detected_lang, done_payload)

        yield sse_pack("done", done_payload)
        log_request_trace("/ask", query, trace, {"cached": False, "state": state, "lang": detected_lang})

    except Exception as fatal_err:
        yield sse_pack("error", {"error": str(fatal_err)})


async def run_pipeline_sync(
    query: str,
    state: Optional[str] = None,
    lang: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes the entire answer assembly pipeline synchronously and returns the complete JSON payload.
    """
    detected_lang = lang or detect_query_language(query)

    # 1. Check answer cache first
    cached_data = get_cached_answer(query=query, state=state, lang=detected_lang)
    if cached_data is not None:
        trace = list(cached_data.get("trace", []))
        trace.append({
            "step": "cache_hit",
            "ms": 0.5,
            "ok": True,
            "cached": True,
        })
        for tr in trace:
            tr["cached"] = True
        res = dict(cached_data)
        res["trace"] = trace
        res["cached"] = True
        log_request_trace("/ask/sync", query, trace, {"cached": True, "state": state, "lang": detected_lang})
        return res

    # 2. Check CACHE_ONLY mode
    if is_cache_only():
        t_start = time.perf_counter()
        trace = [{
            "step": "cache_lookup",
            "ms": 0.1,
            "ok": False,
            "cached": False,
            "info": "CACHE_ONLY=1 active - skipping all model calls",
        }]
        loop = asyncio.get_running_loop()
        tiered_res = await loop.run_in_executor(None, lambda: retrieve_tiered(query=query, state=state))
        trace.append({
            "step": "retrieve_tiered",
            "ms": round((time.perf_counter() - t_start) * 1000, 2),
            "ok": True,
            "cached": False,
        })
        evidence = format_tiered_evidence(tiered=tiered_res, web=None, state=state, lang=detected_lang)
        fallback_ans, fallback_sources = build_rag_fallback_answer(evidence, lang=detected_lang)
        res = {
            "answer": fallback_ans,
            "sources_cited": fallback_sources,
            "trace": trace,
            "any_confident": bool(evidence.any_confident),
            "state": state,
            "lang": detected_lang,
            "fallback": True,
            "cached": False,
        }
        log_request_trace("/ask/sync", query, trace, {"cached": False, "cache_only": True, "state": state, "lang": detected_lang})
        return res

    # 3. Normal execution
    evidence, prompt_bundle, trace, detected_lang, any_confident = await execute_retrieval_and_evidence(
        query=query,
        state=state,
        lang=lang,
    )

    sources_meta = [
        {
            "tag": item.get("tag", ""),
            "citation": item.get("citation", ""),
            "source": item.get("source", ""),
            "section": item.get("section", ""),
            "status": item.get("status", "In Force"),
            "jurisdiction": item.get("jurisdiction", "India"),
            "url": item.get("url", ""),
        }
        for item in evidence
    ]

    full_answer = ""
    fallback = False
    t_gen = time.perf_counter()

    try:
        async with GENERATION_SEMAPHORE:
            loop = asyncio.get_running_loop()

            def _sync_worker():
                chunks = []
                for chunk in generate_stream(
                    model=WRITER_MODEL,
                    system=prompt_bundle["system"],
                    user=prompt_bundle["user"],
                    temperature=0.2,
                    timeout=WRITER_TIMEOUT,
                ):
                    chunks.append(chunk)
                return "".join(chunks)

            full_answer = await loop.run_in_executor(None, _sync_worker)

        if not full_answer.strip():
            raise RuntimeError("Model returned empty generation response.")

        trace.append({
            "step": "writer_generation",
            "ms": round((time.perf_counter() - t_gen) * 1000, 2),
            "ok": True,
            "cached": False,
        })
    except Exception as exc:
        fallback = True
        trace.append({
            "step": "writer_generation",
            "ms": round((time.perf_counter() - t_gen) * 1000, 2),
            "ok": False,
            "error": str(exc),
            "cached": False,
        })
        full_answer, fallback_sources = build_rag_fallback_answer(evidence, lang=detected_lang)

    if fallback:
        _, sources_cited = build_rag_fallback_answer(evidence, lang=detected_lang)
    else:
        sources_cited = extract_sources_cited(full_answer, evidence, trace)

    for tr in trace:
        if "cached" not in tr:
            tr["cached"] = False

    result = {
        "answer": full_answer,
        "sources": sources_meta,
        "sources_cited": sources_cited,
        "trace": trace,
        "any_confident": any_confident,
        "state": state,
        "lang": detected_lang,
        "fallback": fallback,
        "cached": False,
    }

    if not fallback and full_answer:
        set_cached_answer(query, state, detected_lang, result)

    log_request_trace("/ask/sync", query, trace, {"cached": False, "state": state, "lang": detected_lang})
    return result


if __name__ == "__main__":
    test_q = "can my landlord throw me out without notice"
    print(f"Testing run_pipeline_sync for: \"{test_q}\"")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    res = loop.run_until_complete(run_pipeline_sync(test_q, state="Maharashtra"))
    print("\n--- Answer (preview) ---")
    print(res["answer"][:300])
    print("\n--- Sources Cited ---")
    print(len(res["sources_cited"]))
    print("\n--- Trace ---")
    for tr in res["trace"]:
        print(f"  {tr['step']}: {tr['ms']}ms (ok={tr['ok']})")
