#!/usr/bin/env python3
"""
llm.py - Wrapper around the google-genai SDK for Legal Lens.

Configured for Gemma models with model and timeout settings from orchestrator.config.
Reads Gemini/Gemma API keys safely from environment or .env without printing or logging them.
Supports non-streaming and streaming generation, structured JSON, thinking level control,
tools (Google Search), multimodal/image inputs, single retry on 429/500/504 with a 3-second pause,
and clean error raising.
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

from orchestrator.config import (
    DEFAULT_MODEL,
    REVIEWER_MODEL,
    REVIEWER_TIMEOUT,
    TIMEOUTS,
    VISION_MODEL,
    VISION_TIMEOUT,
    WRITER_MODEL,
    WRITER_TIMEOUT,
)


class LLMError(Exception):
    """Custom exception raised when generation fails after retries."""
    pass


def _get_api_key() -> str:
    """Retrieves Gemini/Gemma API key from environment or .env without ever logging or printing it."""
    for key in ["GEMINI_API_KEY", "gemma_api_key", "GEMMA_API_KEY", "gemma_api_key_2"]:
        val = os.getenv(key)
        if val:
            return val.strip().strip("'\"")

    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k in ["GEMINI_API_KEY", "gemma_api_key", "GEMMA_API_KEY", "gemma_api_key_2"]:
                            return v
        except Exception:
            pass
    return ""


_CLIENT_INSTANCE: Optional[genai.Client] = None


def get_client() -> genai.Client:
    """Returns a singleton genai.Client instance."""
    global _CLIENT_INSTANCE
    if _CLIENT_INSTANCE is None:
        key = _get_api_key()
        if not key:
            raise LLMError("API key not found. Ensure GEMINI_API_KEY or gemma_api_key is defined in environment or .env.")
        _CLIENT_INSTANCE = genai.Client(api_key=key)
    return _CLIENT_INSTANCE


def _is_retryable_error(exc: Exception) -> bool:
    """Checks whether the exception represents a 429, 500, 503, 504, or transient error."""
    msg = str(exc).upper()
    return any(
        err in msg
        for err in [
            "429",
            "500",
            "503",
            "504",
            "UNAVAILABLE",
            "RESOURCE_EXHAUSTED",
            "DEADLINE_EXCEEDED",
            "INTERNAL",
            "SERVER ERROR",
            "RATE LIMIT",
            "TIMEOUT",
        ]
    )



def _resolve_timeout(model: str, timeout: Optional[int] = None) -> int:
    """Resolves request timeout in seconds based on explicit argument or model type."""
    if timeout is not None:
        return int(timeout)
    if model == REVIEWER_MODEL:
        return REVIEWER_TIMEOUT
    if model == VISION_MODEL:
        return VISION_TIMEOUT
    return WRITER_TIMEOUT


def _get_writer_thinking_level() -> Optional[Any]:
    """Inspects SDK types for minimal/low thinking level enum."""
    if hasattr(types, "ThinkingLevel"):
        tl = getattr(types.ThinkingLevel, "MINIMAL", None)
        if tl is None:
            tl = getattr(types.ThinkingLevel, "LOW", None)
        return tl
    return "MINIMAL"


def _build_config(
    system: str,
    model: str = WRITER_MODEL,
    json_schema: Any = None,
    temperature: float = 0.2,
    timeout: Optional[int] = None,
    thinking_level: Optional[Any] = None,
    tools: Optional[list[Any]] = None,
) -> types.GenerateContentConfig:
    """Constructs a GenerateContentConfig object with timeout, tools, and thinking options."""
    effective_timeout = _resolve_timeout(model, timeout)
    http_opts = types.HttpOptions(timeout=int(effective_timeout * 1000))

    kwargs: dict[str, Any] = {
        "system_instruction": system,
        "temperature": temperature,
        "http_options": http_opts,
    }

    if json_schema is not None:
        kwargs["response_mime_type"] = "application/json"
        if not isinstance(json_schema, bool):
            kwargs["response_schema"] = json_schema

    if tools is not None:
        kwargs["tools"] = tools

    # Thinking configuration: check if SDK types support it
    if hasattr(types, "ThinkingConfig"):
        if thinking_level is None and tools is None:
            # Use minimal/low thinking for the writer model when not using conflicting tools
            if model == WRITER_MODEL or "writer" in model.lower() or "gemma" in model.lower():
                thinking_level = _get_writer_thinking_level()

        if thinking_level is not False and thinking_level is not None:
            try:
                kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=thinking_level)
            except Exception:
                pass

    return types.GenerateContentConfig(**kwargs)


def _prepare_contents(user: str, images: Any = None) -> Any:
    """Prepares multimodal or text content for generate_content."""
    if not images:
        return user

    contents: list[Any] = []
    if user:
        contents.append(user)

    if isinstance(images, (list, tuple)):
        contents.extend(images)
    else:
        contents.append(images)

    return contents


def _normalize_args(
    model: str,
    system: str,
    user: str,
) -> tuple[str, str, str]:
    """
    Ensures backwards compatibility if called positionally as generate(system, user).
    If model contains newlines/spaces and user is empty, model is treated as system prompt.
    """
    if not user and system and ("\n" in model or " " in model or model not in [WRITER_MODEL, VISION_MODEL, REVIEWER_MODEL]):
        return WRITER_MODEL, model, system
    return model, system, user


def generate(
    model: str = WRITER_MODEL,
    system: str = "",
    user: str = "",
    json_schema: Any = None,
    images: Any = None,
    temperature: float = 0.2,
    timeout: Optional[int] = None,
    thinking_level: Optional[Any] = None,
    tools: Optional[list[Any]] = None,
    return_raw: bool = False,
) -> Any:
    """
    Executes non-streaming generation using google-genai SDK.

    Args:
        model: Model identifier (defaults to WRITER_MODEL).
        system: System instruction prompt.
        user: User query or content.
        json_schema: Optional JSON schema for structured output.
        images: Optional image(s) or multimodal parts.
        temperature: Sampling temperature (default: 0.2).
        timeout: Timeout in seconds (default derived from model config).
        thinking_level: Optional thinking level (defaults to minimal/low for writer).
        tools: Optional list of tools (e.g. GoogleSearch).
        return_raw: If True, returns full GenerateContentResponse object.

    Retries once on 429 / 500 / 504 with a 3-second pause.
    Raises LLMError on terminal failure.
    """
    model, system, user = _normalize_args(model, system, user)
    client = get_client()
    config = _build_config(
        system=system,
        model=model,
        json_schema=json_schema,
        temperature=temperature,
        timeout=timeout,
        thinking_level=thinking_level,
        tools=tools,
    )
    contents = _prepare_contents(user, images=images)

    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            if return_raw:
                return response
            return response.text.strip() if response.text else ""
        except Exception as exc:
            if attempt == 0 and _is_retryable_error(exc):
                time.sleep(3.0)
                continue
            raise LLMError(f"Generation failed for model '{model}': {exc}") from exc

    if return_raw:
        return None
    return ""


def generate_stream(
    model: str = WRITER_MODEL,
    system: str = "",
    user: str = "",
    json_schema: Any = None,
    images: Any = None,
    temperature: float = 0.2,
    timeout: Optional[int] = None,
    thinking_level: Optional[Any] = None,
    tools: Optional[list[Any]] = None,
) -> Iterator[str]:
    """
    Executes streaming generation using google-genai SDK and yields text chunks.

    Args:
        model: Model identifier (defaults to WRITER_MODEL).
        system: System instruction prompt.
        user: User query or content.
        json_schema: Optional JSON schema for structured output.
        images: Optional image(s) or multimodal parts.
        temperature: Sampling temperature (default: 0.2).
        timeout: Timeout in seconds (default derived from model config).
        thinking_level: Optional thinking level (defaults to minimal/low for writer).
        tools: Optional list of tools.

    Retries initialization once on 429 / 500 / 504 with a 3-second pause.
    Raises LLMError on terminal failure.
    """
    model, system, user = _normalize_args(model, system, user)
    client = get_client()
    config = _build_config(
        system=system,
        model=model,
        json_schema=json_schema,
        temperature=temperature,
        timeout=timeout,
        thinking_level=thinking_level,
        tools=tools,
    )
    contents = _prepare_contents(user, images=images)

    yielded_any = False
    for attempt in range(2):
        try:
            response_stream = client.models.generate_content_stream(
                model=model,
                contents=contents,
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
            raise LLMError(f"Streaming generation failed for model '{model}': {exc}") from exc
