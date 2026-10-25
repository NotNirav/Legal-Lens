/**
 * src/lib/api.js - Unified API Client & SSE Stream Reader for Legal Lens
 *
 * Provides:
 *  - Dynamic base URL resolution with localStorage persistence and ?api=<url> override
 *  - Error normalization into friendly ApiError (UNREACHABLE, TIMEOUT, SERVER_ERROR, ABORTED)
 *  - Full endpoint wrappers: getHealth(), getStates(), reviewAnswer()
 *  - Server-Sent Events (SSE) streaming readers: askStream() and askDocument()
 *  - Built-in AbortController management to cancel in-flight queries
 */

const STORAGE_KEY = 'legal_lens_api_url';
const DEFAULT_API_URL = 'http://localhost:8000';

const listeners = new Set();

/**
 * Normalizes an API URL by trimming whitespace, removing trailing slashes,
 * and ensuring an HTTP/HTTPS protocol prefix.
 */
function cleanUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return DEFAULT_API_URL;
  let url = rawUrl.trim().replace(/\/+$/, '');
  if (!url) return DEFAULT_API_URL;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

/**
 * Returns the active API Base URL.
 * Checks (in order of priority):
 *  1. Query parameter ?api=<url> (and persists it to localStorage)
 *  2. Saved localStorage value
 *  3. Framework env variable VITE_API_URL
 *  4. Fallback default (http://localhost:8000)
 */
export function getBaseUrl() {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryParam = params.get('api');
      if (queryParam) {
        const cleaned = cleanUrl(queryParam);
        localStorage.setItem(STORAGE_KEY, cleaned);
        // Clean URL query param without full page reload
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('api');
        window.history.replaceState({}, '', newUrl.toString());
        notifyListeners(cleaned);
        return cleaned;
      }

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return cleanUrl(stored);
      }
    } catch {
      // Storage access may fail in restricted iframes
    }
  }

  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || DEFAULT_API_URL;
  return cleanUrl(envUrl);
}

/**
 * Programmatically updates the active Base URL, saves to localStorage,
 * and notifies active UI subscribers (such as the footer).
 */
export function setBaseUrl(newUrl) {
  const cleaned = cleanUrl(newUrl);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, cleaned);
    } catch {
      // ignore
    }
  }
  notifyListeners(cleaned);
  return cleaned;
}

/**
 * Resets the Base URL to the default framework env variable or localhost.
 */
export function resetBaseUrl() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  const fallback = cleanUrl(import.meta.env?.VITE_API_URL || DEFAULT_API_URL);
  notifyListeners(fallback);
  return fallback;
}

/**
 * Subscribes a callback to Base URL updates.
 * Returns an unsubscribe function.
 */
export function subscribeBaseUrl(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(url) {
  listeners.forEach((fn) => {
    try {
      fn(url);
    } catch (e) {
      console.error('Error notifying API URL listener:', e);
    }
  });
}

// ==============================================================================
// Normalized Error Handling
// ==============================================================================

/**
 * Unified Friendly API Error
 * Types:
 *  - 'UNREACHABLE': Server is down, port is closed, or tunnel URL is invalid
 *  - 'TIMEOUT': Request took too long to respond
 *  - 'SERVER_ERROR': 500 / 502 / 503 internal or gateway errors
 *  - 'ABORTED': Request was intentionally cancelled by a new question
 */
export class ApiError extends Error {
  constructor(type, message, status = null, details = null) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.status = status;
    this.details = details;
  }
}

/**
 * Detects whether making requests to the target URL would trigger a Mixed Content block
 * (i.e. loading from an HTTPS page but requesting an insecure HTTP resource).
 */
export function isMixedContentUrl(url) {
  if (typeof window === 'undefined' || !url) return false;
  return window.location.protocol === 'https:' && /^http:\/\//i.test(url);
}

/**
 * Transforms native fetch exceptions, AbortErrors, or HTTP status codes
 * into user-friendly ApiError instances.
 */
export function normalizeError(err, targetUrl = getBaseUrl(), status = null) {
  if (err instanceof ApiError) {
    return err;
  }

  if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('aborted')) {
    return new ApiError('ABORTED', 'Request was cancelled.', status, err);
  }

  // Mixed Content blocked by browser security
  if (isMixedContentUrl(targetUrl)) {
    return new ApiError(
      'MIXED_CONTENT',
      `Mixed Content Blocked: The application is running over HTTPS, but the API Base URL is using insecure HTTP (${targetUrl}). Browsers block insecure HTTP requests from HTTPS sites. Please use an HTTPS tunnel URL (e.g. ?api=https://your-tunnel.trycloudflare.com).`,
      status,
      { isMixedContent: true, targetUrl }
    );
  }

  // Network offline, DNS failure, CORS block, or refused connection
  if (err instanceof TypeError || err?.message?.toLowerCase().includes('failed to fetch')) {
    return new ApiError(
      'UNREACHABLE',
      `Cannot connect to Legal Lens backend at ${targetUrl}. Please ensure the server or tunnel is running.`,
      status,
      err
    );
  }

  // Gateway timeout or client timeout
  if (status === 504 || err?.message?.toLowerCase().includes('timeout')) {
    return new ApiError(
      'TIMEOUT',
      'The legal analysis request timed out. High server load or upstream model latency occurred.',
      status || 504,
      err
    );
  }

  // Service unavailable
  if (status === 503) {
    return new ApiError(
      'UNREACHABLE',
      'Ollama embedding service or model provider is temporarily unavailable. Check local Ollama status.',
      503,
      err
    );
  }

  // 5xx Server Errors
  if (status && status >= 500) {
    return new ApiError(
      'SERVER_ERROR',
      `Legal Lens backend server error (${status}). ${err?.message || ''}`.trim(),
      status,
      err
    );
  }

  return new ApiError('SERVER_ERROR', err?.message || 'An unexpected error occurred.', status, err);
}

// Active request tracking for automatic cancellation of prior queries
let activeStreamController = null;

export function cancelActiveStream() {
  if (activeStreamController) {
    activeStreamController.abort();
    activeStreamController = null;
  }
}

// ==============================================================================
// Server-Sent Events (SSE) Stream Parser
// ==============================================================================

/**
 * Reads a fetch ReadableStream and decodes SSE blocks formatted as:
 *   event: <type>
 *   data: <json or string>
 *
 * Calls corresponding handlers for "sources", "trace", "document", "token", "done", "error".
 */
async function processSseStream(response, handlers = {}, signal = null) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatchEvent = (eventType, rawData) => {
    let payload = rawData;
    if (typeof rawData === 'string') {
      const trimmed = rawData.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          payload = JSON.parse(trimmed);
        } catch {
          payload = rawData;
        }
      }
    }

    if (handlers.onEvent) {
      try {
        handlers.onEvent(eventType, payload);
      } catch (e) {
        console.error(`Error in onEvent(${eventType}):`, e);
      }
    }

    switch (eventType) {
      case 'sources':
        handlers.onSources?.(payload?.sources || payload);
        break;
      case 'trace':
        handlers.onTrace?.(payload?.trace || payload);
        break;
      case 'document':
        handlers.onDocument?.(payload?.document || payload);
        break;
      case 'token':
        handlers.onToken?.(payload?.token !== undefined ? payload.token : payload);
        break;
      case 'done':
        handlers.onDone?.(payload);
        break;
      case 'error':
        handlers.onError?.(normalizeError(new Error(payload?.error || 'Stream error'), getBaseUrl()));
        break;
      default:
        break;
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted by user', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || ''; // Preserve incomplete trailing chunk

      for (const block of blocks) {
        if (!block.trim()) continue;

        let eventType = 'message';
        let dataAccumulator = [];

        const lines = block.split('\n');
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataAccumulator.push(line.slice(5).trim());
          }
        }

        if (dataAccumulator.length > 0) {
          dispatchEvent(eventType, dataAccumulator.join('\n'));
        }
      }
    }

    // Flush any leftover buffer content
    if (buffer.trim()) {
      let eventType = 'message';
      let dataAccumulator = [];
      for (const line of buffer.split('\n')) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataAccumulator.push(line.slice(5).trim());
        }
      }
      if (dataAccumulator.length > 0) {
        dispatchEvent(eventType, dataAccumulator.join('\n'));
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

// ==============================================================================
// Public API Methods
// ==============================================================================

/**
 * GET /health
 * Returns status, active chunk count, loaded models, and cache size.
 */
export async function getHealth(options = {}) {
  const baseUrl = getBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 8000);

  const signal = options.signal || controller.signal;

  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw normalizeError(err, baseUrl, err.status);
  }
}

/**
 * GET /states
 * Returns all Indian jurisdictions with chunk counts, coverage status, and notes.
 */
export async function getStates(options = {}) {
  const baseUrl = getBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 8000);

  const signal = options.signal || controller.signal;

  try {
    const res = await fetch(`${baseUrl}/states`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw normalizeError(err, baseUrl, err.status);
  }
}

/**
 * GET /sources
 * Returns all loaded legal statutes with chunk counts, consolidation dates, and statuses.
 */
export async function getSources(options = {}) {
  const baseUrl = getBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 8000);

  const signal = options.signal || controller.signal;

  try {
    const res = await fetch(`${baseUrl}/sources`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw normalizeError(err, baseUrl, err.status);
  }
}

/**
 * POST /ask (Streaming SSE)
 * Sends question to the assembly pipeline and parses SSE events in real-time.
 * Automatically cancels any previous ongoing askStream request unless detach=true is passed.
 *
 * @param {Object} body - { query, state, lang }
 * @param {Object} handlers - { onSources, onTrace, onToken, onDone, onError, onEvent }
 * @param {Object} options - { signal, timeout, detach }
 * @returns {Object} - { abort } handle
 */
export function askStream(body, handlers = {}, options = {}) {
  const baseUrl = getBaseUrl();

  // Cancel prior active question unless caller explicitly detached it
  if (!options.detach) {
    cancelActiveStream();
  }

  const controller = new AbortController();
  if (!options.detach) {
    activeStreamController = controller;
  }

  // Link caller signal if provided
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, options.timeout || 90000);

  (async () => {
    try {
      const response = await fetch(`${baseUrl}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          query: body.query,
          state: body.state || null,
          lang: body.lang || null,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errDetail = '';
        try {
          const errJson = await response.json();
          errDetail = errJson.details || errJson.error || '';
        } catch {
          // ignore
        }
        throw new Error(errDetail || `Server returned HTTP ${response.status}`);
      }

      await processSseStream(response, handlers, controller.signal);
    } catch (err) {
      clearTimeout(timeoutId);
      const friendlyErr = normalizeError(err, baseUrl, err.status);
      if (handlers.onError) {
        handlers.onError(friendlyErr);
      } else {
        console.error('Unhandled askStream error:', friendlyErr);
      }
    } finally {
      if (activeStreamController === controller) {
        activeStreamController = null;
      }
    }
  })();

  return {
    abort: () => controller.abort(),
  };
}

/**
 * POST /ask/document (Multimodal Document Vision SSE)
 * Uploads eviction notices, employment contracts, or rental agreements (JPG, PNG, WEBP).
 * Streams document metadata, retrieved citations, and statutory compliance guidance.
 *
 * @param {FormData|Object} formOrData - FormData or { file, query, state, lang }
 * @param {Object} handlers - { onDocument, onSources, onTrace, onToken, onDone, onError }
 * @param {Object} options - { signal, timeout }
 * @returns {Object} - { abort } handle
 */
export function askDocument(formOrData, handlers = {}, options = {}) {
  const baseUrl = getBaseUrl();

  cancelActiveStream();
  const controller = new AbortController();
  activeStreamController = controller;

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, options.timeout || 120000);

  let formData;
  if (typeof FormData !== 'undefined' && formOrData instanceof FormData) {
    formData = formOrData;
  } else {
    formData = new FormData();
    if (formOrData.file) formData.append('file', formOrData.file);
    if (formOrData.query) formData.append('query', formOrData.query);
    if (formOrData.state) formData.append('state', formOrData.state);
    if (formOrData.lang) formData.append('lang', formOrData.lang);
  }

  (async () => {
    try {
      const response = await fetch(`${baseUrl}/ask/document`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errDetail = '';
        try {
          const errJson = await response.json();
          errDetail = errJson.details || errJson.error || '';
        } catch {
          // ignore
        }
        throw new Error(errDetail || `Server returned HTTP ${response.status}`);
      }

      await processSseStream(response, handlers, controller.signal);
    } catch (err) {
      clearTimeout(timeoutId);
      const friendlyErr = normalizeError(err, baseUrl, err.status);
      if (handlers.onError) {
        handlers.onError(friendlyErr);
      } else {
        console.error('Unhandled askDocument error:', friendlyErr);
      }
    } finally {
      if (activeStreamController === controller) {
        activeStreamController = null;
      }
    }
  })();

  return {
    abort: () => controller.abort(),
  };
}

/**
 * POST /review
 * Audits generated answer against verified evidence off the critical path.
 * Always resolves gracefully with { ok: false } on error or timeout so the UI hides the card.
 */
export async function reviewAnswer(body, options = {}) {
  const baseUrl = getBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 75000);

  const signal = options.signal || controller.signal;

  try {
    const res = await fetch(`${baseUrl}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: body.query,
        answer: body.answer,
        evidence_tags: body.evidence_tags || null,
        state: body.state || null,
      }),
      signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return { ok: false };
    }
    const data = await res.json();
    return data && typeof data.ok === 'boolean' ? data : { ok: false };
  } catch (err) {
    clearTimeout(timeoutId);
    // Off-critical path must never throw or break UI
    return { ok: false, error: err?.message };
  }
}

export default {
  getBaseUrl,
  setBaseUrl,
  resetBaseUrl,
  subscribeBaseUrl,
  getHealth,
  getStates,
  getSources,
  askStream,
  askDocument,
  reviewAnswer,
  cancelActiveStream,
  ApiError,
  normalizeError,
};
