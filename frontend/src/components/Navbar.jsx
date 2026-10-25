import React, { useState, useRef, useEffect } from 'react';
import { 
  Globe, Sun, Moon, 
  ChevronDown, Check, Menu, X, Scale
} from 'lucide-react';
import { translations } from '../data/translations';
import { DEFAULT_INDIAN_STATES } from '../data/states';
import { getStates } from '../lib/api';

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' }
];

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  language = 'en', 
  setLanguage,
  theme = 'light',
  toggleTheme,
  selectedState = 'Maharashtra',
  setSelectedState
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [statesList, setStatesList] = useState(DEFAULT_INDIAN_STATES);
  const [stateSearch, setStateSearch] = useState('');
  
  const langRef = useRef(null);
  const stateRef = useRef(null);
  const stateInputRef = useRef(null);
  const t = translations[language] || translations.en;

  useEffect(() => {
    if (stateDropdownOpen) {
      stateInputRef.current?.focus({ preventScroll: true });
    }
  }, [stateDropdownOpen]);

  useEffect(() => {
    let isMounted = true;
    getStates()
      .then((data) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setStatesList(data);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (langRef.current && !langRef.current.contains(event.target)) {
        setLangDropdownOpen(false);
      }
      if (stateRef.current && !stateRef.current.contains(event.target)) {
        setStateDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNavClick = (tabId) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
    if (tabId !== 'query') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStateSelect = (stName) => {
    if (setSelectedState) setSelectedState(stName);
    localStorage.setItem('legal_lens_selected_state', stName);
    setStateDropdownOpen(false);
    setStateSearch('');
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        let detected = 'Maharashtra';
        if (latitude >= 28.0 && latitude <= 29.2 && longitude >= 76.5 && longitude <= 77.8) {
          detected = 'Delhi';
        } else if (latitude >= 12.5 && latitude <= 13.8 && longitude >= 77.0 && longitude <= 78.5) {
          detected = 'Karnataka';
        } else if (latitude >= 18.2 && latitude <= 20.0 && longitude >= 72.5 && longitude <= 74.0) {
          detected = 'Maharashtra';
        } else if (latitude >= 12.8 && latitude <= 13.5 && longitude >= 80.0 && longitude <= 80.5) {
          detected = 'Tamil Nadu';
        } else if (latitude >= 22.0 && latitude <= 23.5 && longitude >= 88.0 && longitude <= 88.8) {
          detected = 'West Bengal';
        }
        handleStateSelect(detected);
      },
      (error) => {
        console.warn('Geolocation detection error:', error);
      },
      { timeout: 10000 }
    );
  };

  const filteredStates = statesList.filter(s => 
    s.jurisdiction.toLowerCase().includes(stateSearch.toLowerCase().trim())
  );

  const currentStateObj = statesList.find(
    s => s.jurisdiction.toLowerCase() === selectedState.toLowerCase()
  );
  const isCovered = currentStateObj ? currentStateObj.covered : true;

  return (
    <header className="navbar-sticky-header">
      <nav className="main-navbar" aria-label="Main navigation">
        <div className="container navbar-container">
          {/* Wordmark: serif 'Legal Lens' with 4-bar CSS accent mark */}
          <div 
            className="brand-logo" 
            role="button" 
            tabIndex={0}
            onClick={() => handleNavClick('home')}
            onKeyDown={(e) => e.key === 'Enter' && handleNavClick('home')}
            aria-label="Legal Lens Home"
          >
            <span className="brand-wordmark">Legal Lens</span>
            <span className="brand-accent-mark" aria-hidden="true">
              <span className="bar bar-red" />
              <span className="bar bar-blue" />
              <span className="bar bar-yellow" />
              <span className="bar bar-pink" />
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <div className="desktop-nav-links" role="tablist">
            <button
              type="button"
              className={`nav-link ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => handleNavClick('home')}
              role="tab"
              aria-selected={activeTab === 'home'}
            >
              <span>{t.tabHome || 'Home'}</span>
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === 'query' ? 'active' : ''}`}
              onClick={() => handleNavClick('query')}
              role="tab"
              aria-selected={activeTab === 'query'}
            >
              <span>{t.tabQuery || 'Counsel'}</span>
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === 'insights' ? 'active' : ''}`}
              onClick={() => handleNavClick('insights')}
              role="tab"
              aria-selected={activeTab === 'insights'}
            >
              <span>{t.tabInsights || 'Insights'}</span>
            </button>
          </div>

          {/* Right cluster: State selector + Language toggle + Mode toggle */}
          <div className="nav-actions-cluster">
            {/* Header State Selector */}
            <div className="header-state-selector-wrap" ref={stateRef}>
              <button
                type="button"
                className="header-detect-location-btn"
                onClick={handleDetectLocation}
                title={t.detectLocation || "Detect my location"}
                aria-label={t.detectLocation || "Detect my location"}
              >
                <Globe size={14} />
              </button>

              <button
                type="button"
                className="header-state-trigger"
                onClick={() => setStateDropdownOpen(prev => !prev)}
                aria-expanded={stateDropdownOpen}
                aria-label={`Selected jurisdiction: ${selectedState}`}
                title="Select state jurisdiction for local law grounding"
              >
                <Scale size={13} className="state-scale-icon" />
                <span className="state-trigger-text">{selectedState}</span>
                {!isCovered && <span className="state-central-chip">Central</span>}
                <ChevronDown size={12} className={`chevron-icon ${stateDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {stateDropdownOpen && (
                <div className="header-state-dropdown animate-popover" role="dialog" aria-label="Select state jurisdiction">
                  <div className="state-search-wrap">
                    <input
                      ref={stateInputRef}
                      type="text"
                      className="state-quick-search-input"
                      placeholder="Search state or UT..."
                      value={stateSearch}
                      onChange={(e) => setStateSearch(e.target.value)}
                      aria-label="Filter state list"
                    />
                  </div>
                  <div className="state-quick-list" role="listbox">
                    {filteredStates.map((st) => (
                      <button
                        key={st.jurisdiction}
                        type="button"
                        className={`state-quick-item ${st.jurisdiction === selectedState ? 'active' : ''}`}
                        onClick={() => handleStateSelect(st.jurisdiction)}
                        role="option"
                        aria-selected={st.jurisdiction === selectedState}
                      >
                        <span className="state-item-name">{st.jurisdiction}</span>
                        <span className="state-item-note">
                          {st.covered ? 'State laws indexed' : 'Central law only'}
                        </span>
                        {st.jurisdiction === selectedState && (
                          <Check size={13} className="state-check-icon" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Language Toggle: EN / हिन्दी */}
            <div className="header-lang-toggle" role="group" aria-label="Language selector">
              <button
                type="button"
                className={`lang-pill-btn ${language === 'en' ? 'active' : ''}`}
                onClick={() => setLanguage && setLanguage('en')}
                aria-pressed={language === 'en'}
              >
                EN
              </button>
              <span className="lang-pill-sep" aria-hidden="true">/</span>
              <button
                type="button"
                className={`lang-pill-btn ${language === 'hi' ? 'active' : ''}`}
                onClick={() => setLanguage && setLanguage('hi')}
                aria-pressed={language === 'hi'}
              >
                हिन्दी
              </button>
            </div>

            {/* Language Extended Dropdown (for Marathi, Bengali, Tamil, etc.) */}
            <div className="header-lang-more-wrap" ref={langRef}>
              <button
                type="button"
                className="btn-lang-more"
                onClick={() => setLangDropdownOpen(prev => !prev)}
                aria-label="More languages"
                title="More languages"
                aria-expanded={langDropdownOpen}
              >
                <Globe size={14} />
              </button>

              {langDropdownOpen && (
                <div className="header-lang-dropdown animate-popover" role="menu">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      className={`lang-dropdown-item ${language === lang.code ? 'active' : ''}`}
                      onClick={() => {
                        if (setLanguage) setLanguage(lang.code);
                        setLangDropdownOpen(false);
                      }}
                      role="menuitem"
                    >
                      <span>{lang.native}</span>
                      <span className="lang-eng-label">({lang.label})</span>
                      {language === lang.code && <Check size={13} className="ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Theme Toggle Button */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <Sun size={15} className="theme-icon" />
              ) : (
                <Moon size={15} className="theme-icon" />
              )}
            </button>

            {/* Mobile menu toggle */}
            <button
              type="button"
              className="mobile-toggle-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile flyout */}
        {mobileMenuOpen && (
          <div className="mobile-flyout-drawer animate-slide-down">
            <div className="container mobile-flyout-content">
              <button
                type="button"
                className={`mobile-nav-link ${activeTab === 'home' ? 'active' : ''}`}
                onClick={() => handleNavClick('home')}
              >
                <span>{t.tabHome || 'Home'}</span>
              </button>
              <button
                type="button"
                className={`mobile-nav-link ${activeTab === 'query' ? 'active' : ''}`}
                onClick={() => handleNavClick('query')}
              >
                <span>{t.tabQuery || 'Counsel'}</span>
              </button>
              <button
                type="button"
                className={`mobile-nav-link ${activeTab === 'insights' ? 'active' : ''}`}
                onClick={() => handleNavClick('insights')}
              >
                <span>{t.tabInsights || 'Insights'}</span>
              </button>

              <div className="mobile-drawer-footer">
                <div className="mobile-state-picker-row">
                  <span className="mobile-picker-label">Jurisdiction:</span>
                  <select
                    className="mobile-state-select"
                    value={selectedState}
                    onChange={(e) => handleStateSelect(e.target.value)}
                    aria-label="Select state jurisdiction"
                  >
                    {statesList.map(st => (
                      <option key={st.jurisdiction} value={st.jurisdiction}>
                        {st.jurisdiction} {st.covered ? '' : '(Central only)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
