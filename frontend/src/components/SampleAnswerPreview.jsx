import React, { useState } from 'react';
import { 
  Scale, CheckCircle, ExternalLink, ShieldCheck, ArrowRight 
} from 'lucide-react';
import { translations } from '../data/translations';

const SAMPLE_SCENARIOS = [
  {
    id: "tenancy",
    title: "Tenancy · Deposit Withholding",
    tag: "Tenancy Rights",
    question: "My landlord refuses to return my ₹50,000 security deposit after 30 days notice and threatens to lock my belongings inside. What are my rights?",
    answer: {
      whatThisMeans: "Your landlord's actions are legally void. In India, a landlord cannot take the law into their own hands, forcibly dispossess a tenant, or withhold a security deposit without providing itemized receipts for actual physical damage beyond ordinary wear and tear.",
      possibleRights: [
        "Under Section 108(q) of Transfer of Property Act, 1882, the landlord is statutorily bound to return the deposit upon peaceful delivery of possession.",
        "Under the Model Tenancy Act, security deposits are capped at 2 months' rent and must be refunded within 30 days of vacating after agreed deductions.",
        "A landlord CANNOT disconnect essential amenities (electricity, water) or lock out a tenant without a judicial decree from the Rent Authority."
      ],
      nextSteps: [
        "Issue a formal written legal notice demanding the deposit refund within 15 days, referencing Section 108(q) of Transfer of Property Act.",
        "If they threaten a lockout, lodge a Police Non-Cognizable Report (NCR) for criminal trespass and intimidation (IPC / BNS).",
        "Approach the local Rent Controller / Civil Court or District Legal Services Authority (DLSA) for free government legal assistance."
      ],
      supportingSources: [
        {
          title: "Supreme Court Landmark",
          citation: "Bishandas v. State of Punjab, AIR 1961 SC 1570",
          summary: "The Supreme Court held that state authorities or private landlords cannot take forcible possession without due process of law, even against unauthorized occupants."
        },
        {
          title: "Transfer of Property Act, 1882",
          citation: "Section 106 & 108",
          summary: "Governs mandatory notice requirements and the reciprocal obligations of lessor and lessee."
        }
      ],
      whereToGetHelp: [
        { name: "NALSA Free Legal Aid", link: "https://nalsa.gov.in", helpline: "15100", type: "National Legal Aid" },
        { name: "Local Rent Authority / SDM Court", link: "https://districts.ecourts.gov.in", helpline: "Local District Office", type: "Dispute Court" }
      ]
    }
  },
  {
    id: "employment",
    title: "Employment · Unpaid Salary",
    tag: "Workplace Rights",
    question: "I resigned with 30 days notice, but my company has withheld my salary for the last 2 months and refuses to issue my relieving letter. What can I do?",
    answer: {
      whatThisMeans: "Withholding earned wages after fulfilling notice requirements constitutes unlawful wage deduction. An employer cannot hold your salary hostage or refuse experience certificates as leverage.",
      possibleRights: [
        "Under Section 15 of Payment of Wages Act, 1936, delaying or withholding earned wages is an offense punishable with compensation up to 10 times the unpaid amount.",
        "Under the Industrial Disputes Act, arbitrary wage withholdings after peaceful resignation entitle you to approach the Labour Commissioner directly.",
        "Service certificates and experience letters are statutory acknowledgments of employment and cannot be withheld maliciously."
      ],
      nextSteps: [
        "Send a formal written demand letter to the HR and Managing Director citing Section 15 of Payment of Wages Act with a 7-day payment deadline.",
        "File an online grievance on the Ministry of Labour's official SAMADHAN portal.",
        "Lodge a complaint with the District Labour Conciliation Officer for wage recovery."
      ],
      supportingSources: [
        {
          title: "Supreme Court Landmark",
          citation: "People's Union for Democratic Rights v. Union of India, (1982) 3 SCC 235",
          summary: "The Supreme Court ruled that paying less than statutory wages or withholding wages violates Article 23 of the Constitution (prohibition of forced labor)."
        },
        {
          title: "Payment of Wages Act, 1936",
          citation: "Section 5 & 15",
          summary: "Mandates timely wage disbursement by the 7th or 10th of every month and penalties for illegal deductions."
        }
      ],
      whereToGetHelp: [
        { name: "SAMADHAN Labour Portal", link: "https://samadhan.labour.gov.in", helpline: "1800-180-1555", type: "Labour Grievance" },
        { name: "District Labour Commissioner Office", link: "https://labour.gov.in", helpline: "Local Labour Office", type: "Conciliation" }
      ]
    }
  },
  {
    id: "consumer",
    title: "Consumer · E-Commerce Scam",
    tag: "Consumer Protection",
    question: "I purchased a laptop online for ₹45,000 that arrived broken. The seller rejected my return request claiming 'no return policy'. How do I get my money back?",
    answer: {
      whatThisMeans: "A 'no return policy' printed on an invoice or website cannot override statutory consumer protection law in India. Refusing to replace or refund a dead-on-arrival item is considered an 'Unfair Trade Practice' and 'Deficiency in Service'.",
      possibleRights: [
        "Under Section 2(47) of Consumer Protection Act, 2019, refusing to take back defective goods or refund consideration paid within statutory timelines is explicitly defined as an Unfair Trade Practice.",
        "Both the e-commerce marketplace and the merchant are jointly liable for defective products under Product Liability provisions (Section 84-86).",
        "You are entitled to a full refund, replacement, plus compensation for mental agony."
      ],
      nextSteps: [
        "Lodge a grievance immediately on the National Consumer Helpline portal (NCH) or dial 1915.",
        "Send a formal statutory email notice to the Grievance Officer of the e-commerce platform.",
        "If unresolved within 15 days, file a direct electronic consumer complaint on e-Daakhil without hiring a lawyer."
      ],
      supportingSources: [
        {
          title: "Supreme Court Landmark",
          citation: "Lucknow Development Authority v. M.K. Gupta, (1994) 1 SCC 243",
          summary: "The Supreme Court established that statutory authorities and commercial service providers are strictly accountable for deficiency in service and arbitrary customer harassment."
        },
        {
          title: "Consumer Protection Act, 2019",
          citation: "Section 2(11) & Section 35",
          summary: "Defines deficiency of service and grants every consumer the right to file claims in District Consumer Commissions."
        }
      ],
      whereToGetHelp: [
        { name: "National Consumer Helpline (NCH)", link: "https://consumerhelpline.gov.in", helpline: "1915", type: "Direct Grievance" },
        { name: "e-Daakhil Portal", link: "https://edaakhil.nic.in", helpline: "1800-11-4000", type: "Online Filing" }
      ]
    }
  }
];

export default function SampleAnswerPreview({ onAskScenario, language = 'en' }) {
  const t = translations[language] || translations.en;
  const [activeScenarioId, setActiveScenarioId] = useState("tenancy");

  const current = SAMPLE_SCENARIOS.find(s => s.id === activeScenarioId) || SAMPLE_SCENARIOS[0];

  return (
    <section id="sample-answer" className="editorial-section sample-answer-section">
      <div className="container">
        {/* Section Header */}
        <div className="editorial-header-row">
          <div className="editorial-tag-wrap">
            <span className="editorial-tag-sub">Grounded Quality Standard</span>
          </div>
          <h2 className="editorial-h2">
            Sample Answer <span className="editorial-italic">Preview</span>
          </h2>
          <p className="editorial-lead">
            {t.sampleSectionSubtitle}
          </p>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="sample-scenario-tabs" role="tablist">
          {SAMPLE_SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              role="tab"
              aria-selected={activeScenarioId === scenario.id}
              className={`sample-tab-btn ${activeScenarioId === scenario.id ? 'active' : ''}`}
              onClick={() => setActiveScenarioId(scenario.id)}
            >
              <span className="tab-pill-dot"></span>
              <span>{scenario.title}</span>
            </button>
          ))}
        </div>

        {/* High-Fidelity Answer Card */}
        <div className="sample-card-frame">
          {/* Question Banner */}
          <div className="sample-query-strip">
            <div className="query-meta-row">
              <span className="sample-tag-badge">{current.tag}</span>
              <span className="sample-verified-badge">
                <ShieldCheck size={14} />
                <span>Verified Legal Reasoning</span>
              </span>
            </div>
            <p className="sample-query-text">
              &ldquo;{current.question}&rdquo;
            </p>
          </div>

          {/* 5-Part Grounded Breakdown */}
          <div className="sample-breakdown-body">
            {/* Part 1: What this means */}
            <div className="sample-part-block">
              <div className="part-header">
                <span className="part-num">01</span>
                <h4>{t.whatThisMeans}</h4>
              </div>
              <p className="part-text-lead">{current.answer.whatThisMeans}</p>
            </div>

            {/* Part 2: Your Rights Under Law */}
            <div className="sample-part-block">
              <div className="part-header">
                <span className="part-num">02</span>
                <h4>{t.possibleRights}</h4>
              </div>
              <ul className="sample-check-list">
                {current.answer.possibleRights.map((right, idx) => (
                  <li key={idx}>
                    <CheckCircle size={18} className="list-icon-check" />
                    <span>{right}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Part 3: Recommended Next Steps */}
            <div className="sample-part-block">
              <div className="part-header">
                <span className="part-num">03</span>
                <h4>{t.nextSteps}</h4>
              </div>
              <ol className="sample-step-list">
                {current.answer.nextSteps.map((step, idx) => (
                  <li key={idx}>
                    <span className="step-counter">{idx + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Part 4: Clearly Visible Legal Citations */}
            <div className="sample-part-block citations-block">
              <div className="part-header">
                <span className="part-num">04</span>
                <h4>{t.supportingSources}</h4>
              </div>
              <div className="citation-cards-grid">
                {current.answer.supportingSources.map((source, idx) => (
                  <div key={idx} className="citation-card">
                    <div className="citation-top">
                      <Scale size={16} className="citation-scale-icon" />
                      <span className="citation-title">{source.title}</span>
                    </div>
                    <div className="citation-ref-box">{source.citation}</div>
                    <p className="citation-summary">{source.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Part 5: Official Government Portals */}
            <div className="sample-part-block portals-block">
              <div className="part-header">
                <span className="part-num">05</span>
                <h4>{t.whereToGetHelp}</h4>
              </div>
              <div className="portals-strip">
                {current.answer.whereToGetHelp.map((portal, idx) => (
                  <div key={idx} className="portal-item-pill">
                    <div className="portal-info">
                      <span className="portal-name">{portal.name}</span>
                      <span className="portal-contact">Helpline: <strong>{portal.helpline}</strong></span>
                    </div>
                    <a 
                      href={portal.link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="portal-link-btn"
                      aria-label={`Visit official portal ${portal.name}`}
                    >
                      <span>Access Portal</span>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Trigger Footer */}
          <div className="sample-card-footer">
            <span className="sample-footer-text">
              Have a similar dispute or notice? Ask the assistant for a tailored legal breakdown.
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm sample-ask-btn"
              onClick={() => onAskScenario && onAskScenario(current.question)}
            >
              <span>Ask About This Situation</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
