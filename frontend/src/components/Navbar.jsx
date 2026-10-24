import React, { useState, useRef, useEffect } from 'react';
import { 
  Globe, Sun, Moon, ArrowRight, Sparkles, 
  ChevronDown, Check, Menu, X, Shield 
} from 'lucide-react';
import { translations } from '../data/translations';

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
  language, 
  setLanguage,
  theme = 'dark',
  toggleTheme
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langRef = useRef(null);
  const t = translations[language] || translations.en;

  const currentLangObj = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  // Close language dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (langRef.current && !langRef.current.contains(event.target)) {
        setLangDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNavClick = (tabId) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectLanguage = (code) => {
    setLanguage(code);
    setLangDropdownOpen(false);
  };

  return (
    <header className="navbar-sticky-header">
      <nav className="main-navbar" aria-label="Main navigation">
        <div className="container navbar-container">
          {/* Minimalist Modern Brand Logo */}
          <div 
            className="brand-logo" 
            role="button" 
            tabIndex={0}
            onClick={() => handleNavClick('home')}
            onKeyDown={(e) => e.key === 'Enter' && handleNavClick('home')}
            aria-label="LegalLens Home"
          >
            <div className="logo-symbol-modern">
              <span className="logo-symbol-core"></span>
            </div>
            <div className="logo-text-block">
              <span className="logo-title">LegalLens<span className="logo-accent-dot">.ai</span></span>
            </div>
          </div>

          {/* Desktop Navigation Links (ReactBits / shadcn inspired clean pill) */}
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
              className={`nav-link ${activeTab === 'insights' ? 'active' : ''}`}
              onClick={() => handleNavClick('insights')}
              role="tab"
              aria-selected={activeTab === 'insights'}
            >
              <span>{t.tabInsights || 'Insights'}</span>
            </button>
            <button
              type="button"
              className={`nav-link nav-link-assistant ${activeTab === 'query' ? 'active' : ''}`}
              onClick={() => handleNavClick('query')}
              role="tab"
              aria-selected={activeTab === 'query'}
            >
              <span>{t.tabQuery || 'Counsel'}</span>
              <span className="nav-assistant-pill">26B AI</span>
            </button>
          </div>

          {/* Right Action Cluster: Theme Switcher + Language Dropdown + CTA */}
          <div className="nav-actions-cluster">
            {/* Dark / Light Mode Toggle */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <Sun size={17} className="theme-icon sun-icon" />
              ) : (
                <Moon size={17} className="theme-icon moon-icon" />
              )}
            </button>

            {/* Smooth Floating Language Dropdown */}
            <div className="language-dropdown-wrapper" ref={langRef}>
              <button
                type="button"
                className={`language-trigger-btn ${langDropdownOpen ? 'is-open' : ''}`}
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                aria-haspopup="true"
                aria-expanded={langDropdownOpen}
                aria-label="Select interface language"
              >
                <Globe size={15} className="lang-globe-icon" />
                <span className="lang-trigger-label">{currentLangObj.native}</span>
                <ChevronDown size={14} className={`lang-chevron ${langDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {langDropdownOpen && (
                <div className="language-popover-menu animate-popover">
                  <div className="popover-arrow"></div>
                  <div className="popover-header-note">Select Language</div>
                  <div className="popover-options-list" role="menu">
                    {LANGUAGES.map((lang) => {
                      const isSelected = language === lang.code;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          className={`language-option-item ${isSelected ? 'active' : ''}`}
                          onClick={() => handleSelectLanguage(lang.code)}
                          role="menuitem"
                        >
                          <div className="lang-option-text">
                            <span className="lang-option-native">{lang.native}</span>
                            <span className="lang-option-eng">{lang.label}</span>
                          </div>
                          {isSelected && <Check size={14} className="lang-check-icon" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Highlighted CTA Launch Button */}
            <button
              type="button"
              className="btn btn-primary btn-sm nav-ask-cta"
              onClick={() => handleNavClick('query')}
              title="Launch the Gemma 4 Legal Assistant"
            >
              <Sparkles size={14} className="sparkle-gold" />
              <span>Launch Assistant</span>
              <ArrowRight size={14} />
            </button>

            {/* Mobile Hamburger Toggle */}
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

        {/* Mobile Flyout Menu */}
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
                className={`mobile-nav-link ${activeTab === 'insights' ? 'active' : ''}`}
                onClick={() => handleNavClick('insights')}
              >
                <span>{t.tabInsights || 'Insights'}</span>
              </button>
              <button
                type="button"
                className={`mobile-nav-link ${activeTab === 'query' ? 'active' : ''}`}
                onClick={() => handleNavClick('query')}
              >
                <span>{t.tabQuery || 'Counsel'}</span>
                <span className="nav-assistant-pill">26B AI</span>
              </button>

              <div className="mobile-drawer-footer">
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={() => handleNavClick('query')}
                >
                  <Sparkles size={16} />
                  <span>Launch Assistant</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
