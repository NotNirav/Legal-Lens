import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, AlertTriangle, 
  Trash2, ArrowRight, ShieldCheck, FileCheck2, Info 
} from 'lucide-react';
import { translations } from '../data/translations';

export default function DocumentAnalysisSection({ onAnalyzeDocument, language = 'en' }) {
  const t = translations[language] || translations.en;
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  const handleFileProcess = (file) => {
    setFileError("");
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(pdf|jpe?g|png|webp)$/i)) {
      setFileError("Invalid file type. Please upload a PDF, JPG, or PNG document.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError("File exceeds 10MB limit. Please compress or crop your document.");
      return;
    }

    // Auto-detect probable category from file name
    const name = file.name.toLowerCase();
    let detected = "General Legal Notice";
    if (name.includes("evict") || name.includes("rent") || name.includes("lease") || name.includes("flat") || name.includes("tenant")) {
      detected = "Rental & Eviction Document";
    } else if (name.includes("salary") || name.includes("payslip") || name.includes("offer") || name.includes("resign") || name.includes("terminat") || name.includes("employ")) {
      detected = "Employment & Wages Document";
    } else if (name.includes("invoice") || name.includes("bill") || name.includes("receipt") || name.includes("order") || name.includes("consumer")) {
      detected = "Consumer & Invoice Document";
    } else if (name.includes("police") || name.includes("fir") || name.includes("complaint") || name.includes("court") || name.includes("notice")) {
      detected = "Legal / Police Document";
    }

    setSelectedFile({
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
      type: file.type || "Document",
      detectedType: detected,
      rawFile: file
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    setSelectedFile(null);
    setFileError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleTriggerAnalysis = () => {
    if (!selectedFile) return;
    if (onAnalyzeDocument) {
      onAnalyzeDocument(selectedFile);
    }
  };

  return (
    <section id="document-analysis" className="editorial-section doc-analysis-section">
      <div className="container">
        {/* Section Header */}
        <div className="editorial-header-row">
          <div className="editorial-tag-wrap">
            <span className="editorial-tag">Section 03</span>
            <span className="editorial-tag-line"></span>
            <span className="editorial-tag-sub">Multimodal Verification</span>
          </div>
          <h2 className="editorial-h2">
            Document Analysis <span className="editorial-italic">&amp; Notice Review</span>
          </h2>
          <p className="editorial-lead">
            {t.docSectionSubtitle}
          </p>
        </div>

        {/* Upload & Analysis Grid */}
        <div className="doc-analysis-grid">
          {/* Left: Drag & Drop Zone */}
          <div 
            className={`doc-dropzone ${dragOver ? 'drag-active' : ''} ${selectedFile ? 'has-file' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !selectedFile && fileInputRef.current && fileInputRef.current.click()}
            role="region"
            aria-label="Document upload dropzone"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => e.target.files && e.target.files[0] && handleFileProcess(e.target.files[0])}
            />

            {!selectedFile ? (
              <div className="dropzone-content">
                <div className="dropzone-icon-ring">
                  <Upload size={32} className="dropzone-icon" />
                </div>
                <h3 className="dropzone-title">{t.docDragDrop}</h3>
                <p className="dropzone-sub">{t.docFormats}</p>
                <button 
                  type="button" 
                  className="btn btn-outline btn-sm dropzone-browse-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (fileInputRef.current) fileInputRef.current.click();
                  }}
                >
                  <FileText size={16} />
                  <span>{t.docBrowse}</span>
                </button>
              </div>
            ) : (
              <div className="dropzone-file-preview">
                <div className="file-preview-card">
                  <div className="file-preview-icon">
                    <FileCheck2 size={36} />
                  </div>
                  <div className="file-preview-meta">
                    <div className="file-name-row">
                      <span className="file-name" title={selectedFile.name}>{selectedFile.name}</span>
                      <span className="file-badge">{selectedFile.detectedType}</span>
                    </div>
                    <span className="file-size-info">{selectedFile.size} · Ready for statutory cross-check</span>
                  </div>
                  <button 
                    type="button" 
                    className="file-remove-btn" 
                    onClick={handleRemove}
                    aria-label={t.docRemove}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="file-action-row">
                  <button 
                    type="button" 
                    className="btn btn-primary btn-lg file-analyze-btn"
                    onClick={handleTriggerAnalysis}
                  >
                    <span>{t.docAnalyzeBtn}</span>
                    <ArrowRight size={18} />
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-outline btn-sm"
                    onClick={() => { if (fileInputRef.current) fileInputRef.current.click(); }}
                  >
                    Change Document
                  </button>
                </div>
              </div>
            )}

            {fileError && (
              <div className="dropzone-error" role="alert">
                <AlertTriangle size={16} />
                <span>{fileError}</span>
              </div>
            )}
          </div>

          {/* Right: Inspection Standards & Safety Checklist */}
          <div className="doc-standards-card">
            <div className="standards-badge">
              <ShieldCheck size={18} />
              <span>Zero Privacy Leakage Protocol</span>
            </div>
            
            <h3 className="standards-title">What the Assistant Inspects</h3>
            
            <ul className="standards-list">
              <li>
                <div className="standard-num">01</div>
                <div>
                  <strong>Statutory Notice Period</strong>
                  <p>Verifies whether 15/30-day notice requirements under Transfer of Property Act or Employment laws were fulfilled.</p>
                </div>
              </li>
              <li>
                <div className="standard-num">02</div>
                <div>
                  <strong>Arbitrary or Coercive Penalties</strong>
                  <p>Identifies illegal forfeiture clauses, unilateral rent hikes, or unlawful salary withholdings.</p>
                </div>
              </li>
              <li>
                <div className="standard-num">03</div>
                <div>
                  <strong>Remedy &amp; Portals</strong>
                  <p>Directs you to appropriate redressal (e-Daakhil, Rent Controller, Samadhan, NALSA Free Legal Aid).</p>
                </div>
              </li>
            </ul>

            <div className="privacy-callout">
              <Info size={16} className="privacy-callout-icon" />
              <p>{t.docPrivacyNotice}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
