/**
 * Target Audiences defined in User Brief: Citizens, Tenants, Workers, Small Business Owners
 */
export const TARGET_AUDIENCES = [
  {
    id: "citizens",
    title: "Everyday Citizens",
    subtitle: "Constitutional & Civil Rights",
    icon: "Shield",
    keyStatute: "Constitution of India, Art. 14 & 21",
    protection: "Zero FIR across any police station, freedom from arbitrary detention, right to public legal aid (NALSA).",
    disputeExample: "Police refusal to register FIR, illegal roadside checks, or denial of public administrative services.",
    prefillQuestion: "What are my legal rights if a police officer stops me or refuses to register a Zero FIR for a cognizable crime?"
  },
  {
    id: "tenants",
    title: "Tenants & Renters",
    subtitle: "Housing & Deposit Security",
    icon: "Home",
    keyStatute: "Model Tenancy Act & State Rent Control Acts",
    protection: "Mandatory 24-hr entry notice, security deposit capped at 2 months' rent, illegal lockout protection.",
    disputeExample: "Landlord refusing to refund deposit, cutting off electricity/water, or issuing sudden eviction without written notice.",
    prefillQuestion: "My landlord has cut off my water supply and demanded I vacate within 48 hours without returning my security deposit. What are my legal protections?"
  },
  {
    id: "workers",
    title: "Workers & Employees",
    subtitle: "Wages, Safety & Fair Exit",
    icon: "Briefcase",
    keyStatute: "Payment of Wages Act & Industrial Relations Code",
    protection: "Mandatory wage disbursement by 7th/10th of month, 30 days severance notice or pay in lieu, gratuity entitlement.",
    disputeExample: "Company abruptly withholding last two months' pay, forced immediate resignations, or refusal to issue service letters.",
    prefillQuestion: "My employer terminated my services abruptly without 30 days notice or severance pay, and is withholding my final salary settlement. How can I legally recover my dues?"
  },
  {
    id: "small-business",
    title: "Small Business Owners",
    subtitle: "Commercial & Payment Recovery",
    icon: "ShoppingBag",
    keyStatute: "MSMED Act, 2006 (Sec 15-18) & NI Act Sec 138",
    protection: "Statutory 45-day payment rule with 3x RBI bank interest rate on delays; swift MSME Samadhaan conciliation.",
    disputeExample: "Corporate buyer delaying invoice payment for over 90 days, or dishonored payment cheques without remedy.",
    prefillQuestion: "A corporate client is delaying payment on verified invoices for over 90 days. How can I recover payments and compound interest under the MSME Samadhaan portal?"
  }
];

export const CITIZEN_CATEGORIES = [
  {
    id: "employment",
    title: "Employment & Unpaid Salary",
    icon: "Briefcase",
    desc: "Withheld salary, sudden termination without notice, overtime pay, and gratuity claims.",
    prefillQuestion: "My employer has withheld my salary for the past 2 months after I resigned with notice. What are my legal rights and how do I recover my dues?",
    tag: "Workplace Rights"
  },
  {
    id: "rent",
    title: "Rent & Security Deposits",
    icon: "Home",
    desc: "Landlords withholding security deposits, illegal eviction threats, and arbitrary rent hikes.",
    prefillQuestion: "I vacated my rented flat after giving 1 month notice, but the landlord refuses to refund my security deposit of ₹45,000 citing unreasonable deductions. What should I do?",
    tag: "Tenancy Rights"
  },
  {
    id: "consumer",
    title: "Consumer Complaints & Refunds",
    icon: "ShoppingBag",
    desc: "Defective goods, e-commerce return refusals, misleading warranties, and service deficiency.",
    prefillQuestion: "An e-commerce company delivered a defective electronics item and refused return/refund despite reporting within 24 hours. How do I file a consumer complaint?",
    tag: "Consumer Protection"
  },
  {
    id: "cyber",
    title: "Online Harassment & Threats",
    icon: "ShieldAlert",
    desc: "Cyber blackmail, abusive calls, morphing of photos, online financial fraud, and privacy breaches.",
    prefillQuestion: "Someone is sending threatening messages, blackmailing me online, and threatening to circulate edited pictures. How can I stop this and file an urgent cyber complaint?",
    tag: "Cyber Law & Safety"
  },
  {
    id: "police",
    title: "Police Complaints & FIR",
    icon: "Scale",
    desc: "Police refusing to register an FIR, Zero FIR rights, wrongful detention, and arrest bail rules.",
    prefillQuestion: "The local police station is refusing to register an FIR for my stolen vehicle and asking me to file an untraceable report instead. What are my legal rights under Zero FIR?",
    tag: "Criminal Procedure"
  },
  {
    id: "family",
    title: "Family & Maintenance",
    icon: "Users",
    desc: "Maintenance rights for wives/parents/children, domestic violence protection, and senior citizen safety.",
    prefillQuestion: "What are the legal provisions for claiming monthly maintenance under Section 125 CrPC and protection orders under the Protection of Women from Domestic Violence Act?",
    tag: "Family & Welfare"
  }
];

export const CITIZEN_INSIGHTS = [
  {
    id: "emp_01",
    category: "employment",
    categoryLabel: "Employment & Unpaid Salary",
    title: "Can an employer hold back your earned salary after you resign?",
    situation: "You submitted your formal resignation, served the agreed notice period (or agreed to notice pay adjustment), completed handover, but the employer delays or completely refuses your Full & Final (F&F) settlement.",
    rights: [
      "Under Section 5 of the Payment of Wages Act, 1936, wages must be disbursed within 7 to 10 days of the wage period or employment termination.",
      "Employers cannot make arbitrary unilateral deductions from salary for alleged performance losses unless explicitly agreed and provable.",
      "Gratuity is a statutory right under Payment of Gratuity Act, 1972 if you have served 5 years (payable within 30 days of leaving)."
    ],
    nextSteps: [
      "Send a formal written email to HR and management demanding full settlement within 7 business days, citing your resignation acceptance.",
      "If unanswered, send a formal Legal Notice through an advocate giving 15 days notice before initiating recovery proceedings.",
      "File an online grievance on the Ministry of Labour's 'SAMADHAN' portal (samadhan.labour.gov.in) or before the local Labour Commissioner."
    ],
    complaintChannels: [
      { name: "SAMADHAN Portal (Ministry of Labour)", url: "https://samadhan.labour.gov.in", type: "Portal" },
      { name: "Labour Commissioner Office (State/District)", details: "Physical filing under Payment of Wages Act, Sec 15", type: "Tribunal" },
      { name: "Free Legal Aid Helpline", details: "Call 15100 (National Legal Services Authority)", type: "Phone" }
    ],
    legalSources: [
      { title: "Payment of Wages Act, 1936", ref: "Section 5 & Section 15" },
      { title: "Supreme Court of India Ruling", ref: "State of Punjab v. Labour Court, (1980) 1 SCR 953 (Withholding earned wages violates fundamental livelihood rights under Article 21)" }
    ],
    dateVerified: "April 2024"
  },
  {
    id: "rent_01",
    category: "rent",
    categoryLabel: "Rent & Security Deposits",
    title: "How to recover security deposit wrongfully withheld by a landlord?",
    situation: "You have handed over the keys upon notice expiration, but the landlord makes bogus claims of painting or wear-and-tear, refusing to refund your security deposit.",
    rights: [
      "Model Tenancy Act provisions and State Rent Control rules mandate the refund of security deposit within 30 days of premises vacation after deducting valid unpaid utility dues.",
      "Normal 'wear and tear' (natural aging of paint, minor scuffs) cannot be deducted from security deposit without an itemized bill agreed upon in writing.",
      "A landlord has no legal authority to forcefully lock or dispossess a tenant without a formal eviction order from a competent Rent Tribunal."
    ],
    nextSteps: [
      "Conduct a joint inspection with photos/videos of the empty apartment to document its condition on handover date.",
      "Send a registered demand notice with your bank details requesting refund within 7 working days.",
      "Approach the local Rent Authority / Rent Court under the Tenancy Act or file a summary recovery suit under Order 37 of Civil Procedure Code (CPC)."
    ],
    complaintChannels: [
      { name: "Local Rent Authority / Rent Court", details: "Established under State Tenancy Laws", type: "Tribunal" },
      { name: "District Legal Services Authority (DLSA)", details: "Free pre-litigation mediation and legal aid (Call 15100)", type: "Mediation" }
    ],
    legalSources: [
      { title: "Model Tenancy Act, 2021", ref: "Section 11 (Security Deposit Limits & Return Deadline)" },
      { title: "Supreme Court Precedent", ref: "Pannalal v. Mst. Naraini, 1952 SCR 544 (Execution and recovery of statutory debts)" }
    ],
    dateVerified: "March 2024"
  },
  {
    id: "cons_01",
    category: "consumer",
    categoryLabel: "Consumer Complaints & Refunds",
    title: "Rights against e-commerce sites or brands refusing refunds for defective products",
    situation: "You purchased a product online or in-store that arrived broken, malfunctioning, or not matching specifications, and the seller or platform denies exchange or refund.",
    rights: [
      "Under the Consumer Protection Act, 2019, selling defective goods or denying genuine warranty claims constitutes an 'unfair trade practice' and 'deficiency in service'.",
      "Consumers are entitled to replacement, full refund with interest, and compensation for mental agony and litigation costs.",
      "Under Consumer Protection (E-Commerce) Rules 2020, marketplace platforms cannot escape liability by simply blaming third-party sellers."
    ],
    nextSteps: [
      "Keep unboxing videos, invoices, and written communications safely.",
      "Call the National Consumer Helpline at 1915 or register a grievance via consumerhelpline.gov.in.",
      "File a formal online petition before the District Consumer Commission via the official government 'e-Daakhil' portal (edaakhil.nic.in) for nominal government fees."
    ],
    complaintChannels: [
      { name: "National Consumer Helpline (NCH)", details: "Call 1915 or SMS/WhatsApp 8800001915", url: "https://consumerhelpline.gov.in", type: "Helpline" },
      { name: "e-Daakhil Consumer Portal", details: "Online filing across all District, State & National Commissions", url: "https://edaakhil.nic.in", type: "Portal" }
    ],
    legalSources: [
      { title: "Consumer Protection Act, 2019", ref: "Section 2(47) (Unfair Trade Practice) & Section 35" },
      { title: "Consumer Protection (E-Commerce) Rules, 2020", ref: "Rule 5 & Rule 6" }
    ],
    dateVerified: "January 2024"
  },
  {
    id: "cyber_01",
    category: "cyber",
    categoryLabel: "Online Harassment & Threats",
    title: "Immediate steps if you face cyber blackmail, morphed photos, or online threats",
    situation: "An anonymous caller or online profile threatens to leak private information, financial blackmail via loan apps, or creates fake accounts using your pictures.",
    rights: [
      "Transmitting obscene or threatening material online is a cognizable criminal offense under Sections 66E, 67, 67A of the Information Technology Act, 2000.",
      "Extortion and criminal intimidation are punishable under Bharatiya Nyaya Sanhita (BNS) / Sections 384 and 506 IPC.",
      "Victims have the right to demand emergency blocking of content and immediate registration of an online cyber complaint without visiting the physical police station initially."
    ],
    nextSteps: [
      "Do NOT pay any money or delete chats. Take clear screenshots of phone numbers, profiles, UPI IDs, and chat threads as evidence.",
      "Immediately report to the National Cyber Crime Reporting Portal at cybercrime.gov.in or dial the 24x7 toll-free emergency helpline 1930.",
      "If money was fraudulently debited, calling 1930 within the 'Golden Hour' (first 2 hours) allows the police nodal officer to freeze the recipient bank wallet."
    ],
    complaintChannels: [
      { name: "National Cyber Crime Helpline", details: "Dial 1930 (Immediate 24x7 Assistance)", type: "Phone" },
      { name: "Cyber Crime Reporting Portal", url: "https://cybercrime.gov.in", details: "Official MHA portal for anonymous women/child and general complaints", type: "Portal" }
    ],
    legalSources: [
      { title: "Information Technology Act, 2000", ref: "Section 66C, 66D, 66E (Privacy violation) and Section 67" },
      { title: "Supreme Court Landmark", ref: "Shreya Singhal v. Union of India, (2015) 5 SCC 1" }
    ],
    dateVerified: "May 2024"
  },
  {
    id: "police_01",
    category: "police",
    categoryLabel: "Police Complaints & FIR",
    title: "What to do if police refuse to register an FIR: Your Zero FIR rights",
    situation: "You went to a police station to report a cognizable crime (theft, physical assault, robbery, fraud) but the duty officer turns you away or insists on jurisdiction excuses.",
    rights: [
      "Under Supreme Court ruling in Lalita Kumari v. Govt. of UP (2014), registration of an FIR is mandatory under Section 154 CrPC if information discloses a cognizable offense.",
      "Under 'Zero FIR', any police station in India is legally obligated to register an FIR irrespective of whether the offense took place in their jurisdiction, and later transfer it.",
      "Right to receive a free, signed copy of the registered FIR immediately upon registration."
    ],
    nextSteps: [
      "Request the duty officer to record a 'Zero FIR' and clearly note down the General Diary (GD) entry number.",
      "If still refused, send a written complaint with your signature via Registered Post / Speed Post directly to the Superintendent of Police (SP) / Commissioner under Section 154(3) CrPC.",
      "If no action is taken, you can file a private complaint before the Judicial Magistrate under Section 156(3) CrPC seeking a direct court order to register the FIR."
    ],
    complaintChannels: [
      { name: "Superintendent of Police (SP / DCP Office)", details: "Submit written representation under Section 154(3) CrPC", type: "Office" },
      { name: "State Police Citizen Portal", details: "Online e-FIR for lost property and vehicle theft in most states", type: "Portal" },
      { name: "National Human Rights Commission (NHRC)", details: "Helpline 14433 for police misconduct", type: "Helpline" }
    ],
    legalSources: [
      { title: "Code of Criminal Procedure (CrPC)", ref: "Section 154 (Mandatory FIR) & Section 156(3)" },
      { title: "Supreme Court Constitution Bench", ref: "Lalita Kumari v. Govt. of U.P., (2014) 2 SCC 1 (Compulsory registration of FIR)" },
      { title: "Arrest Guidelines", ref: "D.K. Basu v. State of West Bengal, (1997) 1 SCC 416 (Rights of arrested persons)" }
    ],
    dateVerified: "February 2024"
  },
  {
    id: "fam_01",
    category: "family",
    categoryLabel: "Family & Maintenance",
    title: "Rights to monthly maintenance and protection from domestic harassment",
    situation: "A spouse, elderly parent, or child has been abandoned or subjected to physical/mental harassment at home without financial support or living security.",
    rights: [
      "Under Section 125 CrPC (now BNSS), a wife, dependent minor children, and elderly parents have a statutory right to claim monthly maintenance from a person having sufficient means.",
      "Under the Protection of Women from Domestic Violence Act, 2005 (PWDVA), a woman has a legal right to reside in the shared household and receive interim monetary relief.",
      "Under Maintenance and Welfare of Parents and Senior Citizens Act 2007, senior citizens can seek swift monthly maintenance up to ₹10,000 from adult children/heirs."
    ],
    nextSteps: [
      "Approach the Protection Officer (appointed by state government) or Protection Service Home in your district.",
      "File an application before the Judicial Magistrate or Family Court seeking interim maintenance and residence protection orders.",
      "Reach out to the District Legal Services Authority (DLSA) for a free government-appointed lawyer if your annual income falls within state legal aid criteria."
    ],
    complaintChannels: [
      { name: "Women Helpline (All India)", details: "Call 181 (Toll-Free, 24x7 Domestic Violence & Harassment Support)", type: "Phone" },
      { name: "Senior Citizen National Helpline (Elderline)", details: "Dial 14567 (Ministry of Social Justice)", type: "Phone" },
      { name: "District Legal Services Authority (DLSA)", details: "Free legal representation across all civil and family courts", type: "Legal Aid" }
    ],
    legalSources: [
      { title: "Code of Criminal Procedure, 1973", ref: "Section 125 (Order for maintenance of wives, children, and parents)" },
      { title: "Protection of Women from Domestic Violence Act, 2005", ref: "Section 12, 17 (Right to reside in shared household), Section 18" },
      { title: "Supreme Court Landmark", ref: "Rajnesh v. Neha, (2021) 2 SCC 324 (Uniform guidelines on maintenance determination)" }
    ],
    dateVerified: "April 2024"
  }
];
