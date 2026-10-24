import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import HomeTab from './components/HomeTab';
import InsightsTab from './components/InsightsTab';
import QueryTab from './components/QueryTab';
import { Scale, Shield, PhoneCall } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [language, setLanguage] = useState('en');
  const [prefillQuestion, setPrefillQuestion] = useState("");
  const [prefillAttachment, setPrefillAttachment] = useState(null);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('legal_lens_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('legal_lens_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Handler when user asks a question from Hero input or prompts
  const handleAskQuestion = (questionText) => {
    setPrefillQuestion(questionText);
    setActiveTab('query');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handler when user uploads a document in Document Analysis Section
  const handleAnalyzeDocument = (fileObj) => {
    setPrefillAttachment({
      file: fileObj.rawFile,
      name: fileObj.name,
      size: fileObj.size,
      type: fileObj.type
    });
    setPrefillQuestion(`Please review this uploaded document (${fileObj.detectedType}) and explain my legal rights, statutory notice timelines, and immediate next steps under Indian Law.`);
    setActiveTab('query');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handler when user clicks an Audience Pillar (Citizens, Tenants, Workers, Small Business Owners)
  const handleSelectAudience = (audience) => {
    setPrefillQuestion(audience.prefillQuestion);
    setActiveTab('query');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handler when user clicks "Ask about this" from an Insight/FAQ card
  const handleAskQuestionFromInsight = (questionText) => {
    setPrefillQuestion(`I need legal guidance regarding this situation: "${questionText}". What are my rights and next steps?`);
    setActiveTab('query');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`app-layout theme-${theme}`}>
      {/* Top Navbar with Dark/Light Toggle & Smooth Language Dropdown */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        language={language}
        setLanguage={setLanguage}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Main Content Area */}
      <main className="main-content" role="main">
        {activeTab === 'home' && (
          <HomeTab
            setActiveTab={setActiveTab}
            onAskQuestion={handleAskQuestion}
            onAnalyzeDocument={handleAnalyzeDocument}
            onSelectAudience={handleSelectAudience}
            language={language}
          />
        )}

        {activeTab === 'insights' && (
          <InsightsTab
            onAskQuestion={handleAskQuestionFromInsight}
            language={language}
          />
        )}

        {activeTab === 'query' && (
          <QueryTab
            prefillQuestion={prefillQuestion}
            clearPrefill={() => setPrefillQuestion("")}
            prefillAttachment={prefillAttachment}
            clearPrefillAttachment={() => setPrefillAttachment(null)}
            language={language}
          />
        )}
      </main>

      {/* Discrete Bottom Emergency Helplines Bar */}
      <aside className="emergency-footer-bar" aria-label="National Legal and Emergency Helplines">
        <div className="container emergency-footer-content">
          <div className="emergency-footer-item">
            <PhoneCall size={14} className="icon-emerald" />
            <span>NALSA Free Legal Aid: <a href="tel:15100"><strong>15100</strong></a></span>
          </div>
          <div className="emergency-footer-item">
            <PhoneCall size={14} className="icon-blue" />
            <span>National Cyber Crime: <a href="tel:1930"><strong>1930</strong></a></span>
          </div>
          <div className="emergency-footer-item">
            <PhoneCall size={14} className="icon-amber" />
            <span>National Consumer Helpline: <a href="tel:1915"><strong>1915</strong></a></span>
          </div>
          <div className="emergency-trust-pill">
            <Shield size={14} className="icon-gold" />
            <span>24x7 Statutory Helplines</span>
          </div>
        </div>
      </aside>

      {/* Editorial Site Footer */}
      <footer className="site-footer">
        <div className="container footer-container">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="footer-logo-row">
                <Scale size={24} className="footer-logo" />
                <span className="footer-title">Legal-Lens</span>
              </div>
              <p className="footer-desc">
                An open-source public legal empowerment initiative helping Indian citizens, tenants, workers, and small shop owners understand statutory rights in plain, everyday language.
              </p>
              <div className="footer-edition-note">
                <span>Hacktoberfest 2026 Edition · Public Legal Literacy Initiative</span>
              </div>
            </div>

            <div className="footer-links-col">
              <h4>Official Redressal Portals</h4>
              <ul>
                <li><a href="https://nalsa.gov.in" target="_blank" rel="noopener noreferrer">NALSA Free Legal Aid (15100)</a></li>
                <li><a href="https://consumerhelpline.gov.in" target="_blank" rel="noopener noreferrer">National Consumer Helpline (1915)</a></li>
                <li><a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">National Cyber Crime Reporting (1930)</a></li>
                <li><a href="https://samadhan.labour.gov.in" target="_blank" rel="noopener noreferrer">SAMADHAN Labour Grievance Portal</a></li>
                <li><a href="https://edaakhil.nic.in" target="_blank" rel="noopener noreferrer">e-Daakhil Electronic Consumer Filing</a></li>
              </ul>
            </div>

            <div className="footer-links-col">
              <h4>Grounded Legal Corpus</h4>
              <ul>
                <li><span className="footer-stat">Constitution of India (503 Articles)</span></li>
                <li><span className="footer-stat">Supreme Court Rulings (1,104 Holdings)</span></li>
                <li><span className="footer-stat">Model Tenancy &amp; Rent Control Acts</span></li>
                <li><span className="footer-stat">Payment of Wages &amp; Industrial Codes</span></li>
                <li><span className="footer-stat">MSMED Act Statutory 45-Day Rule</span></li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-copy">
              &copy; 2026 Legal-Lens Project. Non-profit public interest awareness.
            </p>
            <div className="footer-disclaimer-pill">
              <Shield size={14} />
              <span>Public Legal Literacy — Not formal attorney representation. Under Article 39A of Constitution of India.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
