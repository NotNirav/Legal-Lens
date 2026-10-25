import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Square, Paperclip, X, FileText, 
  RotateCcw, Scale, AlertCircle, AlertTriangle, Shield, 
  Copy, Check, Printer, ChevronDown, Clock, ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { askStream, askDocument, getStates, reviewAnswer, cancelActiveStream } from '../lib/api';
import SafeMarkdown from '../lib/SafeMarkdown';
import { DEFAULT_INDIAN_STATES } from '../data/states';
import { GOLDEN_DEMO_QUESTIONS } from '../data/goldenQuestions';

let messageCounter = 100;
const getUniqueId = (prefix) => `${prefix}_${++messageCounter}_${Date.now()}`;
const getFormattedTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Client-side canvas downscaler: shrinks images with longest side > 1600px
 * preserving aspect ratio before uploading.
 */
function downscaleImage(file, maxDimension = 1600) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      if (width <= maxDimension && height <= maxDimension) {
        resolve(file);
        return;
      }

      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const resizedFile = new File([blob], file.name, {
            type: mimeType,
            lastModified: Date.now(),
          });
          resolve(resizedFile);
        },
        mimeType,
        0.90
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

const EXAMPLE_QUESTIONS_EN = [
  "Can my landlord deduct my deposit without repair receipts?",
  "Company delayed my salary by 2 months — how to recover?",
  "Can police refuse to file an FIR for a stolen phone or bike?",
  "What is the 45-day payment rule for small businesses and MSMEs?"
];

const EXAMPLE_QUESTIONS_HI = [
  "क्या मकान मालिक बिना बिल दिखाए सिक्योरिटी डिपॉजिट काट सकता है?",
  "कंपनी ने 2 महीने से सैलरी रोकी है — पैसे कैसे वापस पाएं?",
  "क्या पुलिस चोरी की शिकायत पर FIR दर्ज करने से मना कर सकती है?",
  "छोटे व्यापारियों और MSME के लिए 45 दिन का भुगतान नियम क्या है?"
];

// Helper for source card left border type color
const getSourceBorderType = (s) => {
  const tag = (s.tag || '').toUpperCase();
  if (tag.startsWith('[C') || (s.citation || '').toLowerCase().includes('constitution')) return 'type-constitution';
  if (tag.startsWith('[L') || (s.jurisdiction || '').toLowerCase() === 'india') return 'type-central';
  if (tag.startsWith('[S')) return 'type-state';
  if (tag.startsWith('[W') || s.url) return 'type-web';
  return 'type-central';
};

// ==============================================================================
// Isolated Text Input Composers (Keep typing local to prevent message list re-render)
// ==============================================================================

/**
 * EmptyStateComposer: Used when conversation has not started yet.
 */
function EmptyStateComposer({
  onSend,
  attachment,
  onAttachClick,
  onRemoveAttachment,
  isStateDropdownOpen,
  setIsStateDropdownOpen,
  selectedState,
  handleSelectState,
  stateDropdownRef,
  stateSearchTerm,
  setStateSearchTerm,
  filteredStates,
  language
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);
  const stateSearchInputRef = useRef(null);

  useEffect(() => {
    if (isStateDropdownOpen) {
      stateSearchInputRef.current?.focus({ preventScroll: true });
    }
  }, [isStateDropdownOpen]);

  const handleInput = (e) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() || attachment) {
        onSend(text.trim());
        setText("");
      }
    }
  };

  const handleSubmit = () => {
    if (text.trim() || attachment) {
      onSend(text.trim());
      setText("");
    }
  };

  return (
    <div className="empty-state-dock-card">
      {attachment && (
        <div className="dock-staged-attachment">
          <FileText size={14} className="text-blue" />
          <span className="dock-attachment-name">{attachment.name}</span>
          <button 
            type="button" 
            className="dock-remove-attachment" 
            onClick={onRemoveAttachment}
            aria-label="Remove attached document"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="hero-dock-input-row">
        <textarea
          ref={textareaRef}
          className="hero-dock-textarea"
          rows={2}
          placeholder={
            language === 'hi'
              ? 'अपनी समस्या सरल शब्दों में लिखें (उदा. क्या मकान मालिक बिना नोटिस के निकाल सकता है?)'
              : "Describe your situation in plain language (e.g. 'Can my landlord lock me out without notice?')"
          }
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          aria-label="Legal question input"
        />

        <button
          type="button"
          className={`dock-tool-btn dock-attach-btn ${attachment ? 'has-file' : ''}`}
          onClick={onAttachClick}
          title="Attach eviction notice, letter, or bill image"
          aria-label="Attach document image"
        >
          <Paperclip size={18} />
        </button>

        <button
          type="button"
          className="dock-tool-btn dock-send-btn"
          onClick={handleSubmit}
          disabled={!text.trim() && !attachment}
          aria-label="Send legal question"
          title="Send question"
        >
          <Send size={18} />
        </button>
      </div>

      {/* State selector next to it */}
      <div className="hero-dock-bottom-bar" ref={stateDropdownRef}>
        <div className="dock-state-picker-wrap">
          <button
            type="button"
            className="dock-state-trigger"
            onClick={() => setIsStateDropdownOpen(!isStateDropdownOpen)}
            aria-expanded={isStateDropdownOpen}
            aria-label={`Current jurisdiction: ${selectedState}`}
          >
            <Scale size={13} className="text-muted" />
            <span>{language === 'hi' ? 'कार्यक्षेत्र:' : 'Jurisdiction:'} <strong>{selectedState}</strong></span>
            <ChevronDown size={12} className={`chevron ${isStateDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isStateDropdownOpen && (
            <div className="dock-state-dropdown animate-popover" role="listbox">
              <div className="dock-state-search-wrap">
                <input
                  ref={stateSearchInputRef}
                  type="text"
                  className="state-quick-search-input"
                  placeholder="Search 36 States &amp; UTs..."
                  value={stateSearchTerm}
                  onChange={(e) => setStateSearchTerm(e.target.value)}
                  aria-label="Filter states"
                />
              </div>
              <div className="state-quick-list">
                {filteredStates.map((st) => (
                  <button
                    key={st.jurisdiction}
                    type="button"
                    className={`dock-state-item ${st.jurisdiction === selectedState ? 'active' : ''}`}
                    onClick={() => handleSelectState(st.jurisdiction)}
                    role="option"
                    aria-selected={st.jurisdiction === selectedState}
                  >
                    <div className="state-item-name-line">
                      <span>{st.jurisdiction}</span>
                      <span className="state-note-sub">{st.covered ? 'State laws indexed' : 'Central law only'}</span>
                    </div>
                    {st.jurisdiction === selectedState && <Check size={13} className="ml-auto" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <span className="dock-state-hint">
          {language === 'hi' ? 'स्थानीय राज्य नियम एवं केंद्रीय अधिनियम लागू' : 'Local state rules & central acts applied'}
        </span>
      </div>
    </div>
  );
}

/**
 * ChatComposer: Normal flex item at the bottom of active chat thread.
 * Auto-resizing textarea does NOT touch or scroll the message area.
 */
function ChatComposer({
  onSend,
  isSubmitting,
  onStop,
  attachment,
  onAttachClick,
  onRemoveAttachment,
  uploadError,
  onDismissUploadError,
  language
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  const handleInput = (e) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((text.trim() || attachment) && !isSubmitting) {
        onSend(text.trim());
        setText("");
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleSubmit = () => {
    if ((text.trim() || attachment) && !isSubmitting) {
      onSend(text.trim());
      setText("");
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className="active-thread-composer-dock">
      <div className="chat-thread-column">
        {attachment && (
          <div className="dock-staged-attachment">
            <FileText size={14} className="text-blue" />
            <span className="dock-attachment-name">{attachment.name}</span>
            <button 
              type="button" 
              className="dock-remove-attachment" 
              onClick={onRemoveAttachment}
              aria-label="Remove attached document"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {uploadError && (
          <div className="upload-error-pill" role="alert">
            <AlertCircle size={13} />
            <span>{uploadError}</span>
            <button type="button" onClick={onDismissUploadError} aria-label="Dismiss error">✕</button>
          </div>
        )}

        <div className="thread-composer-inner">
          <button
            type="button"
            className={`dock-tool-btn dock-attach-btn ${attachment ? 'has-file' : ''}`}
            onClick={onAttachClick}
            title="Attach document or notice image"
            aria-label="Attach document or notice photo"
            disabled={isSubmitting}
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            className="thread-composer-textarea"
            rows={1}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              isSubmitting
                ? (language === 'hi' ? "सत्यापित कानूनी उत्तर लिखा जा रहा है..." : "Writing verified legal answer...")
                : (language === 'hi' ? "सरल शब्दों में अगला प्रश्न पूछें..." : "Ask a follow-up question in plain language...")
            }
            aria-label="Follow-up question"
          />

          {isSubmitting ? (
            <button
              type="button"
              className="dock-tool-btn dock-stop-btn"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating response"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className="dock-tool-btn dock-send-btn"
              onClick={handleSubmit}
              disabled={!text.trim() && !attachment}
              aria-label="Send follow-up question"
              title="Send question"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==============================================================================
// Memoized Individual Messages and Message Stream List
// ==============================================================================

const MemoizedMessageItem = React.memo(function MessageItem({
  msg,
  selectedState,
  highlightedTag,
  onTagClick,
  expandedSources,
  onToggleSource,
  mobileSourcesOpen,
  onToggleMobileSources,
  openTraces,
  onToggleTrace,
  copiedId,
  onCopyBrief,
  onPrint,
  onRetry,
  language
}) {
  if (msg.sender === 'user') {
    return (
      <div className="thread-row row-user">
        <div className="user-question-pill">
          {msg.attachment && (
            <div className="user-attached-tag">
              <FileText size={13} />
              <span>{msg.attachment.name}</span>
            </div>
          )}
          <p className="user-pill-text">{msg.text}</p>
          <span className="user-pill-time">{msg.timestamp}</span>
        </div>
      </div>
    );
  }

  // Assistant message card
  const hasStateSources = (msg.retrievedSources || msg.sourcesCited || []).some(
    (s) => (s.tag && s.tag.startsWith('[S')) || (s.jurisdiction && s.jurisdiction.toLowerCase() !== 'india' && s.jurisdiction.toLowerCase() !== 'central')
  );

  return (
    <div className="thread-row row-assistant">
      <article className="assistant-answer-card" aria-label="Legal Assistant Answer">
        {/* Answering for label on top */}
        <div className="card-top-identity">
          <div className="answering-state-tag">
            <Scale size={13} className="text-muted" />
            <span>Answering for: <strong>{msg.state || selectedState}</strong></span>
          </div>

          <div className="card-tools-cluster">
            <button
              type="button"
              className="card-tool-btn"
              onClick={() => onCopyBrief(msg)}
              title="Copy answer brief"
              aria-label="Copy answer brief"
            >
              {copiedId === msg.id ? (
                <>
                  <Check size={13} className="text-emerald" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="card-tool-btn"
              onClick={onPrint}
              title="Print brief"
              aria-label="Print brief"
            >
              <Printer size={13} />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Loading: Three-Step Progress Line + Skeleton Block */}
        {msg.isStreaming && (
          <div className="answer-loading-suite" role="status" aria-label="Answer generation progress">
            <div className="three-step-progress-line">
              <div className={`progress-step-item ${!msg.retrievedSources?.length && !msg.text ? 'is-active is-current' : 'is-done'}`}>
                <span className="step-num-dot">1</span>
                <span className="step-title-text">Searching the law</span>
              </div>
              <span className="progress-step-divider" aria-hidden="true" />
              <div className={`progress-step-item ${msg.retrievedSources?.length && !msg.text ? 'is-active is-current' : msg.text ? 'is-done' : ''}`}>
                <span className="step-num-dot">2</span>
                <span className="step-title-text">Checking official sources</span>
              </div>
              <span className="progress-step-divider" aria-hidden="true" />
              <div className={`progress-step-item ${msg.text ? 'is-active is-current' : ''}`}>
                <span className="step-num-dot">3</span>
                <span className="step-title-text">Writing your answer</span>
              </div>
            </div>

            {!msg.text && (
              <div className="skeleton-placeholder-block" aria-hidden="true">
                <div className="skeleton-line skeleton-short" />
                <div className="skeleton-line skeleton-full" />
                <div className="skeleton-line skeleton-mid" />
              </div>
            )}
          </div>
        )}

        {/* Document Analysis Summary Card */}
        {msg.documentData && (
          <div className="document-analysis-summary-card animate-popover" aria-label="Document summary">
            <div className="doc-summary-top">
              <FileText size={15} className="text-blue" />
              <strong>What we read from your document</strong>
              {msg.documentData.doc_type && (
                <span className="doc-type-badge">{msg.documentData.doc_type}</span>
              )}
            </div>
            <div className="doc-summary-grid">
              {msg.documentData.parties && (
                <div className="doc-meta-item">
                  <span className="doc-meta-label">Parties:</span>
                  <span className="doc-meta-val">{msg.documentData.parties}</span>
                </div>
              )}
              {msg.documentData.notice_period && (
                <div className="doc-meta-item">
                  <span className="doc-meta-label">Notice Period:</span>
                  <span className="doc-meta-val">{msg.documentData.notice_period}</span>
                </div>
              )}
              {msg.documentData.deadlines && (
                <div className="doc-meta-item">
                  <span className="doc-meta-label">Deadlines:</span>
                  <span className="doc-meta-val">{msg.documentData.deadlines}</span>
                </div>
              )}
              {msg.documentData.amounts && (
                <div className="doc-meta-item">
                  <span className="doc-meta-label">Amounts:</span>
                  <span className="doc-meta-val">{msg.documentData.amounts}</span>
                </div>
              )}
            </div>
            {msg.documentData.summary && (
              <p className="doc-summary-desc">{msg.documentData.summary}</p>
            )}
          </div>
        )}

        {/* Error Notice */}
        {msg.error && (
          <div className="calm-notice-banner notice-error animate-popover" role="alert">
            <AlertCircle size={16} className="notice-icon" />
            <div className="notice-body">
              <strong>{msg.error.type === 'IMAGE_UNREADABLE' ? 'Unreadable Document Photo' : 'Connection Interrupted'}</strong>
              <p>{msg.error.message}</p>
              <div className="notice-actions-row">
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm"
                  onClick={() => onRetry(msg)}
                >
                  <RotateCcw size={12} />
                  <span>Retry Question</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fallback Mode Notice Banner */}
        {msg.fallback && (
          <div className="calm-notice-banner notice-amber" role="status">
            <AlertTriangle size={15} className="notice-icon" />
            <span>Showing the relevant statutory text directly from official sources while our AI synthesizer is resting.</span>
          </div>
        )}

        {/* Low Confidence Notice Banner (Priority 5: Matches what was returned) */}
        {msg.anyConfident === false && (
          <div className="calm-notice-banner notice-amber" role="alert">
            <AlertCircle size={15} className="notice-icon" />
            <span>
              {hasStateSources
                ? (language === 'hi' 
                    ? `राज्य कानूनों में प्रारंभिक मिलान मिला (${msg.state || selectedState})। कृपया विशिष्ट धाराओं की जांच करें या NALSA (15100) से संपर्क करें।`
                    : `Preliminary legal match found in state statutes for ${msg.state || selectedState}. Confidence is modest; verify specific section details or consult free legal aid via NALSA (15100).`)
                : (language === 'hi'
                    ? `राज्य कानूनों में कोई सटीक मिलान नहीं मिला; निकटतम केंद्रीय वैधानिक प्रावधान प्रदर्शित हैं। NALSA (15100) से संपर्क कर सकते हैं।`
                    : `We could not find an exact match in state statutes; here is the closest central legal provision. Consider consulting free legal aid via NALSA (15100).`)}
            </span>
          </div>
        )}

        {/* Answer Body via SafeMarkdown */}
        {msg.text && (
          <div className="card-answer-content" aria-live="polite">
            <SafeMarkdown
              content={msg.text}
              availableTags={msg.sourcesCited && msg.sourcesCited.length > 0 ? msg.sourcesCited.map(s => s.tag) : (msg.retrievedSources ? msg.retrievedSources.map(s => s.tag) : null)}
              onTagClick={onTagClick}
            />
          </div>
        )}

        {/* Sources Panel */}
        {!msg.isStreaming && msg.sourcesCited && msg.sourcesCited.length > 0 && (
          <section className="sources-panel-section" aria-label="Cited legal authorities">
            <div className="sources-panel-header">
              <div className="sources-header-left">
                <Scale size={14} className="text-muted" />
                <h4 className="sources-heading">Cited Legal Authorities ({msg.sourcesCited.length})</h4>
              </div>

              <button
                type="button"
                className="mobile-sources-toggle-btn"
                onClick={() => onToggleMobileSources(msg.id)}
                aria-expanded={Boolean(mobileSourcesOpen[msg.id])}
                aria-label="Toggle sources view on mobile"
              >
                <span>{mobileSourcesOpen[msg.id] ? 'Hide sources' : 'Show sources'}</span>
                <ChevronDown size={13} className={`chevron ${mobileSourcesOpen[msg.id] ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div className={`sources-cards-grid ${mobileSourcesOpen[msg.id] ? 'mobile-is-open' : 'mobile-is-collapsed'}`}>
              {msg.sourcesCited.map((s, idx) => {
                const borderTypeClass = getSourceBorderType(s);
                const isHighlighted = highlightedTag === s.tag;
                const isExpanded = Boolean(expandedSources[`${msg.id}-${s.tag}`]);
                const isInForce = (s.status || '').toLowerCase().includes('in force');

                return (
                  <div
                    key={s.tag || idx}
                    id={`source-card-${s.tag}`}
                    className={`source-card-item ${borderTypeClass} ${isHighlighted ? 'is-highlighted' : ''}`}
                  >
                    <div className="source-card-top-line">
                      <span className="source-card-tag-pill">{s.tag}</span>
                      <span className="source-card-title">{s.citation || s.source}</span>
                      <span className={`source-status-pill ${isInForce ? 'status-in-force' : 'status-repealed'}`}>
                        {s.status || 'In Force'}
                      </span>
                    </div>

                    <div className="source-card-meta-line">
                      {s.jurisdiction && <span className="meta-item">{s.jurisdiction}</span>}
                      <span className="meta-sep">·</span>
                      <span className="meta-item">as on {s.text_as_on || '2026'}</span>
                      {s.url && (
                        <>
                          <span className="meta-sep">·</span>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="meta-link">
                            <span>{s.domain || 'official portal'}</span>
                            <ExternalLink size={11} />
                          </a>
                        </>
                      )}
                    </div>

                    {s.text && (
                      <div className="source-excerpt-block">
                        <p className="source-excerpt-text">
                          {isExpanded || s.text.length <= 180 ? s.text : s.text.slice(0, 180) + '…'}
                        </p>
                        {s.text.length > 180 && (
                          <button
                            type="button"
                            className="source-expand-toggle"
                            onClick={() => onToggleSource(msg.id, s.tag)}
                          >
                            {isExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Second-Model Review Audit Card */}
        {!msg.isStreaming && msg.reviewData && msg.reviewData.ok && (
          <div className="second-model-review-box" aria-label="Second-model review card">
            <div className="review-box-top">
              <div className="review-box-title-group">
                <Shield size={14} className="text-muted" />
                <span className="review-box-heading">Second-model review</span>
              </div>
              <span className={`review-verdict-chip verdict-${(msg.reviewData.verdict || '').toLowerCase()}`}>
                {(msg.reviewData.verdict || '').toLowerCase().includes('part') ? (
                  <AlertTriangle size={12} />
                ) : (msg.reviewData.verdict || '').toLowerCase().includes('unsupport') ? (
                  <AlertCircle size={12} />
                ) : (
                  <CheckCircle2 size={12} />
                )}
                <span>
                  {(msg.reviewData.verdict || '').toLowerCase() === 'partly_supported'
                    ? 'Partly Supported'
                    : (msg.reviewData.verdict || '').toLowerCase() === 'unsupported'
                    ? 'Unsupported'
                    : 'Supported'}
                </span>
              </span>
            </div>

            {msg.reviewData.claims && msg.reviewData.claims.length > 0 && (
              <div className="review-claims-stack">
                {msg.reviewData.claims.map((cl, cIdx) => (
                  <div key={cIdx} className="review-claim-row">
                    {cl.supported ? (
                      <CheckCircle2 size={13} className="text-emerald shrink-0" />
                    ) : (
                      <AlertTriangle size={13} className="text-amber shrink-0" />
                    )}
                    <span className="review-claim-text">{cl.claim}</span>
                    {cl.tag && (
                      <button 
                        type="button" 
                        className="review-claim-tag" 
                        onClick={() => onTagClick(cl.tag)}
                      >
                        {cl.tag}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {msg.reviewData.caveat && (
              <p className="review-caveat-note">
                <strong>Note:</strong> {msg.reviewData.caveat}
              </p>
            )}
          </div>
        )}

        {/* Collapsible Pipeline Trace Timeline */}
        {!msg.isStreaming && msg.trace && msg.trace.length > 0 && (
          <div className="trace-accordion-wrap">
            <button
              type="button"
              className="trace-accordion-trigger"
              onClick={() => onToggleTrace(msg.id)}
              aria-expanded={Boolean(openTraces[msg.id])}
            >
              <Clock size={12} />
              <span>How this answer was made ({msg.trace.reduce((acc, t) => acc + (typeof t.ms === 'number' ? t.ms : 0), 0).toFixed(0)} ms)</span>
              <ChevronDown size={12} className={`chevron ${openTraces[msg.id] ? 'rotate-180' : ''}`} />
            </button>

            {openTraces[msg.id] && (
              <div className="trace-timeline-list animate-popover">
                {msg.trace.map((tr, tIdx) => (
                  <div key={tIdx} className="trace-step-row">
                    <span className={`trace-dot ${tr.ok ? 'ok' : 'fail'}`} />
                    <span className="trace-step-name">{tr.step.replace(/_/g, ' ')}</span>
                    <span className="trace-step-time">{typeof tr.ms === 'number' ? `${tr.ms.toFixed(0)}ms` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mandatory Disclaimer */}
        <div className="mandatory-card-disclaimer">
          <span>A plain-language guide to your legal rights. Not formal legal representation.</span>
        </div>
      </article>
    </div>
  );
});

const MemoizedMessageList = React.memo(function MessageList({
  messages,
  selectedState,
  highlightedTag,
  onTagClick,
  expandedSources,
  onToggleSource,
  mobileSourcesOpen,
  onToggleMobileSources,
  openTraces,
  onToggleTrace,
  copiedId,
  onCopyBrief,
  onPrint,
  onRetry,
  language
}) {
  return (
    <div className="thread-messages-list">
      {messages.map((msg) => (
        <MemoizedMessageItem
          key={msg.id}
          msg={msg}
          selectedState={selectedState}
          highlightedTag={highlightedTag}
          onTagClick={onTagClick}
          expandedSources={expandedSources}
          onToggleSource={onToggleSource}
          mobileSourcesOpen={mobileSourcesOpen}
          onToggleMobileSources={onToggleMobileSources}
          openTraces={openTraces}
          onToggleTrace={onToggleTrace}
          copiedId={copiedId}
          onCopyBrief={onCopyBrief}
          onPrint={onPrint}
          onRetry={onRetry}
          language={language}
        />
      ))}
    </div>
  );
});

// ==============================================================================
// QueryTab Main Component
// ==============================================================================

export default function QueryTab({ 
  prefillQuestion, 
  clearPrefill, 
  prefillAttachment, 
  clearPrefillAttachment, 
  language = 'en',
  _setLanguage,
  _hasDemoParam = false,
  isDemoModeActive = false,
  _setIsDemoModeActive,
  selectedState = 'Maharashtra',
  setSelectedState
}) {
  const exampleQuestions = language === 'hi' ? EXAMPLE_QUESTIONS_HI : EXAMPLE_QUESTIONS_EN;

  // Single Scroll Container Ref & Auto-scroll Tracking
  const chatScrollContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const scrollRafRef = useRef(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  // Stream management refs
  const tokenBufferRef = useRef('');
  const lastFlushTimeRef = useRef(0);
  const rafIdRef = useRef(null);
  const activeAssistantMsgIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamHandleRef = useRef(null);
  const stateDropdownRef = useRef(null);

  // Messages state (typing text is NOT stored here!)
  const [messages, setMessages] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachment, setAttachment] = useState(prefillAttachment || null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  // Jurisdiction & Source expansion
  const [statesList, setStatesList] = useState(DEFAULT_INDIAN_STATES);
  const [isStateDropdownOpen, setIsStateDropdownOpen] = useState(false);
  const [stateSearchTerm, setStateSearchTerm] = useState("");
  const [highlightedTag, setHighlightedTag] = useState(null);
  const [expandedSources, setExpandedSources] = useState({});
  const [mobileSourcesOpen, setMobileSourcesOpen] = useState({});
  const [openTraces, setOpenTraces] = useState({});

  // Demo Questions filter
  const [demoCategoryFilter, setDemoCategoryFilter] = useState('all');

  // Load available states
  useEffect(() => {
    let isMounted = true;
    getStates()
      .then((data) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setStatesList(data);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // Close state dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(event.target)) {
        setIsStateDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle prefill prop from Home tab
  useEffect(() => {
    if (prefillQuestion) {
      handleSendMessage(prefillQuestion);
      if (clearPrefill) clearPrefill();
    }
  }, [prefillQuestion]);

  useEffect(() => {
    if (prefillAttachment) {
      setAttachment(prefillAttachment);
      if (clearPrefillAttachment) clearPrefillAttachment();
    }
  }, [prefillAttachment]);

  // Handle image thumbnail preview
  useEffect(() => {
    if (attachment && attachment.file && attachment.file.type.startsWith('image/')) {
      const url = URL.createObjectURL(attachment.file);
      setAttachmentPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAttachmentPreviewUrl(null);
    }
  }, [attachment]);

  // Clean up in-flight streams and RAF on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (streamHandleRef.current) streamHandleRef.current.abort();
      cancelActiveStream();
    };
  }, []);

  // Track whether the user is within ~100px of bottom
  const handleChatScroll = useCallback(() => {
    const el = chatScrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNear = distanceFromBottom <= 100;
    isNearBottomRef.current = isNear;
    setShowJumpToLatest(!isNear);
  }, []);

  // Instant scroll to bottom batched with requestAnimationFrame (NO smooth behavior)
  const scrollToBottomInstant = useCallback(() => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      const el = chatScrollContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, []);

  const handleJumpToLatest = useCallback(() => {
    const el = chatScrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      isNearBottomRef.current = true;
      setShowJumpToLatest(false);
    }
  }, []);

  const handleSelectState = useCallback((stName) => {
    if (setSelectedState) setSelectedState(stName);
    localStorage.setItem('legal_lens_selected_state', stName);
    setIsStateDropdownOpen(false);
    setStateSearchTerm("");
  }, [setSelectedState]);

  // Citation tag click: scroll within chatScrollContainerRef without window scrolling
  const handleTagClick = useCallback((tag) => {
    setHighlightedTag(tag);
    const container = chatScrollContainerRef.current;
    const targetEl = document.getElementById(`source-card-${tag}`);
    if (container && targetEl) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const scrollOffset = targetRect.top - containerRect.top + container.scrollTop - 24;
      container.scrollTop = scrollOffset;
    }
    setTimeout(() => {
      setHighlightedTag((curr) => (curr === tag ? null : curr));
    }, 2500);
  }, []);

  const toggleSourceExpansion = useCallback((msgId, tag) => {
    setExpandedSources(prev => ({
      ...prev,
      [`${msgId}-${tag}`]: !prev[`${msgId}-${tag}`],
    }));
  }, []);

  const toggleMobileSources = useCallback((msgId) => {
    setMobileSourcesOpen(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  }, []);

  const toggleTrace = useCallback((msgId) => {
    setOpenTraces(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  }, []);

  // Handle file attachment
  const handleFileChange = async (e) => {
    setUploadError("");
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    const MAX_BYTES = 8 * 1024 * 1024;
    if (rawFile.size > MAX_BYTES) {
      setUploadError("Image exceeds 8 MB limit. Please select an image under 8 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ext = rawFile.name.substring(rawFile.name.lastIndexOf('.')).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

    if (!allowedMime.includes(rawFile.type) && !allowedExts.includes(ext)) {
      setUploadError("Unsupported format. Please upload a JPG, PNG, or WEBP image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const processedFile = await downscaleImage(rawFile, 1600);
      const formatSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      };

      setAttachment({
        file: processedFile,
        name: rawFile.name,
        size: formatSize(processedFile.size),
        type: processedFile.type,
        isImage: true,
      });
    } catch {
      setUploadError("Could not process the selected image. Please try again.");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentPreviewUrl(null);
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleStop = () => {
    if (streamHandleRef.current) {
      streamHandleRef.current.abort();
      streamHandleRef.current = null;
    }
    cancelActiveStream();
    setIsSubmitting(false);

    setMessages((prev) =>
      prev.map((m, idx) => {
        if (idx === prev.length - 1 && m.sender === 'assistant' && m.isStreaming) {
          return { ...m, isStreaming: false, statusMessage: null };
        }
        return m;
      })
    );
  };

  const handleRetry = useCallback((failedMsg) => {
    const queryToRetry = failedMsg?.query;
    if (!queryToRetry) return;
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
    handleSendMessage(queryToRetry);
  }, []);

  async function handleSendMessage(textToSend = "") {
    if (isSubmitting) return;

    const messageText = (textToSend || "").trim();
    if (!messageText && !attachment) return;

    if (streamHandleRef.current) {
      streamHandleRef.current.abort();
      streamHandleRef.current = null;
    }
    cancelActiveStream();

    const userMessageId = getUniqueId("user_msg");
    const assistantMessageId = getUniqueId("assistant_msg");
    const currentAttachment = attachment ? { ...attachment, previewUrl: attachmentPreviewUrl } : null;

    const userEntry = {
      id: userMessageId,
      sender: "user",
      timestamp: getFormattedTime(),
      text: messageText || "Please analyze this attached legal document.",
      attachment: currentAttachment
    };

    const assistantEntry = {
      id: assistantMessageId,
      sender: "assistant",
      timestamp: getFormattedTime(),
      text: "",
      isStreaming: true,
      statusMessage: "Searching the law…",
      retrievedSources: [],
      sourcesCited: [],
      fallback: false,
      anyConfident: true,
      cached: false,
      error: null,
      query: messageText || "Document Analysis",
      state: selectedState || "Maharashtra",
    };

    activeAssistantMsgIdRef.current = assistantMessageId;
    tokenBufferRef.current = '';
    lastFlushTimeRef.current = 0;
    
    // User triggered new submission, force scroll to bottom
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    setMessages((prev) => [...prev, userEntry, assistantEntry]);
    setAttachment(null);
    setAttachmentPreviewUrl(null);
    setIsSubmitting(true);
    setUploadError("");

    scrollToBottomInstant();

    const flushBufferedTokens = () => {
      const chunk = tokenBufferRef.current;
      const targetId = activeAssistantMsgIdRef.current;
      if (!chunk || !targetId) return;
      tokenBufferRef.current = '';
      lastFlushTimeRef.current = performance.now();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === targetId
            ? {
                ...m,
                text: (m.text || "") + chunk,
                statusMessage: "Writing your answer…",
              }
            : m
        )
      );

      // Auto-scroll rule: scroll to bottom ONLY when near bottom
      if (isNearBottomRef.current) {
        scrollToBottomInstant();
      }
    };

    const handlers = {
      onSources: (sources) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  retrievedSources: Array.isArray(sources) ? sources : [],
                  statusMessage: "Checking official sources…",
                }
              : m
          )
        );
        if (isNearBottomRef.current) {
          scrollToBottomInstant();
        }
      },
      onTrace: (trace) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantMessageId) return m;
            let status = m.statusMessage;
            if (Array.isArray(trace)) {
              const hasRet = trace.some((t) => t.step === 'retrieve_tiered' && t.ok);
              const hasWeb = trace.some((t) => t.step === 'web_evidence' && t.ok);
              if (hasWeb) status = "Writing your answer…";
              else if (hasRet) status = "Checking official sources…";
            }
            return { ...m, trace, statusMessage: status };
          })
        );
      },
      onDocument: (docData) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  documentData: docData,
                  statusMessage: "Document scanned. Searching the law…",
                }
              : m
          )
        );
        if (isNearBottomRef.current) {
          scrollToBottomInstant();
        }
      },
      onToken: (token) => {
        tokenBufferRef.current += token;
        const now = performance.now();
        if (now - lastFlushTimeRef.current >= 50) {
          flushBufferedTokens();
        } else if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            flushBufferedTokens();
          });
        }
      },
      onDone: (donePayload) => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        tokenBufferRef.current = '';
        activeAssistantMsgIdRef.current = null;

        const cited = donePayload.sources_cited || [];
        const allSources = donePayload.sources && donePayload.sources.length ? donePayload.sources : [];

        const enrichedCited = cited.map((c) => {
          const matched = allSources.find((s) => s.tag === c.tag);
          let domain = c.domain || '';
          if (!domain && c.url) {
            try { domain = new URL(c.url).hostname; } catch { domain = ''; }
          }
          return {
            ...c,
            text: c.text || matched?.text || '',
            jurisdiction: c.jurisdiction || matched?.jurisdiction || (c.tag?.startsWith('[S') ? selectedState : 'India'),
            domain,
          };
        });

        const shouldReview = !donePayload.fallback && Boolean(donePayload.answer);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  text: donePayload.answer || m.text,
                  sourcesCited: enrichedCited,
                  retrievedSources: allSources.length ? allSources : m.retrievedSources,
                  fallback: Boolean(donePayload.fallback),
                  anyConfident: donePayload.any_confident !== false,
                  cached: Boolean(donePayload.cached),
                  trace: donePayload.trace || m.trace,
                  isStreaming: false,
                  statusMessage: null,
                  isReviewing: shouldReview,
                  reviewData: null,
                }
              : m
          )
        );
        setIsSubmitting(false);
        streamHandleRef.current = null;

        if (isNearBottomRef.current) {
          scrollToBottomInstant();
        }

        if (shouldReview) {
          const evidenceTags = enrichedCited.map((s) => s.tag);
          reviewAnswer({
            query: messageText || "Document Analysis",
            answer: donePayload.answer,
            evidence_tags: evidenceTags,
            state: selectedState || "Maharashtra",
          })
            .then((res) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, isReviewing: false, reviewData: res && res.ok ? res : null }
                    : m
                )
              );
            })
            .catch(() => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, isReviewing: false, reviewData: null }
                    : m
                )
              );
            });
        }
      },
      onError: (err) => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        tokenBufferRef.current = '';
        activeAssistantMsgIdRef.current = null;

        let displayError = err;
        const msgLower = (err?.message || '').toLowerCase();
        if (
          msgLower.includes('unreadable') ||
          msgLower.includes('blurry') ||
          msgLower.includes('not contain a recognizable') ||
          msgLower.includes('non-document')
        ) {
          displayError = {
            ...err,
            type: 'IMAGE_UNREADABLE',
            message: "We couldn't clearly read text from this document image. Please ensure the document is flat, well-lit, and in focus, then try uploading again.",
          };
        } else {
          displayError = {
            ...err,
            type: 'UNREACHABLE',
            message: "We could not connect to the legal engine right now. Please check that your server or internet connection is active.",
          };
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  isStreaming: false,
                  statusMessage: null,
                  error: displayError,
                }
              : m
          )
        );
        setIsSubmitting(false);
        streamHandleRef.current = null;

        if (isNearBottomRef.current) {
          scrollToBottomInstant();
        }
      },
    };

    try {
      if (currentAttachment && currentAttachment.file) {
        const handle = askDocument(
          {
            file: currentAttachment.file,
            query: messageText || "Explain this document and my rights",
            state: selectedState || "Maharashtra",
            lang: language,
          },
          handlers
        );
        streamHandleRef.current = handle;
      } else {
        const handle = askStream(
          {
            query: messageText,
            state: selectedState || "Maharashtra",
            lang: language,
          },
          handlers
        );
        streamHandleRef.current = handle;
      }
    } catch (launchErr) {
      handlers.onError(launchErr);
    }
  }

  const handleResetChat = useCallback(() => {
    if (streamHandleRef.current) {
      streamHandleRef.current.abort();
      streamHandleRef.current = null;
    }
    cancelActiveStream();
    setIsSubmitting(false);
    setMessages([]);
    setAttachment(null);
    setAttachmentPreviewUrl(null);
    setUploadError("");
  }, []);

  const copyBriefToClipboard = useCallback((msg) => {
    if (!msg || !msg.text) return;
    const textToCopy = `LEGAL LENS SUMMARY\nJurisdiction: ${msg.state || selectedState}\n\n${msg.text}\n\nDisclaimer: A plain-language guide to your legal rights. Not legal advice.`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2500);
    });
  }, [selectedState]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const filteredStates = statesList.filter(s =>
    s.jurisdiction.toLowerCase().includes(stateSearchTerm.toLowerCase().trim())
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="query-workspace-page">
      {/* Hidden file input for file picker dialog */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,.pdf,.txt"
        style={{ display: 'none' }}
        id="query-tab-file-input"
      />

      {/* Empty State when no conversation has started */}
      {!hasMessages ? (
        <div className="empty-state-scroll-container">
          <div className="chat-centered-column">
            <div className="chat-empty-state" role="region" aria-label="Legal inquiry empty state">
              <div className="hero-mark-row">
                <span className="brand-accent-mark" aria-hidden="true">
                  <span className="bar bar-red" />
                  <span className="bar bar-blue" />
                  <span className="bar bar-yellow" />
                  <span className="bar bar-pink" />
                </span>
                <span className="hero-eyebrow">Interactive Legal Counsel</span>
              </div>

              <h1 className="empty-state-headline">
                {language === 'hi' ? 'अपने अधिकार जानें, सरल भाषा में' : 'Know your rights, in plain language'}
              </h1>
              <p className="empty-state-subtitle">
                {language === 'hi'
                  ? 'किरायेदारी, वेतन, पुलिस प्रक्रिया या उपभोक्ता अधिकारों पर स्पष्ट और विश्वसनीय उत्तर।'
                  : 'A plain-language guide to your legal rights, cited from the Constitution, central acts and state laws.'}
              </p>

              {/* Large Input Dock with Send, Attach, and State Selector next to it */}
              <EmptyStateComposer
                onSend={handleSendMessage}
                attachment={attachment}
                onAttachClick={() => fileInputRef.current?.click()}
                onRemoveAttachment={removeAttachment}
                isStateDropdownOpen={isStateDropdownOpen}
                setIsStateDropdownOpen={setIsStateDropdownOpen}
                selectedState={selectedState}
                handleSelectState={handleSelectState}
                stateDropdownRef={stateDropdownRef}
                stateSearchTerm={stateSearchTerm}
                setStateSearchTerm={setStateSearchTerm}
                filteredStates={filteredStates}
                language={language}
              />

              {/* 4 Clickable Example Inquiries */}
              <div className="hero-chips-container" role="region" aria-label="Sample inquiries">
                <span className="hero-chips-label">
                  {language === 'hi' ? 'सुझाए गए कानूनी विषय:' : 'Common inquiries:'}
                </span>
                <div className="hero-chips-cluster">
                  {exampleQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="editorial-chip-btn"
                      onClick={() => handleSendMessage(q)}
                      aria-label={`Ask: ${q}`}
                    >
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Verified Golden Pre-Indexed Inquiries */}
              {isDemoModeActive && (
                <div className="golden-questions-dock-tray" role="region" aria-label="Golden Demo Questions">
                  <div className="golden-tray-top">
                    <span className="golden-tray-title">Verified Pre-Indexed Scenarios (Instant Grounding):</span>
                    <div className="golden-filter-pills">
                      <button
                        type="button"
                        className={`golden-filter-btn ${demoCategoryFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setDemoCategoryFilter('all')}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`golden-filter-btn ${demoCategoryFilter === 'en' ? 'active' : ''}`}
                        onClick={() => setDemoCategoryFilter('en')}
                      >
                        EN
                      </button>
                      <button
                        type="button"
                        className={`golden-filter-btn ${demoCategoryFilter === 'hi' ? 'active' : ''}`}
                        onClick={() => setDemoCategoryFilter('hi')}
                      >
                        हिन्दी
                      </button>
                    </div>
                  </div>
                  <div className="golden-chips-row">
                    {GOLDEN_DEMO_QUESTIONS
                      .filter((gq) => {
                        if (demoCategoryFilter === 'en') return gq.lang === 'en';
                        if (demoCategoryFilter === 'hi') return gq.lang === 'hi';
                        return true;
                      })
                      .slice(0, 4)
                      .map((gq) => (
                        <button
                          key={gq.id}
                          type="button"
                          className="golden-demo-mini-chip"
                          onClick={() => handleSendMessage(gq.query)}
                          disabled={isSubmitting}
                        >
                          <span>{gq.title}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Active Conversation: ONE Single Chat Scroll Container */}
          <div 
            className="chat-thread-container" 
            ref={chatScrollContainerRef} 
            onScroll={handleChatScroll}
          >
            <div className="chat-thread-column">
              {/* Thread Top Action Header */}
              <div className="thread-top-bar">
                <button 
                  type="button" 
                  className="thread-reset-btn" 
                  onClick={handleResetChat}
                  title="Start a fresh conversation"
                  aria-label="Start new conversation"
                >
                  <RotateCcw size={13} />
                  <span>New Question</span>
                </button>

                <div className="thread-jurisdiction-pill">
                  <Scale size={13} className="text-muted" />
                  <span>Jurisdiction: <strong>{selectedState}</strong></span>
                </div>
              </div>

              {/* Memoized Message Stream */}
              <MemoizedMessageList
                messages={messages}
                selectedState={selectedState}
                highlightedTag={highlightedTag}
                onTagClick={handleTagClick}
                expandedSources={expandedSources}
                onToggleSource={toggleSourceExpansion}
                mobileSourcesOpen={mobileSourcesOpen}
                onToggleMobileSources={toggleMobileSources}
                openTraces={openTraces}
                onToggleTrace={toggleTrace}
                copiedId={copiedId}
                onCopyBrief={copyBriefToClipboard}
                onPrint={handlePrint}
                onRetry={handleRetry}
                language={language}
              />
            </div>

            {/* Jump to latest floating button when user has scrolled up */}
            {showJumpToLatest && (
              <button
                type="button"
                className="jump-to-latest-pill"
                onClick={handleJumpToLatest}
                aria-label={language === 'hi' ? "नवीनतम संदेश पर जाएं" : "Jump to latest message"}
              >
                <ChevronDown size={14} />
                <span>{language === 'hi' ? "नवीनतम पर जाएं" : "Jump to latest"}</span>
              </button>
            )}
          </div>

          {/* Fixed / Docked Bottom Composer for active conversation: Normal flex item */}
          <ChatComposer
            onSend={handleSendMessage}
            isSubmitting={isSubmitting}
            onStop={handleStop}
            attachment={attachment}
            onAttachClick={() => fileInputRef.current?.click()}
            onRemoveAttachment={removeAttachment}
            uploadError={uploadError}
            onDismissUploadError={() => setUploadError("")}
            language={language}
          />
        </>
      )}
    </div>
  );
}
