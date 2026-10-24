import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Paperclip, X, FileText, 
  RotateCcw, Scale, AlertCircle, Shield, 
  Building2, Phone, ExternalLink, CheckCircle2,
  Sparkles, Copy, Check, Printer, Image as ImageIcon,
  PhoneCall, ShieldCheck, Download, ChevronRight, Key, Settings
} from 'lucide-react';
import { queryLegalAssistant } from '../services/ragService';
import { translations } from '../data/translations';

let messageCounter = 100;
const getUniqueId = (prefix) => `${prefix}_${++messageCounter}_${Date.now()}`;
const getFormattedTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function QueryTab({ 
  prefillQuestion, 
  clearPrefill, 
  prefillAttachment, 
  clearPrefillAttachment, 
  language = 'en' 
}) {
  const t = translations[language] || translations.en;

  const [apiKey, setApiKey] = useState(() => {
    return sessionStorage.getItem('user_gemini_api_key') || localStorage.getItem('user_gemini_api_key') || '';
  });
  const [isKeyDrawerOpen, setIsKeyDrawerOpen] = useState(false);
  const [tempKeyInput, setTempKeyInput] = useState(apiKey);
  const [keySaveMessage, setKeySaveMessage] = useState("");

  const handleSaveApiKey = () => {
    const cleanKey = tempKeyInput.trim();
    if (cleanKey) {
      sessionStorage.setItem('user_gemini_api_key', cleanKey);
      localStorage.setItem('user_gemini_api_key', cleanKey);
      setApiKey(cleanKey);
      setKeySaveMessage("Gemini key active!");
      setTimeout(() => {
        setKeySaveMessage("");
        setIsKeyDrawerOpen(false);
      }, 1200);
    }
  };

  const handleClearApiKey = () => {
    sessionStorage.removeItem('user_gemini_api_key');
    localStorage.removeItem('user_gemini_api_key');
    setApiKey('');
    setTempKeyInput('');
    setKeySaveMessage("Key removed. Switched to Grounded Local Engine.");
    setTimeout(() => {
      setKeySaveMessage("");
      setIsKeyDrawerOpen(false);
    }, 1200);
  };

  const [messages, setMessages] = useState([
    {
      id: "initial_welcome",
      sender: "assistant",
      timestamp: "10:00 AM",
      text: null,
      sourceType: "Google Gemma 4 (26B-A4B-IT) + Hybrid Legal RAG",
      data: {
        whatThisMeans: "Welcome to Legal-Lens Gemma 4 Counsel. Powered by Google Gemma 4 (26B-A4B-IT) with direct grounding in the Constitution of India and 1,104 Supreme Court landmark holdings. I explain your legal protections in plain language without expensive attorney retainers. Type your dilemma below or attach an eviction notice, employment letter, or invoice.",
        possibleRights: [
          "Protection from arbitrary state or contractual action (Constitution of India, Article 14 & Article 21)",
          "Mandatory registration of cognizable offenses via Zero FIR (Lalita Kumari v. Govt of UP)",
          "Protection against unilateral wage retention (Payment of Wages Act, Section 15)",
          "Statutory 45-day payment recovery with 3x RBI compound interest for MSMEs (MSMED Act 2006)",
          "Right to refund/replacement for defective goods & services (Consumer Protection Act 2019)"
        ],
        nextSteps: [
          "Describe your situation in 2-3 sentences or pick one of the common scenarios below.",
          "If you have an official notice or agreement, attach it using the paperclip button (remember to mask confidential Aadhaar/PAN numbers).",
          "Review the structured legal rights, statutory references, and direct government complaint links provided."
        ],
        whereToGetHelp: [
          { name: "National Legal Services Authority (NALSA)", details: "Call 15100 for 24x7 free legal aid under Art. 39A", type: "Helpline", url: "https://nalsa.gov.in" },
          { name: "National Cyber Crime Helpline", details: "Call 1930 for online fraud & financial scam recovery", type: "Helpline", url: "https://cybercrime.gov.in" },
          { name: "National Consumer Helpline", details: "Call 1915 for consumer disputes & refund refusals", type: "Helpline", url: "https://consumerhelpline.gov.in" }
        ],
        sources: [
          { title: "Constitution of India", ref: "Articles 14, 21, and 39A (Free Legal Aid to Citizens)" },
          { title: "Supreme Court Landmark Holding", ref: "Lalita Kumari v. Govt of UP (Mandatory FIR registration)" }
        ],
        followUpQuestions: [
          "My landlord is refusing to return my security deposit without showing repair receipts.",
          "My company abruptly withheld my final settlement salary after I resigned with notice.",
          "The police station refused to register my complaint citing territorial jurisdiction."
        ]
      }
    }
  ]);

  const [inputValue, setInputValue] = useState(prefillQuestion || "");
  const [prevPrefill, setPrevPrefill] = useState(prefillQuestion);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachment, setAttachment] = useState(prefillAttachment || null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState(null);
  const [prevPrefillAttach, setPrevPrefillAttach] = useState(prefillAttachment);
  const [uploadError, setUploadError] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Sync prefill prop during render
  if (prefillQuestion && prefillQuestion !== prevPrefill) {
    setPrevPrefill(prefillQuestion);
    setInputValue(prefillQuestion);
    if (clearPrefill) clearPrefill();
  }

  if (prefillAttachment && prefillAttachment !== prevPrefillAttach) {
    setPrevPrefillAttach(prefillAttachment);
    setAttachment(prefillAttachment);
    if (clearPrefillAttachment) clearPrefillAttachment();
  }

  // Generate thumbnail URL for image attachments
  useEffect(() => {
    if (attachment && attachment.file && attachment.file.type.startsWith('image/')) {
      const url = URL.createObjectURL(attachment.file);
      setAttachmentPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAttachmentPreviewUrl(null);
    }
  }, [attachment]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSubmitting]);

  // Handle file attachment
  const handleFileChange = (e) => {
    setUploadError("");
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File exceeds 10MB limit. Please upload a smaller image or document.");
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
    if (!validTypes.includes(file.type)) {
      setUploadError("Unsupported format. Please upload JPG, PNG, WEBP, or PDF.");
      return;
    }

    const formatSize = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    setAttachment({
      file: file,
      name: file.name,
      size: formatSize(file.size),
      type: file.type,
      isImage: file.type.startsWith('image/')
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentPreviewUrl(null);
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendMessage = async (textToSend = null) => {
    const messageText = (textToSend !== null ? textToSend : inputValue).trim();
    if (!messageText && !attachment) return;

    const userMessageId = getUniqueId("user_msg");
    const currentAttachment = attachment ? { ...attachment, previewUrl: attachmentPreviewUrl } : null;

    const newMessages = [
      ...messages,
      {
        id: userMessageId,
        sender: "user",
        timestamp: getFormattedTime(),
        text: messageText || "Please analyze this attached legal document.",
        attachment: currentAttachment
      }
    ];

    setMessages(newMessages);
    setInputValue("");
    setAttachment(null);
    setAttachmentPreviewUrl(null);
    setIsSubmitting(true);
    setUploadError("");

    try {
      const responseData = await queryLegalAssistant({
        message: messageText || "Please analyze this attached legal document.",
        attachment: currentAttachment,
        language: language,
        userApiKey: apiKey
      });

      const assistantMessageId = getUniqueId("assistant_msg");
      setMessages([
        ...newMessages,
        {
          id: assistantMessageId,
          sender: "assistant",
          timestamp: getFormattedTime(),
          text: null,
          sourceType: responseData.sourceType || "Google Gemma 4 (26B-A4B-IT) + Hybrid RAG",
          data: responseData
        }
      ]);
    } catch (err) {
      console.error("Inquiry failed", err);
      const errorMessageId = getUniqueId("error_msg");
      setMessages([
        ...newMessages,
        {
          id: errorMessageId,
          sender: "assistant",
          timestamp: getFormattedTime(),
          isError: true,
          text: "An error occurred while analyzing statutory databases. Please check your query or verify network connectivity."
        }
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleResetChat = () => {
    setMessages([messages[0]]);
    setInputValue("");
    setAttachment(null);
    setAttachmentPreviewUrl(null);
    setUploadError("");
  };

  const copyDossierToClipboard = (msg) => {
    if (!msg || !msg.data) return;
    const { whatThisMeans, possibleRights, nextSteps, sources } = msg.data;
    
    let textToCopy = `LEGAL-LENS COUNSEL BRIEF (Article 39A Public Legal Literacy)\n`;
    textToCopy += `Engine: ${msg.sourceType || "Google Gemma 4 + Indian Legal Corpus"}\n\n`;
    textToCopy += `1. EXECUTIVE SUMMARY:\n${whatThisMeans}\n\n`;
    textToCopy += `2. YOUR STATUTORY RIGHTS:\n${(possibleRights || []).map(r => `• ${r}`).join('\n')}\n\n`;
    textToCopy += `3. IMMEDIATE NEXT STEPS:\n${(nextSteps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n`;
    textToCopy += `4. GROUNDED LEGAL SOURCES:\n${(sources || []).map(s => `• ${s.title}: ${s.ref}`).join('\n')}\n\n`;
    textToCopy += `Note: General legal educational awareness under Article 39A of the Constitution of India. For representation, dial NALSA 15100.`;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  const handlePrintBrief = () => {
    window.print();
  };

  const sampleQuestions = [
    "My landlord deducted ₹30,000 from my deposit without any repair bills.",
    "My employer withheld my last 2 months' salary after I resigned with notice.",
    "A police officer refused to register a Zero FIR for a stolen laptop.",
    "Corporate buyer is delaying my MSME invoice payment beyond 45 days.",
    "E-commerce website refuses to refund or exchange a defective delivered phone."
  ];

  return (
    <div className="query-view-wrapper gemma-counsel-view">
      <div className="container">
        {/* Highlighted Crown Jewel Header */}
        <header className="editorial-header-row query-main-header">
          <div className="query-header-flex">
            <div>
              <div className="editorial-tag-wrap">
                <span className="editorial-tag-sub">Gemma 4 (26B-A4B-IT) + Grounded Legal RAG</span>
              </div>
              <h1 className="editorial-h2">
                Legal-Lens <span className="editorial-italic">Gemma 4 Counsel</span>
              </h1>
              <p className="editorial-lead">
                Grounded multimodal legal analysis for Indian citizens, tenants, workers, and MSMEs. Cross-referencing 503 Constitutional articles, 1,104 Supreme Court holdings, and state statutes in plain language.
              </p>
            </div>

            {/* Quick Engine Status & Key Switcher in Header */}
            <div className="query-header-actions">
              <button 
                type="button" 
                className={`api-key-status-badge ${apiKey ? 'is-active' : ''}`}
                onClick={() => setIsKeyDrawerOpen(prev => !prev)}
                title="Click to configure Gemini API Key"
              >
                <Key size={14} className={apiKey ? "icon-emerald" : "icon-gold"} />
                <span>{apiKey ? "Gemini 2.0 Flash Live" : "Grounded Engine (Zero Setup)"}</span>
                <Settings size={13} className="ml-1 opacity-70" />
              </button>
            </div>
          </div>
        </header>

        {/* Two-Column Interactive Workspace */}
        <div className="query-two-col-layout">
          {/* Left: Engine Context & Prompt Starters Sidebar */}
          <aside className="query-sidebar-panel" aria-label="Assistant context and shortcuts">
            {/* AI Engine Status & Key Config Card */}
            <div className="sidebar-block api-config-card">
              <div className="api-config-header">
                <div className="assistant-status-indicator">
                  <span className={`status-live-dot ${apiKey ? 'dot-gemini' : 'dot-grounded'}`}></span>
                  <span className="status-live-text">
                    {apiKey ? "Gemini 2.0 Flash Active" : "Grounded Indian Law Engine"}
                  </span>
                </div>
              </div>
              
              <p className="sidebar-description">
                {apiKey 
                  ? "Live multimodal generative reasoning enabled via Google Gemini API." 
                  : "Zero-hallucination grounded mode with 503 Constitutional Articles & 1,104 Supreme Court holdings (No key required)."}
              </p>

              <button 
                type="button" 
                className="btn btn-outline btn-sm w-full key-drawer-toggle"
                onClick={() => setIsKeyDrawerOpen(!isKeyDrawerOpen)}
              >
                <Key size={13} />
                <span>{apiKey ? "Manage Gemini Key" : "Configure Gemini API Key"}</span>
              </button>

              {isKeyDrawerOpen && (
                <div className="api-key-popover-box animate-popover">
                  <label htmlFor="gemini-key-input" className="api-key-label">
                    Google Gemini API Key
                  </label>
                  <input
                    id="gemini-key-input"
                    type="password"
                    className="api-key-input-field"
                    placeholder="Enter AIzaSy..."
                    value={tempKeyInput}
                    onChange={(e) => setTempKeyInput(e.target.value)}
                  />
                  <div className="api-key-btn-cluster">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm flex-1"
                      onClick={handleSaveApiKey}
                      disabled={!tempKeyInput.trim()}
                    >
                      Save Key
                    </button>
                    {apiKey && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-clear-key"
                        onClick={handleClearApiKey}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {keySaveMessage && (
                    <span className="key-save-feedback">{keySaveMessage}</span>
                  )}
                  <p className="api-key-note">
                    Keys are kept strictly in your local browser session and never sent to our servers.
                  </p>
                </div>
              )}

              <button 
                type="button" 
                className="btn btn-outline btn-sm w-full new-chat-action-btn mt-2"
                onClick={handleResetChat}
              >
                <RotateCcw size={14} />
                <span>{t.newChat}</span>
              </button>
            </div>

            {/* Quick Everyday Situations */}
            <div className="sidebar-block">
              <span className="sidebar-block-title">Common Legal Inquiries</span>
              <div className="sidebar-prompts-list">
                {sampleQuestions.map((sq, i) => (
                  <button
                    key={i}
                    type="button"
                    className="sidebar-prompt-item"
                    onClick={() => handleSendMessage(sq)}
                  >
                    <ChevronRight size={14} className="prompt-arrow-icon" />
                    <span>{sq}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Document Scan Guidance */}
            <div className="sidebar-block doc-guidance-card">
              <div className="privacy-card-top">
                <FileText size={16} className="text-blue" />
                <span className="privacy-card-heading">Attachable Documents</span>
              </div>
              <p className="privacy-card-text">
                Attach eviction notices, employment exit letters, rent agreements, or consumer bills. Gemma 4 reads document text &amp; images to highlight notice violations.
              </p>
              <div className="privacy-card-top mt-2">
                <Shield size={16} className="privacy-card-icon" />
                <span className="privacy-card-heading">Privacy Reminder</span>
              </div>
              <p className="privacy-card-text">
                Please mask Aadhaar, PAN, or bank account numbers before uploading. We only process legal clauses.
              </p>
            </div>
          </aside>

          {/* Right: Rich Chat Thread & Dossier Window */}
          <section className="query-chat-window" aria-label="Legal Dossier Thread">
            {/* Messages Scroll Area */}
            <div className="query-messages-stream">
              {messages.map((msg) => (
                <div key={msg.id} className={`query-msg-row ${msg.sender}-msg-row`}>
                  {msg.sender === 'user' ? (
                    <div className="minimal-user-bubble">
                      {/* Attached Document / Image Card in User Message */}
                      {msg.attachment && (
                        <div className="user-staged-attachment-pill">
                          {msg.attachment.previewUrl ? (
                            <div className="user-thumb-wrap">
                              <img 
                                src={msg.attachment.previewUrl} 
                                alt={msg.attachment.name} 
                                className="user-msg-thumb" 
                              />
                            </div>
                          ) : (
                            <FileText size={16} className="text-blue" />
                          )}
                          <div className="user-thumb-meta">
                            <span className="attached-filename">{msg.attachment.name}</span>
                            <span className="attached-filesize">({msg.attachment.size}) · Document Attached</span>
                          </div>
                        </div>
                      )}
                      {msg.text && <p className="user-message-text">{msg.text}</p>}
                      <span className="message-time-stamp">{msg.timestamp}</span>
                    </div>
                  ) : (
                    <div className="minimal-assistant-response">
                      {msg.isError ? (
                        <div className="assistant-error-banner" role="alert">
                          <AlertCircle size={18} />
                          <p>{msg.text}</p>
                        </div>
                      ) : (
                        <div className="assistant-structured-frame">
                          {/* Top Model Badge Strip */}
                          <div className="dossier-model-strip">
                            <div className="dossier-badge">
                              <Sparkles size={13} className="sparkle-gold" />
                              <span>{msg.sourceType || "Google Gemma 4 (26B-A4B-IT) + Hybrid RAG"}</span>
                            </div>

                            <div className="dossier-actions-cluster">
                              <button
                                type="button"
                                className="dossier-tool-btn"
                                onClick={() => copyDossierToClipboard(msg)}
                                title="Copy Legal Dossier to Clipboard"
                              >
                                {copiedId === msg.id ? (
                                  <>
                                    <Check size={14} className="text-emerald" />
                                    <span className="text-emerald">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={14} />
                                    <span>Copy Brief</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                className="dossier-tool-btn"
                                onClick={handlePrintBrief}
                                title="Print or Save Formatted PDF Brief"
                              >
                                <Printer size={14} />
                                <span>Print Brief</span>
                              </button>
                            </div>
                          </div>

                          {/* Part 1: Executive Assessment */}
                          <div className="dossier-part-block">
                            <div className="dossier-part-header">
                              <Scale size={16} className="dossier-header-icon icon-gold" />
                              <h4 className="dossier-part-title">{t.whatThisMeans}</h4>
                            </div>
                            <p className="dossier-body-text">{msg.data.whatThisMeans}</p>
                          </div>

                          {/* Part 2: Possible Rights */}
                          <div className="dossier-part-block">
                            <div className="dossier-part-header">
                              <Shield size={16} className="dossier-header-icon icon-emerald" />
                              <h4 className="dossier-part-title">{t.possibleRights}</h4>
                            </div>
                            <ul className="dossier-rights-list">
                              {msg.data.possibleRights.map((item, idx) => (
                                <li key={idx} className="dossier-rights-item">
                                  <CheckCircle2 size={16} className="rights-check-icon" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Part 3: Next Steps */}
                          <div className="dossier-part-block">
                            <div className="dossier-part-header">
                              <CheckCircle2 size={16} className="dossier-header-icon icon-blue" />
                              <h4 className="dossier-part-title">{t.nextSteps}</h4>
                            </div>
                            <ol className="dossier-steps-ordered">
                              {msg.data.nextSteps.map((step, idx) => (
                                <li key={idx} className="dossier-step-row">
                                  <span className="step-counter-circle">{idx + 1}</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>

                          {/* Part 4: Where to Get Help */}
                          <div className="dossier-part-block">
                            <div className="dossier-part-header">
                              <Building2 size={16} className="dossier-header-icon icon-amber" />
                              <h4 className="dossier-part-title">{t.whereToGetHelp}</h4>
                            </div>
                            <div className="dossier-portals-grid">
                              {msg.data.whereToGetHelp.map((channel, idx) => (
                                <div key={idx} className="dossier-portal-card">
                                  <div className="portal-header-line">
                                    {channel.type === 'Helpline' ? <Phone size={14} className="portal-icon" /> : <Building2 size={14} className="portal-icon" />}
                                    <strong className="portal-title">{channel.name}</strong>
                                  </div>
                                  <p className="portal-details-text">{channel.details}</p>
                                  {channel.url && (
                                    <a href={channel.url} target="_blank" rel="noopener noreferrer" className="portal-direct-link">
                                      <span>Access Official Portal</span>
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Part 5: Verified Sources */}
                          <div className="dossier-part-block sources-dossier-block">
                            <div className="dossier-part-header">
                              <FileText size={16} className="dossier-header-icon icon-navy" />
                              <h4 className="dossier-part-title">{t.supportingSources}</h4>
                            </div>
                            <div className="dossier-sources-cluster">
                              {msg.data.sources.map((src, idx) => (
                                <div key={idx} className="dossier-source-item">
                                  <Scale size={14} className="source-item-scale" />
                                  <span><strong>{src.title}</strong> — {src.ref}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Follow-up Question Chips */}
                          {msg.data.followUpQuestions && msg.data.followUpQuestions.length > 0 && (
                            <div className="structured-followup-tray">
                              <span className="followup-title-label">Suggested follow-ups:</span>
                              <div className="followup-chips-wrap">
                                {msg.data.followUpQuestions.map((q, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    className="minimal-followup-chip"
                                    onClick={() => handleSendMessage(q)}
                                  >
                                    <span>{q}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <span className="message-time-stamp">{msg.timestamp}</span>
                    </div>
                  )}
                </div>
              ))}

              {isSubmitting && (
                <div className="query-msg-row assistant-msg-row">
                  <div className="minimal-assistant-response">
                    <div className="assistant-loading-card">
                      <div className="minimal-typing-dots">
                        <span></span><span></span><span></span>
                      </div>
                      <span className="loading-status-text">
                        Gemma 4 analyzing Indian statutes &amp; Supreme Court precedents...
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Staged Attachment Preview Tray */}
            {attachment && (
              <div className="staged-attachment-bar">
                {attachmentPreviewUrl ? (
                  <div className="staged-img-thumb-wrap">
                    <img src={attachmentPreviewUrl} alt="Thumbnail preview" className="staged-thumb-img" />
                  </div>
                ) : (
                  <FileText size={20} className="staged-icon" />
                )}
                <div className="staged-file-info">
                  <span className="staged-filename">{attachment.name}</span>
                  <span className="staged-filesize">{attachment.size} · Ready for Gemma 4 scanning</span>
                </div>
                <button 
                  type="button" 
                  className="remove-attachment-btn" 
                  onClick={removeAttachment} 
                  aria-label="Remove attached file"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Upload Error Notice */}
            {uploadError && (
              <div className="upload-error-inline" role="alert">
                <AlertCircle size={16} />
                <span>{uploadError}</span>
                <button type="button" onClick={() => setUploadError("")} aria-label="Dismiss error">✕</button>
              </div>
            )}

            {/* Composer Input Area */}
            <div className="query-composer-dock">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                style={{ display: 'none' }}
                id="assistant-file-upload"
              />

              <div className="composer-input-row">
                <button
                  type="button"
                  className={`composer-clip-btn ${attachment ? 'has-file' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach Notice, Agreement, or Receipt (JPG, PNG, PDF)"
                  aria-label="Attach Document"
                >
                  <Paperclip size={20} />
                </button>

                <textarea
                  ref={textareaRef}
                  className="composer-textarea"
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={attachment ? "Ask a specific question about this document, or hit Send..." : "Describe your legal situation or dispute in natural language..."}
                  aria-label="Describe your legal dispute"
                />

                <button
                  type="button"
                  className="composer-send-btn"
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim() && !attachment}
                  aria-label="Send Inquiry to Gemma 4"
                >
                  <Send size={18} />
                </button>
              </div>

              <div className="composer-sub-notice">
                <span>Article 39A Public Legal Awareness Counsel · Powered by Google Gemma 4 (26B-A4B-IT) · Not attorney representation.</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
