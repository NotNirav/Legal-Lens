#!/usr/bin/env python3
"""
llm.py - Lightweight wrapper around the google-genai SDK for Gemma.

Configured for model 'gemma-4-26b-a4b-it'. Reads GEMINI_API_KEY from .env,
supports non-streaming and streaming generation, structured JSON, thinking level control,
automatic single retry on 429/500/504 with a 3-second pause, and clean error raising.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any, Iterator, Optional

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from google import genai
from google.genai import types

DEFAULT_MODEL = "gemma-4-26b-a4b-it"


class LLMError(Exception):
    """Custom exception raised when generation fails after retries."""
    pass


def _get_api_key() -> str:
    """Retrieves GEMINI_API_KEY from environment or .env without ever logging or printing it."""
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


_CLIENT_INSTANCE: Optional[genai.Client] = None


def get_client() -> genai.Client:
    """Returns a singleton genai.Client instance."""
    global _CLIENT_INSTANCE
    if _CLIENT_INSTANCE is None:
        key = _get_api_key()
        if not key:
            raise LLMError("API key not found. Ensure GEMINI_API_KEY is defined in environment or .env.")
        _CLIENT_INSTANCE = genai.Client(api_key=key)
    return _CLIENT_INSTANCE


def _is_retryable_error(exc: Exception) -> bool:
    """Checks whether the exception represents a 429, 500, 504, or transient error."""
    msg = str(exc).upper()
    return any(
        err in msg
        for err in [
            "429",
            "500",
            "504",
            "RESOURCE_EXHAUSTED",
            "DEADLINE_EXCEEDED",
            "INTERNAL",
            "SERVER ERROR",
            "RATE LIMIT",
            "TIMEOUT",
        ]
    )


def _build_config(
    system: str,
    json_schema: Any = None,
    temperature: float = 0.2,
    timeout: int = 45,
    thinking_level: Optional[Any] = None,
) -> types.GenerateContentConfig:
    """Constructs a GenerateContentConfig object with timeout and thinking options."""
    http_opts = types.HttpOptions(timeout=int(timeout * 1000))

    kwargs: dict[str, Any] = {
        "system_instruction": system,
        "temperature": temperature,
        "http_options": http_opts,
    }

    if json_schema is not None:
        kwargs["response_mime_type"] = "application/json"
        if not isinstance(json_schema, bool):
            kwargs["response_schema"] = json_schema

    if thinking_level is not None:
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=thinking_level)

    return types.GenerateContentConfig(**kwargs)


def generate(
    system: str,
    user: str,
    json_schema: Any = None,
    temperature: float = 0.2,
    timeout: int = 45,
    thinking_level: Optional[Any] = None,
    model: str = DEFAULT_MODEL,
) -> str:
    """
    Executes non-streaming generation using Gemma.

    Retries once on 429 / 500 / 504 with a 3-second pause.
    Raises LLMError on terminal failure.
    """
    client = get_client()
    config = _build_config(
        system=system,
        json_schema=json_schema,
        temperature=temperature,
        timeout=timeout,
        thinking_level=thinking_level,
    )

    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=model,
                contents=user,
                config=config,
            )
            return response.text.strip() if response.text else ""
        except Exception as exc:
            if attempt == 0 and _is_retryable_error(exc):
                time.sleep(3.0)
                continue
            raise LLMError(f"Gemma generation failed: {exc}") from exc

    return ""


def generate_stream(
    system: str,
    user: str,
    json_schema: Any = None,
    temperature: float = 0.2,
    timeout: int = 45,
    thinking_level: Optional[Any] = None,
    model: str = DEFAULT_MODEL,
) -> Iterator[str]:
    """
    Executes streaming generation using Gemma and yields text chunks.

    Retries initialization once on 429 / 500 / 504 with a 3-second pause.
    Raises LLMError on terminal failure.
    """
    client = get_client()
    config = _build_config(
        system=system,
        json_schema=json_schema,
        temperature=temperature,
        timeout=timeout,
        thinking_level=thinking_level,
    )

    yielded_any = False
    for attempt in range(2):
        try:
            response_stream = client.models.generate_content_stream(
                model=model,
                contents=user,
                config=config,
            )
            for chunk in response_stream:
                if chunk.text:
                    yielded_any = True
                    yield chunk.text
            return
        except Exception as exc:
            if attempt == 0 and not yielded_any and _is_retryable_error(exc):
                time.sleep(3.0)
                continue
            raise LLMError(f"Gemma streaming generation failed: {exc}") from exc

