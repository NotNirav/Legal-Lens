#!/usr/bin/env python3
"""
reviewer.py - Off-critical-path legal accuracy auditor for Legal Lens.

Audits AI-generated legal explanations against verified statutory and case law evidence
using REVIEWER_MODEL (gemma-4-31b-it) with structured JSON schema output:
{
    "verdict": "supported|partly_supported|unsupported",
    "claims": [{"claim": str, "tag": str, "supported": bool}],
    "missing": [str],
    "caveat": str
}

Enforces a 70s timeout, in-memory caching by (question, answer hash),
and fails gracefully with ok=False without raising exceptions to the client.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pydantic import BaseModel, Field

from orchestrator.config import REVIEWER_MODEL, REVIEWER_TIMEOUT
from orchestrator.evidence import build_evidence
from orchestrator.llm import generate
from orchestrator.prompt import format_evidence_block


class ClaimAudit(BaseModel):
    claim: str = Field(description="Specific legal assertion made in the answer")
    tag: str = Field(default="", description="Cited evidence tag, e.g. [S1], [L2], or empty")
    supported: bool = Field(description="True if substantiated by cited evidence, else False")


class ReviewSchema(BaseModel):
    verdict: str = Field(description="Must be 'supported', 'partly_supported', or 'unsupported'")
    claims: List[ClaimAudit] = Field(default_factory=list, description="Claim-by-claim verification")
    missing: List[str] = Field(default_factory=list, description="Statutory exceptions or critical omissions")
    caveat: str = Field(default="", description="Summary audit note or cautionary warning")


REVIEWER_SYSTEM_PROMPT = """You are an expert legal accuracy auditor reviewing an AI-generated answer against verified statutory and case law evidence chunks.

Your task is to audit the answer claim by claim against the provided evidence:
1. Extract all factual or legal claims from the answer.
2. For each claim, check its cited evidence tag (e.g. [C1], [L1], [S1], [Q1], [W1], [D1]).
   - Mark supported=true ONLY if the cited evidence actually substantiates the claim.
   - Mark supported=false if the claim is fabricated, exaggerated, contradicts the text, or cites a tag that doesn't say that.
3. List any critical statutory exceptions or conditions that are missing in the 'missing' list.
4. Set verdict strictly to:
   - 'supported': All legal claims are substantiated by the cited evidence.
   - 'partly_supported': Some claims are substantiated, but some are ambiguous, unsupported or minor caveats exist.
   - 'unsupported': Major claims contradict the evidence, cite non-existent provisions, or lack grounding.
5. Provide a concise, clear caveat explaining the audit findings.

Return strictly valid JSON conforming to the schema."""

# In-memory cache by (question, answer hash)
REVIEW_CACHE: Dict[str, Dict[str, Any]] = {}


def _compute_cache_key(query: str, answer: str) -> str:
    """Computes a SHA-256 hash key for (query, answer)."""
    raw = f"{query.strip().lower()}:::{answer.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def review_answer(
    query: str,
    answer: str,
    evidence_tags: Optional[List[str]] = None,
    state: Optional[str] = None,
    evidence: Optional[Any] = None,
    timeout: float = float(REVIEWER_TIMEOUT),
) -> Dict[str, Any]:
    """
    Audits the writer's answer against legal evidence using REVIEWER_MODEL.

    Args:
        query: User legal question.
        answer: Text of writer's generated answer.
        evidence_tags: Optional list of tags cited in the answer.
        state: Optional state jurisdiction.
        evidence: Optional pre-loaded flat evidence list or dict.
        timeout: Execution timeout in seconds (defaults to 70s).

    Returns:
        JSON dict with:
        {"ok": bool, "verdict": str, "claims": list, "missing": list, "caveat": str, "latency": float}
        On any failure returns {"ok": false, "latency": float} without raising exceptions.
    """
    start_time = time.perf_counter()
    cache_key = _compute_cache_key(query, answer)

    # Check cache first
    if cache_key in REVIEW_CACHE:
        cached = dict(REVIEW_CACHE[cache_key])
        cached["cached"] = True
        cached["latency"] = 0.0
        return cached

    try:
        loop = asyncio.get_running_loop()

        # Step 1: Resolve evidence
        if evidence is None:
            # Reload evidence using retrieve_tiered via build_evidence
            def _load_evidence():
                return build_evidence(query=query, state=state)

            evidence_items = await loop.run_in_executor(None, _load_evidence)
        else:
            evidence_items = evidence

        # Format evidence block
        formatted_evidence = format_evidence_block(evidence_items)

        # Step 2: Build user audit prompt
        user_content = (
            f"LEGAL QUESTION:\n\"{query}\"\n\n"
            f"VERIFIED EVIDENCE:\n{formatted_evidence}\n\n"
            f"ANSWER TO AUDIT:\n\"{answer}\""
        )

        effective_timeout = min(int(timeout), 70)

        # Step 3: Run LLM call with JSON schema in executor
        def _call_reviewer() -> str:
            return generate(
                model=REVIEWER_MODEL,
                system=REVIEWER_SYSTEM_PROMPT,
                user=user_content,
                json_schema=ReviewSchema,
                temperature=0.1,
                timeout=effective_timeout,
            )

        raw_output = await loop.run_in_executor(None, _call_reviewer)

        elapsed = time.perf_counter() - start_time
        if elapsed > timeout or not raw_output.strip():
            return {
                "ok": False,
                "latency": round(elapsed, 3),
            }

        # Step 4: Parse structured JSON
        data = json.loads(raw_output)

        raw_verdict = str(data.get("verdict", "")).lower().strip()
        if raw_verdict in ["supported", "partly_supported", "unsupported"]:
            verdict = raw_verdict
        elif "part" in raw_verdict:
            verdict = "partly_supported"
        elif "unsupport" in raw_verdict:
            verdict = "unsupported"
        elif "support" in raw_verdict:
            verdict = "supported"
        else:
            verdict = "partly_supported"

        claims = data.get("claims", [])
        missing = data.get("missing", [])
        caveat = str(data.get("caveat", "")).strip()

        result = {
            "ok": True,
            "verdict": verdict,
            "claims": claims,
            "missing": missing,
            "caveat": caveat,
            "latency": round(elapsed, 3),
        }

        # Cache result
        REVIEW_CACHE[cache_key] = result
        return result

    except Exception:
        elapsed = time.perf_counter() - start_time
        return {
            "ok": False,
            "latency": round(elapsed, 3),
        }


if __name__ == "__main__":
    test_q = "can my landlord throw me out without notice"
    test_ans = "Under [S1] The Maharashtra Rent Control Act, 1999, Section 15, a landlord cannot evict a tenant without notice as long as the tenant pays rent."
    print(f"Testing review_answer for: \"{test_q}\"")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    res = loop.run_until_complete(review_answer(test_q, test_ans, state="Maharashtra"))
    print("ok:", res.get("ok"))
    print("verdict:", res.get("verdict"))
    print("latency:", res.get("latency"))
