"""
Legal Q&A Extraction Pipeline for Legal-Lens
Extracts authoritative legal Questions and Answers from Indian Court Decisions.
Optimized for RAG (Retrieval-Augmented Generation) pipelines and legal search.
"""

import json
import os
import re
import unicodedata
from typing import Any, Dict, List, Optional
import pandas as pd


# ---------------------------------------------------------
# 1. OCR Cleaning & Quality Validation Utilities
# ---------------------------------------------------------

def clean_ocr_text(text: str) -> str:
    """Cleans OCR artifacts, broken hyphens, corrupt characters, and excessive whitespace."""
    if not isinstance(text, str):
        return ""
    text = unicodedata.normalize('NFKD', text)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\ufffd]', ' ', text)
    text = re.sub(r'[~`_•|]', ' ', text)
    text = text.replace('"', '"').replace('"', '"').replace('‘', "'").replace('’', "'")
    text = text.replace('“', '"').replace('”', '"')
    # Fix broken word hyphens like "restric- tions" -> "restrictions"
    text = re.sub(r'(\b[a-zA-Z]{3,})-\s+([a-zA-Z]{2,}\b)', r'\1\2', text)
    # Fix OCR split words with dots like "com. pany" -> "company"
    text = re.sub(r'\b([a-zA-Z]+)\.\s+([a-zA-Z]{2,}\b)', r'\1\2', text)
    # Normalize whitespace
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def clean_clause_text(text: str) -> str:
    """Cleans leading/trailing punctuation, connectives, and numbering from rulings."""
    text = clean_ocr_text(text)
    # Strip leading markers like "(1)", "(i)", "(a)"
    text = re.sub(r'^(?:\([0-9a-zA-Zivx]+\)|[0-9ivx]+\.)\s*', '', text, flags=re.IGNORECASE)
    # Strip leading punctuation and connectives
    text = re.sub(r'^[\s;,\.\:\-]+', '', text)
    text = re.sub(r'^(?:and|or|that|further|assuming that|also)\s+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^[\s;,\.\:\-]+', '', text)
    text = text.strip()
    if text:
        text = text[0].upper() + text[1:]
    return text


def is_valid_legal_holding(text: str) -> bool:
    """
    Validates whether extracted text represents a substantive legal ruling
    or merely administrative / procedural court appeal details.
    """
    # 1. Reject procedural appeal headers and case filings
    procedural_keywords = [
        r'^\s*Appeals?\s+(?:by\s+special\s+leave\s+)?from', r'^\s*Civil\s+Appeals?\s+No',
        r'^\s*Criminal\s+Appeals?\s+No', r'^\s*Writ\s+Petitions?\s+No',
        r'^\s*Special\s+Leave\s+Petition', r'arising\s+out\s+of\s+(?:the\s+)?decrees?',
        r'^\s*In\s+these\s+appeals', r'^\s*Suits?\s+Nos?\.',
        r'^\s*For\s+the\s+(?:appellant|respondent)', r'^\s*Advocates?\s+appeared',
        r'^\s*The\s+Judgment\s+of\s+the\s+Court\s+was\s+delivered',
        r'^\s*Heard\s+(?:learned\s+)?counsel', r'^\s*Leave\s+granted'
    ]
    for pat in procedural_keywords:
        if re.search(pat, text, re.IGNORECASE):
            return False

    # 2. Must contain substantive legal keywords/concepts
    legal_substance_pattern = (
        r'\b(?:held|holding|cannot|entitled|violate[sd]?|infringe[sd]?|'
        r'right[s]?|liab(?:le|ility)|valid(?:ity)?|void|unconstitutional|'
        r'jurisdiction|maintainable|obligation|duty|statut(?:e|ory)|decree|'
        r'offence|convict(?:ion)?|acquit(?:tal)?|presumption|procedure|'
        r'burden\s+of\s+proof|bar(?:red)?|relief|damages|compensation|remedy)\b'
    )
    if not re.search(legal_substance_pattern, text, re.IGNORECASE):
        return False

    return True


# ---------------------------------------------------------
# 2. Legal Domain Classifier & Tagging
# ---------------------------------------------------------

LEGAL_DOMAINS = {
    "Constitutional Law & Fundamental Rights": [
        r'\bConstitution of India\b', r'\bFundamental Right', r'\bArt(?:icle)?\.?\s*(?:1[2-9]|2[0-9]|3[0-2]|136|226|311)\b',
        r'\bWrit Petition\b', r'\bArticle 32\b', r'\bArticle 226\b', r'\bArticle 14\b', r'\bArticle 19\b', r'\bArticle 21\b',
        r'\bPreventive Detention\b', r'\bEminent Domain\b', r'\bDirective Principles\b', r'\bEquality before law\b'
    ],
    "Criminal Law & Procedure": [
        r'\bIndian Penal Code\b', r'\bPenal Code\b', r'\bI\.?P\.?C\.?\b', r'\bCr\.?P\.?C\.?\b',
        r'\bCriminal Procedure Code\b', r'\bCode of Criminal Procedure\b', r'\bSection 302\b', r'\bSection 307\b',
        r'\bSection 376\b', r'\bSection 420\b', r'\bBail\b', r'\bPolice Custody\b', r'\bFIR\b',
        r'\bCharge\b', r'\bConviction\b', r'\bSessions Judge\b', r'\bAcquittal\b', r'\bCriminal Appeal\b'
    ],
    "Civil Procedure & Execution": [
        r'\bCivil Procedure Code\b', r'\bCode of Civil Procedure\b', r'\bC\.?P\.?C\.?\b',
        r'\bSection 52\b', r'\bSection 53\b', r'\bSection 100\b', r'\bRes Judicata\b',
        r'\bExecution of Decree\b', r'\bDecree-holder\b', r'\bJudgment-debtor\b', r'\bInjunction\b',
        r'\bOrder [0-9]+ Rule\b'
    ],
    "Corporate, Commercial & Arbitration": [
        r'\bArbitration Act\b', r'\bCompanies Act\b', r'\bManaging Agent\b', r'\bShareholder\b',
        r'\bNegotiable Instruments\b', r'\bCheque Bounce\b', r'\bPartnership Act\b', r'\bArbitrator\b'
    ],
    "Contract & Specific Relief": [
        r'\bContract Act\b', r'\bSpecific Relief\b', r'\bBreach of Contract\b', r'\bAgreement to Sell\b',
        r'\bDamages\b', r'\bSpecific Performance\b', r'\bVoid Ab Initio\b', r'\bConsideration\b'
    ],
    "Property & Tenancy Law": [
        r'\bTransfer of Property Act\b', r'\bMortgage\b', r'\bEasement\b', r'\bTenant\b',
        r'\bRent Control\b', r'\bLand Acquisition\b', r'\bZamindari Abolition\b', r'\bEviction\b', r'\bLease\b'
    ],
    "Family & Succession Law": [
        r'\bHindu Law\b', r'\bHindu Succession\b', r'\bHindu Marriage\b', r'\bMuslim Personal Law\b',
        r'\bMaintenance\b', r'\bDower\b', r'\bPartition\b', r'\bPious Obligation\b', r'\bLegal Heir\b', r'\bCoparcener\b'
    ],
    "Labor, Employment & Service Law": [
        r'\bIndustrial Disputes Act\b', r'\bWorkman\b', r'\bTermination of Service\b', r'\bDepartmental Inquiry\b',
        r'\bService Law\b', r'\bCompulsory Retirement\b', r'\bPension\b', r'\bDisciplinary Authority\b'
    ],
    "Taxation & Revenue": [
        r'\bIncome Tax Act\b', r'\bSales Tax\b', r'\bExcise\b', r'\bCustoms Act\b',
        r'\bAssessment Year\b', r'\bTax Recovery\b', r'\bWealth Tax\b', r'\bRevenue\b'
    ],
    "Evidence & Trial Procedure": [
        r'\bEvidence Act\b', r'\bIndian Evidence Act\b', r'\bBurden of Proof\b', r'\bConfession\b',
        r'\bDying Declaration\b', r'\bExpert Evidence\b', r'\bWitness\b', r'\bCircumstantial Evidence\b'
    ]
}


def classify_legal_category(text: str) -> str:
    """Classifies text into its primary legal domain."""
    for domain, patterns in LEGAL_DOMAINS.items():
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                return domain
    return "General Legal Principles & Jurisprudence"


def extract_legal_references(text: str) -> List[str]:
    """Extracts mentioned statutory sections, acts, and articles."""
    refs = set()
    # Articles
    for m in re.finditer(r'\bArt(?:icle)?\.?\s*(\d+(?:\s*\([0-9a-zA-Z]+\))*)', text, re.IGNORECASE):
        refs.add(f"Article {m.group(1)} Constitution of India")
    # Sections
    for m in re.finditer(r'\b(?:s\.|sec\.|section|sections|ss\.)\s*([0-9]+[A-Za-z]?(?:\s*(?:and|to|,)\s*[0-9]+[A-Za-z]?)*)', text, re.IGNORECASE):
        sec_num = m.group(1).strip()
        if len(sec_num) <= 20:
            refs.add(f"Section {sec_num}")
    # Named Acts
    acts = [
        "Constitution of India", "Indian Penal Code", "Code of Criminal Procedure",
        "Civil Procedure Code", "Indian Evidence Act", "Contract Act", "Arbitration Act",
        "Transfer of Property Act", "Specific Relief Act", "Companies Act", "Income Tax Act",
        "Industrial Disputes Act", "Hindu Marriage Act", "Hindu Succession Act"
    ]
    for act in acts:
        if re.search(r'\b' + re.escape(act) + r'\b', text, re.IGNORECASE):
            refs.add(act)

    return sorted(list(refs))[:6]


def generate_cluster_tag(category: str, references: List[str], question: str) -> str:
    """Generates a semantic grouping / cluster tag for RAG indexing."""
    prefix = category.split('&')[0].strip().lower().replace(' ', '_')
    if references:
        clean_ref = re.sub(r'[^a-zA-Z0-9_]', '_', references[0].lower()).strip('_')
        return f"{prefix}:{clean_ref}"
    q_words = re.findall(r'\b[a-zA-Z]{4,}\b', question.lower())
    keyword = q_words[1] if len(q_words) > 1 else "principles"
    return f"{prefix}:{keyword}"


# ---------------------------------------------------------
# 3. Question & Answer Formulation Logic
# ---------------------------------------------------------

def formulate_question_from_holding(holding_text: str, subject_context: str, case_title: str) -> Optional[str]:
    """
    Transforms legal holding text and subject context into a natural,
    authoritative legal question suitable for RAG search.
    """
    clean_holding = clean_clause_text(holding_text)
    if len(clean_holding) < 40 or not is_valid_legal_holding(clean_holding):
        return None

    # 1. Constitutionality / Infringement of fundamental rights
    if re.search(r'\b(?:unconstitutional|void|ultra vires|violat(?:es|ed|ion)|infringe[sd]?)\b', clean_holding, re.IGNORECASE):
        act_match = re.search(r'(?:the\s+impugned\s+(?:Act|Order|Section|Notice|Rule)|[A-Z][a-zA-Z\s]{4,35}Act(?:\s*\([^\)]+\))?)', clean_holding + " " + subject_context)
        act_name = act_match.group(0).strip() if act_match else "the statutory enactment or order"
        right_match = re.search(r'(?:Art(?:icle)?\.?\s*\d+(?:\s*\([^\)]+\))*|fundamental rights?|Article 14|Article 19|Article 21|Article 29|Article 31)', clean_holding + " " + subject_context, re.IGNORECASE)
        right_name = right_match.group(0).strip() if right_match else "fundamental rights"
        return f"Does {act_name} infringe or violate {right_name} under the Constitution of India?"

    # 2. Criminal charge / conviction questions
    charge_match = re.search(r'charge[d]?\s+(?:under\s+)?(?:s\.|sec\.|section)?\s*(\d+[A-Za-z]?).*?convict(?:ed|ion)?\s+(?:under\s+)?(?:s\.|sec\.|section)?\s*(\d+[A-Za-z]?)', clean_holding, re.IGNORECASE)
    if charge_match:
        c1, c2 = charge_match.group(1), charge_match.group(2)
        return f"Can an accused charged under Section {c1} IPC be lawfully convicted under Section {c2} IPC without a separate formal charge?"

    # 3. Special Leave / Appellate Jurisdiction
    if re.search(r'\b(?:special leave|Article 136|Art\. 136)\b', clean_holding + " " + subject_context, re.IGNORECASE):
        return "Under what circumstances and principles will the Supreme Court grant Special Leave to Appeal under Article 136 of the Constitution of India?"

    # 4. Preventive Detention
    if re.search(r'\b(?:writ of habeas corpus|preventive detention|grounds of detention)\b', clean_holding + " " + subject_context, re.IGNORECASE):
        return "What are the legal requirements and rights regarding the communication of grounds in preventive detention cases under Indian law?"

    # 5. Arbitration
    if re.search(r'\b(?:arbitrat(?:ion|or)|arbitration clause|agreement)\b', clean_holding + " " + subject_context, re.IGNORECASE):
        return "Can an arbitrator determine a dispute when a party contends that the arbitration agreement or policy has ceased to be operative?"

    # 6. Decree Execution & Legal Heirs
    if re.search(r'\b(?:execution of(?: the)? decree|decree-holder|Section 52|Section 53)\b', clean_holding + " " + subject_context, re.IGNORECASE):
        return "How can a decree obtained against a deceased person be executed against legal representatives or sons under the Civil Procedure Code?"

    # 7. Check if subject context has clean legal issues
    if subject_context:
        for chunk in re.split(r'[-–—;]', subject_context):
            chunk = chunk.strip()
            if 15 < len(chunk) < 120:
                if chunk.lower().startswith('whether'):
                    return chunk.rstrip('.') + '?'
                if any(kw in chunk.lower() for kw in ['right to', 'power of', 'validity of', 'jurisdiction of', 'liability of']):
                    return f"What is the legal position regarding the {chunk.lower()} under Indian law?"

    # 8. Transform declarative holding statement
    first_sentence = clean_holding.split('.')[0].strip()
    if 25 < len(first_sentence) < 140:
        return f"What is the legal principle governing: {first_sentence}?"

    return None


def clean_answer_text(holding_text: str, case_title: str, year: int, references: List[str]) -> str:
    """Formats and grounds the answer text cleanly with legal context."""
    text = clean_clause_text(holding_text)
    if not text.endswith(('.', ';', '!')):
        text += '.'

    ref_str = f" [Statutory Provisions: {', '.join(references)}]" if references else ""
    return f"{text}\n\n(Authoritative Ruling: {case_title}, {year}{ref_str})"


# ---------------------------------------------------------
# 4. Core Extraction Engine
# ---------------------------------------------------------

class LegalQAExtractor:
    """Scans court decision records and extracts structured legal Q&As."""

    def __init__(self):
        self.held_start_pattern = re.compile(
            r'\bHeld\b(?:\s*(?:by\s+[^\n\-:]+|per\s+[^\n\-:]+|\([^\)]+\)|,\s*that|\s*that|[:\-,]))\s*',
            re.IGNORECASE
        )

    def extract_from_case(self, row: pd.Series, case_index: int) -> List[Dict[str, Any]]:
        """Extracts all valid legal Q&As from a single case row."""
        full_text = row.get('full_text', '')
        if not full_text or len(full_text) < 200:
            return []

        year = int(row.get('year', 1950))
        court_name = row.get('court_name') or "Supreme Court of India"
        row_title = row.get('title')

        case_title = self._extract_case_title(full_text, row_title)

        headnote_chunk = full_text[:4500]
        held_match = self.held_start_pattern.search(headnote_chunk)
        if not held_match:
            return []

        held_start = held_match.end()
        pre_held_text = headnote_chunk[:held_match.start()]
        post_held_text = full_text[held_start:held_start + 3500]

        # Determine where Held ends
        end_markers = [
            r'\n\s*APPEAL\s+from', r'\n\s*CRIMINAL\s+APPELLATE\s+JURISDICTION',
            r'\n\s*CIVIL\s+APPELLATE\s+JURISDICTION', r'\n\s*PETITION\s+under\s+Art',
            r'\n\s*WRIT\s+PETITION', r'\n\s*JUDGMENT\s*:', r'\n\s*The\s+Judgment\s+of\s+the\s+Court',
            r'\n\s*ORDER\s*\n', r'\n\s*This\s+was\s+an\s+appeal\s+by\s+special\s+leave'
        ]
        held_end = len(post_held_text)
        for marker in end_markers:
            m = re.search(marker, post_held_text, re.IGNORECASE)
            if m and m.start() < held_end:
                held_end = m.start()

        held_body = post_held_text[:held_end].strip()
        if len(held_body) < 50:
            return []

        subject_context = self._extract_subject_context(pre_held_text)

        sub_holdings = self._split_sub_holdings(held_body)
        if not sub_holdings:
            sub_holdings = [held_body]

        extracted_pairs = []
        for part_idx, sub_h in enumerate(sub_holdings):
            sub_h_clean = clean_clause_text(sub_h)
            if len(sub_h_clean) < 60 or not is_valid_legal_holding(sub_h_clean):
                continue

            combined_context = f"{subject_context} {sub_h_clean}"
            category = classify_legal_category(combined_context)
            references = extract_legal_references(combined_context)

            question = formulate_question_from_holding(sub_h_clean, subject_context, case_title)
            if not question:
                continue

            answer = clean_answer_text(sub_h_clean, case_title, year, references)
            cluster_tag = generate_cluster_tag(category, references, question)

            qa_entry = {
                "id": f"legal_qa_{year}_{case_index}_{part_idx+1}",
                "category": category,
                "cluster_tag": cluster_tag,
                "question": question,
                "answer": answer,
                "legal_references": references,
                "case_title": case_title,
                "year": year,
                "court": court_name,
                "confidence_score": 0.95
            }
            extracted_pairs.append(qa_entry)

        return extracted_pairs

    def _extract_case_title(self, full_text: str, default_title: Optional[str]) -> str:
        """Extracts formal case name (e.g. Appellant v. Respondent)."""
        if default_title and len(default_title.strip()) > 5:
            clean_t = clean_ocr_text(default_title)
            if not clean_t.startswith('TS/') and not clean_t.startswith('APP/'):
                return clean_t

        m = re.search(r'([A-Z0-9\s,\.\'\(\)\-]{4,60}?\s+(?:v\.|vs\.|versus|against)\s+[A-Z0-9\s,\.\'\(\)\-]{4,60}?)(?=\s*\[|\n|\.|\d|\()', full_text[:1800], re.IGNORECASE)
        if m:
            clean_name = clean_ocr_text(m.group(1))
            clean_name = re.sub(r'^(?:S\.C\.R\.\s+SUPREME COURT REPORTS\s+\d*\s*|[0-9\s\.\-]+)', '', clean_name).strip()
            if 10 < len(clean_name) < 90 and 'SUPREME COURT' not in clean_name.upper():
                return clean_name

        return "Supreme Court of India Case"

    def _extract_subject_context(self, pre_text: str) -> str:
        """Extracts legal subject matter headers and statutes."""
        lines = [l.strip() for l in pre_text.splitlines() if l.strip()]
        relevant_lines = []
        for line in lines[-12:]:
            if any(k in line.lower() for k in ['act', 'code', 'constitution', 'art.', 'section', 'whether', 'right', 'appeal', 'jurisdiction', 'liability']):
                relevant_lines.append(line)
        return clean_ocr_text(' - '.join(relevant_lines))

    def _split_sub_holdings(self, held_body: str) -> List[str]:
        """Splits multi-point holdings like (1) that..., (2) that... into discrete points."""
        parts = re.split(r'(?:^|\n|\s)(?:\([0-9a-zA-Zivx]+\)|[0-9ivx]+\.)\s+(?:that\s+)?', held_body, flags=re.IGNORECASE)
        valid_parts = [clean_clause_text(p) for p in parts if len(p.strip()) > 60 and is_valid_legal_holding(p)]
        return valid_parts if len(valid_parts) > 1 else []


# ---------------------------------------------------------
# 5. Batch Pipeline Runner & Exporter
# ---------------------------------------------------------

def process_dataset(
    parquet_path: str,
    output_dir: str,
    limit: Optional[int] = None
) -> Dict[str, Any]:
    """
    Reads the court dataset, extracts all legal Q&A pairs,
    groups and tags them, and exports to a dedicated output folder.
    """
    os.makedirs(output_dir, exist_ok=True)
    output_json = os.path.join(output_dir, "legal_qa_dataset.json")
    output_jsonl = os.path.join(output_dir, "legal_qa_dataset.jsonl")

    print(f"Loading court decisions from: {parquet_path}...")
    df = pd.read_parquet(parquet_path)
    total_records = len(df)
    print(f"Total dataset records: {total_records}")

    if limit:
        df = df.head(limit)
        print(f"Processing subset of {limit} records...")

    extractor = LegalQAExtractor()
    all_qa = []
    seen_questions = set()

    for idx, row in df.iterrows():
        pairs = extractor.extract_from_case(row, idx)
        for pair in pairs:
            norm_q = re.sub(r'\W+', '', pair['question'].lower())
            if norm_q not in seen_questions:
                seen_questions.add(norm_q)
                all_qa.append(pair)

    print(f"\nSuccessfully extracted {len(all_qa)} high-quality, grounded legal Q&A pairs!")

    # Summary by category
    categories_breakdown = {}
    for qa in all_qa:
        cat = qa['category']
        categories_breakdown[cat] = categories_breakdown.get(cat, 0) + 1

    # Save to JSON
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(all_qa, f, indent=2, ensure_ascii=False)
    print(f"Saved complete structured JSON to: {output_json}")

    # Save to JSONL for RAG / Embedding Pipelines
    with open(output_jsonl, 'w', encoding='utf-8') as f:
        for item in all_qa:
            f.write(json.dumps(item, ensure_ascii=False) + '\n')
    print(f"Saved line-delimited JSONL to: {output_jsonl}")

    # Save Metadata Summary file in output directory
    summary_path = os.path.join(output_dir, "dataset_summary.json")
    summary_data = {
        "dataset_name": "Indian Court Decisions - Legal Q&A Corpus",
        "source": parquet_path,
        "total_cases_scanned": len(df),
        "total_qa_pairs": len(all_qa),
        "categories_breakdown": categories_breakdown,
        "format": ["json", "jsonl"]
    }
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary_data, f, indent=2)
    print(f"Saved summary metadata to: {summary_path}")

    return {
        "output_dir": output_dir,
        "total_cases_scanned": len(df),
        "total_qa_extracted": len(all_qa),
        "categories_breakdown": categories_breakdown,
        "json_path": output_json,
        "jsonl_path": output_jsonl,
        "summary_path": summary_path
    }


if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    default_parquet = os.path.join(base_dir, 'sc_test.parquet')
    root_dir = os.path.dirname(base_dir)
    out_dir = os.path.join(root_dir, 'data', 'extracted_qa') if os.path.exists(os.path.join(root_dir, 'data', 'extracted_qa')) else os.path.join(base_dir, 'output')

    if os.path.exists(default_parquet):
        process_dataset(default_parquet, out_dir)
    else:
        print(f"Parquet file not found at {default_parquet}")
