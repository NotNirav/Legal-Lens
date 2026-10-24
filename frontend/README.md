# ⚖️ Legal-Lens: Legal Rights Awareness Assistant

> **Hacktoberfest 2026 Project**  
> An accessible, trustworthy, source-backed legal awareness assistant designed specifically for Indian citizens, tenants, workers, and small shop owners.

---

## 🌟 Key Features

### 1. 🏛️ Home — Understand Your Rights
- **Hero Title**: *"Understand your rights. Know your next steps."*
- **6 Core Everyday Dispute Categories**:
  - 💼 **Employment & Unpaid Salary** (Wage protection, arbitrary deductions, F&F recovery)
  - 🏠 **Rent & Security Deposits** (Model Tenancy Act, deposit withholding, unlawful eviction)
  - 🛍️ **Consumer Complaints & Refunds** (Defective goods, e-Daakhil filing, warranty refusals)
  - 🛡️ **Online Harassment & Threats** (Cyber blackmail, morphed photos, 1930 Golden Hour freeze)
  - ⚖️ **Police Complaints & FIR** (Zero FIR rights, mandatory FIR under *Lalita Kumari*, arrest rules)
  - 👥 **Family & Maintenance** (Section 125 CrPC maintenance, Domestic Violence relief, Elderline)
- **Click-to-Prefill**: Clicking any category immediately switches to the Legal Assistant with a realistic question prefilled.
- **How It Works**: 3-step citizen journey.
- **Privacy Notice**: Proactive advice on redacting Aadhaar/PAN before submitting documents.

### 2. 🔍 Insights — Everyday Legal Q&A
- **Real-Time Search Bar**: Instant query search across citizen dispute guides and court precedents.
- **Domain Filter Pills**: Filter by category (Employment, Rent, Consumer, Cyber, Police, Family).
- **Dual Source Views**: Filter between verified Citizen Practical Guides and Supreme Court Case Decisions.
- **Structured Explanations**:
  - The Situation
  - Your Legal Rights under Indian Law
  - Practical Next Steps (1-2-3 checklist)
  - Official Complaint Channels & Direct Portals (SAMADHAN, e-Daakhil, Cyber Portal, DLSA 15100)
  - Supporting Statutes & Landmark Rulings
- **"Ask AI" Action**: Transfer any insight directly into the conversational assistant.

### 3. 💬 Query — Multimodal Legal Assistant
- **Multimodal Document Upload**:
  - Attach tenancy notices, employment letters, or receipts (supports JPG, PNG, WEBP, PDF up to 10MB).
  - Image thumbnail / document preview with remove button.
  - Client-side size & format validation with error banners.
  - Privacy reminder alert to blur sensitive identity numbers.
- **Multilingual Support**:
  - Native toggle for **English**, **हिंदी (Hindi)**, and **मराठी (Marathi)**.
- **5-Part Structured Answers**:
  1. 💡 **What This Means** (plain-language explanation)
  2. ⚖️ **Your Rights under Indian Law** (statutory sections & articles)
  3. 📋 **Practical Next Steps** (actionable checklist)
  4. 🏛️ **Where to Get Help** (toll-free helplines, physical offices, portals)
  5. 📚 **Verified Sources** (Constitution of India & Supreme Court case precedents)
- **Follow-up Chips**: Interactive prompts to dig deeper or clarify facts.
- **Backend-Ready Architecture**: Connects seamlessly to a live Gemma 4 / FastAPI backend endpoint with graceful local RAG fallback.

---

## 🎨 Design System & Visual Direction (UI/UX Pro Max)
- **Design Inspiration**: Architectural editorial minimalism inspired by [thenest.pl/en](https://thenest.pl/en).
- **Style Archetype**: *Editorial Typography & Accessible Legal Authority*
- **Color Palette**:
  - Warm Off-White / Cream Base: `#FAF7F2` & `#F4EFEB`
  - Deep Midnight Navy Typography: `#0A192F`
  - Restrained Blue Accents: `#1D4ED8`
  - Architectural Warm Gold / Bronze: `#9B7739`
  - Hairline Architectural Grids & Borders: `rgba(10, 25, 47, 0.12)`
- **Typography**:
  - Display: `Bodoni Moda` & `EB Garamond` serif with delicate italic gold accents
  - Body & UI: `Plus Jakarta Sans` for WCAG AAA legibility (4.5:1+ contrast)
- **Selective Rounded Cards**: Crisp architectural panels with subtle hovers, avoiding generic bubbly cards.

---

## 🌟 Homepage Architecture

1. **Header (`Navbar.jsx`)**: Sticky header with logo, navigation links (*Home*, *Explore Rights*, *Ask a Question*), language switcher (`EN / हिन्दी / मराठी`), national emergency helplines (`15100 · 1930 · 1915`), and high-contrast *Ask Now* CTA.
2. **Hero Section**:
   - Headline: *"Your Rights. Clearly Explained."*
   - Natural language search box with live submit and interactive example inquiry chips.
   - Architectural metrics bar (1,104 Supreme Court holdings, 503 Constitutional Articles, 100% Free Public Aid).
3. **Target Audiences (`AudienceSection.jsx`)**: 4 focused pillars for **Citizens**, **Tenants**, **Workers**, and **Small Business Owners** with statutory protections, everyday disputes, and prefill inquiries.
4. **How the Assistant Works**: 3-step numbered editorial process (`01`, `02`, `03`) with connecting lines.
5. **Document Analysis Section (`DocumentAnalysisSection.jsx`)**: Drag-and-drop file upload zone for eviction notices, payslips, or bills (PDF/JPG/PNG up to 10MB), real-time validation, preview, privacy notice, and one-click *Analyze Document Rights*.
6. **Sample Answer Preview (`SampleAnswerPreview.jsx`)**: High-fidelity 5-part grounded legal answer preview with scenario switcher (Tenancy deposit withholding, wage denial, e-commerce dispute).
7. **Frequently Asked Questions & Guides (`FaqSection.jsx`)**: Searchable accordion categorized across Tenancy, Employment, Consumer, Cyber, and Police complaints.
8. **Trust & Verification Section (`TrustSection.jsx`)**: Explains official sources, strict anti-hallucination policy, zero confidential data retention, and Article 39A statutory disclaimer.
9. **Editorial Footer**: Comprehensive directory of official government grievance portals and statutory notices.
10. **Conversational Assistant (`QueryTab.jsx`)**: Full multimodal chatbot with 5-part grounded answers and follow-up suggestions.
  - Cards: Crisp White (`#FFFFFF`) with subtle elevation and `#E2E8F0` borders
- **Typography**: Google Fonts (*Plus Jakarta Sans* & *EB Garamond*)
- **Accessibility**: Full WCAG AAA contrast compliance, keyboard focus rings, touch targets >= 44px.

---

## 🚀 How to Run the Frontend Locally

### Prerequisites
- Node.js (v18+) and npm

### 1. Install Dependencies & Start Dev Server
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173/`** in your browser.

### 2. Build for Production & Linting
```bash
cd frontend
npm run lint    # Runs oxlint (0 warnings, 0 errors)
npm run build   # Produces optimized production bundle in dist/
```

---

## 📊 Legal RAG Dataset

The assistant is backed by:
1. **Constitution of India Corpus** (`data/COI.json` & `data/constitution_chunks.jsonl`): 503 Articles, Parts, Schedules.
2. **Supreme Court Precedents Dataset** (`output/legal_qa_dataset.json` & `output/legal_qa_dataset.jsonl`):
   - **1,104 verified, high-quality legal Q&A pairs** extracted from Indian court judgments.
   - Covering Constitutional Rights, Criminal Charges, Preventive Detention, Bail, Decree Execution, and Tenancy.

---

## ⚖️ Legal Disclaimer
*Legal-Lens is an educational public legal awareness platform. The guidance provided does not constitute formal legal advice or create an attorney-client relationship. Citizens facing urgent situations are encouraged to contact the National Legal Services Authority (NALSA Helpline: 15100) or emergency helplines.*
