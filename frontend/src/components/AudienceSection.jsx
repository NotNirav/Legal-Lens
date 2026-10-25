import React from 'react';
import { 
  Shield, Home, Briefcase, ShoppingBag, 
  ArrowRight, BookOpen 
} from 'lucide-react';
import { TARGET_AUDIENCES } from '../data/citizenRights';

const ICON_MAP = {
  Shield: Shield,
  Home: Home,
  Briefcase: Briefcase,
  ShoppingBag: ShoppingBag
};

export default function AudienceSection({ onSelectAudience }) {

  return (
    <section id="audiences" className="bento-audiences-section">
      <div className="container">
        <div className="section-header-clean">
          <span className="section-pill-tag">Everyday Scenarios</span>
          <h2 className="section-title-large">
            Tailored Legal Clarity <span className="title-serif-italic">for Real Life</span>
          </h2>
          <p className="section-subtitle-clean">
            Specific statutory protections, notice periods, and dispute mechanisms for those who need them most.
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
                role="button"
                onClick={() => onSelectAudience && onSelectAudience(item)}
                onKeyDown={(e) => e.key === 'Enter' && onSelectAudience && onSelectAudience(item)}
              >
                <div className="pillar-top-row">
                  <div className="pillar-icon-box">
                    <IconComp size={22} className="pillar-icon" />
                  </div>
                  <span className="pillar-num">0{index + 1}</span>
                </div>

                <div className="pillar-info-block">
                  <h3 className="pillar-title">{item.title}</h3>
                  <span className="pillar-subtitle">{item.subtitle}</span>
                </div>

                {/* Key Statute Badge */}
                <div className="pillar-statute-badge">
                  <BookOpen size={13} />
                  <span>{item.keyStatute}</span>
                </div>

                {/* Core Protections */}
                <p className="pillar-protection-text">
                  <strong>Protections:</strong> {item.protection}
                </p>

                <div className="pillar-issue-box">
                  <span className="issue-label">Common Dilemma:</span>
                  <p className="issue-text">{item.disputeExample}</p>
                </div>

                {/* Card Action Link */}
                <div className="pillar-action-row">
                  <span className="pillar-action-label">Analyze rights with Legal Lens</span>
                  <div className="pillar-action-arrow">
                    <ArrowRight size={14} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
