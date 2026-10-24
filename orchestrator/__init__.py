"""
Legal Lens Orchestrator Package

Answer assembly layer: Evidence gathering, language detection, and prompt construction.
"""

from orchestrator.evidence import build_evidence
from orchestrator.prompt import build_prompt

__all__ = ["build_evidence", "build_prompt"]
