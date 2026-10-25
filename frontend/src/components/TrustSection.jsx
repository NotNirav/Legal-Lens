import React from 'react';
import { Scale } from 'lucide-react';
import { translations } from '../data/translations';

export default function TrustSection({ language = 'en' }) {
  const t = translations[language] || translations.en;

  const trustPillars = [
    {
      num: "01",
      title: "Constitutional Articles & Official Statutes",
      desc: "Extracted directly from the Constitution of India, Central Acts, and State statutes. Provisions are cited with official section numbers and statutory titles.",
      badge: "Statutory Law"
    },
    {
      num: "02",
      title: "Strict Anti-Hallucination Policy",
      desc: "Our retrieval-augmented architecture never fabricates acts, section numbers, or judgments. If a statutory provision is uncertain or state-specific, the system clearly discloses the limitation.",
      badge: "Grounded RAG"
    },
    {
      num: "03",
      title: "Zero Confidential Data Retention",
      desc: "All document reviews and queries are processed in-memory. Personal identity markers (such as Aadhaar, PAN, and contact credentials) are neither stored nor used to train public models.",
      badge: "Citizen Privacy"
    },
    {
      num: "04",
      title: "Official Government Redressal Portals",
      desc: "Every answer links directly to verified government redressal mechanisms: NALSA (15100), e-Daakhil for consumer disputes, SAMADHAN for wages, and 1930 for cyber fraud.",
      badge: "100% Free Public Aid"
    }
  ];

  return (
    <section id="trust-sources" className="editorial-section trust-section">
      <div className="container">
        {/* Section Header */}
        <div className="editorial-header-row">
          <div className="editorial-tag-wrap">
            <span className="editorial-tag">Section 06</span>
            <span className="editorial-tag-line"></span>
            <span className="editorial-tag-sub">Source Verification &amp; Ethics</span>
          </div>
          <h2 className="editorial-h2">
            Rooted in Indian Law. <span className="editorial-italic">Verified by Official Records.</span>
          </h2>
          <p className="editorial-lead">
            {t.trustSubtitle}
          </p>
        </div>

        {/* 4 Trust Pillars Grid */}
        <div className="trust-pillars-grid">
          {trustPillars.map((pillar) => (
            <div key={pillar.num} className="trust-pillar-card">
              <div className="pillar-top">
                <span className="pillar-num">{pillar.num}</span>
                <span className="pillar-badge">{pillar.badge}</span>
              </div>
              <h3 className="pillar-title">{pillar.title}</h3>
              <p className="pillar-desc">{pillar.desc}</p>
            </div>
          ))}
        </div>

        {/* Statutory Limitation Callout Box */}
        <div className="trust-statutory-notice">
          <div className="statutory-notice-icon">
            <Scale size={28} />
          </div>
          <div className="statutory-notice-content">
            <h4>Distinction Between Public Information &amp; Legal Representation</h4>
            <p>
              Legal-Lens is an educational legal awareness assistant developed to advance equal access to justice under 
              <strong> Article 39A of the Constitution of India</strong>. It provides generalized legal literacy and statutory awareness. 
              It does not constitute formal attorney-client representation. For court appearances, affidavit drafting, or filing urgent stay petitions, citizens are strongly encouraged to contact their 
              <strong> District Legal Services Authority (DLSA)</strong> for free government-appointed legal counsel.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
