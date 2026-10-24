import React, { useState, useMemo } from 'react';
import { 
  Search, ChevronDown, ChevronUp, Scale, ArrowRight, HelpCircle 
} from 'lucide-react';
import { CITIZEN_INSIGHTS } from '../data/citizenRights';
import { translations } from '../data/translations';

export default function FaqSection({ onAskQuestion, language = 'en' }) {
  const t = translations[language] || translations.en;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  const categories = [
    { id: "all", label: "All Questions" },
    { id: "rent", label: "Tenancy & Rent" },
    { id: "employment", label: "Wages & Jobs" },
    { id: "consumer", label: "Consumer & Refunds" },
    { id: "cyber", label: "Cyber & Privacy" },
    { id: "police", label: "Police & FIR" }
  ];

  const filteredFaqs = useMemo(() => {
    return CITIZEN_INSIGHTS.filter(item => {
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        item.title.toLowerCase().includes(q) ||
        item.situation.toLowerCase().includes(q) ||
        item.rights.some(r => r.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <section id="faq-guides" className="editorial-section faq-section">
      <div className="container">
        {/* Section Header */}
        <div className="editorial-header-row">
          <div className="editorial-tag-wrap">
            <span className="editorial-tag-sub">Everyday Legal Knowledge</span>
          </div>
          <h2 className="editorial-h2">
            Frequently Asked <span className="editorial-italic">Legal Questions</span>
          </h2>
          <p className="editorial-lead">
            {t.faqSubtitle}
          </p>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="faq-toolbar">
          <div className="faq-search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="faq-search-input"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search frequently asked legal questions"
            />
            {searchQuery && (
              <button 
                type="button" 
                className="faq-search-clear"
                onClick={() => setSearchQuery("")}
              >
                Clear
              </button>
            )}
          </div>

          <div className="faq-categories-row" role="tablist">
            {categories.map((cat) => (
              <button
                key={cat.id}
                role="tab"
                aria-selected={selectedCategory === cat.id}
                className={`faq-cat-pill ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ Accordion List */}
        <div className="faq-accordion-list">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq, idx) => {
              const isExpanded = expandedId === faq.id || (idx === 0 && !expandedId);
              return (
                <div 
                  key={faq.id} 
                  className={`faq-accordion-item ${isExpanded ? 'open' : ''}`}
                >
                  <button
                    type="button"
                    className="faq-question-btn"
                    onClick={() => toggleExpand(faq.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="question-left">
                      <span className="faq-category-tag">{faq.categoryLabel}</span>
                      <span className="faq-question-title">{faq.title}</span>
                    </div>
                    <div className="question-right">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="faq-answer-panel">
                      <div className="faq-situation-quote">
                        <span className="quote-label">Common Situation:</span>
                        <p>{faq.situation}</p>
                      </div>

                      <div className="faq-rights-block">
                        <h5>Your Protected Legal Rights:</h5>
                        <ul className="faq-rights-list">
                          {faq.rights.map((right, rIdx) => (
                            <li key={rIdx}>{right}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="faq-sources-row">
                        <div className="sources-label-col">
                          <Scale size={15} />
                          <span>Statutory Authorities:</span>
                        </div>
                        <div className="sources-chips-wrap">
                          {faq.legalSources.map((source, sIdx) => (
                            <span key={sIdx} className="source-mini-chip">
                              {source.title} ({source.ref})
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="faq-action-bar">
                        <span className="channels-note">
                          Official Recourse: {faq.complaintChannels[0]?.name}
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onAskQuestion && onAskQuestion(faq.title)}
                        >
                          <span>Ask Assistant About This</span>
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="faq-empty-state">
              <HelpCircle size={36} className="empty-icon" />
              <p>No questions found matching &ldquo;{searchQuery}&rdquo;.</p>
              <button 
                type="button" 
                className="btn btn-outline btn-sm"
                onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}
              >
                Reset Search Filters
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
