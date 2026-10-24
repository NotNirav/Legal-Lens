import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Square, Paperclip, X, FileText, 
  RotateCcw, Scale, AlertCircle, AlertTriangle, Shield, 
  Building2, Phone, ExternalLink, CheckCircle2,
  Sparkles, Copy, Check, Printer, ChevronRight, Key, Settings,
  MapPin, Search, ChevronDown, Clock
} from 'lucide-react';
import { askStream, askDocument, getStates, reviewAnswer, cancelActiveStream } from '../lib/api';
import SafeMarkdown from '../lib/SafeMarkdown';
import { translations } from '../data/translations';
import { GOLDEN_DEMO_QUESTIONS } from '../data/goldenQuestions';

const DEFAULT_INDIAN_STATES = [
  { jurisdiction: "Maharashtra", covered: true, note: "State laws indexed" },
  { jurisdiction: "India", covered: true, note: "All-India Central Law & Constitution" },
  { jurisdiction: "Andhra Pradesh", covered: false, note: "Central law only" },
  { jurisdiction: "Arunachal Pradesh", covered: false, note: "Central law only" },
  { jurisdiction: "Assam", covered: false, note: "Central law only" },
  { jurisdiction: "Bihar", covered: false, note: "Central law only" },
  { jurisdiction: "Chhattisgarh", covered: false, note: "Central law only" },
  { jurisdiction: "Delhi", covered: false, note: "Central law only" },
  { jurisdiction: "Goa", covered: false, note: "Central law only" },
  { jurisdiction: "Gujarat", covered: false, note: "Central law only" },
  { jurisdiction: "Haryana", covered: false, note: "Central law only" },
  { jurisdiction: "Himachal Pradesh", covered: false, note: "Central law only" },
  { jurisdiction: "Jharkhand", covered: false, note: "Central law only" },
  { jurisdiction: "Karnataka", covered: false, note: "Central law only" },
  { jurisdiction: "Kerala", covered: false, note: "Central law only" },
  { jurisdiction: "Madhya Pradesh", covered: false, note: "Central law only" },
  { jurisdiction: "Manipur", covered: false, note: "Central law only" },
  { jurisdiction: "Meghalaya", covered: false, note: "Central law only" },
  { jurisdiction: "Mizoram", covered: false, note: "Central law only" },
  { jurisdiction: "Nagaland", covered: false, note: "Central law only" },
  { jurisdiction: "Odisha", covered: false, note: "Central law only" },
  { jurisdiction: "Punjab", covered: false, note: "Central law only" },
  { jurisdiction: "Rajasthan", covered: false, note: "Central law only" },
  { jurisdiction: "Sikkim", covered: false, note: "Central law only" },
  { jurisdiction: "Tamil Nadu", covered: false, note: "Central law only" },
  { jurisdiction: "Telangana", covered: false, note: "Central law only" },
  { jurisdiction: "Tripura", covered: false, note: "Central law only" },
  { jurisdiction: "Uttar Pradesh", covered: false, note: "Central law only" },
  { jurisdiction: "Uttarakhand", covered: false, note: "Central law only" },
  { jurisdiction: "West Bengal", covered: false, note: "Central law only" },
  { jurisdiction: "Andaman and Nicobar Islands", covered: false, note: "Central law only" },
  { jurisdiction: "Chandigarh", covered: false, note: "Central law only" },
  { jurisdiction: "Dadra and Nagar Haveli and Daman and Diu", covered: false, note: "Central law only" },
  { jurisdiction: "Jammu and Kashmir", covered: false, note: "Central law only" },
  { jurisdiction: "Ladakh", covered: false, note: "Central law only" },
  { jurisdiction: "Lakshadweep", covered: false, note: "Central law only" },
  { jurisdiction: "Puducherry", covered: false, note: "Central law only" }
];

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

export default function QueryTab({ 
  prefillQuestion, 
  clearPrefill, 
  prefillAttachment, 
  clearPrefillAttachment, 
  language = 'en',
  setLanguage,
  _hasDemoParam = false,
  isDemoModeActive = false,
  setIsDemoModeActive
}) {
  const t = translations[language] || translations.en;

  const [demoCategoryFilter, setDemoCategoryFilter] = useState('all');

  const handleToggleLanguage = (newLang) => {
    if (setLanguage) {
      setLanguage(newLang);
    }
    localStorage.setItem('legal_lens_language', newLang);
  };

  // Performance batching & scroll control refs
  const chatScrollContainerRef = useRef(null);
  const userScrolledUpRef = useRef(false);
  const tokenBufferRef = useRef('');
  const lastFlushTimeRef = useRef(0);
  const rafIdRef = useRef(null);
  const activeAssistantMsgIdRef = useRef(null);

  const [apiKey, setApiKey] = useState(() => {
    return sessionStorage.getItem('user_gemini_api_key') || localStorage.getItem('user_gemini_api_key') || '';
  });
  const [isKeyDrawerOpen, setIsKeyDrawerOpen] = useState(false);
  const [tempKeyInput, setTempKeyInput] = useState(apiKey);
  const [keySaveMessage, setKeySaveMessage] = useState("");

  // State / Jurisdiction selection
  const [statesList, setStatesList] = useState([]);
  const [selectedState, setSelectedState] = useState(() => {
    return localStorage.getItem('legal_lens_selected_state') || "Maharashtra";
  });
  const [isStateDropdownOpen, setIsStateDropdownOpen] = useState(false);
  const [stateSearchTerm, setStateSearchTerm] = useState("");
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState(null);
  const stateDropdownRef = useRef(null);

  // Task 4: Source highlight, text expansion & trace accordion state
  const [highlightedTag, setHighlightedTag] = useState(null);
  const [expandedSources, setExpandedSources] = useState({});
  const [openTraces, setOpenTraces] = useState({});

  // Handler for jumping to source card when a citation tag is clicked
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

  // Load available states from backend on mount
  useEffect(() => {
    let isMounted = true;
    getStates()
      .then((data) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setStatesList(data);
        }
      })
      .catch(() => {
        // Backend offline or loading; default list remains active
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Close searchable dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(event.target)) {
        setIsStateDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Persist selectedState changes to localStorage
  const handleSelectState = (stateName) => {
    setSelectedState(stateName);
    localStorage.setItem('legal_lens_selected_state', stateName);
    setIsStateDropdownOpen(false);
    setStateSearchTerm("");
  };

  // Detect location via GPS + OpenStreetMap Nominatim reverse geocoding
  const handleDetectLocation = () => {
    if (isDetectingLocation) return; // Guard: max one call per click

    if (!navigator.geolocation) {
      setLocationMessage({
        type: 'info',
        text: 'Geolocation is not supported by your browser.'
      });
      return;
    }

    setIsDetectingLocation(true);
    setLocationMessage({ type: 'info', text: 'Detecting your device coordinates…' });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&lat=${lat}&lon=${lon}&accept-language=en`;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const rawState = data.address?.state || data.address?.province || data.address?.state_district || '';
          
          // Case-insensitive, trim "State of" and trailing "State"
          const cleaned = rawState.replace(/^State of\s+/i, '').replace(/\s+State$/i, '').trim();

          if (!cleaned) {
            setLocationMessage({
              type: 'info',
              text: 'Could not determine state from location. Please pick from the dropdown.'
            });
            setIsDetectingLocation(false);
            return;
          }

          const availableStates = statesList.length > 0 ? statesList : DEFAULT_INDIAN_STATES;
          const cleanedLower = cleaned.toLowerCase();
          const matched = availableStates.find((s) => {
            const jurLower = s.jurisdiction.toLowerCase();
            return jurLower === cleanedLower || cleanedLower.includes(jurLower) || jurLower.includes(cleanedLower);
          });

          if (matched) {
            handleSelectState(matched.jurisdiction);
            setLocationMessage({
              type: 'success',
              text: `Detected location: ${matched.jurisdiction}`
            });
            setTimeout(() => setLocationMessage(null), 4000);
          } else {
            setLocationMessage({
              type: 'info',
              text: `Detected "${cleaned}", but no matching Indian state was found. Please select from dropdown.`
            });
          }
        } catch {
          setLocationMessage({
            type: 'info',
            text: 'Could not fetch location details. Please choose your state from the dropdown.'
          });
        } finally {
          setIsDetectingLocation(false);
        }
      },
      (geoErr) => {
        setIsDetectingLocation(false);
        if (geoErr.code === 1) {
          setLocationMessage({
            type: 'info',
            text: 'Location access was denied. Please select your state manually.'
          });
        } else {
          setLocationMessage({
            type: 'info',
            text: 'Unable to acquire location. Please pick your state from the dropdown.'
          });
        }
      },
      { timeout: 12000, enableHighAccuracy: false, maximumAge: 60000 }
    );
  };

  const activeStatesList = statesList.length > 0 ? statesList : DEFAULT_INDIAN_STATES;
  const currentSelectedStateObj = activeStatesList.find(
    (s) => s.jurisdiction.toLowerCase() === selectedState.toLowerCase()
  );
  const isCurrentStateCovered = currentSelectedStateObj ? currentSelectedStateObj.covered : true;
  const filteredStates = activeStatesList.filter((st) =>
    st.jurisdiction.toLowerCase().includes(stateSearchTerm.toLowerCase().trim())
  );

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
    setKeySaveMessage("Key removed. Using Grounded Backend Engine.");
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
        whatThisMeans: "Welcome to Legal-Lens Counsel. Powered by Google Gemma 4 (26B-A4B-IT) with direct grounding in the Constitution of India and 1,104 Supreme Court landmark holdings. I explain your legal protections in plain language without expensive attorney retainers. Type your dilemma below or attach an eviction notice, employment letter, or invoice.",
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
  const streamHandleRef = useRef(null);

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

  // Handle chat container scroll: do NOT fight the user if they scroll up to read earlier citations
  const handleChatScroll = () => {
    const el = chatScrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 75;
  };

  // Scroll to bottom on new messages only if the user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSubmitting]);

  // Clean up in-flight stream and animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (streamHandleRef.current) {
        streamHandleRef.current.abort();
      }
      cancelActiveStream();
    };
  }, []);

  // Handle file attachment with 8MB cap and client-side downscaling
  const handleFileChange = async (e) => {
    setUploadError("");
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    // Enforce 8 MB maximum size
    const MAX_BYTES = 8 * 1024 * 1024;
    if (rawFile.size > MAX_BYTES) {
      setUploadError("Image exceeds 8 MB limit. Please select an image under 8 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Enforce JPG, PNG, WEBP
    const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ext = rawFile.name.substring(rawFile.name.lastIndexOf('.')).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

    if (!allowedMime.includes(rawFile.type) && !allowedExts.includes(ext)) {
      setUploadError("Unsupported format. Please upload a JPG, PNG, or WEBP image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      // Downscale large image with canvas (longest side <= 1600px)
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

  // Stop button handler
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
          return {
            ...m,
            isStreaming: false,
            statusMessage: null,
          };
        }
        return m;
      })
    );
  };

  // Retry failed query handler
  const handleRetry = (failedMsg) => {
    const queryToRetry = failedMsg?.query;
    if (!queryToRetry) return;
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
    handleSendMessage(queryToRetry);
  };

  // Main inquiry dispatcher using askStream / askDocument
  const handleSendMessage = async (textToSend = null) => {
    // Prevent duplicate submits while generation is active
    if (isSubmitting) return;

    const messageText = (textToSend !== null ? textToSend : inputValue).trim();
    if (!messageText && !attachment) return;

    // Cancel any previous stream
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
      statusMessage: t.searchingLaw || "Searching the law…",
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

    // Helper: Flush buffered streaming tokens batch-wise (~every 50ms via requestAnimationFrame)
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
                statusMessage: t.writingAnswer || "Writing the answer…",
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
                  statusMessage: t.checkingWeb || "Checking official web sources…",
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
              if (hasWeb) status = t.writingAnswer || "Writing the answer…";
              else if (hasRet) status = t.checkingWeb || "Checking official web sources…";
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
                  statusMessage: "Document scanned. Searching statutes…",
                }
              : m
          )
        );
      },
      onToken: (token) => {
        tokenBufferRef.current += token;
        const now = performance.now();
        // Batch updates every ~50ms using requestAnimationFrame to eliminate lag
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

        // Enrich sources_cited with text, jurisdiction, and domain
        const enrichedCited = cited.map((c) => {
          const matched = allSources.find((s) => s.tag === c.tag);
          let domain = c.domain || '';
          if (!domain && c.url) {
            try {
              domain = new URL(c.url).hostname;
            } catch {
              domain = '';
            }
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

        // Call reviewAnswer off critical path in background
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
                    ? {
                        ...m,
                        isReviewing: false,
                        reviewData: res && res.ok ? res : null,
                      }
                    : m
                )
              );
            })
            .catch(() => {
              // On failure or timeout, show nothing and no error
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
            message: "We couldn't clearly read a legal document from this image. Please ensure the document is well-lit, laid flat, and the text is sharp and readable, then try uploading again.",
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
        // Document Vision Stream
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
        // Text Question Stream
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
    setMessages([messages[0]]);
    setInputValue("");
    setAttachment(null);
    setAttachmentPreviewUrl(null);
    setUploadError("");
  };

  const copyDossierToClipboard = (msg) => {
    if (!msg) return;
    let textToCopy = "";

    if (msg.text) {
      textToCopy = `LEGAL-LENS COUNSEL BRIEF\n${msg.text}\n\nDisclaimer: General information, not legal advice. Under Article 39A of the Constitution of India.`;
    } else if (msg.data) {
      const { whatThisMeans, possibleRights, nextSteps, sources } = msg.data;
      textToCopy = `LEGAL-LENS COUNSEL BRIEF (Article 39A Public Legal Literacy)\n`;
      textToCopy += `Engine: ${msg.sourceType || "Google Gemma 4 + Indian Legal Corpus"}\n\n`;
      textToCopy += `1. EXECUTIVE SUMMARY:\n${whatThisMeans}\n\n`;
      textToCopy += `2. YOUR STATUTORY RIGHTS:\n${(possibleRights || []).map((r) => `• ${r}`).join('\n')}\n\n`;
      textToCopy += `3. IMMEDIATE NEXT STEPS:\n${(nextSteps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n`;
      textToCopy += `4. GROUNDED LEGAL SOURCES:\n${(sources || []).map((s) => `• ${s.title}: ${s.ref}`).join('\n')}\n\n`;
      textToCopy += `Note: General legal educational awareness under Article 39A of the Constitution of India. For representation, dial NALSA 15100.`;
    }

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopiedId(msg.id);
        setTimeout(() => setCopiedId(null), 2500);
      });
    }
  };

  const handlePrintBrief = () => {
    window.print();
  };

  const sampleQuestions = t.exampleQuestions || [
    "Can my landlord throw me out without notice?",
    "My salary was deducted without telling me",
    "What are my rights if the police arrest me?",
    "Online seller is refusing to refund a defective product"
  ];

  const handleSelectGoldenQuestion = (goldenItem, autoRun = true) => {
    if (goldenItem.state) {
      setSelectedState(goldenItem.state);
      localStorage.setItem('legal_lens_selected_state', goldenItem.state);
    }
    if (goldenItem.lang && setLanguage && goldenItem.lang !== language) {
      setLanguage(goldenItem.lang);
      localStorage.setItem('legal_lens_language', goldenItem.lang);
    }
    setInputValue(goldenItem.query);
    if (textareaRef.current) {
      textareaRef.current.value = goldenItem.query;
      textareaRef.current.style.height = 'auto';
    }

    if (autoRun) {
      setTimeout(() => {
        handleSendMessage(goldenItem.query);
      }, 60);
    }
  };

  const filteredGoldenQuestions = GOLDEN_DEMO_QUESTIONS.filter((gq) => {
    if (demoCategoryFilter === 'all') return true;
    if (demoCategoryFilter === 'en') return gq.lang === 'en' && gq.topic !== 'out_of_scope';
    if (demoCategoryFilter === 'hi') return gq.lang === 'hi';
    if (demoCategoryFilter === 'out_of_scope') return gq.topic === 'out_of_scope';
    return true;
  });

  return (
    <div className="query-tab-workspace">
      <div className="container">
        {/* Workspace Top Header */}
        <header className="query-workspace-header">
          <div className="query-header-flex">
            <div>
              <div className="editorial-tag-wrap mb-1">
                <span className="editorial-tag">Interactive Counsel</span>
                <span className="editorial-tag-line"></span>
                <span className="editorial-tag-sub">Gemma 4 Guided Assistant</span>
              </div>
              <h1 className="editorial-h2">
                Legal Guidance <span className="editorial-italic">&amp; Rights Dossier</span>
              </h1>
              <p className="editorial-lead">
                Grounded multimodal legal analysis for Indian citizens, tenants, workers, and MSMEs. Cross-referencing 503 Constitutional articles, 1,104 Supreme Court holdings, and state statutes in plain language.
              </p>
            </div>

            {/* Header Actions: Jurisdiction Selector & Engine Badge */}
            <div className="query-header-actions">
              {/* State Jurisdiction Dropdown */}
              <div className="state-selector-wrap" title="Select State Jurisdiction for local statutes">
                <Scale size={14} className="icon-emerald opacity-80" />
                <select
                  id="state-select"
                  className="state-select-dropdown"
                  value={selectedState}
                  onChange={(e) => handleSelectState(e.target.value)}
                  aria-label="Select state jurisdiction"
                >
                  {activeStatesList.map((st) => (
                    <option key={st.jurisdiction} value={st.jurisdiction}>
                      {st.jurisdiction} {st.covered ? '' : '(Central law only)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Engine Status Indicator */}
              <button 
                type="button" 
                className={`api-key-status-badge ${apiKey ? 'is-active' : ''}`}
                onClick={() => setIsKeyDrawerOpen((prev) => !prev)}
                title="Click to view engine details"
              >
                <Key size={14} className={apiKey ? "icon-emerald" : "icon-gold"} />
                <span>Gemma 4 Live Stream</span>
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
                  <span className="status-live-dot dot-grounded"></span>
                  <span className="status-live-text">
                    Gemma 4 Assembly Pipeline
                  </span>
                </div>
              </div>
              
              <p className="sidebar-description">
                Direct statutory RAG with Constitution of India, State Tenancy Laws, Central Rules, and Supreme Court holdings.
              </p>

              <button 
                type="button" 
                className="btn btn-outline btn-sm w-full key-drawer-toggle"
                onClick={() => setIsKeyDrawerOpen(!isKeyDrawerOpen)}
              >
                <Key size={13} />
                <span>{apiKey ? "Manage Gemini Key" : "Configure Custom API Key"}</span>
              </button>

              {isKeyDrawerOpen && (
                <div className="api-key-popover-box animate-popover">
                  <label htmlFor="gemini-key-input" className="api-key-label">
                    Optional Direct Gemini Key
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
                    Default: Backend proxy runs automatically without any frontend key needed.
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
                    disabled={isSubmitting}
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
            {/* Sticky Chat Thread Header Bar with State Dropdown & EN / हिन्दी Language Toggle */}
            <div className="chat-thread-header-bar">
              <div className="chat-header-state-suite">
                <div className="chat-header-label">
                  <Scale size={14} className="icon-emerald" />
                  <span>{t.stateLawLabel || "State Law:"}</span>
                </div>

                {/* Searchable State Dropdown */}
                <div className="searchable-state-container" ref={stateDropdownRef}>
                  <button
                    type="button"
                    className="searchable-state-trigger"
                    onClick={() => setIsStateDropdownOpen((prev) => !prev)}
                    aria-expanded={isStateDropdownOpen}
                    aria-label="Select state jurisdiction"
                    title="Select State Jurisdiction for local statutory RAG"
                  >
                    <span className="selected-state-text">{selectedState}</span>
                    {isCurrentStateCovered ? (
                      <span className="state-status-pill is-covered">{t.stateIndexed || "Indexed"}</span>
                    ) : (
                      <span className="state-status-pill is-central">{t.centralOnly || "Central Only"}</span>
                    )}
                    <ChevronDown size={13} className={`state-chevron ${isStateDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isStateDropdownOpen && (
                    <div className="searchable-state-popover">
                      <div className="state-search-box">
                        <Search size={13} className="state-search-icon" />
                        <input
                          type="text"
                          className="state-search-input"
                          placeholder="Search 36 States &amp; UTs…"
                          value={stateSearchTerm}
                          onChange={(e) => setStateSearchTerm(e.target.value)}
                          autoFocus
                          aria-label="Search Indian states"
                        />
                        {stateSearchTerm && (
                          <button
                            type="button"
                            className="clear-search-btn"
                            onClick={() => setStateSearchTerm("")}
                            title="Clear search"
                            aria-label="Clear search"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      <div className="state-options-scroll" role="listbox">
                        {filteredStates.length > 0 ? (
                          filteredStates.map((st) => (
                            <button
                              key={st.jurisdiction}
                              type="button"
                              className={`state-option-row ${st.jurisdiction === selectedState ? 'is-active' : ''}`}
                              onClick={() => handleSelectState(st.jurisdiction)}
                              role="option"
                              aria-selected={st.jurisdiction === selectedState}
                            >
                              <div className="state-option-left">
                                <span className="state-option-title">{st.jurisdiction}</span>
                                <span className="state-option-subtitle">
                                  {st.covered ? 'State laws indexed' : 'Central law & Constitution only'}
                                </span>
                              </div>
                              {st.jurisdiction === selectedState && (
                                <Check size={14} className="text-emerald" />
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="no-state-found">No state matching "{stateSearchTerm}"</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Detect My Location Button */}
                <button
                  type="button"
                  className={`btn-detect-location ${isDetectingLocation ? 'is-locating' : ''}`}
                  onClick={handleDetectLocation}
                  disabled={isDetectingLocation}
                  title="Auto-detect Indian state via device GPS &amp; OpenStreetMap reverse geocoding"
                  aria-label="Auto-detect state from location"
                >
                  <MapPin size={13} className={isDetectingLocation ? 'icon-spin' : ''} />
                  <span>{isDetectingLocation ? (t.detectingLocation || "Detecting…") : (t.detectLocation || "Detect my location")}</span>
                </button>

                {/* Sticky Header Language Toggle: EN / हिन्दी */}
                <div className="chat-header-lang-toggle" role="group" aria-label="Toggle interface language">
                  <button
                    type="button"
                    className={`chat-lang-btn ${language === 'en' ? 'is-active' : ''}`}
                    onClick={() => handleToggleLanguage('en')}
                    aria-pressed={language === 'en'}
                    aria-label="Switch interface to English"
                  >
                    EN
                  </button>
                  <span className="chat-lang-sep" aria-hidden="true">/</span>
                  <button
                    type="button"
                    className={`chat-lang-btn ${language === 'hi' ? 'is-active' : ''}`}
                    onClick={() => handleToggleLanguage('hi')}
                    aria-pressed={language === 'hi'}
                    aria-label="इंटरफ़ेस भाषा हिन्दी में बदलें"
                  >
                    हिन्दी
                  </button>
                </div>
              </div>

              {/* Coverage Meta Tag in Chat Header */}
              <div className="chat-header-coverage-meta">
                {isCurrentStateCovered ? (
                  <span className="coverage-badge covered">State &amp; Central Laws Active</span>
                ) : (
                  <span className="coverage-badge central">Central Law &amp; Constitution Only</span>
                )}
              </div>
            </div>

            {/* Advisory Note when covered=false state chosen */}
            {!isCurrentStateCovered && (
              <div className="state-uncovered-advisory-bar" role="alert">
                <AlertTriangle size={14} className="icon-amber" />
                <span>{t.uncoveredNote || "Only central law and the Constitution are available for this state."}</span>
              </div>
            )}

            {/* Geolocation feedback note */}
            {locationMessage && (
              <div className={`location-feedback-toast toast-${locationMessage.type}`}>
                <div className="flex items-center gap-2">
                  <MapPin size={13} />
                  <span>{locationMessage.text}</span>
                </div>
                <button
                  type="button"
                  className="toast-dismiss-btn"
                  onClick={() => setLocationMessage(null)}
                  title="Dismiss notification"
                  aria-label="Dismiss location notification"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Demo Mode: Golden Questions Tray (Active when ?demo=1 in URL or toggle enabled) */}
            {isDemoModeActive && (
              <div className="golden-demo-tray" role="region" aria-label="Demo Mode Golden Questions">
                <div className="golden-demo-header">
                  <div className="golden-demo-title-group">
                    <Sparkles size={14} className="sparkle-gold" />
                    <strong className="golden-demo-title">Demo Mode — Golden Questions (1-Click Use)</strong>
                    <span className="golden-demo-badge">eval/golden_demo.json</span>
                    {setIsDemoModeActive && (
                      <button
                        type="button"
                        className="btn-golden-dismiss"
                        onClick={() => setIsDemoModeActive(false)}
                        title="Hide Demo Questions"
                        aria-label="Hide Demo Questions"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <div className="golden-demo-filter-pills" role="tablist">
                    <button
                      type="button"
                      className={`golden-filter-btn ${demoCategoryFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setDemoCategoryFilter('all')}
                      role="tab"
                      aria-selected={demoCategoryFilter === 'all'}
                    >
                      All (11)
                    </button>
                    <button
                      type="button"
                      className={`golden-filter-btn ${demoCategoryFilter === 'en' ? 'active' : ''}`}
                      onClick={() => setDemoCategoryFilter('en')}
                      role="tab"
                      aria-selected={demoCategoryFilter === 'en'}
                    >
                      English (5)
                    </button>
                    <button
                      type="button"
                      className={`golden-filter-btn ${demoCategoryFilter === 'hi' ? 'active' : ''}`}
                      onClick={() => setDemoCategoryFilter('hi')}
                      role="tab"
                      aria-selected={demoCategoryFilter === 'hi'}
                    >
                      हिन्दी (5)
                    </button>
                    <button
                      type="button"
                      className={`golden-filter-btn ${demoCategoryFilter === 'out_of_scope' ? 'active' : ''}`}
                      onClick={() => setDemoCategoryFilter('out_of_scope')}
                      role="tab"
                      aria-selected={demoCategoryFilter === 'out_of_scope'}
                    >
                      Out-of-Scope (1)
                    </button>
                  </div>
                </div>

                <div className="golden-demo-grid">
                  {filteredGoldenQuestions.map((gq) => (
                    <div key={gq.id} className="golden-demo-card">
                      <div className="golden-card-meta">
                        <span className="golden-category-pill">{gq.category}</span>
                        <span className="golden-lang-pill">{gq.lang.toUpperCase()}</span>
                      </div>
                      <h4 className="golden-card-headline">{gq.title}</h4>
                      <p className="golden-card-query-text">{gq.query}</p>
                      <div className="golden-card-actions">
                        <button
                          type="button"
                          className="btn-golden-run"
                          onClick={() => {
                            userScrolledUpRef.current = false;
                            handleSelectGoldenQuestion(gq, true);
                          }}
                          disabled={isSubmitting}
                          title="Execute inquiry immediately (Maharashtra jurisdiction)"
                        >
                          <Sparkles size={12} />
                          <span>1-Click Run</span>
                        </button>
                        <button
                          type="button"
                          className="btn-golden-prefill"
                          onClick={() => handleSelectGoldenQuestion(gq, false)}
                          disabled={isSubmitting}
                          title="Pre-fill into chat box"
                        >
                          Pre-fill
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4 Pre-filled Example Question Chips on Empty State / Prompt Bar */}
            <div className="empty-state-prompt-chips" role="region" aria-label="Quick example legal inquiries">
              <div className="empty-chips-header">
                <Sparkles size={13} className="sparkle-gold" />
                <span>{t.sampleQuestionsHeader || "Common Everyday Legal Inquiries"}:</span>
              </div>
              <div className="empty-chips-cluster">
                {sampleQuestions.map((sq, i) => (
                  <button
                    key={i}
                    type="button"
                    className="example-prompt-chip"
                    onClick={() => {
                      userScrolledUpRef.current = false;
                      handleSendMessage(sq);
                    }}
                    disabled={isSubmitting}
                    aria-label={`Ask: ${sq}`}
                  >
                    <span>{sq}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div 
              ref={chatScrollContainerRef}
              onScroll={handleChatScroll}
              className="query-messages-stream"
              tabIndex={0}
              role="region"
              aria-label="Legal conversation history"
            >
              {messages.map((msg) => (
                <div key={msg.id} className={`query-msg-row ${msg.sender}-msg-row`}>
                  {msg.sender === 'user' ? (
                    <div className="minimal-user-bubble">
                      {/* Attached Document in User Message */}
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
                      {/* Friendly Error UI with Retry Button */}
                      {msg.error ? (
                        <div className="friendly-error-card" role="alert">
                          <div className="error-card-header">
                            <AlertCircle size={18} />
                            <span>
                              {msg.error.type === 'UNREACHABLE'
                                ? 'Server Unreachable'
                                : msg.error.type === 'TIMEOUT'
                                ? 'Request Timed Out'
                                : msg.error.type === 'IMAGE_UNREADABLE'
                                ? 'Unreadable Document Photo'
                                : 'Analysis Notice'}
                            </span>
                          </div>
                          <p className="error-card-message">{msg.error.message}</p>
                          <button
                            type="button"
                            className="error-retry-btn"
                            onClick={() => handleRetry(msg)}
                          >
                            <RotateCcw size={13} />
                            <span>Retry Question</span>
                          </button>
                        </div>
                      ) : msg.text !== null && msg.text !== undefined ? (
                        /* Live Streaming or Completed Answer from askStream */
                        <div className="assistant-structured-frame">
                          {/* Top Model Badge Strip */}
                          <div className="dossier-model-strip">
                            <div className="dossier-model-info">
                              <div className="dossier-badge">
                                <Sparkles size={13} className="sparkle-gold" />
                                <span>
                                  {msg.cached
                                    ? "Gemma 4 (Instant Cache Hit)"
                                    : "Google Gemma 4 (26B-A4B-IT) + Hybrid RAG"}
                                </span>
                              </div>
                              <div className="dossier-answering-state-pill" title={`Jurisdiction applied: ${msg.state || selectedState || 'Maharashtra'}`}>
                                <Scale size={12} className="icon-emerald" />
                                <span>{t.answeringFor || "Answering for:"} <strong>{msg.state || selectedState || "Maharashtra"}</strong></span>
                              </div>
                            </div>

                            <div className="dossier-actions-cluster">
                              <button
                                type="button"
                                className="dossier-tool-btn"
                                onClick={() => copyDossierToClipboard(msg)}
                                title="Copy Legal Dossier to Clipboard"
                                aria-label="Copy legal dossier"
                              >
                                {copiedId === msg.id ? (
                                  <>
                                    <Check size={14} className="text-emerald" />
                                    <span className="text-emerald">{t.copied || "Copied"}</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={14} />
                                    <span>{t.copyBrief || "Copy Brief"}</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                className="dossier-tool-btn"
                                onClick={handlePrintBrief}
                                title="Print or Save Formatted PDF Brief"
                                aria-label="Print formatted PDF brief"
                              >
                                <Printer size={14} />
                                <span>{t.printBrief || "Print Brief"}</span>
                              </button>
                            </div>
                          </div>

                          {/* What we read from your document (Multimodal Vision Facts) */}
                          {msg.documentData && (
                            <div className="document-extracted-card" aria-label="Extracted Document Facts">
                              <div className="doc-card-header">
                                <FileText size={16} className="text-blue" />
                                <span className="doc-card-title">{t.whatWeRead || "What we read from your document"}</span>
                              </div>

                              <div className="doc-fields-grid">
                                {msg.documentData.doc_type && (
                                  <div className="doc-field-row">
                                    <span className="doc-field-label">{t.docType || "Document Type:"}</span>
                                    <span className="doc-field-val highlight">{msg.documentData.doc_type}</span>
                                  </div>
                                )}

                                {msg.documentData.parties && msg.documentData.parties.length > 0 && (
                                  <div className="doc-field-row">
                                    <span className="doc-field-label">{t.parties || "Parties:"}</span>
                                    <div className="doc-field-tags">
                                      {msg.documentData.parties.map((p, pIdx) => (
                                        <span key={pIdx} className="doc-field-pill">{p}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {msg.documentData.notice_period && (
                                  <div className="doc-field-row">
                                    <span className="doc-field-label">{t.noticePeriod || "Notice Period:"}</span>
                                    <span className="doc-field-val notice-period">{msg.documentData.notice_period}</span>
                                  </div>
                                )}

                                {msg.documentData.dates && msg.documentData.dates.length > 0 && (
                                  <div className="doc-field-row">
                                    <span className="doc-field-label">{t.dates || "Dates:"}</span>
                                    <div className="doc-field-tags">
                                      {msg.documentData.dates.map((d, dIdx) => (
                                        <span key={dIdx} className="doc-field-pill">{d}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {msg.documentData.deadlines && msg.documentData.deadlines.length > 0 && (
                                  <div className="doc-field-row">
                                    <span className="doc-field-label">{t.deadlines || "Deadlines:"}</span>
                                    <div className="doc-field-tags">
                                      {msg.documentData.deadlines.map((dl, dlIdx) => (
                                        <span key={dlIdx} className="doc-field-pill deadline">{dl}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {msg.documentData.amounts && msg.documentData.amounts.length > 0 && (
                                  <div className="doc-field-row">
                                    <span className="doc-field-label">{t.amounts || "Amounts:"}</span>
                                    <div className="doc-field-tags">
                                      {msg.documentData.amounts.map((amt, aIdx) => (
                                        <span key={aIdx} className="doc-field-pill amount">{amt}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {msg.documentData.summary && (
                                  <div className="doc-field-row doc-summary-row">
                                    <span className="doc-field-label">{t.summary || "Summary:"}</span>
                                    <p className="doc-summary-text">{msg.documentData.summary}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Preliminary Retrieved Sources Bar (rendered immediately when sources arrive!) */}
                          {msg.retrievedSources && msg.retrievedSources.length > 0 && (
                            <div className="preliminary-sources-bar">
                              <span className="preliminary-sources-label">{t.retrievedAuthorities || "Retrieved Legal Authorities:"}</span>
                              {msg.retrievedSources.map((s, idx) => (
                                <span key={idx} className="preliminary-source-tag" title={s.citation || s.source}>
                                  <strong>{s.tag || `[S${idx + 1}]`}</strong> {s.source || s.citation}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Live Pipeline Status Line while waiting/streaming */}
                          {msg.isStreaming && msg.statusMessage && (
                            <div className="pipeline-status-line">
                              <span className="status-spinner-dot" />
                              <span>{msg.statusMessage}</span>
                            </div>
                          )}

                          {/* Fallback Warning Badge */}
                          {msg.fallback && (
                            <div className="fallback-warning-badge" role="status">
                              <AlertTriangle size={14} />
                              <span>{t.fallbackNotice || "Showing the relevant law directly (AI writer unavailable)"}</span>
                            </div>
                          )}

                          {/* Rendered Safe Markdown Content with aria-live="polite" */}
                          <div className="dossier-body-stream" aria-live="polite" aria-atomic="false">
                            {msg.text ? (
                              <SafeMarkdown 
                                content={msg.text} 
                                availableTags={msg.sourcesCited && msg.sourcesCited.length > 0 ? msg.sourcesCited.map(s => s.tag) : (msg.retrievedSources ? msg.retrievedSources.map(s => s.tag) : null)}
                                onTagClick={handleTagClick}
                              />
                            ) : (
                              msg.isStreaming && (
                                <span className="text-muted text-sm italic">
                                  {t.synthesizingNotice || "Gemma 4 synthesizing verified legal provisions..."}
                                </span>
                              )
                            )}
                            {msg.isStreaming && <span className="streaming-cursor" />}
                          </div>

                          {/* Low Confidence Notice Banner */}
                          {msg.anyConfident === false && (
                            <div className="low-confidence-notice-banner" role="alert">
                              <AlertCircle size={16} />
                              <span>
                                {t.lowConfidenceNotice || "We couldn't find a strong match; here is the closest law. Consider free legal aid (NALSA)."}
                              </span>
                            </div>
                          )}

                          {/* Background Second Model Review Indicator */}
                          {msg.isReviewing && (
                            <div className="review-checking-line">
                              <Sparkles size={13} className="sparkle-gold sparkle-spin" />
                              <span>{t.secondModelChecking || "Second model is double-checking…"}</span>
                            </div>
                          )}

                          {/* Second-Model Review Audit Card (Rendered ONLY if reviewData.ok === true) */}
                          {msg.reviewData && msg.reviewData.ok && (
                            <div className="second-model-review-card" aria-label="Second Model Audit">
                              <div className="review-card-top">
                                <div className="review-title-group">
                                  <Shield size={16} className="text-emerald" />
                                  <span className="review-card-title">{t.secondModelReview || "Second-model review"}</span>
                                  <span className="review-model-sub">Gemma 4 (31B-IT) Independent Audit</span>
                                </div>

                                <div className="review-verdict-wrap">
                                  <span
                                    className={`review-verdict-badge verdict-${(msg.reviewData.verdict || '').toLowerCase().replace(/\s+/g, '_')}`}
                                  >
                                    {(msg.reviewData.verdict || '').toLowerCase().includes('part') ? (
                                      <AlertTriangle size={13} />
                                    ) : (msg.reviewData.verdict || '').toLowerCase().includes('unsupport') ? (
                                      <AlertCircle size={13} />
                                    ) : (
                                      <CheckCircle2 size={13} />
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
                              </div>

                              {msg.reviewData.claims && msg.reviewData.claims.length > 0 && (
                                <div className="review-claims-list">
                                  <span className="review-subheading">Audited Claims:</span>
                                  {msg.reviewData.claims.map((cl, clIdx) => (
                                    <div key={clIdx} className="review-claim-item">
                                      {cl.supported ? (
                                        <CheckCircle2 size={14} className="claim-icon-supported" />
                                      ) : (
                                        <AlertTriangle size={14} className="claim-icon-warning" />
                                      )}
                                      <div className="review-claim-body">
                                        <span className="review-claim-text">{cl.claim}</span>
                                        {cl.tag && (
                                          <button
                                            type="button"
                                            className="review-claim-tag clickable"
                                            onClick={() => handleTagClick(cl.tag)}
                                            title={`Jump to source ${cl.tag}`}
                                          >
                                            {cl.tag}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {msg.reviewData.missing && msg.reviewData.missing.length > 0 && (
                                <div className="review-missing-block">
                                  <span className="review-subheading text-amber">
                                    Omitted / Missing Considerations:
                                  </span>
                                  <ul className="review-missing-list">
                                    {msg.reviewData.missing.map((item, mIdx) => (
                                      <li key={mIdx}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {msg.reviewData.caveat && (
                                <div className="review-caveat-block">
                                  <span className="review-caveat-label">Caveat:</span>
                                  <p className="review-caveat-text">{msg.reviewData.caveat}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Sources Panel built from done.sources_cited */}
                          {!msg.isStreaming && msg.sourcesCited && msg.sourcesCited.length > 0 && (
                            <div className="sources-cited-panel" aria-label="Cited Legal Authorities">
                              <div className="sources-panel-title-bar">
                                <div className="flex items-center gap-2">
                                  <Scale size={15} className="text-emerald" />
                                  <span className="sources-panel-heading">
                                    Authorities &amp; Statutory Sources Cited ({msg.sourcesCited.length})
                                  </span>
                                </div>
                                <span className="sources-panel-sub">Verified Statutory &amp; Grounded Web Sources</span>
                              </div>

                              <div className="sources-cards-grid">
                                {msg.sourcesCited.map((s, sIdx) => {
                                  const isExpanded = Boolean(expandedSources[`${msg.id}-${s.tag}`]);
                                  const isHighlighted = highlightedTag === s.tag;
                                  const isInForce = (s.status || '').toLowerCase().includes('in force');
                                  const isRepealed = (s.status || '').toLowerCase().includes('repealed');
                                  const isDraft = (s.status || '').toLowerCase().includes('draft');
                                  const isWeb = (s.tag || '').startsWith('[W');

                                  return (
                                    <div
                                      key={s.tag || sIdx}
                                      id={`source-card-${s.tag}`}
                                      className={`source-detail-card ${isHighlighted ? 'is-highlighted-card' : ''}`}
                                    >
                                      <div className="source-card-top">
                                        <div className="source-card-identity">
                                          <span className={`source-card-tag tag-${(s.tag || '')[1]?.toLowerCase() || 's'}`}>
                                            {s.tag}
                                          </span>
                                          <div className="source-title-block">
                                            <h5 className="source-citation-title">
                                              {s.citation || s.source}
                                            </h5>
                                            <div className="source-meta-row">
                                              {s.jurisdiction && (
                                                <span className="source-jurisdiction-chip">
                                                  {s.jurisdiction}
                                                </span>
                                              )}
                                              {s.text_as_on && (
                                                <span className="source-date-chip">
                                                  text as on {s.text_as_on}
                                                </span>
                                              )}
                                              {isWeb && s.domain && (
                                                <span className="source-domain-chip">
                                                  {s.domain}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="source-card-badges">
                                          <span
                                            className={`source-status-badge ${
                                              isInForce
                                                ? 'status-in-force'
                                                : isRepealed
                                                ? 'status-repealed'
                                                : isDraft
                                                ? 'status-draft'
                                                : 'status-other'
                                            }`}
                                          >
                                            {!isInForce && <AlertTriangle size={11} className="mr-1" />}
                                            {s.status || 'Verified Authority'}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Web Link if available */}
                                      {s.url && (
                                        <div className="source-web-link-row">
                                          <a
                                            href={s.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="source-external-link"
                                            title={`Open ${s.domain || 'official portal'}`}
                                          >
                                            <span>View on {s.domain || 'Official Portal'}</span>
                                            <ExternalLink size={12} />
                                          </a>
                                        </div>
                                      )}

                                      {/* Retrieved Text Expandable Excerpt */}
                                      {s.text && (
                                        <div className="source-text-accordion">
                                          <p className="source-text-content">
                                            {isExpanded || s.text.length <= 180
                                              ? s.text
                                              : s.text.slice(0, 180) + '…'}
                                          </p>
                                          {s.text.length > 180 && (
                                            <button
                                              type="button"
                                              className="source-toggle-expand-btn"
                                              onClick={() =>
                                                setExpandedSources((prev) => ({
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
                            </div>
                          )}

                          {/* Collapsible Trace Timeline */}
                          {!msg.isStreaming && msg.trace && msg.trace.length > 0 && (
                            <div className="pipeline-trace-container">
                              <button
                                type="button"
                                className="trace-collapsible-trigger"
                                onClick={() =>
                                  setOpenTraces((prev) => ({
                                    ...prev,
                                    [msg.id]: !prev[msg.id],
                                  }))
                                }
                                aria-expanded={Boolean(openTraces[msg.id])}
                              >
                                <div className="trace-trigger-left">
                                  <Clock size={13} className="icon-emerald" />
                                  <span className="trace-trigger-label">How this answer was made</span>
                                  <span className="trace-time-total">
                                    ({msg.trace.reduce((acc, t) => acc + (typeof t.ms === 'number' ? t.ms : 0), 0).toFixed(0)} ms)
                                  </span>
                                </div>
                                <ChevronDown
                                  size={13}
                                  className={`trace-chevron ${openTraces[msg.id] ? 'rotate-180' : ''}`}
                                />
                              </button>

                              {openTraces[msg.id] && (
                                <div className="trace-timeline-body animate-popover">
                                  <div className="timeline-steps-track">
                                    {msg.trace.map((tr, tIdx) => {
                                      const friendlyName =
                                        tr.step === 'retrieve_tiered'
                                          ? 'Tiered Legal Retrieval'
                                          : tr.step === 'web_evidence'
                                          ? 'Official Web Grounding'
                                          : tr.step === 'writer_generation'
                                          ? 'Gemma 4 Synthesis'
                                          : tr.step === 'extract_sources_cited'
                                          ? 'Statute Cross-Referencing'
                                          : tr.step === 'document_vision'
                                          ? 'Vision Fact Extraction'
                                          : tr.step.replace(/_/g, ' ');

                                      return (
                                        <div key={tIdx} className="timeline-step-row">
                                          <div className="timeline-node-column">
                                            <span
                                              className={`timeline-node-dot ${
                                                tr.ok ? 'node-success' : 'node-failure'
                                              }`}
                                            />
                                            {tIdx < msg.trace.length - 1 && (
                                              <span className="timeline-node-connector" />
                                            )}
                                          </div>
                                          <div className="timeline-step-details">
                                            <div className="timeline-step-meta">
                                              <span className="timeline-step-name">{friendlyName}</span>
                                              <span className="timeline-step-duration">
                                                {typeof tr.ms === 'number' ? `${tr.ms.toFixed(1)} ms` : ''}
                                              </span>
                                            </div>
                                            {tr.cached && (
                                              <span className="timeline-cache-chip">Cache Hit</span>
                                            )}
                                            {tr.error && (
                                              <span className="timeline-error-chip">{tr.error}</span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Mandatory One-Line Disclaimer */}
                          <div className="answer-mandatory-disclaimer">
                            <Shield size={13} />
                            <span>{t.disclaimer || "General information, not legal advice."}</span>
                          </div>
                        </div>
                      ) : msg.data ? (
                        /* Initial Structured Welcome Card */
                        <div className="assistant-structured-frame">
                          <div className="dossier-model-strip">
                            <div className="dossier-model-info">
                              <div className="dossier-badge">
                                <Sparkles size={13} className="sparkle-gold" />
                                <span>{msg.sourceType || "Google Gemma 4 (26B-A4B-IT) + Hybrid RAG"}</span>
                              </div>
                              <div className="dossier-answering-state-pill" title={`Jurisdiction applied: ${msg.state || selectedState || 'Maharashtra'}`}>
                                <Scale size={12} className="icon-emerald" />
                                <span>Answering for: <strong>{msg.state || selectedState || "Maharashtra"}</strong></span>
                              </div>
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

                          <div className="dossier-part-block">
                            <div className="dossier-part-header">
                              <Scale size={16} className="dossier-header-icon icon-gold" />
                              <h4 className="dossier-part-title">{t.whatThisMeans}</h4>
                            </div>
                            <p className="dossier-body-text">{msg.data.whatThisMeans}</p>
                          </div>

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
                                    disabled={isSubmitting}
                                  >
                                    <span>{q}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="answer-mandatory-disclaimer">
                            <Shield size={13} />
                            <span>{t.disclaimer || "General information, not legal advice."}</span>
                          </div>
                        </div>
                      ) : null}
                      <span className="message-time-stamp">{msg.timestamp}</span>
                    </div>
                  )}
                </div>
              ))}
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
                  aria-label={t.removeDocBtn || "Remove attached file"}
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
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                id="assistant-file-upload"
              />

              <div className="composer-input-row">
                <button
                  type="button"
                  className={`composer-clip-btn ${attachment ? 'has-file' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  title={t.attachDocBtn || "Attach Legal Notice, Agreement, or Bill Image (JPG, PNG, WEBP up to 8 MB)"}
                  aria-label={t.attachDocBtn || "Attach Document Image"}
                  disabled={isSubmitting}
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
                  placeholder={
                    isSubmitting 
                      ? (t.inputSynthesizing || "Gemma 4 is synthesizing legal guidance...") 
                      : attachment 
                      ? (t.inputPlaceholderDoc || "Ask a specific question about this document, or hit Send...") 
                      : (t.inputPlaceholder || "Describe your legal situation or dispute in natural language...")
                  }
                  aria-label={t.inputPlaceholder || "Describe your legal dispute"}
                />

                {isSubmitting ? (
                  <button
                    type="button"
                    className="composer-stop-btn"
                    onClick={handleStop}
                    title={t.stopBtn || "Stop Generating Response"}
                    aria-label={t.stopBtn || "Stop Generating Response"}
                  >
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="composer-send-btn"
                    onClick={() => {
                      userScrolledUpRef.current = false;
                      handleSendMessage();
                    }}
                    disabled={!inputValue.trim() && !attachment}
                    aria-label={t.sendBtn || "Send Inquiry to Legal Lens"}
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>

              {/* Privacy Note near the attach button */}
              <div className="composer-privacy-note">
                <Shield size={12} className="text-emerald" />
                <span>{t.privacyNote || "Your image is sent to the AI model to read it and isn't stored by this app."}</span>
              </div>

              <div className="composer-sub-notice">
                <span>Article 39A Public Legal Awareness Counsel · Powered by Google Gemma 4 (26B-A4B-IT) · {t.disclaimer || "Not formal attorney representation."}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
