import React, { useState, useMemo } from 'react';
import { 
  Search, ChevronDown, ChevronUp, ExternalLink, 
  Scale, BookOpen, Building2, Phone, CheckCircle, 
  AlertCircle, ArrowRight, X, Sparkles, RefreshCw, 
  RotateCcw, Sun, Feather, ChevronLeft, ChevronRight,
  Car, Home, Briefcase, ShoppingBag, Award
} from 'lucide-react';
import { searchKnowledgeBase } from '../services/ragService';
import { translations } from '../data/translations';

// 6 Curated Animated Life Scenes
const ANIMATED_SCENES = [
  {
    id: "scene_police",
    title: "The Midnight Police Check",
    category: "Personal Liberty & Privacy",
    icon: Car,
    accentColor: "#3B82F6",
    situation: "A police officer flags your vehicle down at night for a routine check and demands you unlock and hand over your mobile phone.",
    funQuestion: "Can police browse your private WhatsApp or photos during a routine vehicle stop?",
    statutoryTruth: "No. Under Article 21 and the Supreme Court landmark Puttaswamy ruling, your personal digital devices are protected by fundamental privacy rights. Police cannot demand phone access or browse your messages without a registered FIR, specific recorded grounds, or a judicial warrant.",
    keyArticle: "Article 21 Constitution of India · K.S. Puttaswamy v. Union of India · Section 100 CrPC",
    prefillQuestion: "What are my legal rights if a police officer demands to search my personal phone without a warrant during a routine vehicle check?"
  },
  {
    id: "scene_rent",
    title: "The Locked-Out Tenant",
    category: "Tenancy & Housing",
    icon: Home,
    accentColor: "#10B981",
    situation: "You return from work to discover your landlord has installed a padlock on the main door and cut off water supply because of an ongoing rent disagreement.",
    funQuestion: "Can a landlord ever take the law into their own hands to lock a tenant out?",
    statutoryTruth: "Strictly illegal. Under Section 29 of the Rent Control Acts and Supreme Court jurisprudence, dispossession without an official civil court decree is a criminal offense. Disconnecting water or electricity carries criminal prosecution and mandatory immediate restoration.",
    keyArticle: "Section 29 Maharashtra Rent Control Act · Model Tenancy Act Section 20 · IPC Section 441",
    prefillQuestion: "My landlord has padlocked my rental flat and cut off the water supply over a rent dispute. How do I immediately restore access and take legal action?"
  },
  {
    id: "scene_msme",
    title: "The 45-Day MSME Payment Shield",
    category: "Small Business & Trade",
    icon: Briefcase,
    accentColor: "#F59E0B",
    situation: "Your registered small business delivered customized supplies to a corporate client 3 months ago, but accounts keeps delaying payment with endless excuses.",
    funQuestion: "How long can a buyer legally delay payments to a small business without massive penalties?",
    statutoryTruth: "Strictly 45 days. Section 15 of the MSMED Act mandates that buyer payments must be cleared within 45 days. Any delay legally forces the buyer to pay compound interest with monthly rests at THREE TIMES the RBI bank rate.",
    keyArticle: "MSMED Act, 2006 (Sections 15, 16 & 18) · MSME Samadhaan Conciliation Mechanism",
    prefillQuestion: "A corporate buyer is withholding payment on my verified MSME invoices beyond 45 days. How do I file on MSME Samadhaan and claim 3x RBI compound interest?"
  },
  {
    id: "scene_zerofir",
    title: "The Zero FIR Liberty",
    category: "Criminal Procedure",
    icon: Scale,
    accentColor: "#8B5CF6",
    situation: "You were mugged near a metro station in another part of the city. When you walk into your local police precinct, the duty officer says: 'This happened outside our boundary, go there.'",
    funQuestion: "Can a police station ever reject your complaint because the incident happened outside their jurisdiction?",
    statutoryTruth: "Never. In Lalita Kumari v. Govt of UP, the Supreme Court ruled that any police station in India MUST register a 'Zero FIR' for cognizable offenses, initiate immediate preliminary steps, and transfer the case to the jurisdictional precinct afterwards.",
    keyArticle: "Supreme Court Ruling: Lalita Kumari v. Govt of UP (2014) · Section 154 CrPC / BNSS Sec 173",
    prefillQuestion: "A police officer is refusing to register my complaint because the crime occurred in a different jurisdiction. How do I enforce my right to a Zero FIR?"
  },
  {
    id: "scene_refund",
    title: "The 'No Refund' Retail Myth",
    category: "Consumer Rights",
    icon: ShoppingBag,
    accentColor: "#EC4899",
    situation: "You bought an appliance that arrived defective and broken. The seller refuses to assist, pointing to a stamp on the invoice: 'Goods once sold cannot be returned or refunded.'",
    funQuestion: "Does an invoice stamp take away your statutory right to a replacement or refund?",
    statutoryTruth: "Absolutely not. Under the Consumer Protection Act, 2019, unilateral 'No Refund' notices are deemed unfair contract terms and void under law. Consumers have a statutory right to replacement, repair, or full refund for defective goods.",
    keyArticle: "Consumer Protection Act, 2019 (Section 2(46) & Section 35) · National Consumer Helpline (1915)",
    prefillQuestion: "A seller delivered a defective product and refuses a refund citing 'Goods once sold are not refundable'. How do I file a complaint on e-Daakhil / NCH?"
  },
  {
    id: "scene_aid",
    title: "Article 39A: Free State-Funded Justice",
    category: "Constitutional Safeguards",
    icon: Award,
    accentColor: "#059669",
    situation: "You are facing an unfair legal notice or dispute, but hiring a private advocate costs more than your monthly earnings, making you feel helpless.",
    funQuestion: "Did you know that having no money does not mean you are denied court representation?",
    statutoryTruth: "Under Article 39A of the Constitution and the Legal Services Authorities Act, 1987, the State is legally mandated to provide free legal aid advocates through NALSA / DLSA to women, children, workers, custody detainees, and low-income citizens.",
    keyArticle: "Article 39A Constitution of India · Legal Services Authorities Act, 1987 · NALSA Helpline 15100",
    prefillQuestion: "How do I apply for free legal aid representation under Article 39A of the Constitution through NALSA or my local DLSA?"
  }
];

// 4 Interactive Myth vs Reality Flip Cards
const MYTH_REALITY_CARDS = [
  {
    id: "myth_cert",
    myth: "Employers have the legal right to retain your original university degree certificates until you finish 2 years.",
    reality: "Illegal Extortion: UGC regulations and High Court precedents strictly forbid employers or colleges from withholding original academic credentials. Retaining original papers is punishable.",
    statute: "UGC Directives & IPC Section 383 (Extortion)"
  },
  {
    id: "myth_deposit",
    myth: "A landlord can deduct your entire ₹50,000 security deposit for normal repainting and general flat aging.",
    reality: "Held in Trust: Model Tenancy Act prohibits deductions for ordinary wear and tear. Landlords must furnish itemized contractor receipts for any legitimate tenant-caused damage.",
    statute: "Model Tenancy Act & State Rent Control Rules"
  },
  {
    id: "myth_women_arrest",
    myth: "Police can arrest a woman at 2:00 AM if they suspect a non-bailable offense.",
    reality: "Sunset-to-Sunrise Ban: Section 46(4) CrPC / BNSS strictly forbids arresting female citizens between sunset and sunrise except under extraordinary situations with prior Magistrate approval.",
    statute: "Section 46(4) CrPC / BNSS Section 43"
  },
  {
    id: "myth_equal_pay",
    myth: "Private companies are completely free to pay female employees less than male peers for identical roles.",
    reality: "Constitutional Mandate: Article 39(d) and the Equal Remuneration Act, 1976 mandate equal wages for equal work without gender discrimination across all Indian establishments.",
    statute: "Article 39(d) & Equal Remuneration Act, 1976"
  }
];

// Daily Constitutional Wisdom Nuggets
const DAILY_WISDOM_NUGGETS = [
  {
    quote: "Under Section 160 CrPC, women and children under 15 years cannot be summoned to a police station just for questioning; police officers must interview them at their place of residence.",
    source: "Section 160 Code of Criminal Procedure, 1973"
  },
  {
    quote: "Even if your written lease agreement expires, you remain a 'tenant holding over' under Transfer of Property Act Sec 116, protected from arbitrary dispossession without due court process.",
    source: "Transfer of Property Act, 1882 (Section 116)"
  },
  {
    quote: "Cheque bounce is a criminal offense under Section 138 of Negotiable Instruments Act, carrying up to 2 years imprisonment and double the cheque amount as penalty.",
    source: "Negotiable Instruments Act, 1881 (Section 138)"
  },
  {
    quote: "Dr. B.R. Ambedkar called Article 32 the 'Heart and Soul of the Constitution' because it empowers any citizen to move the Supreme Court directly for protection of Fundamental Rights.",
    source: "Article 32 Constitution of India (Right to Constitutional Remedies)"
  },
  {
    quote: "Gratuity is mandatory after 5 years of continuous service under the Payment of Gratuity Act, calculated even if the employer claims it has an internal 'no gratuity policy'.",
    source: "Payment of Gratuity Act, 1972"
  },
  {
    quote: "Under the Consumer Protection Act, 2019, any consumer can file an electronic case from home through e-Daakhil without hiring an advocate or paying exorbitant fees.",
    source: "Consumer Protection Act, 2019 · e-Daakhil Portal"
  },
  {
    quote: "An official copy of a First Information Report (FIR) must be handed over to the informant or complainant immediately and completely FREE of charge under Section 154(2) CrPC.",
    source: "Section 154(2) Code of Criminal Procedure, 1973"
  },
  {
    quote: "26 weeks of paid maternity leave is a non-negotiable statutory right under the Maternity Benefit (Amendment) Act, 2017 for establishments with 10 or more employees.",
    source: "Maternity Benefit Act, 2017"
  }
];

export default function InsightsTab({ onAskQuestion, language = 'en' }) {
  const t = translations[language] || translations.en;

  // Scene Carousel State
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [showSceneTruth, setShowSceneTruth] = useState(false);

  // 3D Flip Card State
  const [flippedCards, setFlippedCards] = useState({});

  // Daily Wisdom Pill State
  const [wisdomIndex, setWisdomIndex] = useState(0);
  const [isWisdomAnimating, setIsWisdomAnimating] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [activeTabType, setActiveTabType] = useState("all"); // 'all', 'citizen', 'court'
  const [expandedCards, setExpandedCards] = useState({});

  // Query Knowledge Base
  const searchResults = useMemo(() => {
    return searchKnowledgeBase(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  const toggleExpand = (id) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFlip = (cardId) => {
    setFlippedCards(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const handleNextWisdom = () => {
    setIsWisdomAnimating(true);
    setTimeout(() => {
      setWisdomIndex(prev => (prev + 1) % DAILY_WISDOM_NUGGETS.length);
      setIsWisdomAnimating(false);
    }, 250);
  };

  const handleNextScene = () => {
    setShowSceneTruth(false);
    setActiveSceneIndex(prev => (prev + 1) % ANIMATED_SCENES.length);
  };

  const handlePrevScene = () => {
    setShowSceneTruth(false);
    setActiveSceneIndex(prev => (prev - 1 + ANIMATED_SCENES.length) % ANIMATED_SCENES.length);
  };

  const currentScene = ANIMATED_SCENES[activeSceneIndex];
  const CurrentSceneIcon = currentScene.icon;

  const categories = [
    { id: "all", label: t.filterAll },
    { id: "employment", label: "Employment & Wages" },
    { id: "rent", label: "Rent & Tenancy" },
    { id: "consumer", label: "Consumer & Refunds" },
    { id: "cyber", label: "Cyber & Harassment" },
    { id: "police", label: "Police & FIR" },
    { id: "family", label: "Family & Maintenance" }
  ];

  const totalResultsCount = (activeTabType !== 'court' ? searchResults.citizen.length : 0) + 
                            (activeTabType !== 'citizen' ? searchResults.court.length : 0);

  return (
    <div className="insights-view-wrapper soothing-insights-page">
      <div className="container">
        {/* Serene Sanctuary Visual Banner */}
        <section className="soothing-hero-sanctuary">
          <div className="sanctuary-artwork-wrap">
            <img 
              src="/insights_zen.jpg" 
              alt="Law is Justice, Clarity and Peace Sanctuary" 
              className="sanctuary-img"
              loading="eager"
            />
            <div className="sanctuary-gradient-overlay"></div>
            <div className="sanctuary-copy-block">
              <div className="sanctuary-tag">
                <Feather size={14} className="feather-icon" />
                <span>Soothing Legal Clarity · Article 39A Literacy Initiative</span>
              </div>
              <h1 className="sanctuary-title">
                Understand Your Rights <span className="sanctuary-italic">in Calm &amp; Peace</span>
              </h1>
              <p className="sanctuary-desc">
                No dense legalese. No panic. Experience Indian constitutional safeguards, tenant rights, and 1,104 extracted Supreme Court holdings through soothing visual scenes.
              </p>
            </div>
          </div>
        </section>

        {/* Feature 01: Animated Life Scenes Carousel */}
        <section className="soothing-section animated-scenes-section">
          <div className="editorial-header-row">
            <div className="editorial-tag-wrap">
              <span className="editorial-tag">Interactive Scene 01</span>
              <span className="editorial-tag-line"></span>
              <span className="editorial-tag-sub">Everyday Dilemmas &amp; Real Law</span>
            </div>
            <h2 className="editorial-h2">
              Life in Plain Law <span className="editorial-italic">— Animated Scenarios</span>
            </h2>
            <p className="editorial-lead">
              Step through common everyday situations citizens face across India, and uncover the exact statutory protection backing you.
            </p>
          </div>

          <div className="scene-theater-container">
            {/* Scene Card */}
            <div className="scene-display-card">
              <div className="scene-top-meta">
                <div className="scene-pill" style={{ borderColor: currentScene.accentColor }}>
                  <CurrentSceneIcon size={16} style={{ color: currentScene.accentColor }} />
                  <span>{currentScene.category}</span>
                </div>
                <div className="scene-pagination-indicator">
                  <span>Scene {activeSceneIndex + 1} of {ANIMATED_SCENES.length}</span>
                </div>
              </div>

              <h3 className="scene-headline">{currentScene.title}</h3>

              <div className="scene-narrative-box">
                <p className="scene-situation-text">
                  &ldquo;{currentScene.situation}&rdquo;
                </p>
              </div>

              {/* The Fun Question Hook */}
              <div className="scene-question-hook">
                <div className="hook-badge">The Everyday Question</div>
                <h4 className="hook-title">{currentScene.funQuestion}</h4>
              </div>

              {/* Revealable Statutory Truth */}
              <div className="scene-truth-drawer">
                {!showSceneTruth ? (
                  <button 
                    type="button" 
                    className="btn btn-outline scene-reveal-btn"
                    onClick={() => setShowSceneTruth(true)}
                  >
                    <Sparkles size={16} className="sparkle-gold" />
                    <span>Reveal What the Law Actually Says</span>
                  </button>
                ) : (
                  <div className="scene-revealed-content animate-fade-in">
                    <div className="revealed-header">
                      <CheckCircle size={18} className="text-emerald" />
                      <strong>Statutory Reality Under Indian Law</strong>
                    </div>
                    <p className="revealed-explanation">{currentScene.statutoryTruth}</p>
                    <div className="revealed-statute-pill">
                      <Scale size={14} />
                      <span>{currentScene.keyArticle}</span>
                    </div>

                    <div className="revealed-actions-row">
                      <button 
                        type="button" 
                        className="btn btn-primary btn-sm"
                        onClick={() => onAskQuestion && onAskQuestion(currentScene.prefillQuestion)}
                      >
                        <span>Test this scenario in Gemma 4 Assistant</span>
                        <ArrowRight size={14} />
                      </button>
                      <button 
                        type="button" 
                        className="btn-text-muted"
                        onClick={() => setShowSceneTruth(false)}
                      >
                        Hide details
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Scene Controls */}
              <div className="scene-controls-footer">
                <button 
                  type="button" 
                  className="scene-nav-btn prev-btn"
                  onClick={handlePrevScene}
                  aria-label="Previous legal scene"
                >
                  <ChevronLeft size={18} />
                  <span>Previous</span>
                </button>

                <div className="scene-dots-cluster">
                  {ANIMATED_SCENES.map((sc, idx) => (
                    <button
                      key={sc.id}
                      type="button"
                      className={`scene-dot ${idx === activeSceneIndex ? 'active' : ''}`}
                      onClick={() => {
                        setShowSceneTruth(false);
                        setActiveSceneIndex(idx);
                      }}
                      aria-label={`Jump to ${sc.title}`}
                    />
                  ))}
                </div>

                <button 
                  type="button" 
                  className="scene-nav-btn next-btn"
                  onClick={handleNextScene}
                  aria-label="Next legal scene"
                >
                  <span>Next Scene</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Feature 02: Interactive 3D Myth vs Reality Flip Cards */}
        <section className="soothing-section myth-flip-section">
          <div className="editorial-header-row">
            <div className="editorial-tag-wrap">
              <span className="editorial-tag">Interactive Scene 02</span>
              <span className="editorial-tag-line"></span>
              <span className="editorial-tag-sub">Bust Everyday Misconceptions</span>
            </div>
            <h2 className="editorial-h2">
              Legal Myth <span className="editorial-italic">vs Statutory Reality</span>
            </h2>
            <p className="editorial-lead">
              Tap or click any card to flip it and unveil the binding statutory truth.
            </p>
          </div>

          <div className="myth-flip-grid">
            {MYTH_REALITY_CARDS.map(card => {
              const isFlipped = !!flippedCards[card.id];
              return (
                <div 
                  key={card.id} 
                  className={`myth-flip-card ${isFlipped ? 'is-flipped' : ''}`}
                  onClick={() => toggleFlip(card.id)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => e.key === 'Enter' && toggleFlip(card.id)}
                  aria-label={`Flip card for ${card.myth}`}
                >
                  <div className="flip-card-inner">
                    {/* Front: Myth */}
                    <div className="flip-card-front">
                      <div className="flip-card-badge myth-badge">
                        <span>Common Myth</span>
                      </div>
                      <p className="flip-card-text">&ldquo;{card.myth}&rdquo;</p>
                      <div className="flip-action-hint">
                        <RefreshCw size={14} />
                        <span>Tap to reveal the truth</span>
                      </div>
                    </div>

                    {/* Back: Reality */}
                    <div className="flip-card-back">
                      <div className="flip-card-badge reality-badge">
                        <CheckCircle size={12} />
                        <span>Statutory Reality</span>
                      </div>
                      <p className="flip-reality-text">{card.reality}</p>
                      <div className="flip-statute-note">
                        <Scale size={12} />
                        <span>{card.statute}</span>
                      </div>
                      <div className="flip-action-hint back-hint">
                        <RotateCcw size={13} />
                        <span>Tap to flip back</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Feature 03: Daily Serendipity Wisdom Pill */}
        <section className="soothing-section wisdom-pill-section">
          <div className="wisdom-box">
            <div className="wisdom-sparkle-pill">
              <Sun size={15} className="sun-pulse" />
              <span>Did You Know? · Daily Legal Wisdom</span>
            </div>

            <div className={`wisdom-quote-wrap ${isWisdomAnimating ? 'wisdom-fade' : ''}`}>
              <p className="wisdom-text">
                &ldquo;{DAILY_WISDOM_NUGGETS[wisdomIndex].quote}&rdquo;
              </p>
              <div className="wisdom-citation">
                <Scale size={14} />
                <span>{DAILY_WISDOM_NUGGETS[wisdomIndex].source}</span>
              </div>
            </div>

            <button 
              type="button" 
              className="btn btn-outline btn-sm wisdom-refresh-btn"
              onClick={handleNextWisdom}
            >
              <Sparkles size={14} className="sparkle-gold" />
              <span>✨ Reveal Another Legal Insight</span>
            </button>
          </div>
        </section>

        {/* Feature 04: Peaceful Categorized Corpus Digest (NOT slop bubbles!) */}
        <section className="soothing-section corpus-digest-section">
          <div className="editorial-header-row">
            <div className="editorial-tag-wrap">
              <span className="editorial-tag">Corpus Explorer</span>
              <span className="editorial-tag-line"></span>
              <span className="editorial-tag-sub">503 Articles &amp; 1,104 Supreme Court Precedents</span>
            </div>
            <h2 className="editorial-h2">
              Explore Precedents <span className="editorial-italic">&amp; Case Law</span>
            </h2>
            <p className="editorial-lead">
              Carefully organized architectural records from our verified Indian judicial dataset.
            </p>
          </div>

          {/* Minimal Architectural Search & Filter Bar */}
          <div className="insights-filter-panel">
            {/* Search Input Box */}
            <div className="insights-search-field">
              <Search size={20} className="search-field-icon" aria-hidden="true" />
              <input
                type="text"
                className="insights-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label="Search legal rights and rulings"
              />
              {searchQuery && (
                <button 
                  type="button" 
                  className="insights-search-clear" 
                  onClick={() => setSearchQuery("")} 
                  aria-label="Clear Search"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Category Chips Bar */}
            <div className="insights-chips-scroll" role="radiogroup" aria-label="Filter by Category">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  className={`insights-category-chip ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Source Segments & Status Counter */}
            <div className="insights-segment-bar">
              <div className="insights-count-stat">
                Showing <strong>{totalResultsCount}</strong> verified legal records
              </div>

              <div className="insights-segment-pills" role="tablist">
                <button
                  type="button"
                  className={`segment-btn ${activeTabType === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTabType('all')}
                >
                  All Sources ({searchResults.citizen.length + searchResults.court.length})
                </button>
                <button
                  type="button"
                  className={`segment-btn ${activeTabType === 'citizen' ? 'active' : ''}`}
                  onClick={() => setActiveTabType('citizen')}
                >
                  Citizen Guides ({searchResults.citizen.length})
                </button>
                <button
                  type="button"
                  className={`segment-btn ${activeTabType === 'court' ? 'active' : ''}`}
                  onClick={() => setActiveTabType('court')}
                >
                  Supreme Court ({searchResults.court.length})
                </button>
              </div>
            </div>
          </div>

          {/* Results Container */}
          <div className="insights-results-stack">
            {totalResultsCount === 0 ? (
              <div className="minimal-empty-state">
                <AlertCircle size={36} className="empty-state-icon" />
                <h3 className="empty-state-title">No matching legal records found</h3>
                <p className="empty-state-desc">
                  Try searching for broader keywords like &ldquo;deposit&rdquo;, &ldquo;notice&rdquo;, &ldquo;wages&rdquo;, or &ldquo;FIR&rdquo;.
                </p>
                <button 
                  type="button" 
                  className="btn btn-primary btn-sm" 
                  onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}
                >
                  Reset Search Filters
                </button>
              </div>
            ) : (
              <>
                {/* 1. Citizen Practical Rights Guides */}
                {(activeTabType === 'all' || activeTabType === 'citizen') && searchResults.citizen.length > 0 && (
                  <section className="results-group-block">
                    <div className="group-heading-row">
                      <div className="group-heading-icon">
                        <BookOpen size={18} />
                      </div>
                      <div>
                        <h3 className="group-title">Citizen Rights &amp; Action Guides</h3>
                        <span className="group-subtitle">Practical remedies, notice periods, and official helplines</span>
                      </div>
                    </div>

                    <div className="minimal-cards-list">
                      {searchResults.citizen.map(guide => {
                        const isExpanded = expandedCards[guide.id] !== false;
                        return (
                          <article key={guide.id} className={`minimal-card ${isExpanded ? 'is-expanded' : ''}`}>
                            <div 
                              className="minimal-card-header" 
                              role="button" 
                              tabIndex={0}
                              onClick={() => toggleExpand(guide.id)}
                              onKeyDown={(e) => e.key === 'Enter' && toggleExpand(guide.id)}
                            >
                              <div className="header-meta-row">
                                <span className="meta-category-tag">{guide.categoryLabel}</span>
                                <span className="meta-verified-tag">
                                  <CheckCircle size={13} />
                                  <span>Verified {guide.dateVerified}</span>
                                </span>
                              </div>
                              
                              <h4 className="card-question-heading">{guide.title}</h4>

                              <div className="card-expand-toggle">
                                <span>{isExpanded ? "Collapse" : "Read Full Guide"}</span>
                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="minimal-card-body">
                                {/* Situation */}
                                <div className="detail-section-row">
                                  <span className="section-label-col">The Situation</span>
                                  <div className="section-content-col">
                                    <p className="situation-quote-text">{guide.situation}</p>
                                  </div>
                                </div>

                                {/* Your Legal Rights */}
                                <div className="detail-section-row">
                                  <span className="section-label-col">Your Rights</span>
                                  <div className="section-content-col">
                                    <ul className="minimal-bullet-list">
                                      {guide.rights.map((r, i) => (
                                        <li key={i}>{r}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>

                                {/* Next Steps */}
                                <div className="detail-section-row">
                                  <span className="section-label-col">Next Steps</span>
                                  <div className="section-content-col">
                                    <ol className="minimal-numbered-list">
                                      {guide.nextSteps.map((s, i) => (
                                        <li key={i}>
                                          <span className="step-num-badge">{i + 1}</span>
                                          <span>{s}</span>
                                        </li>
                                      ))}
                                    </ol>
                                  </div>
                                </div>

                                {/* Complaint Portals & Helplines */}
                                <div className="detail-section-row">
                                  <span className="section-label-col">Official Channels</span>
                                  <div className="section-content-col">
                                    <div className="channels-pill-grid">
                                      {guide.complaintChannels.map((c, i) => (
                                        <div key={i} className="channel-minimal-card">
                                          <div className="channel-top">
                                            {c.type === 'Phone' ? <Phone size={14} className="channel-icon" /> : <Building2 size={14} className="channel-icon" />}
                                            <strong className="channel-name">{c.name}</strong>
                                          </div>
                                          <p className="channel-text">{c.details}</p>
                                          {c.url && (
                                            <a href={c.url} target="_blank" rel="noopener noreferrer" className="channel-ext-link">
                                              <span>Visit Official Portal</span>
                                              <ExternalLink size={12} />
                                            </a>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                {/* Supporting Sources */}
                                <div className="detail-section-row">
                                  <span className="section-label-col">Statutory Bases</span>
                                  <div className="section-content-col">
                                    <div className="sources-tags-cluster">
                                      {guide.legalSources.map((src, i) => (
                                        <span key={i} className="minimal-source-chip">
                                          <Scale size={13} />
                                          <span><strong>{src.title}</strong> — {src.ref}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                {/* Card Action Footer */}
                                <div className="minimal-card-footer">
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm ask-about-guide-btn"
                                    onClick={() => onAskQuestion(guide.title)}
                                  >
                                    <span>Ask Gemma 4 Assistant about this guide</span>
                                    <ArrowRight size={14} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* 2. Supreme Court Precedents Section */}
                {(activeTabType === 'all' || activeTabType === 'court') && searchResults.court.length > 0 && (
                  <section className="results-group-block">
                    <div className="group-heading-row">
                      <div className="group-heading-icon">
                        <Scale size={18} />
                      </div>
                      <div>
                        <h3 className="group-title">Binding Supreme Court Decisions</h3>
                        <span className="group-subtitle">Constitutional rulings and ratios decidendi under Article 141</span>
                      </div>
                    </div>

                    <div className="minimal-cards-list">
                      {searchResults.court.map(prec => {
                        const isExpanded = expandedCards[prec.id] === true;
                        return (
                          <article key={prec.id} className={`minimal-card court-record-card ${isExpanded ? 'is-expanded' : ''}`}>
                            <div 
                              className="minimal-card-header" 
                              role="button" 
                              tabIndex={0}
                              onClick={() => toggleExpand(prec.id)}
                              onKeyDown={(e) => e.key === 'Enter' && toggleExpand(prec.id)}
                            >
                              <div className="header-meta-row">
                                <span className="meta-category-tag">{prec.category}</span>
                                <span className="court-bench-tag">{prec.court} ({prec.year})</span>
                                <span className="cluster-tag-text">{prec.cluster_tag}</span>
                              </div>

                              <h4 className="card-question-heading">{prec.question}</h4>

                              <div className="card-expand-toggle">
                                <span>{isExpanded ? "Collapse" : "View Court Holding"}</span>
                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="minimal-card-body">
                                <div className="detail-section-row">
                                  <span className="section-label-col">Ratio Decidendi</span>
                                  <div className="section-content-col">
                                    <div className="court-quote-box">
                                      <p>{prec.answer}</p>
                                    </div>
                                  </div>
                                </div>

                                {prec.legal_references && prec.legal_references.length > 0 && (
                                  <div className="detail-section-row">
                                    <span className="section-label-col">Referenced Acts</span>
                                    <div className="section-content-col">
                                      <div className="sources-tags-cluster">
                                        {prec.legal_references.map((ref, idx) => (
                                          <span key={idx} className="minimal-source-chip mono-chip">
                                            {ref}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <div className="minimal-card-footer">
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => onAskQuestion(prec.question)}
                                  >
                                    <span>Apply this ruling with Gemma 4 Assistant</span>
                                    <ArrowRight size={14} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
