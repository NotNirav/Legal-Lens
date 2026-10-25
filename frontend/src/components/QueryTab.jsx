import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Square, Paperclip, X, FileText, 
  RotateCcw, Scale, AlertCircle, AlertTriangle, Shield, 
  Copy, Check, Printer, ChevronDown, Clock, ExternalLink,
  Sparkles, CheckCircle2
} from 'lucide-react';
import { askStream, askDocument, getStates, reviewAnswer, cancelActiveStream } from '../lib/api';
import SafeMarkdown from '../lib/SafeMarkdown';
import { translations } from '../data/translations';
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

export default function QueryTab({ 
  prefillQuestion, 
  clearPrefill, 
  prefillAttachment, 
  clearPrefillAttachment, 
  language = 'en',
  setLanguage,
  _hasDemoParam = false,
  isDemoModeActive = false,
  setIsDemoModeActive,
  selectedState = 'Maharashtra',
  setSelectedState
}) {
  const t = translations[language] || translations.en;
  const exampleQuestions = language === 'hi' ? EXAMPLE_QUESTIONS_HI : EXAMPLE_QUESTIONS_EN;

  // Scroll & stream control refs
  const chatScrollContainerRef = useRef(null);
  const userScrolledUpRef = useRef(false);
  const tokenBufferRef = useRef('');
  const lastFlushTimeRef = useRef(0);
  const rafIdRef = useRef(null);
  const activeAssistantMsgIdRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const streamHandleRef = useRef(null);
  const stateDropdownRef = useRef(null);

  // States
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState(prefillQuestion || "");
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

  // Chat scroll listener: don't fight user if they scrolled up to read earlier citations
  const handleChatScroll = () => {
    const el = chatScrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 80;
  };

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSubmitting]);

  // Clean up in-flight streams on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (streamHandleRef.current) streamHandleRef.current.abort();
      cancelActiveStream();
    };
  }, []);

  const handleSelectState = (stName) => {
    if (setSelectedState) setSelectedState(stName);
    localStorage.setItem('legal_lens_selected_state', stName);
    setIsStateDropdownOpen(false);
    setStateSearchTerm("");
  };

  const handleTagClick = (tag) => {
    setHighlightedTag(tag);
    const targetEl = document.getElementById(`source-card-${tag}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
      setHighlightedTag((curr) => (curr === tag ? null : curr));
    }, 2500);
  };

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

  const handleRetry = (failedMsg) => {
    const queryToRetry = failedMsg?.query;
    if (!queryToRetry) return;
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
    handleSendMessage(queryToRetry);
  };

  const handleSendMessage = async (textToSend = null) => {
    if (isSubmitting) return;

    const messageText = (textToSend !== null ? textToSend : inputValue).trim();
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
    userScrolledUpRef.current = false;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    setMessages((prev) => [...prev, userEntry, assistantEntry]);
    setInputValue("");
    setAttachment(null);
    setAttachmentPreviewUrl(null);
    setIsSubmitting(true);
    setUploadError("");

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
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleResetChat = () => {
    if (streamHandleRef.current) {
      streamHandleRef.current.abort();
      streamHandleRef.current = null;
    }
    cancelActiveStream();
    setIsSubmitting(false);
    setMessages([]);
    setInputValue("");
    setAttachment(null);
    setAttachmentPreviewUrl(null);
    setUploadError("");
  };

  const copyBriefToClipboard = (msg) => {
    if (!msg || !msg.text) return;
    const textToCopy = `LEGAL LENS SUMMARY\nJurisdiction: ${msg.state || selectedState}\n\n${msg.text}\n\nDisclaimer: A plain-language guide to your legal rights. Not legal advice.`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper for source card left border type color
  const getSourceBorderType = (s) => {
    const tag = (s.tag || '').toUpperCase();
    if (tag.startsWith('[C') || (s.citation || '').toLowerCase().includes('constitution')) return 'type-constitution';
    if (tag.startsWith('[L') || (s.jurisdiction || '').toLowerCase() === 'india') return 'type-central';
    if (tag.startsWith('[S')) return 'type-state';
    if (tag.startsWith('[W') || s.url) return 'type-web';
    return 'type-central';
  };

  const filteredStates = statesList.filter(s =>
    s.jurisdiction.toLowerCase().includes(stateSearchTerm.toLowerCase().trim())
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="query-workspace-page">
      <div className="chat-centered-column">

        {/* Empty State when no conversation has started */}
        {!hasMessages && (
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
            <div className="empty-state-dock-card">
              {attachment && (
                <div className="dock-staged-attachment">
                  <FileText size={14} className="text-blue" />
                  <span className="dock-attachment-name">{attachment.name}</span>
                  <button 
                    type="button" 
                    className="dock-remove-attachment" 
                    onClick={removeAttachment}
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
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Legal question input"
                />

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,.pdf,.txt"
                  style={{ display: 'none' }}
                  id="query-empty-file-input"
                />

                <button
                  type="button"
                  className={`dock-tool-btn dock-attach-btn ${attachment ? 'has-file' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach eviction notice, letter, or bill image"
                  aria-label="Attach document image"
                >
                  <Paperclip size={18} />
                </button>

                <button
                  type="button"
                  className="dock-tool-btn dock-send-btn"
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim() && !attachment}
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
                    <span>Jurisdiction: <strong>{selectedState}</strong></span>
                    <ChevronDown size={12} className={`chevron ${isStateDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isStateDropdownOpen && (
                    <div className="dock-state-dropdown animate-popover" role="listbox">
                      <div className="dock-state-search-wrap">
                        <input
                          type="text"
                          className="state-quick-search-input"
                          placeholder="Search 36 States &amp; UTs..."
                          value={stateSearchTerm}
                          onChange={(e) => setStateSearchTerm(e.target.value)}
                          autoFocus
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
                            <span>{st.jurisdiction}</span>
                            <span className="state-note-sub">{st.covered ? 'State laws indexed' : 'Central law only'}</span>
                            {st.jurisdiction === selectedState && <Check size={12} className="ml-auto" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <span className="dock-state-hint">
                  Statutes and constitutional rights applied
                </span>
              </div>
            </div>

            {/* 4 Clickable Example-Question Chips (EN or HI according to language) */}
            <div className="hero-chips-container" role="region" aria-label="Example legal inquiries">
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

            {/* Trust Strip with 3 Small Items */}
            <div className="hero-trust-strip" aria-label="Trust indicators">
              <div className="trust-strip-item">
                <span className="css-shape-mark shape-square" aria-hidden="true" />
                <span>Cited from real laws</span>
              </div>
              <div className="trust-strip-sep" aria-hidden="true">·</div>
              <div className="trust-strip-item">
                <span className="css-shape-mark shape-circle" aria-hidden="true" />
                <span>Hindi &amp; English</span>
              </div>
              <div className="trust-strip-sep" aria-hidden="true">·</div>
              <div className="trust-strip-item">
                <span className="css-shape-mark shape-triangle" aria-hidden="true" />
                <span>Not legal advice</span>
              </div>
            </div>
          </div>
        )}

        {/* Demo Mode Tray if active */}
        {isDemoModeActive && (
          <div className="golden-demo-tray" role="region" aria-label="Demo Questions Tray">
            <div className="golden-demo-header">
              <div className="golden-demo-title-group">
                <Sparkles size={14} className="sparkle-gold" />
                <strong className="golden-demo-title">Golden Questions (1-Click Test)</strong>
              </div>
              <div className="golden-demo-filter-pills">
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

            <div className="golden-demo-grid">
              {GOLDEN_DEMO_QUESTIONS
                .filter(gq => {
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

        {/* Active Conversation Thread */}
        {hasMessages && (
          <div className="chat-thread-container" ref={chatScrollContainerRef} onScroll={handleChatScroll}>
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

            {/* Message Stream */}
            <div className="thread-messages-list">
              {messages.map((msg) => (
                <div key={msg.id} className={`thread-row row-${msg.sender}`}>
                  {/* User Question: Small Right-Aligned Pill */}
                  {msg.sender === 'user' ? (
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
                  ) : (
                    /* Assistant Answer: White Card with Answering For label on top */
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
                            onClick={() => copyBriefToClipboard(msg)}
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
                            onClick={handlePrint}
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
                          {/* Three-step progress line */}
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

                          {/* Skeleton placeholder while first tokens arrive */}
                          {!msg.text && (
                            <div className="skeleton-placeholder-block" aria-hidden="true">
                              <div className="skeleton-line skeleton-short" />
                              <div className="skeleton-line skeleton-full" />
                              <div className="skeleton-line skeleton-mid" />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Real Error Notice Banner */}
                      {msg.error && (
                        <div className="calm-notice-banner notice-error" role="alert">
                          <AlertCircle size={16} className="notice-icon" />
                          <div className="notice-content">
                            <strong className="notice-title">Unable to complete query</strong>
                            <p className="notice-text">{msg.error.message}</p>
                            <button
                              type="button"
                              className="notice-retry-btn"
                              onClick={() => handleRetry(msg)}
                              aria-label="Retry question"
                            >
                              <RotateCcw size={12} />
                              <span>Retry Question</span>
                            </button>
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

                      {/* Low Confidence Notice Banner */}
                      {msg.anyConfident === false && (
                        <div className="calm-notice-banner notice-amber" role="alert">
                          <AlertCircle size={15} className="notice-icon" />
                          <span>We could not find an exact match in state statutes; here is the closest central legal provision. Consider consulting free legal aid via NALSA (15100).</span>
                        </div>
                      )}

                      {/* Answer Body via SafeMarkdown (first paragraph styled as callout) */}
                      {msg.text && (
                        <div className="card-answer-content" aria-live="polite">
                          <SafeMarkdown
                            content={msg.text}
                            availableTags={msg.sourcesCited && msg.sourcesCited.length > 0 ? msg.sourcesCited.map(s => s.tag) : (msg.retrievedSources ? msg.retrievedSources.map(s => s.tag) : null)}
                            onTagClick={handleTagClick}
                          />
                        </div>
                      )}

                      {/* Sources Panel: Cards with colored left edge by type */}
                      {!msg.isStreaming && msg.sourcesCited && msg.sourcesCited.length > 0 && (
                        <section className="sources-panel-section" aria-label="Cited legal authorities">
                          <div className="sources-panel-header">
                            <div className="sources-header-left">
                              <Scale size={14} className="text-muted" />
                              <h4 className="sources-heading">Cited Legal Authorities ({msg.sourcesCited.length})</h4>
                            </div>

                            {/* Mobile collapse toggle button */}
                            <button
                              type="button"
                              className="mobile-sources-toggle-btn"
                              onClick={() => setMobileSourcesOpen(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
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
                                          onClick={() =>
                                            setExpandedSources(prev => ({
                                              ...prev,
                                              [`${msg.id}-${s.tag}`]: !prev[`${msg.id}-${s.tag}`],
                                            }))
                                          }
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

                      {/* Second-Model Review Audit Card: Shown UNDER the Sources */}
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
                                      onClick={() => handleTagClick(cl.tag)}
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
                            onClick={() => setOpenTraces(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
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
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Fixed / Docked Bottom Composer for active conversation */}
            <div className="active-thread-composer-dock">
              {attachment && (
                <div className="dock-staged-attachment">
                  <FileText size={14} className="text-blue" />
                  <span className="dock-attachment-name">{attachment.name}</span>
                  <button 
                    type="button" 
                    className="dock-remove-attachment" 
                    onClick={removeAttachment}
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
                  <button type="button" onClick={() => setUploadError("")} aria-label="Dismiss error">✕</button>
                </div>
              )}

              <div className="thread-composer-inner">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,.pdf,.txt"
                  style={{ display: 'none' }}
                  id="query-thread-file-input"
                />

                <button
                  type="button"
                  className={`dock-tool-btn dock-attach-btn ${attachment ? 'has-file' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach document or notice image"
                  aria-label="Attach document or notice photo"
                  disabled={isSubmitting}
                >
                  <Paperclip size={18} />
                </button>

                <textarea
                  className="thread-composer-textarea"
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isSubmitting
                      ? "Writing verified legal answer..."
                      : "Ask a follow-up question in plain language..."
                  }
                  aria-label="Follow-up question"
                />

                {isSubmitting ? (
                  <button
                    type="button"
                    className="dock-tool-btn dock-stop-btn"
                    onClick={handleStop}
                    title="Stop generating"
                    aria-label="Stop generating response"
                  >
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dock-tool-btn dock-send-btn"
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() && !attachment}
                    aria-label="Send follow-up question"
                    title="Send question"
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
