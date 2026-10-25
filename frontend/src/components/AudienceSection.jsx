import React from 'react';
import { 
  Shield, Home, Briefcase, ShoppingBag, 
  ArrowRight, Scale 
} from 'lucide-react';
import { TARGET_AUDIENCES } from '../data/citizenRights';

const ICON_MAP = {
  Shield: Shield,
  Home: Home,
  Briefcase: Briefcase,
  ShoppingBag: ShoppingBag
};

export default function AudienceSection({ onSelectAudience, onAskQuestion, language = 'en' }) {
  const isHindi = language === 'hi';

  const handleDilemmaClick = (e, questionText) => {
    e.stopPropagation();
    if (onAskQuestion) {
      onAskQuestion(questionText);
    }
  };

  return (
    <section id="audiences" className="bento-audiences-section" aria-label="Everyday Legal Scenarios">
      <div className="container">
        <div className="section-header-clean">
          <span className="section-pill-tag">
            {isHindi ? 'दैनिक जीवन के परिदृश्य' : 'Everyday Scenarios'}
          </span>
          <h2 className="section-title-large">
            {isHindi ? 'दैनिक जीवन के लिए' : 'Tailored Legal Clarity'}{' '}
            <span className="title-serif-italic">
              {isHindi ? 'कानूनी स्पष्टता' : 'for Real Life'}
            </span>
          </h2>
          <p className="section-subtitle-clean">
            {isHindi
              ? 'नागरिकों, किरायेदारों, श्रमिकों और व्यापार मालिकों के लिए वैधानिक अधिकार और सुरक्षा नियम।'
              : 'Specific statutory protections, notice periods, and dispute mechanisms for those who need them most.'}
          </p>
        </div>

        {/* 4 Pillars Bento Grid */}
        <div className="audiences-bento-grid">
          {TARGET_AUDIENCES.map((item, index) => {
            const IconComp = ICON_MAP[item.icon] || Shield;
            return (
              <div 
                key={item.id} 
                className="bento-card-pillar"
                tabIndex={0}
                role="region"
                aria-label={`${item.title} legal rights`}
              >
                {/* 1. Icon + Number */}
                <div className="pillar-top-row">
                  <div className="pillar-icon-box">
                    <IconComp size={22} className="pillar-icon" />
                  </div>
                  <span className="pillar-num">0{index + 1}</span>
                </div>

                {/* 2. Title (Reserved two lines so titles align across cards) */}
                <h3 className="pillar-title">{item.title}</h3>

                {/* 3. Subtitle */}
                <span className="pillar-subtitle">{item.subtitle}</span>

                {/* Statute Badge with inline SVG Scale Icon */}
                <div className="pillar-statute-badge" title="Grounded statutory framework">
                  <Scale size={13} className="pillar-statute-icon" />
                  <span>{item.keyStatute}</span>
                </div>

                {/* 4. Labeled "Protections" Block */}
                <div className="pillar-block-section">
                  <span className="pillar-block-label">
                    {isHindi ? 'सुरक्षा नियम:' : 'Protections:'}
                  </span>
                  <p className="pillar-block-text">{item.protection}</p>
                  <span className="pillar-disclaimer-note">
                    {isHindi
                      ? 'केंद्रीय अथवा मॉडल अधिनियमों पर आधारित उदाहरण; राज्यवार नियम भिन्न हो सकते हैं। अपने राज्य के लिए पूछें।'
                      : 'Examples from central or model laws; rules vary by state. Ask Legal Lens for your state.'}
                  </span>
                </div>

                {/* 5. Labeled "Common dilemma" Block (Interactive Button) */}
                <div className="pillar-block-section">
                  <span className="pillar-block-label">
                    {isHindi ? 'सामान्य दुविधा:' : 'Common dilemma:'}
                  </span>
                  <button
                    type="button"
                    className="pillar-dilemma-btn"
                    onClick={(e) => handleDilemmaClick(e, item.prefillQuestion)}
                    title={isHindi ? "लीगल लेंस पर यह प्रश्न पूछें" : "Click to ask Legal Lens about this dilemma"}
                    aria-label={`Ask dilemma: ${item.disputeExample}`}
                  >
                    <span className="dilemma-quote">&ldquo;{item.disputeExample}&rdquo;</span>
                    <span className="dilemma-action-hint">
                      {isHindi ? 'इस पर उत्तर पाएं →' : 'Ask about this →'}
                    </span>
                  </button>
                </div>

                {/* 6. Action pinned to the bottom of the card with margin-top: auto */}
                <div 
                  className="pillar-action-row" 
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectAudience && onSelectAudience(item)}
                  onKeyDown={(e) => e.key === 'Enter' && onSelectAudience && onSelectAudience(item)}
                  aria-label={`Analyze ${item.title} rights with Legal Lens`}
                >
                  <span className="pillar-action-label">
                    <span>{isHindi ? 'अधिकारों का विश्लेषण करें' : 'Analyze rights with Legal Lens'}</span>
                    <ArrowRight size={14} className="pillar-arrow-inline" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
