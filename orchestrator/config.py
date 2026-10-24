#!/usr/bin/env python3
"""
config.py - Model configurations and timeouts for Legal Lens Orchestrator.

Provides defaults for writer, vision, and reviewer models and their timeouts,
each overridable via environment variables.
"""

from __future__ import annotations

import os

# Model identifiers (overridable via environment variables)
WRITER_MODEL: str = os.getenv("WRITER_MODEL", "gemma-4-26b-a4b-it")
VISION_MODEL: str = os.getenv("VISION_MODEL", "gemma-4-26b-a4b-it")
REVIEWER_MODEL: str = os.getenv("REVIEWER_MODEL", "gemma-4-31b-it")

# Default alias
DEFAULT_MODEL: str = WRITER_MODEL

# Timeouts in seconds (overridable via environment variables)
WRITER_TIMEOUT: int = int(os.getenv("WRITER_TIMEOUT", "45"))
VISION_TIMEOUT: int = int(os.getenv("VISION_TIMEOUT", "45"))
REVIEWER_TIMEOUT: int = int(os.getenv("REVIEWER_TIMEOUT", "70"))

TIMEOUTS: dict[str, int] = {
    "writer": WRITER_TIMEOUT,
    "vision": VISION_TIMEOUT,
    "reviewer": REVIEWER_TIMEOUT,
}
