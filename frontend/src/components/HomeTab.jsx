import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowRight, Paperclip, Scale, ChevronDown, Check, FileText, X,
  Sparkles, PhoneCall, Shield
} from 'lucide-react';
import AudienceSection from './AudienceSection';
import SampleAnswerPreview from './SampleAnswerPreview';
import FaqSection from './FaqSection';
import { DEFAULT_INDIAN_STATES } from '../data/states';
import { getSources, getStates } from '../lib/api';

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

export default function HomeTab({ 
  setActiveTab, 
  onAskQuestion, 
  onAnalyzeDocument, 
  onSelectAudience, 
  language = 'en',
  selectedState = 'Maharashtra',
  setSelectedState
}) {
  const [heroInput, setHeroInput] = useState("");
  const [isStateOpen, setIsStateOpen] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [dynamicCoverage, setDynamicCoverage] = useState(() => 
    language === 'hi' 
      ? 'वर्तमान में शामिल: भारत का संविधान, केंद्रीय अधिनियम एवं 36 राज्यों के नियम।'
      : 'Currently covers: Constitution of India, Central Acts, Model Codes, and state laws for 36 states & UTs.'
  );
  const fileInputRef = useRef(null);

  const exampleQuestions = language === 'hi' ? EXAMPLE_QUESTIONS_HI : EXAMPLE_QUESTIONS_EN;

  useEffect(() => {
    let isMounted = true;
    Promise.allSettled([getSources(), getStates()])
      .then(([sourcesRes, statesRes]) => {
        if (!isMounted) return;
        const sources = sourcesRes.status === 'fulfilled' && Array.isArray(sourcesRes.value) ? sourcesRes.value : [];
        const states = statesRes.status === 'fulfilled' && Array.isArray(statesRes.value) ? statesRes.value : [];

        const sourceNames = sources.map(s => s.source).filter(Boolean);
        const uniqueSources = Array.from(new Set(sourceNames));
        const stateCount = states.length > 0 ? states.length : 36;

        if (uniqueSources.length > 0) {
          const topList = uniqueSources.slice(0, 5).join(', ');
          const moreCount = uniqueSources.length > 5 ? ` and ${uniqueSources.length - 5} more statutes` : '';
          setDynamicCoverage(
            language === 'hi'
              ? `वर्तमान में शामिल: ${topList}${moreCount} एवं ${stateCount} राज्यों व केंद्र शासित प्रदेशों के कानून।`
              : `Currently covers: ${topList}${moreCount} and state laws for ${stateCount} states & UTs.`
          );
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [language]);

  const handleHeroSubmit = (e) => {
    if (e) e.preventDefault();
    if (heroInput.trim() || attachment) {
      if (attachment && onAnalyzeDocument) {
        onAnalyzeDocument(attachment);
      }
      if (onAskQuestion) {
        onAskQuestion(heroInput.trim());
      } else {
        setActiveTab('query');
      }
    }
  };

  const handlePromptClick = (promptText) => {
    if (onAskQuestion) {
      onAskQuestion(promptText);
    } else {
      setActiveTab('query');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileObj = {
        rawFile: file,
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type,
        detectedType: file.name.toLowerCase().includes('notice') ? 'Legal Notice' : 'Document'
      };
      setAttachment(fileObj);
    }
  };

  const handleStateSelect = (stName) => {
    if (setSelectedState) setSelectedState(stName);
    localStorage.setItem('legal_lens_selected_state', stName);
    setIsStateOpen(false);
  };

  return (
    <div className="editorial-home-page">
      {/* Centered Editorial Hero Section (Max-Width 720px Column) */}
      <section className="editorial-hero-section">
        <div className="chat-centered-column">
          {/* Header Mark */}
          <div className="hero-mark-row">
            <span className="brand-accent-mark" aria-hidden="true">
              <span className="bar bar-red" />
              <span className="bar bar-blue" />
              <span className="bar bar-yellow" />
              <span className="bar bar-pink" />
            </span>
            <span className="hero-eyebrow">Public Legal Awareness</span>
          </div>

          {/* Editorial Headline & One-Line Subtitle */}
          <h1 className="hero-editorial-headline">
            {language === 'hi' ? 'अपने अधिकार जानें, सरल भाषा में' : 'Know your rights, in plain language'}
          </h1>
          <p className="hero-editorial-sub">
            {language === 'hi'
              ? 'भारतीय संविधान, केंद्रीय अधिनियम और राज्य कानूनों से प्रमाणित कानूनी जानकारी।'
              : 'A plain-language guide to your legal rights, cited from the Constitution, central acts and state laws.'}
          </p>

          {/* Large Input Dock with Send, Attach & State Selector */}
          <div className="hero-dock-card">
            <form onSubmit={handleHeroSubmit} className="hero-dock-form">
              {attachment && (
                <div className="dock-staged-attachment">
                  <FileText size={14} className="text-blue" />
                  <span className="dock-attachment-name">{attachment.name}</span>
                  <button 
                    type="button" 
                    className="dock-remove-attachment" 
                    onClick={() => setAttachment(null)}
                    aria-label="Remove attached document"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              <div className="hero-dock-input-row">
                <input
                  type="text"
                  className="hero-dock-input"
                  placeholder={
                    language === 'hi'
                      ? 'अपनी कानूनी समस्या लिखें (जैसे: क्या मकान मालिक बिना नोटिस के निकाल सकता है?)'
                      : "Ask in plain language (e.g. 'Can my landlord lock me out without notice?')"
                  }
                  value={heroInput}
                  onChange={(e) => setHeroInput(e.target.value)}
                  aria-label="Describe your legal situation"
                />

                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,.pdf,.txt"
                  style={{ display: 'none' }}
                  id="hero-file-input"
                />

                {/* Attach Button inside the input */}
                <button
                  type="button"
                  className={`dock-tool-btn dock-attach-btn ${attachment ? 'has-file' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach document or notice image (JPG, PNG, PDF)"
                  aria-label="Attach document or notice photo"
                >
                  <Paperclip size={18} />
                </button>

                {/* Send Button inside the input */}
                <button
                  type="submit"
                  className="dock-tool-btn dock-send-btn"
                  disabled={!heroInput.trim() && !attachment}
                  aria-label="Send inquiry"
                  title="Send inquiry"
                >
                  <ArrowRight size={18} />
                </button>
              </div>

              {/* State Selector Next to Input */}
              <div className="hero-dock-bottom-bar">
                <div className="dock-state-picker-wrap">
                  <button
                    type="button"
                    className="dock-state-trigger"
                    onClick={() => setIsStateOpen(!isStateOpen)}
                    aria-expanded={isStateOpen}
                    aria-label={`Select jurisdiction, currently ${selectedState}`}
                  >
                    <Scale size={13} className="text-muted" />
                    <span>{language === 'hi' ? 'कार्यक्षेत्र:' : 'Jurisdiction:'} <strong>{selectedState}</strong></span>
                    <ChevronDown size={12} className={`chevron ${isStateOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isStateOpen && (
                    <div className="dock-state-dropdown animate-popover" role="listbox">
                      {DEFAULT_INDIAN_STATES.map((st) => (
                        <button
                          key={st.jurisdiction}
                          type="button"
                          className={`dock-state-item ${st.jurisdiction === selectedState ? 'active' : ''}`}
                          onClick={() => handleStateSelect(st.jurisdiction)}
                          role="option"
                          aria-selected={st.jurisdiction === selectedState}
                        >
                          <span>{st.jurisdiction}</span>
                          {st.jurisdiction === selectedState && <Check size={12} className="ml-auto" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span className="dock-state-hint">
                  Local state rules &amp; central acts applied
                </span>
              </div>
            </form>
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
                  onClick={() => handlePromptClick(q)}
                  aria-label={`Ask: ${q}`}
                >
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Trust Strip with 3 Small Items (No stock illustrations; using CSS shapes or 4-bar mark) */}
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
      </section>

      {/* Target Audiences Section */}
      <AudienceSection 
        onSelectAudience={onSelectAudience}
        onAskQuestion={onAskQuestion}
        language={language}
      />

      {/* How the Grounded Assistant Works: 3 Cards in a Row with SVG Icons & Dynamic Coverage */}
      <section className="engine-pipeline-section" aria-label="How Legal Lens explains your rights">
        <div className="container">
          <div className="pipeline-header-center">
            <h2 className="pipeline-title">
              {language === 'hi' ? 'लीगल लेंस आपके अधिकार कैसे समझाता है' : 'How Legal Lens Explains Your Rights'}
            </h2>
            <p className="pipeline-desc dynamic-sources-coverage">
              {dynamicCoverage}
            </p>
          </div>

          <div className="pipeline-cards-row">
            <div className="pipeline-card">
              <div className="pipeline-card-top">
                <span className="pipeline-card-num">01</span>
                <div className="pipeline-card-icon-wrap">
                  <Scale size={20} className="pipeline-card-icon" />
                </div>
              </div>
              <h3 className="pipeline-card-heading">
                {language === 'hi' ? 'सत्यापित वैधानिक धाराएं' : 'Verified Statutory Provisions'}
              </h3>
              <p className="pipeline-card-text">
                {language === 'hi'
                  ? 'प्रत्येक अधिकार की पुष्टि भारतीय संविधान, केंद्रीय संहिताओं और राज्य कानूनों से की जाती है।'
                  : 'Every right is verified against official statutory provisions with exact section citations and state-level rules.'}
              </p>
            </div>

            <div className="pipeline-card">
              <div className="pipeline-card-top">
                <span className="pipeline-card-num">02</span>
                <div className="pipeline-card-icon-wrap">
                  <Sparkles size={20} className="pipeline-card-icon" />
                </div>
              </div>
              <h3 className="pipeline-card-heading">
                {language === 'hi' ? 'सरल भाषा में विश्लेषण' : 'Plain Language Synthesis'}
              </h3>
              <p className="pipeline-card-text">
                {language === 'hi'
                  ? 'जटिल कानूनी धाराओं को स्पष्ट और व्यावहारिक भाषा में समझाता है जिसे कोई भी नागरिक तुरंत समझ सके।'
                  : 'Complex legal definitions and procedural rules are translated into clear, reassuring language that any citizen can act on immediately.'}
              </p>
            </div>

            <div className="pipeline-card">
              <div className="pipeline-card-top">
                <span className="pipeline-card-num">03</span>
                <div className="pipeline-card-icon-wrap">
                  <PhoneCall size={20} className="pipeline-card-icon" />
                </div>
              </div>
              <h3 className="pipeline-card-heading">
                {language === 'hi' ? 'सीधे सरकारी निवारण पोर्टल' : 'Direct Government Channels'}
              </h3>
              <p className="pipeline-card-text">
                {language === 'hi'
                  ? 'नालसा मुफ्त कानूनी सहायता (15100), उपभोक्ता हेल्पलाइन (1915), और एमएसएमई समाधान के सीधे संपर्क।'
                  : 'Provides verified phone numbers and official grievance portal links for NALSA Free Legal Aid (15100), Consumer Redressal (1915), and official portals.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sample Answer Preview */}
      <SampleAnswerPreview 
        onAskScenario={onAskQuestion}
        language={language}
      />

      {/* FAQ & Everyday Rights Guides */}
      <FaqSection 
        onAskQuestion={onAskQuestion}
        language={language}
      />

      {/* Direct Bottom Invitation: Centered banner with at least 24px spacing */}
      <section className="bottom-launch-section" aria-label="Ask Legal Lens Invitation">
        <div className="container">
          <div className="bottom-launch-card">
            <div className="bottom-launch-copy">
              <h2 className="bottom-launch-title">
                {language === 'hi' ? 'क्या आपके पास कोई विशिष्ट कानूनी नोटिस या प्रश्न है?' : 'Have a specific legal notice or question?'}
              </h2>
              <p className="bottom-launch-desc">
                {language === 'hi'
                  ? 'संविधान, केंद्रीय संहिताओं और राज्य कानूनों पर आधारित त्वरित, संरचित विश्लेषण प्राप्त करें।'
                  : 'Get an instant, structured breakdown backed by the Constitution, central acts, and state laws.'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg bottom-launch-btn"
              onClick={() => setActiveTab('query')}
              aria-label="Start inquiry in Counsel"
            >
              <span>{language === 'hi' ? 'लीगल लेंस से पूछें' : 'Ask Legal Lens'}</span>
              <ArrowRight size={16} />
            </button>
          </div>

          {/* Small Footer Disclaimer on Home */}
          <div className="home-legal-disclaimer-strip" role="note">
            <Shield size={14} className="disclaimer-shield-icon" />
            <span>
              {language === 'hi'
                ? 'सामान्य कानूनी जानकारी, औपचारिक वकील प्रतिनिधित्व नहीं। भारतीय संविधान के अनुच्छेद 39A के अंतर्गत।'
                : 'General information, not legal advice. Under Article 39A of the Constitution of India.'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
