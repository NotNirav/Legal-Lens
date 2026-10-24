# Legal Lens API Documentation

Comprehensive REST and Streaming API reference for frontend integration.
Base URL: `http://localhost:8000` (Configure in frontend as `NEXT_PUBLIC_API_URL` or `VITE_API_URL`).
CORS: **Fully Open** (`allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`).

---

## Table of Contents
1. [Overview & Architecture](#overview--architecture)
2. [Endpoints Reference](#endpoints-reference)
   - [GET /health](#1-get-health)
   - [GET /states](#2-get-states)
   - [POST /retrieve](#3-post-retrieve)
   - [POST /retrieve/tiered](#4-post-retrievetiered)
   - [POST /ask (Streaming SSE)](#5-post-ask-streaming-sse)
   - [POST /ask/sync (Synchronous JSON)](#6-post-asksync-synchronous-json)
   - [POST /ask/document (Multimodal Vision SSE)](#7-post-askdocument-multimodal-vision-sse)
   - [POST /review (Post-Answer Audit)](#8-post-review-post-answer-audit)
3. [Server-Sent Events (SSE) Protocol & JavaScript Client](#server-sent-events-sse-protocol--javascript-client)
4. [Frontend UI Integration Patterns](#frontend-ui-integration-patterns)
   - [Building the State Dropdown](#building-the-state-dropdown)
   - [Calling /review Off-Critical Path](#calling-review-off-critical-path)
   - [Handling Fallback and Confidence Badges](#handling-fallback-and-confidence-badges)
5. [10-Line UI Connection Checklist](#10-line-ui-connection-checklist)

---

## Overview & Architecture

Legal Lens is a legal intelligence platform designed for Indian law. It operates with a dual-pipeline architecture:
- **Retrieval Tier**: Hybrid dense vector (`bge-m3` via Ollama) + BM25 keyword search over Central statutes, the Constitution of India, and State laws (currently Maharashtra).
- **Synthesis Tier**: Google Gemma 4 (`gemma-4-26b-a4b-it`) streaming structured guidance with strict code-level citation validation against tagged evidence (`[C#]`, `[L#]`, `[S#]`, `[Q#]`, `[W#]`, `[D#]`).
- **Post-Generation Reviewer**: Google Gemma 4 31B (`gemma-4-31b-it`) auditing citation accuracy off the critical path.
- **Answer Cache**: SHA-1 keyed caching in `cache/answers.json` replaying streamed answers without calling models on repeated queries.

---

## Endpoints Reference

### 1. GET /health
Checks service health, loaded legal corpus chunks, active models, and cached answer count.

- **Method**: `GET`
- **URL**: `/health`
- **Request Body**: None
- **Timeout**: < 100 ms
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "chunks": 782,
  "models": {
    "writer": "gemma-4-26b-a4b-it",
    "vision": "gemma-4-26b-a4b-it",
    "reviewer": "gemma-4-31b-it"
  },
  "cache_entries": 12
}
```

---

### 2. GET /states
Returns all Indian jurisdictions, loaded chunk counts, and state-specific indexing status.

- **Method**: `GET`
- **URL**: `/states`
- **Request Body**: None
- **Timeout**: < 100 ms
- **Response `200 OK`**:
```json
[
  {
    "jurisdiction": "India",
    "chunks": 425,
    "sources": [
      { "source": "Constitution of India", "chunks": 284 },
      { "source": "Code of Criminal Procedure, 1973", "chunks": 141 }
    ],
    "covered": true,
    "note": "All-India Central Law & Constitution"
  },
  {
    "jurisdiction": "Maharashtra",
    "chunks": 357,
    "sources": [
      { "source": "Maharashtra Rent Control Act, 1999", "chunks": 357 }
    ],
    "covered": true,
    "note": "State laws indexed"
  },
  {
    "jurisdiction": "Karnataka",
    "chunks": 0,
    "sources": [],
    "covered": false,
    "note": "Central law only"
  }
]
```

---

### 3. POST /retrieve
Executes hybrid vector + BM25 keyword retrieval with section deduplication and confidence scoring.

- **Method**: `POST`
- **URL**: `/retrieve`
- **Headers**: `Content-Type: application/json`
- **Timeout**: 3 seconds
- **Request Body**:
```json
{
  "query": "can my landlord evict me without notice",
  "k": 5,
  "state": "Maharashtra",
  "sources": ["Maharashtra Rent Control Act, 1999"]
}
```
*Fields*:
- `query` (string, required): Legal question in English or Hindi.
- `k` (int, optional, default: 5): Max results to return (1-50).
- `state` (string, optional): State jurisdiction filter. If omitted, defaults to Central + Constitution only.
- `sources` (list of strings, optional): Filter by exact statute names.

- **Response `200 OK`**:
```json
{
  "results": [
    {
      "id": "maha_rent_sec_15",
      "title": "Section 15: Relief against forfeiture",
      "text": "No ejectment ordinarily to be made if tenant pays or is ready and willing to pay standard rent and permitted increases...",
      "source": "Maharashtra Rent Control Act, 1999",
      "section": "Section 15",
      "citation": "Maharashtra Rent Control Act, 1999 - Section 15",
      "jurisdiction": "Maharashtra",
      "status": "In Force",
      "text_as_on": "2024",
      "score": 0.0385,
      "confident": true
    }
  ],
  "any_confident": true
}
```
- **Error Responses**:
  - `503 Service Unavailable`: `{"error": "Ollama service is unreachable. Please ensure Ollama is running locally with 'bge-m3' model installed.", "details": "..."}`
  - `500 Internal Server Error`: `{"error": "Failed to process retrieval request.", "details": "..."}`

---

### 4. POST /retrieve/tiered
Returns ranked statutory excerpts separated across constitutional, central, state, and QA tiers.

- **Method**: `POST`
- **URL**: `/retrieve/tiered`
- **Headers**: `Content-Type: application/json`
- **Timeout**: 3 seconds
- **Request Body**:
```json
{
  "query": "can police arrest me without warrant",
  "state": "Maharashtra",
  "k_const": 2,
  "k_central": 3,
  "k_state": 2,
  "k_qa": 2
}
```

- **Response `200 OK`**:
```json
{
  "constitution": [
    {
      "id": "const_art_22",
      "citation": "Constitution of India - Article 22",
      "text": "Protection against arrest and detention in certain cases...",
      "jurisdiction": "India",
      "confident": true
    }
  ],
  "central": [
    {
      "id": "crpc_sec_41",
      "citation": "Code of Criminal Procedure, 1973 - Section 41",
      "text": "When police may arrest without warrant...",
      "jurisdiction": "India",
      "confident": true
    }
  ],
  "state": [],
  "qa": [],
  "any_confident": true
}
```

---

### 5. POST /ask (Streaming SSE)
Primary question answering endpoint using Server-Sent Events (SSE). Streams tokens in real time from `WRITER_MODEL`.

- **Method**: `POST`
- **URL**: `/ask`
- **Headers**:
  - `Content-Type: application/json`
  - `Accept: text/event-stream`
- **Timeout**: 45 seconds (falls back safely to deterministic RAG extract if model fails or times out)
- **Request Body**:
```json
{
  "query": "My landlord cut my water supply and locked the gate. What are my rights?",
  "state": "Maharashtra",
  "lang": "en"
}
```
*Fields*:
- `query` (string, required): Question in English or Hindi.
- `state` (string, optional): E.g., `"Maharashtra"`. If omitted or uncovered, Central law applies.
- `lang` (string, optional): `"en"` or `"hi"`. Auto-detected if omitted.

- **Response**: `200 OK` with `Content-Type: text/event-stream; charset=utf-8`

#### SSE Events Emitted:
1. `event: sources` (Retrieved evidence citations):
```json
{
  "sources": [
    {
      "tag": "[S1]",
      "citation": "Maharashtra Rent Control Act, 1999 - Section 29",
      "source": "Maharashtra Rent Control Act, 1999",
      "section": "Section 29",
      "status": "In Force",
      "jurisdiction": "Maharashtra",
      "url": ""
    }
  ]
}
```

2. `event: trace` (Pipeline timing and execution telemetry):
```json
{
  "step": "retrieval",
  "trace": [
    { "step": "retrieve_tiered", "ms": 320.4, "ok": true, "cached": false },
    { "step": "web_evidence", "ms": 940.1, "ok": true, "cached": false }
  ]
}
```

3. `event: token` (Streamed answer token text):
```json
{ "token": "Under Section 29 of the " }
```

4. `event: done` (Final complete answer payload):
```json
{
  "answer": "Under Section 29 of the Maharashtra Rent Control Act, 1999 [S1], no landlord may cut off essential supplies such as water or electricity without just or sufficient cause...",
  "sources": [ ... ],
  "sources_cited": [
    {
      "tag": "[S1]",
      "citation": "Maharashtra Rent Control Act, 1999 - Section 29",
      "source": "Maharashtra Rent Control Act, 1999",
      "section": "Section 29",
      "status": "In Force",
      "url": ""
    }
  ],
  "trace": [
    { "step": "retrieve_tiered", "ms": 320.4, "ok": true, "cached": false },
    { "step": "web_evidence", "ms": 940.1, "ok": true, "cached": false },
    { "step": "writer_generation", "ms": 2840.5, "ok": true, "cached": false },
    { "step": "extract_sources_cited", "ms": 1.2, "ok": true }
  ],
  "any_confident": true,
  "state": "Maharashtra",
  "lang": "en",
  "fallback": false,
  "cached": false
}
```

5. `event: error` (Emitted only if an unrecoverable exception occurs):
```json
{ "error": "Detailed error message" }
```

---

### 6. POST /ask/sync (Synchronous JSON)
Identical logic to `/ask`, but returns the final assembled JSON payload in a single HTTP response.

- **Method**: `POST`
- **URL**: `/ask/sync`
- **Headers**: `Content-Type: application/json`
- **Timeout**: 45 seconds
- **Request Body**:
```json
{
  "query": "What are my rights upon arrest by police?",
  "state": "Maharashtra",
  "lang": "en"
}
```
- **Response `200 OK`**:
```json
{
  "answer": "Direct Answer: Under Article 22(1) of the Constitution of India [C1] and Section 50 of the Code of Criminal Procedure [L1], every arrested person has the fundamental right to be informed of the grounds of arrest immediately and the right to consult a legal practitioner of choice...",
  "sources": [ ... ],
  "sources_cited": [
    {
      "tag": "[C1]",
      "citation": "Constitution of India - Article 22",
      "source": "Constitution of India",
      "section": "Article 22",
      "status": "In Force",
      "url": ""
    },
    {
      "tag": "[L1]",
      "citation": "Code of Criminal Procedure, 1973 - Section 50",
      "source": "Code of Criminal Procedure, 1973",
      "section": "Section 50",
      "status": "In Force",
      "url": ""
    }
  ],
  "trace": [ ... ],
  "any_confident": true,
  "state": "Maharashtra",
  "lang": "en",
  "fallback": false,
  "cached": true
}
```

---

### 7. POST /ask/document (Multimodal Vision SSE)
Uploads an eviction notice, rental agreement, or employment contract image (JPG, PNG, WEBP up to 8 MB). `VISION_MODEL` parses metadata into `[D1]`.. evidence items, runs tiered retrieval, and streams guidance.

- **Method**: `POST`
- **URL**: `/ask/document`
- **Headers**: `Content-Type: multipart/form-data`
- **Timeout**: 90 seconds (45s vision + 45s writer)
- **Form Data Fields**:
  - `file` (File, required): Image file (JPG, PNG, WEBP, <= 8MB).
  - `query` (string, optional): Custom question (e.g., "Is this 7-day notice period legal?"). Default: `"Explain this document and my rights"`.
  - `state` (string, optional): E.g., `"Maharashtra"`.
  - `lang` (string, optional): `"en"` or `"hi"`.

#### SSE Events Emitted:
1. `event: document` (Emitted immediately after vision analysis):
```json
{
  "doc_type": "Notice to Vacate Premises",
  "language": "English",
  "parties": ["Ramesh Gupta (Landlord)", "Amit Verma (Tenant)"],
  "dates": ["14th October 2026"],
  "amounts": ["Rs. 30,000"],
  "key_terms": ["Termination of tenancy", "Arrears of rent", "7 days notice"],
  "notice_period": "7 days",
  "deadlines": ["21st October 2026"],
  "summary": "Formal demand notice asking tenant to vacate flat within 7 days for alleged unpaid rent."
}
```

2. `event: sources`: Retrieved statutory provisions matching the document facts.
3. `event: trace`: Vision reading and retrieval timings.
4. `event: token`: Streamed explanation of whether clauses comply with Indian law.
5. `event: done`: Final payload including the `document` dictionary and cited laws.
6. `event: error`: Emitted if the file is blurred, unreadable, or a non-document photograph.

---

### 8. POST /review (Post-Answer Audit)
Audits the generated answer against retrieved evidence items using `REVIEWER_MODEL` (`gemma-4-31b-it`).
**Designed to run off the critical path.** The frontend should trigger this call in the background after the `done` event arrives.

- **Method**: `POST`
- **URL**: `/review`
- **Headers**: `Content-Type: application/json`
- **Timeout**: 70 seconds
- **Request Body**:
```json
{
  "query": "Can my landlord evict me without notice?",
  "answer": "Under Section 15 of the Maharashtra Rent Control Act, 1999 [S1], a landlord cannot file an eviction suit without serving a 90-day written notice...",
  "evidence_tags": ["[S1]"],
  "state": "Maharashtra"
}
```

- **Response `200 OK` (Audit Passed / Finished)**:
```json
{
  "ok": true,
  "verdict": "supported",
  "claims": [
    {
      "claim": "Landlord cannot institute eviction proceedings without serving mandatory statutory notice",
      "tag": "[S1]",
      "supported": true
    }
  ],
  "missing": [],
  "caveat": "Ensure all rent payments and receipts are retained as proof.",
  "latency": 3.85,
  "cached": false
}
```

- **Response `200 OK` (On Model Timeout / Error)**:
```json
{
  "ok": false
}
```
> **Frontend Rule**: The endpoint *never raises HTTP 500* on audit failure. If `ok === false`, simply hide or do not render the review card in the UI.

---

## Server-Sent Events (SSE) Protocol & JavaScript Client

Because browser `EventSource` only supports `GET` requests, call POST endpoints (`/ask`, `/ask/document`) using `fetch` with `ReadableStream`.

```javascript
/**
 * Streams legal guidance from /ask using fetch + ReadableStream.
 * Handles multiline buffers, "event:", and "data:" SSE lines.
 */
async function streamLegalLensAsk({ query, state, lang, onEvent, onError }) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  try {
    const response = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({ query, state, lang }),
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || ""; // Keep incomplete trailing fragment

      for (const block of blocks) {
        if (!block.trim()) continue;
        let eventType = "message";
        let dataStr = "";

        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) {
            eventType = line.replace("event:", "").trim();
          } else if (line.startsWith("data:")) {
            dataStr += line.replace("data:", "").trim();
          }
        }

        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            onEvent(eventType, parsed);
          } catch (e) {
            onEvent(eventType, dataStr);
          }
        }
      }
    }
  } catch (err) {
    if (onError) onError(err);
  }
}

// Example Usage:
streamLegalLensAsk({
  query: "Landlord disconnected electricity",
  state: "Maharashtra",
  lang: "en",
  onEvent: (event, payload) => {
    switch (event) {
      case "sources":
        console.log("Retrieved citations:", payload.sources);
        break;
      case "trace":
        console.log("Pipeline trace:", payload.trace);
        break;
      case "token":
        // Append streaming token to output box
        process.stdout.write(payload.token);
        break;
      case "done":
        console.log("\nFinished. Full payload:", payload);
        // Trigger /review in background
        triggerReview(payload);
        break;
      case "error":
        console.error("Stream error:", payload.error);
        break;
    }
  },
  onError: (err) => console.error("Network error:", err),
});
```

---

## Frontend UI Integration Patterns

### Building the State Dropdown
Call `GET /states` when mounting the search header:
```javascript
async function loadStateOptions() {
  const res = await fetch(`${API_BASE}/states`);
  const states = await res.json();
  
  // Render options:
  return states.map((s) => ({
    value: s.jurisdiction,
    label: s.covered 
      ? s.jurisdiction 
      : `${s.jurisdiction} (Central law only)`,
    disabled: false,
    badge: s.covered ? "Indexed" : "Central only",
  }));
}
```

### Calling /review Off-Critical Path
Do **not** block the user's reading experience while waiting for the reviewer:
```javascript
async function triggerReview(donePayload) {
  try {
    const res = await fetch(`${API_BASE}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: donePayload.query || currentQuery,
        answer: donePayload.answer,
        evidence_tags: donePayload.sources_cited.map((s) => s.tag),
        state: donePayload.state,
      }),
    });
    const data = await res.json();
    
    // Show card ONLY if ok === true
    if (data.ok === true) {
      setReviewCardData({
        verdict: data.verdict, // "supported" | "partly_supported" | "unsupported"
        claims: data.claims,
        caveat: data.caveat,
      });
      setShowReviewCard(true);
    } else {
      setShowReviewCard(false);
    }
  } catch (err) {
    setShowReviewCard(false); // Graceful degradation
  }
}
```

### Handling Fallback and Confidence Badges
In the `done` event payload or `/ask/sync` response:
1. **Fallback Badge**:
   ```javascript
   if (response.fallback === true) {
     // Show amber disclaimer badge:
     // "Direct Statutory Provisions (Synthesizer Offline)"
   }
   ```
2. **Confidence Badge**:
   ```javascript
   if (response.any_confident === false) {
     // Show gray/yellow pill:
     // "Preliminary Match - General Legal Framework"
   } else {
     // Show green pill:
     // "Verified Statutory Precedent"
   }
   ```
3. **Cached Response**:
   ```javascript
   if (response.cached === true) {
     // Optional subtle indicator: "Instant Verified Cache"
   }
   ```

---

## 10-Line UI Connection Checklist

1. Set `NEXT_PUBLIC_API_URL=http://localhost:8000` (or your tunnel URL) in the frontend `.env`.
2. Verify API status by calling `GET /health` on initial page mount.
3. Populate the State selector using `GET /states`; display `(Central law only)` if `covered === false`.
4. Connect the main search submit handler to `POST /ask` using `fetch` with `ReadableStream`.
5. Listen for `event: sources` to render the citation badges above the response area.
6. Listen for `event: token` and append `payload.token` directly to the active response text container.
7. Listen for `event: done` to render verified `sources_cited` pills, fallback warning, and trace timings.
8. Trigger `POST /review` in the background after `done`; display the audit verdict card only if `ok === true`.
9. For document uploads, send a `multipart/form-data` request to `POST /ask/document` and handle `event: document`.
10. Ensure graceful UI handling if `fallback: true` or `any_confident: false` by displaying advisory notices.
