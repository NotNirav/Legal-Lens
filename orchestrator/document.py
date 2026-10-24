#!/usr/bin/env python3
"""
document.py - Multimodal legal document analyzer for Legal Lens.

Validates and resizes user document images (JPG, PNG, WEBP up to 8 MB, max 1600px longest side),
extracts structured legal metadata using VISION_MODEL (gemma-4-26b-a4b-it), converts extracted
facts into untrusted [D1].. evidence items, constructs an enriched retrieval query, and streams
SSE response events including a dedicated 'document' event.
"""

from __future__ import annotations

import asyncio
import io
import json
import sys
import time
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from PIL import Image
from pydantic import BaseModel, Field

from orchestrator.config import VISION_MODEL, VISION_TIMEOUT, WRITER_MODEL, WRITER_TIMEOUT
from orchestrator.evidence import detect_query_language, format_tiered_evidence
from orchestrator.llm import generate, generate_stream
from orchestrator.pipeline import (
    GENERATION_SEMAPHORE,
    build_rag_fallback_answer,
    extract_sources_cited,
    sse_pack,
)
from orchestrator.prompt import build_prompt
from orchestrator.web import web_evidence
from rag.retrieve import retrieve_tiered

MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_FORMATS = {"JPEG", "JPG", "PNG", "WEBP"}


class DocumentProcessingError(Exception):
    """Raised when document image is invalid, unreadable, or not a document."""
    pass


class DocumentAnalysis(BaseModel):
    doc_type: Optional[str] = Field(default=None, description="Legal document type, e.g. 'Notice to vacate', 'Rent Agreement', or null")
    language: Optional[str] = Field(default=None, description="Primary language of the document, or null")
    parties: List[str] = Field(default_factory=list, description="Parties, individuals, landlords, tenants, employers, or entities")
    dates: List[str] = Field(default_factory=list, description="Dates explicitly mentioned in document")
    amounts: List[str] = Field(default_factory=list, description="Financial sums, rent, deposits, fines, or fees")
    key_terms: List[str] = Field(default_factory=list, description="Key clauses, terms, demands, or cited provisions")
    notice_period: Optional[str] = Field(default=None, description="Stipulated notice period, e.g. '30 days', or null")
    deadlines: List[str] = Field(default_factory=list, description="Compliance dates or deadlines")
    summary: Optional[str] = Field(default=None, description="Concise factual summary of document content, or null")


VISION_SYSTEM_PROMPT = """You are an expert legal document vision analyzer.
Read the provided image carefully and extract all visible legal document metadata according to the JSON schema.
Strict rules:
1. Extract doc_type, language, parties, dates, amounts, key_terms, notice_period, deadlines, and a concise summary.
2. Use null for anything that is not visible or not present in the image.
3. NEVER guess, assume, or extrapolate any names, amounts, dates, or clauses.
4. If the image is unreadable, blurred, corrupted, or is a non-document photograph (e.g. landscape, selfie, animal, random object), set doc_type to null and summary to null."""


def load_and_resize_image(file_bytes: bytes, filename: Optional[str] = None) -> Image.Image:
    """
    Validates file size (<= 8 MB), file format (JPG, PNG, WEBP), and resizes
    so the longest side is at most 1600 px.
    """
    if len(file_bytes) > MAX_FILE_SIZE:
        raise DocumentProcessingError("File size exceeds the 8 MB limit.")

    if not file_bytes:
        raise DocumentProcessingError("Empty image file provided.")

    if filename:
        ext = Path(filename).suffix.lower()
        if ext and ext not in ALLOWED_EXTENSIONS:
            raise DocumentProcessingError(f"Unsupported file format '{ext}'. Accepted formats: JPG, PNG, WEBP.")

    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.load()
    except Exception as exc:
        raise DocumentProcessingError(f"Cannot read image file. It may be corrupted or not an image: {exc}")

    img_format = (img.format or "").upper()
    if img_format not in ALLOWED_FORMATS:
        raise DocumentProcessingError(f"Unsupported image format: {img_format}. Accepted formats: JPG, PNG, WEBP.")

    # Convert to RGB mode if necessary
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Resize so longest side is at most 1600 px
    w, h = img.size
    longest = max(w, h)
    if longest > 1600:
        scale = 1600.0 / longest
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    return img


def extract_document_data(file_bytes: bytes, filename: Optional[str] = None) -> DocumentAnalysis:
    """
    Reads image using VISION_MODEL and extracts structured legal document metadata.
    Raises DocumentProcessingError for unreadable images or non-document photos.
    """
    img = load_and_resize_image(file_bytes, filename)

    try:
        raw_output = generate(
            model=VISION_MODEL,
            system=VISION_SYSTEM_PROMPT,
            user="Analyze this document image and extract all legal document metadata strictly following the JSON schema.",
            images=img,
            json_schema=DocumentAnalysis,
            temperature=0.1,
            timeout=VISION_TIMEOUT,
        )
    except Exception as exc:
        raise DocumentProcessingError(f"Vision model analysis failed: {exc}") from exc

    if not raw_output or not raw_output.strip():
        raise DocumentProcessingError("Vision model returned an empty response.")

    try:
        data = json.loads(raw_output)
    except Exception as exc:
        raise DocumentProcessingError(f"Failed to parse vision model output as JSON: {exc}") from exc

    doc_analysis = DocumentAnalysis(**data)

    # Validate that the image was actually recognized as a document
    doc_type = (doc_analysis.doc_type or "").strip()
    if not doc_type or doc_type.lower() in ["null", "none", "unknown", "unreadable", "non-document", "not a document"]:
        raise DocumentProcessingError("The provided image is unreadable, blurry, or does not contain a recognizable legal document.")

    return doc_analysis


def build_document_evidence_items(doc_data: DocumentAnalysis) -> List[Dict[str, Any]]:
    """
    Transforms extracted document facts into untrusted evidence items tagged [D1]..
    """
    items: List[Dict[str, Any]] = []

    doc_type = doc_data.doc_type or "Legal Document"
    parties_str = ", ".join(doc_data.parties) if doc_data.parties else "Not specified"
    notice_str = doc_data.notice_period if doc_data.notice_period else "None stated"
    dates_str = ", ".join(doc_data.dates) if doc_data.dates else "None specified"
    amounts_str = ", ".join(doc_data.amounts) if doc_data.amounts else "None mentioned"
    summary_str = doc_data.summary or "Document uploaded by user."

    # [D1] Document Metadata & Overview
    text_d1 = (
        f"Document Type: {doc_type}. "
        f"Parties Involved: {parties_str}. "
        f"Stipulated Notice Period: {notice_str}. "
        f"Dates: {dates_str}. "
        f"Amounts: {amounts_str}. "
        f"Summary: {summary_str}"
    )
    items.append({
        "tag": "[D1]",
        "citation": f"From your document: {doc_type}",
        "source": "Uploaded Document",
        "section": "Document Overview",
        "text": text_d1[:1500].strip(),
        "status": "User Document Data",
        "text_as_on": "Uploaded Document",
        "jurisdiction": "User Document",
        "url": "",
        "tier": "doc",
    })

    # [D2] Key Terms, Clauses & Deadlines (if present)
    terms_list = []
    if doc_data.key_terms:
        terms_list.append(f"Key Terms: {'; '.join(doc_data.key_terms)}")
    if doc_data.deadlines:
        terms_list.append(f"Deadlines: {'; '.join(doc_data.deadlines)}")

    if terms_list:
        text_d2 = " | ".join(terms_list)
        items.append({
            "tag": "[D2]",
            "citation": f"From your document: Terms & Deadlines",
            "source": "Uploaded Document",
            "section": "Stipulations",
            "text": text_d2[:1500].strip(),
            "status": "User Document Data",
            "text_as_on": "Uploaded Document",
            "jurisdiction": "User Document",
            "url": "",
            "tier": "doc",
        })

    return items


async def stream_document_pipeline_sse(
    file_bytes: bytes,
    filename: Optional[str] = None,
    query: Optional[str] = None,
    state: Optional[str] = None,
    lang: Optional[str] = None,
) -> AsyncIterator[str]:
    """
    Executes the multimodal document analysis and answer assembly pipeline,
    yielding SSE events:
      - 'document': Extracted document fields right after vision analysis
      - 'sources': Initial retrieved citations metadata
      - 'token': Streamed tokens from WRITER_MODEL
      - 'done': Final JSON response
      - 'error': Emitted on unreadable image or fatal error
    """
    t_start = time.perf_counter()
    trace: List[Dict[str, Any]] = []

    try:
        loop = asyncio.get_running_loop()

        # Step 0: Vision Model reading
        t_vis = time.perf_counter()
        try:
            doc_data = await loop.run_in_executor(
                None,
                lambda: extract_document_data(file_bytes, filename),
            )
            trace.append({
                "step": "vision_document_analysis",
                "ms": round((time.perf_counter() - t_vis) * 1000, 2),
                "ok": True,
            })
        except DocumentProcessingError as doc_err:
            trace.append({
                "step": "vision_document_analysis",
                "ms": round((time.perf_counter() - t_vis) * 1000, 2),
                "ok": False,
                "error": str(doc_err),
            })
            yield sse_pack("error", {"error": str(doc_err), "trace": trace})
            return
        except Exception as exc:
            trace.append({
                "step": "vision_document_analysis",
                "ms": round((time.perf_counter() - t_vis) * 1000, 2),
                "ok": False,
                "error": str(exc),
            })
            yield sse_pack("error", {"error": f"Failed to analyze document: {exc}", "trace": trace})
            return

        # Emit 'document' SSE event immediately after reading
        doc_dict = doc_data.model_dump()
        yield sse_pack("document", doc_dict)

        # Step 1: Formulate user query & retrieval query
        user_query = query.strip() if query and query.strip() else "Explain this document and my rights"
        if not lang:
            lang = detect_query_language(user_query)

        key_terms_str = " ".join(doc_data.key_terms[:5])
        retrieval_query = f"{user_query}. {doc_data.doc_type} {key_terms_str}".strip()

        # Step 2: Parallel retrieval (tiered RAG + official web grounding)
        t_ret = time.perf_counter()
        tiered_fut = loop.run_in_executor(None, lambda: retrieve_tiered(query=retrieval_query, state=state))
        web_fut = loop.run_in_executor(None, lambda: web_evidence(query=retrieval_query, state=state, lang=lang, timeout=10.0))

        tiered_raw, web_raw = await asyncio.gather(tiered_fut, web_fut, return_exceptions=True)

        if isinstance(tiered_raw, Exception):
            trace.append({
                "step": "retrieve_tiered",
                "ms": round((time.perf_counter() - t_ret) * 1000, 2),
                "ok": False,
                "error": str(tiered_raw),
            })
            tiered_res = {"constitution": [], "central": [], "state": [], "qa": [], "any_confident": False}
        else:
            trace.append({
                "step": "retrieve_tiered",
                "ms": round((time.perf_counter() - t_ret) * 1000, 2),
                "ok": True,
            })
            tiered_res = tiered_raw

        if isinstance(web_raw, Exception):
            trace.append({
                "step": "web_evidence",
                "ms": round((time.perf_counter() - t_ret) * 1000, 2),
                "ok": False,
                "error": str(web_raw),
            })
            web_res = {"ok": False, "findings": "", "sources": [], "latency": 10.0}
        else:
            trace.append({
                "step": "web_evidence",
                "ms": round(web_raw.get("latency", 0.0) * 1000, 2),
                "ok": bool(web_raw.get("ok", False)),
            })
            web_res = web_raw

        # Step 3: Turn facts into evidence items tagged [D1]..
        doc_evidence_items = build_document_evidence_items(doc_data)

        # Synthesize flat evidence list
        t_ev = time.perf_counter()
        evidence = format_tiered_evidence(
            tiered=tiered_res,
            web=web_res,
            doc=doc_evidence_items,
            state=state,
            lang=lang,
        )
        any_confident = bool(evidence.any_confident)

        prompt_bundle = build_prompt(
            query=user_query,
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

        # Emit 'sources' SSE event before generation
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

        # Step 4: Stream answer from WRITER_MODEL under semaphore
        full_answer = ""
        fallback = False
        t_gen = time.perf_counter()

        try:
            async with GENERATION_SEMAPHORE:
                queue: asyncio.Queue[Any] = asyncio.Queue()

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
            })
        except Exception as exc:
            fallback = True
            trace.append({
                "step": "writer_generation",
                "ms": round((time.perf_counter() - t_gen) * 1000, 2),
                "ok": False,
                "error": str(exc),
            })
            full_answer, _ = build_rag_fallback_answer(evidence, lang=lang)
            yield sse_pack("token", {"token": full_answer})

        # Step 5: Extract sources cited in code
        if fallback:
            _, sources_cited = build_rag_fallback_answer(evidence, lang=lang)
        else:
            sources_cited = extract_sources_cited(full_answer, evidence, trace)

        # Step 6: Final 'done' event
        done_payload = {
            "answer": full_answer,
            "sources_cited": sources_cited,
            "trace": trace,
            "any_confident": any_confident,
            "state": state,
            "lang": lang,
            "document": doc_dict,
            "fallback": fallback,
        }
        yield sse_pack("done", done_payload)
        from orchestrator.cache import log_request_trace
        log_request_trace("/ask/document", user_query, trace, {"state": state, "lang": lang})

    except Exception as fatal_err:
        yield sse_pack("error", {"error": str(fatal_err), "trace": trace})


if __name__ == "__main__":
    from PIL import ImageDraw
    test_img = Image.new("RGB", (400, 100), color="white")
    draw = ImageDraw.Draw(test_img)
    draw.text((10, 30), "Notice to vacate premises within 30 days", fill="black")
    buf = io.BytesIO()
    test_img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    print("Testing extract_document_data on synthetic image...")
    res = extract_document_data(png_bytes, "notice.png")
    print("Extracted doc_type:", res.doc_type)
    print("Notice period:", res.notice_period)
    print("Key terms:", res.key_terms)
