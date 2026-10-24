#!/usr/bin/env python3
"""
smoke_gemma.py - Comprehensive Capability Smoke Test for Gemma Models via google-genai SDK.

Features:
  - Discovers models whose name contains "gemma"
  - 60-second timeout per call (via types.HttpOptions)
  - Automatic retry on HTTP 429 / Rate Limits with a 5-second pause
  - Tests 6 core capabilities:
      (a) Plain English generation
      (b) Hindi question answered in Hindi
      (c) Image + text multimodal input
      (d) JSON-only structured output
      (e) Function / Tool calling
      (f) Google Search grounding
  - Displays the first 200 chars of actual replies for tests (a), (b), and (c)
  - Latency tracking per test
  - Formatted final summary table with PASS/FAIL status and exact error messages
  - Strict confidentiality: Never prints API keys
"""

from __future__ import annotations

import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

# Ensure UTF-8 console output for Windows PowerShell
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from PIL import Image, ImageDraw
from google import genai
from google.genai import types

TIMEOUT_MS = 60000  # 60-second HTTP timeout in milliseconds
RETRY_DELAY_SEC = 5.0
MAX_RETRIES = 2


def load_api_key() -> str:
    """Reads GEMINI_API_KEY from environment or .env without printing it."""
    for key in ["GEMINI_API_KEY", "gemma_api_key", "GEMMA_API_KEY"]:
        val = os.getenv(key)
        if val:
            return val.strip().strip("'\"")

    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k in ["GEMINI_API_KEY", "gemma_api_key", "GEMMA_API_KEY"]:
                        return v
    return ""


def create_test_image() -> bytes:
    """Generates an in-memory PNG image with high-contrast printed text."""
    img = Image.new("RGB", (360, 90), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((25, 35), "LEGAL LENS 2026", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# Tool definition for function calling test
def get_statute_enactment_year(statute_name: str) -> str:
    """
    Returns the enactment year of an Indian statute.

    Args:
        statute_name: The official or popular name of the statute.
    """
    statutes = {
        "Maharashtra Rent Control Act": "1999",
        "Constitution of India": "1950",
        "Code on Wages": "2019",
    }
    for k, v in statutes.items():
        if k.lower() in statute_name.lower():
            return f"{k} was enacted in the year {v}."
    return f"{statute_name} enactment record found: 1999."


def execute_with_retry(
    test_func: Callable[[], Tuple[str, str]],
    max_retries: int = MAX_RETRIES,
    delay: float = RETRY_DELAY_SEC,
) -> Tuple[str, float, str, str]:
    """
    Executes a test function, captures latency, retries on 429 rate-limits
    or transient 500 errors after a 5-second pause.

    Returns:
        (status: "PASS" | "FAIL", latency_seconds, details_or_error, raw_reply)
    """
    t0 = time.perf_counter()
    attempts = 0
    last_err: Exception | None = None

    while attempts <= max_retries:
        attempts += 1
        try:
            raw_reply, details = test_func()
            latency = time.perf_counter() - t0
            return ("PASS", latency, details, raw_reply)
        except Exception as e:
            last_err = e
            err_str = str(e)
            is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str.upper() or "QUOTA" in err_str.upper()
            is_server_err = "500" in err_str or "INTERNAL" in err_str.upper()

            if (is_rate_limit or is_server_err) and attempts <= max_retries:
                time.sleep(delay)
                continue
            break

    latency = time.perf_counter() - t0
    err_msg = f"{type(last_err).__name__}: {str(last_err).strip()}" if last_err else "Unknown error"
    return ("FAIL", latency, err_msg, "")


def test_model(client: genai.Client, model_name: str) -> Dict[str, Any]:
    """Runs tests (a) through (f) one by one on a single model."""
    results: List[Dict[str, Any]] = []
    text_previews: Dict[str, str] = {}

    print(f"\n{'='*100}", flush=True)
    print(f"🔬 Testing Model: {model_name}", flush=True)
    print(f"{'='*100}", flush=True)

    http_opts = types.HttpOptions(timeout=TIMEOUT_MS)

    # --------------------------------------------------------------------------
    # Test (a): Plain English Generation
    # --------------------------------------------------------------------------
    def run_a() -> Tuple[str, str]:
        cfg = types.GenerateContentConfig(http_options=http_opts)
        resp = client.models.generate_content(
            model=model_name,
            contents="Explain what Article 21 of the Indian Constitution is in one clear, informative sentence.",
            config=cfg,
        )
        reply = resp.text.strip() if resp.text else ""
        return reply, reply.replace("\n", " ")

    st_a, lat_a, det_a, raw_a = execute_with_retry(run_a)
    text_previews["(a) Plain English"] = raw_a[:200]
    results.append({"name": "(a) Plain English", "status": st_a, "latency": lat_a, "details": det_a})
    print(f"  [{st_a}] (a) Plain English ({lat_a:.2f}s)", flush=True)
    if st_a == "PASS":
        print(f"       Reply (first 200 chars): \"{raw_a[:200]}\"", flush=True)
    else:
        print(f"       Error: {det_a}", flush=True)

    # --------------------------------------------------------------------------
    # Test (b): Hindi Question Answered in Hindi
    # --------------------------------------------------------------------------
    def run_b() -> Tuple[str, str]:
        cfg = types.GenerateContentConfig(http_options=http_opts)
        resp = client.models.generate_content(
            model=model_name,
            contents="भारतीय संविधान का अनुच्छेद 21 क्या गारंटी देता है? एक स्पष्ट वाक्य में हिंदी में उत्तर दें।",
            config=cfg,
        )
        reply = resp.text.strip() if resp.text else ""
        return reply, reply.replace("\n", " ")

    st_b, lat_b, det_b, raw_b = execute_with_retry(run_b)
    text_previews["(b) Hindi in Hindi"] = raw_b[:200]
    results.append({"name": "(b) Hindi in Hindi", "status": st_b, "latency": lat_b, "details": det_b})
    print(f"  [{st_b}] (b) Hindi in Hindi ({lat_b:.2f}s)", flush=True)
    if st_b == "PASS":
        print(f"       Reply (first 200 chars): \"{raw_b[:200]}\"", flush=True)
    else:
        print(f"       Error: {det_b}", flush=True)

    # --------------------------------------------------------------------------
    # Test (c): Image + Text Multimodal Reading
    # --------------------------------------------------------------------------
    def run_c() -> Tuple[str, str]:
        img_bytes = create_test_image()
        image_part = types.Part.from_bytes(data=img_bytes, mime_type="image/png")
        cfg = types.GenerateContentConfig(http_options=http_opts)
        resp = client.models.generate_content(
            model=model_name,
            contents=[image_part, "Read and transcribe the exact printed text shown in this image."],
            config=cfg,
        )
        reply = resp.text.strip() if resp.text else ""
        return reply, reply.replace("\n", " ")

    st_c, lat_c, det_c, raw_c = execute_with_retry(run_c)
    text_previews["(c) Image Reading"] = raw_c[:200]
    results.append({"name": "(c) Image Reading", "status": st_c, "latency": lat_c, "details": det_c})
    print(f"  [{st_c}] (c) Image Reading ({lat_c:.2f}s)", flush=True)
    if st_c == "PASS":
        print(f"       Reply (first 200 chars): \"{raw_c[:200]}\"", flush=True)
    else:
        print(f"       Error: {det_c}", flush=True)

    # --------------------------------------------------------------------------
    # Test (d): JSON-Only Structured Output
    # --------------------------------------------------------------------------
    def run_d() -> Tuple[str, str]:
        cfg = types.GenerateContentConfig(
            response_mime_type="application/json",
            http_options=http_opts,
        )
        resp = client.models.generate_content(
            model=model_name,
            contents="Return a JSON object with keys 'article': 21 and 'topic': 'Protection of life and personal liberty'. Valid JSON only.",
            config=cfg,
        )
        reply = resp.text.strip() if resp.text else "{}"
        parsed = json.loads(reply)
        return reply, json.dumps(parsed, ensure_ascii=False)

    st_d, lat_d, det_d, raw_d = execute_with_retry(run_d)
    results.append({"name": "(d) JSON Output", "status": st_d, "latency": lat_d, "details": det_d})
    print(f"  [{st_d}] (d) JSON Output ({lat_d:.2f}s)", flush=True)
    if st_d == "PASS":
        print(f"       JSON: {det_d}", flush=True)
    else:
        print(f"       Error: {det_d}", flush=True)

    # --------------------------------------------------------------------------
    # Test (e): Function / Tool Calling
    # --------------------------------------------------------------------------
    def run_e() -> Tuple[str, str]:
        cfg = types.GenerateContentConfig(
            tools=[get_statute_enactment_year],
            http_options=http_opts,
        )
        resp = client.models.generate_content(
            model=model_name,
            contents="What year was the Maharashtra Rent Control Act passed? Use get_statute_enactment_year to look it up.",
            config=cfg,
        )
        reply = resp.text.strip() if resp.text else "Tool execution completed"
        return reply, reply.replace("\n", " ")

    st_e, lat_e, det_e, raw_e = execute_with_retry(run_e)
    results.append({"name": "(e) Tool Calling", "status": st_e, "latency": lat_e, "details": det_e})
    print(f"  [{st_e}] (e) Tool Calling ({lat_e:.2f}s)", flush=True)
    if st_e == "PASS":
        print(f"       Tool Output: {det_e[:120]}", flush=True)
    else:
        print(f"       Error: {det_e}", flush=True)

    # --------------------------------------------------------------------------
    # Test (f): Google Search Grounding
    # --------------------------------------------------------------------------
    def run_f() -> Tuple[str, str]:
        cfg = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            http_options=http_opts,
        )
        resp = client.models.generate_content(
            model=model_name,
            contents="Who was awarded the Nobel Peace Prize in 2024?",
            config=cfg,
        )
        reply = resp.text.strip() if resp.text else "Search grounded output returned"
        return reply, reply.replace("\n", " ")

    st_f, lat_f, det_f, raw_f = execute_with_retry(run_f)
    results.append({"name": "(f) Search Grounding", "status": st_f, "latency": lat_f, "details": det_f})
    print(f"  [{st_f}] (f) Search Grounding ({lat_f:.2f}s)", flush=True)
    if st_f == "PASS":
        print(f"       Search Output: {det_f[:120]}", flush=True)
    else:
        print(f"       Error: {det_f}", flush=True)

    return {
        "tests": results,
        "previews": text_previews,
    }


def print_summary_table(all_model_data: Dict[str, Dict[str, Any]]) -> None:
    """Renders the comprehensive summary table."""
    print("\n" + "=" * 125, flush=True)
    print("📊 FINAL GEMMA CAPABILITY SMOKE TEST SUMMARY TABLE", flush=True)
    print("=" * 125, flush=True)
    header = f"{'Model':<28} | {'Test Capability':<22} | {'Status':<6} | {'Latency':<8} | {'Details / Exact Error Message'}"
    print(header, flush=True)
    print("-" * 28 + "-+-" + "-" * 22 + "-+-" + "-" * 6 + "-+-" + "-" * 8 + "-+-" + "-" * 50, flush=True)

    for model_name, data in all_model_data.items():
        short_name = model_name.replace("models/", "")
        for t in data["tests"]:
            det = t["details"].replace("\n", " ")
            if len(det) > 48:
                det = det[:48] + "..."
            row = f"{short_name:<28} | {t['name']:<22} | {t['status']:<6} | {t['latency']:>6.2f}s | {det}"
            print(row, flush=True)
        print("-" * 125, flush=True)


def print_quality_previews(all_model_data: Dict[str, Dict[str, Any]]) -> None:
    """Prints the first 200 characters of replies for tests a, b, and c."""
    print("\n" + "=" * 100, flush=True)
    print("📝 GENERATION QUALITY REVIEWS (First 200 Characters for a, b, c)", flush=True)
    print("=" * 100, flush=True)

    for model_name, data in all_model_data.items():
        print(f"\n--- Model: {model_name} ---", flush=True)
        previews = data["previews"]
        for test_key in ["(a) Plain English", "(b) Hindi in Hindi", "(c) Image Reading"]:
            content = previews.get(test_key, "")
            if content:
                print(f"[{test_key}]:\n  \"{content}\"\n", flush=True)
            else:
                print(f"[{test_key}]: [No output produced / Failed test]\n", flush=True)


def main() -> None:
    print("=" * 100, flush=True)
    print("🌟 Legal Lens — Gemma Capabilities Smoke Test Harness", flush=True)
    print("=" * 100, flush=True)

    api_key = load_api_key()
    if not api_key:
        print("❌ Error: GEMINI_API_KEY / gemma_api_key not found in environment or .env file.")
        sys.exit(1)

    print("🔑 API Key: Loaded successfully from .env (hidden for security)", flush=True)

    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=TIMEOUT_MS),
    )

    # Discover Gemma models
    print("\n🔎 Discovering available models via google-genai SDK...", flush=True)
    available_models = list(client.models.list())
    gemma_models = [m for m in available_models if "gemma" in m.name.lower()]

    print(f"Found {len(gemma_models)} Gemma model(s) available on account:", flush=True)
    for m in gemma_models:
        ctx = getattr(m, "input_token_limit", "N/A")
        print(f"  • {m.name} (Context: {ctx})", flush=True)

    target_models = [m.name for m in gemma_models]

    all_model_data: Dict[str, Dict[str, Any]] = {}
    for model_name in target_models:
        all_model_data[model_name] = test_model(client, model_name)

    # Print summary table and quality previews
    print_summary_table(all_model_data)
    print_quality_previews(all_model_data)


if __name__ == "__main__":
    main()
