#!/usr/bin/env python3
"""
Legal Lens REST API (FastAPI)

Provides HTTP endpoints for health monitoring, loaded legal sources metadata,
and hybrid vector + keyword legal retrieval.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import requests
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from rag.retrieve import CORPUS_RECORDS, retrieve


# Initialize FastAPI app
app = FastAPI(
    title="Legal Lens API",
    description="Multilingual AI Legal Retrieval & Compliance Platform for Indian Law",
    version="1.0.0",
)

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# Request & Response Schemas
# ==============================================================================

class RetrieveRequest(BaseModel):
    query: str = Field(..., description="Legal query in English or Hindi")
    k: int = Field(default=5, ge=1, le=50, description="Number of results to return (default: 5)")
    sources: Optional[List[str]] = Field(
        default=None,
        description="Optional list of source statute names to filter results",
    )


class SourceMetadata(BaseModel):
    source: str
    chunks: int
    text_as_on: str
    status: str


class RetrieveResponse(BaseModel):
    results: List[Dict[str, Any]]
    any_confident: bool


# ==============================================================================
# Exception Handlers
# ==============================================================================

@app.exception_handler(requests.exceptions.RequestException)
async def ollama_connection_exception_handler(request: Request, exc: requests.exceptions.RequestException):
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "error": "Ollama service is unreachable. Please ensure Ollama is running locally with 'bge-m3' model installed.",
            "details": str(exc),
        },
    )


# ==============================================================================
# API Endpoints
# ==============================================================================

@app.get("/", tags=["General"])
def root_info() -> Dict[str, Any]:
    return {
        "service": "Legal Lens API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": ["/health", "/sources", "/retrieve"],
    }


@app.get("/health", tags=["Monitoring"])
def health_check() -> Dict[str, Any]:
    """
    Returns API health status and the count of active loaded legal chunks.
    """
    return {
        "status": "ok",
        "chunks": len(CORPUS_RECORDS),
    }


@app.get("/sources", response_model=List[SourceMetadata], tags=["Metadata"])
def list_sources() -> List[Dict[str, Any]]:
    """
    Returns list of all loaded legal statutes with chunk counts, consolidation date, and legal status.
    """
    stats: Dict[str, Dict[str, Any]] = {}

    for r in CORPUS_RECORDS:
        source_name = r.get("source", "Unknown")
        if source_name not in stats:
            default_date = "1st May, 2024" if source_name == "Constitution of India" else ""
            stats[source_name] = {
                "source": source_name,
                "chunks": 0,
                "text_as_on": r.get("text_as_on") or default_date,
                "status": r.get("status") or "In Force",
            }
        stats[source_name]["chunks"] += 1
        if not stats[source_name]["text_as_on"] and r.get("text_as_on"):
            stats[source_name]["text_as_on"] = r.get("text_as_on")
        if not stats[source_name]["status"] and r.get("status"):
            stats[source_name]["status"] = r.get("status")

    # Sort alphabetically by source name
    return sorted(stats.values(), key=lambda x: x["source"])


@app.post("/retrieve", response_model=RetrieveResponse, tags=["Retrieval"])
def retrieve_endpoint(payload: RetrieveRequest) -> Dict[str, Any]:
    """
    Hybrid retrieval endpoint executing dense vector + BM25 keyword search,
    reciprocal rank fusion, citation boosting, section collapsing, and confidence scoring.
    """
    try:
        results = retrieve(query=payload.query, k=payload.k, sources=payload.sources)
        any_confident = any(r.get("confident", False) for r in results)
        return {
            "results": results,
            "any_confident": any_confident,
        }
    except requests.exceptions.RequestException as err:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": "Ollama service is unreachable. Please verify Ollama is active on http://localhost:11434.",
                "details": str(err),
            },
        )
    except Exception as err:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "Failed to process retrieval request.",
                "details": str(err),
            },
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
