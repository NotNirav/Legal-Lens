import React, { useState } from 'react';
import { 
  Search, ArrowRight, Sparkles, UploadCloud 
} from 'lucide-react';
import AudienceSection from './AudienceSection';
import SampleAnswerPreview from './SampleAnswerPreview';
import FaqSection from './FaqSection';
import { translations } from '../data/translations';

const HERO_QUICK_PROMPTS = [
  "Can my landlord deduct my deposit without repair receipts?",
  "Company delayed my salary by 2 months — how to recover?",
  "Police refusing to register stolen vehicle FIR",
  "MSME 45-day payment recovery rule"
];

export default function HomeTab({ 
  setActiveTab, 
  onAskQuestion, 
  onAnalyzeDocument, 
  onSelectAudience, 
  language = 'en' 
}) {
  const t = translations[language] || translations.en;
  const [heroInput, setHeroInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const handleHeroSubmit = (e) => {
    e.preventDefault();
    if (heroInput.trim()) {
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

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files[0] && onAnalyzeDocument) {
      const f = files[0];
      onAnalyzeDocument({
        rawFile: f,
        name: f.name,
        size: (f.size / 1024).toFixed(1) + ' KB',
        type: f.type,
        detectedType: f.name.toLowerCase().includes('notice') ? 'Legal Notice' : 'Document'
      });
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files[0] && onAnalyzeDocument) {
      const f = files[0];
      onAnalyzeDocument({
        rawFile: f,
        name: f.name,
        size: (f.size / 1024).toFixed(1) + ' KB',
        type: f.type,
        detectedType: f.name.toLowerCase().includes('notice') ? 'Legal Notice' : 'Document'
      });
    }
  };

  return (
    <div className="modern-home-page">
      {/* Immersive Cinematic Hero Viewport */}
      <section className="hero-cinematic-viewport">
        {/* Background Visual Backdrop with Ambient Gradient */}
        <div className="hero-backdrop-container">
          <img 
            src="/hero_gemma.jpg" 
            alt="Constitutional Justice Backdrop" 
            className="hero-backdrop-image"
          />
          <div className="hero-backdrop-vignette"></div>
        </div>

        {/* Hero Content Layer Over the Viewport */}
        <div className="container hero-viewport-content">
          <div className="hero-badge-pill">
            <Sparkles size={14} className="sparkle-gold" />
            <span>Google Gemma 4 (26B-A4B-IT) · Zero-Hallucination Legal RAG</span>
          </div>

          <h1 className="hero-cinema-headline">
            Know Your Rights.<br />
            <span className="headline-gradient">In Plain Words. Backed by Law.</span>
          </h1>

          <p className="hero-cinema-sub">
            Translating 503 Constitutional Articles, 1,104 Supreme Court landmark holdings, and Indian tenancy &amp; labor codes into crystal-clear, everyday action.
          </p>

          {/* Central Interactive Prompt & File Dock */}
          <div className="hero-interactive-dock">
            <form onSubmit={handleHeroSubmit} className="dock-search-form">
              <div className="dock-input-inner">
                <Search size={20} className="dock-search-icon" />
                <input
                  type="text"
                  className="dock-text-input"
                  placeholder={t.heroInputPlaceholder || "Describe your situation (e.g. 'Can my landlord lock me out without notice?')"}
                  value={heroInput}
                  onChange={(e) => setHeroInput(e.target.value)}
                  aria-label="Describe your legal situation"
                />
                <button 
                  type="submit" 
                  className="dock-submit-btn"
                  disabled={!heroInput.trim()}
                  aria-label="Submit Question"
                >
                  <span>{t.askButton || "Ask AI"}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>

            {/* Drag & Drop Document Dropstrip */}
            <div 
              className={`dock-dropzone-bar ${isDragOver ? 'drag-active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <input 
                type="file" 
                id="hero-file-drop" 
                className="hidden-file-input" 
                onChange={handleFileSelect}
                accept="image/*,.pdf,.txt" 
              />
              <label htmlFor="hero-file-drop" className="dropzone-label">
                <UploadCloud size={16} className="dropzone-icon" />
                <span>
                  Drop an <strong>eviction notice, agreement, or invoice</strong> to scan with Gemma 4 Vision
                </span>
                <span className="dropzone-browse">Browse file</span>
              </label>
            </div>

            {/* Fast Prompt Chips */}
            <div className="dock-prompt-chips">
              <span className="prompt-chips-label">Popular inquiries:</span>
              <div className="prompt-chips-tray">
                {HERO_QUICK_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="dock-chip-item"
                    onClick={() => handlePromptClick(prompt)}
                  >
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Minimalist Trust Metrics Bar */}
          <div className="hero-metrics-bar">
            <div className="metric-item">
              <strong className="metric-val">1,104</strong>
              <span className="metric-lbl">Supreme Court Holdings</span>
            </div>
            <div className="metric-divider"></div>
            <div className="metric-item">
              <strong className="metric-val">503</strong>
              <span className="metric-lbl">Constitutional Articles</span>
            </div>
            <div className="metric-divider"></div>
            <div className="metric-item">
              <strong className="metric-val">100% Free</strong>
              <span className="metric-lbl">Article 39A Public Aid</span>
            </div>
            <div className="metric-divider"></div>
            <div className="metric-item">
              <strong className="metric-val">0 Jargon</strong>
              <span className="metric-lbl">Everyday Citizen Language</span>
            </div>
          </div>
        </div>
      </section>

      {/* Target Audiences Bento Grid */}
      <AudienceSection 
        onSelectAudience={onSelectAudience}
        language={language}
      />

      {/* Gemma 4 Grounded Engine Pipeline (Clean single strip) */}
      <section className="engine-pipeline-section">
        <div className="container">
          <div className="pipeline-header-center">
            <span className="section-pill-tag">Precision Engine</span>
            <h2 className="pipeline-title">Why Gemma 4 + Grounded RAG?</h2>
            <p className="pipeline-desc">
              Generic chatbots hallucinate fake court cases and fabricated fines. Legal-Lens anchors every response to verified Indian statutes.
            </p>
          </div>

          <div className="pipeline-cards-row">
            <div className="pipeline-card">
              <div className="pipeline-card-num">01</div>
              <h3 className="pipeline-card-heading">Verified Evidence Bounds</h3>
              <p className="pipeline-card-text">
                Restricted to explicit statutory tags ([L1], [L2]). If a specific detail is not in the legal corpus, Gemma 4 states so rather than making up answers.
              </p>
            </div>

            <div className="pipeline-card">
              <div className="pipeline-card-num">02</div>
              <h3 className="pipeline-card-heading">Multimodal Notice Vision</h3>
              <p className="pipeline-card-text">
                Accepts document photos and PDFs. Gemma 4 reads lease clauses, eviction dates, and salary deductions to check statutory notice compliance.
              </p>
            </div>

            <div className="pipeline-card">
              <div className="pipeline-card-num">03</div>
              <h3 className="pipeline-card-heading">Direct Government Channels</h3>
              <p className="pipeline-card-text">
                Provides direct, actionable links to official redressal portals like NALSA (15100), Consumer Grievance (1915), and MSME Samadhaan.
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

      {/* Direct Bottom Invitation */}
      <section className="bottom-launch-section">
        <div className="container">
          <div className="bottom-launch-card">
            <div className="bottom-launch-copy">
              <h2 className="bottom-launch-title">Have a specific legal notice or question?</h2>
              <p className="bottom-launch-desc">
                Get an instant, structured breakdown backed by constitutional articles and Supreme Court holdings.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => setActiveTab('query')}
            >
              <Sparkles size={18} />
              <span>Launch Gemma 4 Counsel</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
