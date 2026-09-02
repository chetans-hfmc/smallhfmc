import type {
  Activity, AffordabilityCheck, BankItem, BulletinItem, DB, Designation, Instruction, LoanCase, MasterItem,
  PartnerItem, SlaRule, StageItem, Task, User,
} from "./types";
import { daysAgoISO, inDaysISO, todayISO } from "./format";
import { computeAffordability } from "./calc";

const DAY = 86400000;
const ts = (daysBack: number, hourJitter = 0) =>
  new Date(Date.now() - daysBack * DAY - hourJitter * 3600000).toISOString();

export function seedDb(): DB {
  const designations: Designation[] = [
    { id: 1, name: "Super Admin", scope: "all", issueTasks: true, admin: true, super: true, builtIn: true },
    { id: 2, name: "Head of Company", scope: "all", issueTasks: true, admin: true, super: false, builtIn: true },
    { id: 3, name: "PA to HoC", scope: "all", issueTasks: true, admin: false, super: false, builtIn: true },
    { id: 4, name: "Mortgage Head", scope: "all", issueTasks: true, admin: true, super: false, builtIn: true },
    { id: 5, name: "Team Leader SPO", scope: "team", issueTasks: true, admin: false, super: false, builtIn: true },
    { id: 6, name: "Team Leader VRM", scope: "team", issueTasks: true, admin: false, super: false, builtIn: true },
    { id: 7, name: "SPO", scope: "own", issueTasks: false, admin: false, super: false, builtIn: true },
    { id: 8, name: "VRM", scope: "own", issueTasks: false, admin: false, super: false, builtIn: true },
  ];

  const users: User[] = [
    { id: 11, name: "Salem Al Marri", email: "super@meridian.ae", password: "super123", role: "Super Admin", team: "Management", active: true, createdAt: ts(500) },
    { id: 1, name: "Rashid Al Falasi", email: "head@meridian.ae", password: "admin123", role: "Head of Company", team: "Management", active: true, createdAt: ts(400) },
    { id: 2, name: "Layla Haddad", email: "pa@meridian.ae", password: "demo123", role: "PA to HoC", team: "Management", active: true, createdAt: ts(360) },
    { id: 3, name: "Omar Qassim", email: "omar@meridian.ae", password: "demo123", role: "Mortgage Head", team: "Management", active: true, createdAt: ts(330) },
    { id: 4, name: "Imran Sheikh", email: "imran@meridian.ae", password: "demo123", role: "Team Leader SPO", team: "Dubai", active: true, createdAt: ts(300) },
    { id: 5, name: "Aisha Rahman", email: "aisha@meridian.ae", password: "demo123", role: "SPO", team: "Dubai", active: true, createdAt: ts(260) },
    { id: 6, name: "Karim Fawaz", email: "karim@meridian.ae", password: "demo123", role: "SPO", team: "Dubai", active: true, createdAt: ts(220) },
    { id: 7, name: "Nadia Farouk", email: "nadia@meridian.ae", password: "demo123", role: "VRM", team: "Dubai", active: true, createdAt: ts(180) },
    { id: 8, name: "Fatima Al Suwaidi", email: "fatima@meridian.ae", password: "demo123", role: "Team Leader VRM", team: "Abu Dhabi", active: true, createdAt: ts(200) },
    { id: 9, name: "Jose Mathew", email: "jose@meridian.ae", password: "demo123", role: "VRM", team: "Abu Dhabi", active: true, createdAt: ts(140) },
  ];

  const stages: StageItem[] = [
    "WhatsApp Group Creation", "Document collection and QC", "Bank Submission", "Pre-Approval",
    "Bank Query", "Pre-Approval QC", "Valuation", "Valuation Report", "FOL Conversion", "FOL",
    "DDA/Signing", "Loan Booking", "Liability/Release", "Final Transfer", "Title Deed QC", "Closure",
  ].map((label, i) => ({ id: i + 1, label, active: true, sortOrder: i + 1 }));

  /* legacy pipeline → new 16-stage pipeline (keeps seeded history coherent) */
  const STAGE_MAP: Record<string, string> = {
    "New Login": "WhatsApp Group Creation",
    "Documents & KYC": "Document collection and QC",
    "Credit Appraisal": "Pre-Approval",
    "Valuation": "Valuation",
    "Legal & Technical": "FOL Conversion",
    "Sanction": "FOL",
    "Offer & Acceptance": "DDA/Signing",
    "Disbursement": "Loan Booking",
    "Post-Disbursement": "Final Transfer",
    "Closed": "Closure",
  };
  /* cases whose open task fits a different stage better than the straight map */
  const STAGE_OVERRIDES: Record<string, string> = {
    "Priya Menon": "Bank Query",
    "Anna Kowalski": "Document collection and QC",
  };
  const mapStage = (s: string): string => STAGE_MAP[s] ?? s;

  const whyPending: MasterItem[] = [
    "Awaiting client documents", "Bank query raised", "Valuer visit pending", "Legal opinion pending",
    "Internal review", "Payment confirmation", "System / portal issue", "No response from client",
  ].map((label, i) => ({ id: i + 1, label, active: true }));

  const waitingFor: MasterItem[] = ["Client", "Bank", "Valuer", "Legal", "Internal", "Developer"].map((label, i) => ({
    id: i + 1, label, active: true,
  }));

  const banks: BankItem[] = (
    [
      ["ADCB", 1], ["ADIB", 0.95], ["Ajman Bank", 0.7], ["Al Hilal", 0.7], ["Arab Bank", 0.7],
      ["CBD", 1], ["DIB", 0.75], ["EIB", 0.7], ["ENBD", 0.85], ["FAB", 0.75], ["HSBC", 0.85],
      ["Mashreq", 1], ["NBF", 0.7], ["RAK Bank", 0.75], ["SCB", 0.825], ["UAB", 0.9],
    ] as [string, number][]
  ).map(([name, ratePct], i) => ({ id: i + 1, name, ratePct, active: true }));

  const partners: PartnerItem[] = [
    { id: 1, kind: "Agent", name: "Falcon Properties", defaultSharePct: 20, active: true },
    { id: 2, kind: "Agent", name: "Skyline Realty", defaultSharePct: 15, active: true },
    { id: 3, kind: "Agent", name: "Palm Gate Homes", defaultSharePct: 20, active: true },
    { id: 4, kind: "Broker", name: "Mortgage Souq", defaultSharePct: 30, active: true },
    { id: 5, kind: "Broker", name: "Capital Bridge", defaultSharePct: 20, active: true },
    { id: 6, kind: "Referral", name: "Nasser Al Mansoori", defaultSharePct: 10, active: true },
    { id: 7, kind: "Referral", name: "Hessa Al Qasimi", defaultSharePct: 15, active: true },
    { id: 8, kind: "Referral", name: "Bilal Hussain", defaultSharePct: 10, active: true },
  ];

  const slaRules: SlaRule[] = [
    { id: 1, stage: "WhatsApp Group Creation", bank: null, maxDays: 1, active: true },
    { id: 2, stage: "Document collection and QC", bank: null, maxDays: 7, active: true },
    { id: 3, stage: "Bank Submission", bank: null, maxDays: 2, active: true },
    { id: 4, stage: "Pre-Approval", bank: null, maxDays: 7, active: true },
    { id: 5, stage: "Pre-Approval", bank: "EIB", maxDays: 10, active: true },
    { id: 6, stage: "Bank Query", bank: null, maxDays: 10, active: true },
    { id: 7, stage: "Pre-Approval QC", bank: null, maxDays: 2, active: true },
    { id: 8, stage: "Valuation", bank: null, maxDays: 5, active: true },
    { id: 9, stage: "Valuation Report", bank: null, maxDays: 3, active: true },
    { id: 10, stage: "FOL Conversion", bank: null, maxDays: 5, active: true },
    { id: 11, stage: "FOL", bank: null, maxDays: 5, active: true },
    { id: 12, stage: "FOL", bank: "FAB", maxDays: 7, active: true },
    { id: 13, stage: "DDA/Signing", bank: null, maxDays: 5, active: true },
    { id: 14, stage: "Loan Booking", bank: null, maxDays: 3, active: true },
    { id: 15, stage: "Liability/Release", bank: null, maxDays: 5, active: true },
    { id: 16, stage: "Final Transfer", bank: null, maxDays: 5, active: true },
    { id: 17, stage: "Final Transfer", bank: "DIB", maxDays: 7, active: true },
    { id: 18, stage: "Title Deed QC", bank: null, maxDays: 3, active: true },
  ];

  const cases: LoanCase[] = [];
  const tasks: Task[] = [];
  const activities: Activity[] = [];
  let cid = 0;
  let tid = 0;
  let aid = 0;

  interface DoneSeed { desc: string; owner: number; waiting: string; why: string; doneAgo: number; remarks?: string; by?: number }
  interface OpenSeed { desc: string; owner: number; waiting: string; why: string; dueIn: number; openedAgo: number; by?: number }
  interface CaseSeed {
    customer: string; banks: string[]; amountK: number; stage: string; owner: number; age: number;
    source: "Direct" | "Agent" | "Broker" | "Website" | "Referral";
    partner?: { kind: "Agent" | "Broker" | "Referral"; name: string; share: number };
    open?: OpenSeed; done?: DoneSeed[];
    trail?: [number, number, string, string?, string?][];
    state?: "Active" | "Closed" | "Lost";
    won?: string;
    closedAgo?: number;
  }

  const seeds: CaseSeed[] = [
    { customer: "Mohammed Al Mansoori", banks: ["ADCB", "FAB"], amountK: 1850, stage: "Credit Appraisal", owner: 5, age: 21, source: "Agent", partner: { kind: "Agent", name: "Falcon Properties", share: 20 },
      open: { desc: "Collect latest 3 salary certificates & 6-mo statements", owner: 5, waiting: "Client", why: "Awaiting client documents", dueIn: -3, openedAgo: 6, by: 4 },
      done: [
        { desc: "Login case & verify KYC set", owner: 5, waiting: "Internal", why: "Internal review", doneAgo: 17, remarks: "Passport + Emirates ID verified." },
        { desc: "Send document checklist to client", owner: 5, waiting: "Client", why: "Awaiting client documents", doneAgo: 12 },
      ],
      trail: [[5, 21, "Case created"], [5, 12, "Stage moved", "Documents & KYC", "Credit Appraisal"]] },
    { customer: "Sarah Thomson", banks: ["ENBD"], amountK: 2400, stage: "Valuation", owner: 6, age: 14, source: "Broker", partner: { kind: "Broker", name: "Mortgage Souq", share: 30 },
      open: { desc: "Confirm valuer visit — Marina apartment access", owner: 6, waiting: "Valuer", why: "Valuer visit pending", dueIn: 0, openedAgo: 3 },
      done: [{ desc: "Upload title deed to ENBD portal", owner: 6, waiting: "Bank", why: "Bank query raised", doneAgo: 5, remarks: "Ref #ENBD-8842." }],
      trail: [[6, 14, "Case created"], [6, 6, "Stage moved", "Credit Appraisal", "Valuation"]] },
    { customer: "Ahmed Khan", banks: ["DIB", "ADIB", "Ajman Bank"], amountK: 950, stage: "Documents & KYC", owner: 5, age: 6, source: "Website",
      open: { desc: "Follow up on missing 6-month bank statements", owner: 5, waiting: "Client", why: "Awaiting client documents", dueIn: 4, openedAgo: 2 },
      trail: [[5, 6, "Case created"]] },
    { customer: "Priya Menon", banks: ["HSBC", "SCB"], amountK: 3100, stage: "Sanction", owner: 7, age: 26, source: "Referral", partner: { kind: "Referral", name: "Hessa Al Qasimi", share: 15 },
      open: { desc: "Answer bank query on spouse income declaration", owner: 7, waiting: "Bank", why: "Bank query raised", dueIn: -1, openedAgo: 4, by: 3 },
      done: [{ desc: "Submit sanction file to credit team", owner: 7, waiting: "Internal", why: "Internal review", doneAgo: 8 }],
      trail: [[7, 26, "Case created"], [7, 9, "Stage moved", "FOL Conversion", "FOL"], [7, 5, "Stage moved", "FOL", "Bank Query"]] },
    { customer: "John Okafor", banks: [], amountK: 1200, stage: "New Login", owner: 9, age: 2, source: "Direct",
      open: { desc: "Pre-login eligibility check — bank not yet decided", owner: 9, waiting: "Internal", why: "Internal review", dueIn: 6, openedAgo: 2, by: 8 },
      trail: [[9, 2, "Case created"]] },
    { customer: "Fatima Noor", banks: ["FAB"], amountK: 4200, stage: "Legal & Technical", owner: 6, age: 30, source: "Agent", partner: { kind: "Agent", name: "Skyline Realty", share: 15 },
      done: [
        { desc: "Coordinate legal vendor for title search", owner: 6, waiting: "Legal", why: "Legal opinion pending", doneAgo: 7, remarks: "Vendor: Gulf Title Services." },
        { desc: "Share valuation report with bank", owner: 6, waiting: "Bank", why: "Bank query raised", doneAgo: 13 },
      ],
      trail: [[6, 30, "Case created"], [6, 13, "Stage moved", "Valuation", "Legal & Technical"]] },
    { customer: "David Chen", banks: ["Mashreq"], amountK: 1600, stage: "Disbursement", owner: 7, age: 34, source: "Broker", partner: { kind: "Broker", name: "Capital Bridge", share: 20 },
      open: { desc: "Track disbursement & confirm with client", owner: 7, waiting: "Bank", why: "Payment confirmation", dueIn: 1, openedAgo: 2 },
      done: [{ desc: "Collect signed offer & security cheque", owner: 7, waiting: "Client", why: "Awaiting client documents", doneAgo: 4 }],
      trail: [[7, 34, "Case created"], [7, 4, "Stage moved", "Offer & Acceptance", "Disbursement"]] },
    { customer: "Hamad Al Suwaidi", banks: ["ADCB"], amountK: 5600, stage: "Offer & Acceptance", owner: 5, age: 18, source: "Direct",
      open: { desc: "Get offer letter signed — both applicants", owner: 5, waiting: "Client", why: "No response from client", dueIn: 5, openedAgo: 3 },
      trail: [[5, 18, "Case created"], [5, 5, "Stage moved", "Sanction", "Offer & Acceptance"]] },
    { customer: "Elena Petrova", banks: ["RAK Bank"], amountK: 800, stage: "Credit Appraisal", owner: 7, age: 9, source: "Website",
      open: { desc: "Re-check Al Etihad credit bureau report", owner: 7, waiting: "Internal", why: "Internal review", dueIn: -5, openedAgo: 8, by: 4 },
      trail: [[7, 9, "Case created"]] },
    { customer: "Yusuf Karim", banks: ["UAB", "CBD"], amountK: 1450, stage: "Documents & KYC", owner: 9, age: 4, source: "Referral", partner: { kind: "Referral", name: "Nasser Al Mansoori", share: 10 },
      done: [{ desc: "Collect KYC + salary certificate set", owner: 9, waiting: "Client", why: "Awaiting client documents", doneAgo: 1, remarks: "2 payslips still pending." }],
      trail: [[9, 4, "Case created"], [9, 1, "Task completed", "Collect KYC + salary certificate set"]] },
    { customer: "Grace Muthoni", banks: ["ENBD", "Emirates NBD"], amountK: 2100, stage: "Valuation", owner: 6, age: 12, source: "Agent", partner: { kind: "Agent", name: "Palm Gate Homes", share: 20 },
      open: { desc: "Reschedule valuer visit — client travelling", owner: 6, waiting: "Valuer", why: "Valuer visit pending", dueIn: 3, openedAgo: 2 },
      trail: [[6, 12, "Case created"], [6, 4, "Stage moved", "Credit Appraisal", "Valuation"]] },
    { customer: "Sultan Al Nuaimi", banks: ["Ajman Bank"], amountK: 700, stage: "New Login", owner: 7, age: 1, source: "Direct",
      open: { desc: "Collect login form + processing fee", owner: 7, waiting: "Client", why: "Awaiting client documents", dueIn: 7, openedAgo: 1 },
      trail: [[7, 1, "Case created"]] },
    { customer: "Rachel Fernandes", banks: ["FAB", "ADCB"], amountK: 2750, stage: "Sanction", owner: 5, age: 23, source: "Broker", partner: { kind: "Broker", name: "Mortgage Souq", share: 30 },
      open: { desc: "Push credit team for sanction memo", owner: 5, waiting: "Bank", why: "Bank query raised", dueIn: 0, openedAgo: 5 },
      done: [{ desc: "Clarify property chain query", owner: 5, waiting: "Legal", why: "Legal opinion pending", doneAgo: 6 }],
      trail: [[5, 23, "Case created"], [5, 7, "Stage moved", "Legal & Technical", "Sanction"]] },
    { customer: "Khalid Bin Omar", banks: ["ADIB"], amountK: 3400, stage: "Post-Disbursement", owner: 7, age: 41, source: "Referral", partner: { kind: "Referral", name: "Bilal Hussain", share: 10 },
      open: { desc: "Collect original title deed for bank custody", owner: 7, waiting: "Client", why: "No response from client", dueIn: 10, openedAgo: 4 },
      trail: [[7, 41, "Case created"], [7, 6, "Stage moved", "Disbursement", "Post-Disbursement"]] },
    { customer: "Anna Kowalski", banks: ["HSBC"], amountK: 1900, stage: "Credit Appraisal", owner: 8, age: 16, source: "Website",
      open: { desc: "Third call — income proof still pending", owner: 8, waiting: "Client", why: "No response from client", dueIn: -2, openedAgo: 5 },
      trail: [[8, 16, "Case created"], [8, 10, "Stage moved", "WhatsApp Group Creation", "Document collection and QC"]] },
    { customer: "Omar Al Shamsi", banks: ["CBD"], amountK: 1100, stage: "Documents & KYC", owner: 9, age: 5, source: "Direct",
      done: [{ desc: "Verify employment with HR desk", owner: 9, waiting: "Client", why: "Awaiting client documents", doneAgo: 2, remarks: "HR letter issued." }],
      trail: [[9, 5, "Case created"], [9, 2, "Task completed", "Verify employment with HR desk"]] },
    { customer: "Michelle Tan", banks: ["SCB", "HSBC", "CBD"], amountK: 4800, stage: "Legal & Technical", owner: 6, age: 28, source: "Agent", partner: { kind: "Agent", name: "Falcon Properties", share: 20 },
      open: { desc: "Chase legal opinion — 2nd reminder sent", owner: 6, waiting: "Legal", why: "Legal opinion pending", dueIn: 2, openedAgo: 6, by: 4 },
      done: [{ desc: "Book technical inspection", owner: 6, waiting: "Valuer", why: "Valuer visit pending", doneAgo: 9, remarks: "Report received, value OK." }],
      trail: [[6, 28, "Case created"], [6, 10, "Stage moved", "Valuation", "Legal & Technical"]] },
    { customer: "Hassan Raza", banks: ["NBF"], amountK: 900, stage: "Credit Appraisal", owner: 4, age: 11, source: "Referral", partner: { kind: "Referral", name: "Nasser Al Mansoori", share: 10 },
      open: { desc: "Prepare credit note for underwriting", owner: 4, waiting: "Internal", why: "Internal review", dueIn: 2, openedAgo: 2 },
      trail: [[4, 11, "Case created"], [4, 3, "Stage moved", "Documents & KYC", "Credit Appraisal"]] },
    { customer: "Lucia Gomez", banks: ["Mashreq", "UAB"], amountK: 1350, stage: "Valuation", owner: 6, age: 8, source: "Broker", partner: { kind: "Broker", name: "Capital Bridge", share: 20 },
      open: { desc: "Upload valuation invoice for reimbursement", owner: 6, waiting: "Client", why: "Payment confirmation", dueIn: 6, openedAgo: 1 },
      trail: [[6, 8, "Case created"]] },
    { customer: "Viktor Ivanov", banks: ["ENBD"], amountK: 2900, stage: "Offer & Acceptance", owner: 7, age: 15, source: "Direct",
      open: { desc: "Negotiate rate reset clause with bank RM", owner: 7, waiting: "Bank", why: "Bank query raised", dueIn: 4, openedAgo: 3 },
      trail: [[7, 15, "Case created"], [7, 4, "Stage moved", "Sanction", "Offer & Acceptance"]] },
    { customer: "Maryam Al Ketbi", banks: [], amountK: 1750, stage: "New Login", owner: 5, age: 3, source: "Website",
      open: { desc: "Run affordability check — bank shortlist pending", owner: 5, waiting: "Internal", why: "Internal review", dueIn: 8, openedAgo: 1 },
      trail: [[5, 3, "Case created"]] },
    { customer: "Daniel Osei", banks: ["UAB"], amountK: 1000, stage: "Documents & KYC", owner: 9, age: 7, source: "Agent", partner: { kind: "Agent", name: "Skyline Realty", share: 15 },
      open: { desc: "Collect tenancy contract & Ejari", owner: 9, waiting: "Client", why: "Awaiting client documents", dueIn: -4, openedAgo: 6 },
      trail: [[9, 7, "Case created"]] },

    /* ---- booked history (business + commission reports) ---- */
    { customer: "Sunita Pawar", banks: ["ADCB"], amountK: 2150, stage: "Closed", owner: 5, age: 55, state: "Closed", won: "ADCB", closedAgo: 11, source: "Agent", partner: { kind: "Agent", name: "Falcon Properties", share: 20 },
      trail: [[5, 55, "Case created"], [5, 12, "Stage moved", "Post-Disbursement", "Closed"], [5, 11, "Case booked", undefined, "ADCB"]] },
    { customer: "Vinod Kamble", banks: ["ENBD", "ADCB"], amountK: 1800, stage: "Closed", owner: 5, age: 32, state: "Closed", won: "ENBD", closedAgo: 4, source: "Direct",
      trail: [[5, 32, "Case created"], [5, 4, "Case booked", undefined, "ENBD"]] },
    { customer: "Asha Pillai", banks: ["FAB"], amountK: 3200, stage: "Closed", owner: 6, age: 40, state: "Closed", won: "FAB", closedAgo: 9, source: "Broker", partner: { kind: "Broker", name: "Mortgage Souq", share: 30 },
      trail: [[6, 40, "Case created"], [6, 9, "Case booked", undefined, "FAB"]] },
    { customer: "Prakash Jain", banks: ["DIB", "ADIB"], amountK: 1400, stage: "Closed", owner: 5, age: 52, state: "Closed", won: "DIB", closedAgo: 16, source: "Referral", partner: { kind: "Referral", name: "Bilal Hussain", share: 10 },
      trail: [[5, 52, "Case created"], [5, 16, "Case booked", undefined, "DIB"]] },
    { customer: "Rukmini Rao", banks: ["HSBC"], amountK: 4100, stage: "Closed", owner: 6, age: 63, state: "Closed", won: "HSBC", closedAgo: 24, source: "Direct",
      trail: [[6, 63, "Case created"], [6, 24, "Case booked", undefined, "HSBC"]] },
    { customer: "Salim Ansari", banks: ["Mashreq", "CBD"], amountK: 1650, stage: "Closed", owner: 7, age: 44, state: "Closed", won: "Mashreq", closedAgo: 37, source: "Agent", partner: { kind: "Agent", name: "Palm Gate Homes", share: 20 },
      trail: [[7, 44, "Case created"], [7, 37, "Case booked", undefined, "Mashreq"]] },
    { customer: "Bhavna Trivedi", banks: ["SCB"], amountK: 2300, stage: "Closed", owner: 7, age: 55, state: "Closed", won: "SCB", closedAgo: 49, source: "Broker", partner: { kind: "Broker", name: "Capital Bridge", share: 20 },
      trail: [[7, 55, "Case created"], [7, 49, "Case booked", undefined, "SCB"]] },
    { customer: "Kiran Bedi", banks: ["UAB", "RAK Bank"], amountK: 1250, stage: "Closed", owner: 4, age: 60, state: "Closed", won: "UAB", closedAgo: 66, source: "Website",
      trail: [[4, 60, "Case created"], [4, 66, "Case booked", undefined, "UAB"]] },
    { customer: "Mahesh Yadav", banks: ["Ajman Bank"], amountK: 850, stage: "Closed", owner: 9, age: 80, state: "Closed", won: "Ajman Bank", closedAgo: 74, source: "Direct",
      trail: [[9, 80, "Case created"], [9, 74, "Case booked", undefined, "Ajman Bank"]] },
    { customer: "Geeta Sundaram", banks: ["ADCB", "ENBD"], amountK: 2600, stage: "Closed", owner: 6, age: 95, state: "Closed", won: "ADCB", closedAgo: 88, source: "Agent", partner: { kind: "Agent", name: "Skyline Realty", share: 15 },
      trail: [[6, 95, "Case created"], [6, 88, "Case booked", undefined, "ADCB"]] },
    { customer: "Nilesh Phadke", banks: ["CBD"], amountK: 1950, stage: "Closed", owner: 5, age: 128, state: "Closed", won: "CBD", closedAgo: 105, source: "Direct",
      trail: [[5, 128, "Case created"], [5, 105, "Case booked", undefined, "CBD"]] },
    { customer: "Tara Bhandari", banks: ["ADIB"], amountK: 1500, stage: "Closed", owner: 7, age: 152, state: "Closed", won: "ADIB", closedAgo: 132, source: "Referral", partner: { kind: "Referral", name: "Hessa Al Qasimi", share: 15 },
      trail: [[7, 152, "Case created"], [7, 132, "Case booked", undefined, "ADIB"]] },

    /* ---- lost ---- */
    { customer: "Om Prakash", banks: ["EIB"], amountK: 1300, stage: "Credit Appraisal", owner: 7, age: 33, state: "Lost", closedAgo: 12, source: "Website",
      trail: [[7, 33, "Case created"], [7, 12, "Case marked lost", "Credit Appraisal", "Went with another broker"]] },
    { customer: "Jyoti Naik", banks: ["NBF", "UAB"], amountK: 2050, stage: "Sanction", owner: 7, age: 85, state: "Lost", closedAgo: 47, source: "Agent", partner: { kind: "Agent", name: "Falcon Properties", share: 20 },
      trail: [[7, 85, "Case created"], [7, 47, "Case marked lost", "Sanction", "Bank declined — DBR"]] },
  ];

  for (const s of seeds) {
    cid += 1;
    const id = cid;
    const createdAt = ts(s.age, id % 5);
    cases.push({
      id,
      caseNumber: `CASE-${String(111 + id).padStart(6, "0")}`,
      customer: s.customer,
      banks: s.banks,
      wonBank: s.state === "Closed" ? s.won ?? s.banks[0] ?? null : null,
      loanAmount: s.amountK * 1000,
      stage: STAGE_OVERRIDES[s.customer] ?? mapStage(s.stage),
      caseStatus: s.state ?? "Active",
      closedDate: s.state && s.state !== "Active" ? daysAgoISO(s.closedAgo ?? 1) : null,
      ownerId: s.owner,
      source: s.source,
      partner: s.partner ? { kind: s.partner.kind, name: s.partner.name, sharePct: s.partner.share } : null,
      whatsapp: "",
      waGroup: null,
      createdAt,
      updatedAt: ts(Math.max(0.02, (s.open?.openedAgo ?? s.done?.[0]?.doneAgo ?? s.closedAgo ?? 1) * 0.4), id % 3),
    });

    for (const d of s.done ?? []) {
      tid += 1;
      tasks.push({
        id: tid, caseId: id, description: d.desc, ownerId: d.owner, createdBy: d.by ?? d.owner, waitingFor: d.waiting,
        whyPending: d.why, createdAt: ts(d.doneAgo + 2, id % 4), dueDate: daysAgoISO(d.doneAgo - 1),
        status: "Done", completedAt: ts(d.doneAgo, id % 6), remarks: d.remarks ?? "",
      });
    }
    if (s.open) {
      tid += 1;
      tasks.push({
        id: tid, caseId: id, description: s.open.desc, ownerId: s.open.owner, createdBy: s.open.by ?? s.open.owner,
        waitingFor: s.open.waiting, whyPending: s.open.why, createdAt: ts(s.open.openedAgo, id % 4),
        dueDate: s.open.dueIn < 0 ? daysAgoISO(-s.open.dueIn) : inDaysISO(s.open.dueIn),
        status: "Open", completedAt: null, remarks: "",
      });
    }

    aid += 1;
    activities.push({ id: aid, caseId: id, userId: s.owner, at: createdAt, action: "Case created", newValue: STAGE_OVERRIDES[s.customer] ?? mapStage(s.stage) });
    if (s.partner) {
      aid += 1;
      activities.push({ id: aid, caseId: id, userId: s.owner, at: createdAt, action: "Source logged", newValue: `${s.source} · ${s.partner.name} @ ${s.partner.share}%` });
    }
    for (const [u, ago, action, ov, nv] of s.trail ?? []) {
      aid += 1;
      const mapIfStage = (v: string | undefined) => (v === undefined ? v : mapStage(v));
      const mv = action === "Stage moved" || action === "Case marked lost" || action === "Case booked"
        ? [mapIfStage(ov), mapIfStage(nv)]
        : [ov, nv];
      activities.push({ id: aid, caseId: id, userId: u, at: ts(ago, (id + ago) % 5), action, oldValue: mv[0], newValue: mv[1] });
    }
  }

  const waMap: Record<string, { wa: string; group?: string }> = {
    "Mohammed Al Mansoori": { wa: "+971 50 234 8811", group: "https://chat.whatsapp.com/HfmcAlMansoori01" },
    "Sarah Thomson": { wa: "+971 55 810 2245", group: "https://chat.whatsapp.com/HfmcThomson02" },
    "Priya Menon": { wa: "+971 52 667 9034" },
    "Fatima Noor": { wa: "+971 54 402 7789", group: "https://chat.whatsapp.com/HfmcFatimaNoor04" },
    "David Chen": { wa: "+971 56 300 7719" },
    "Hamad Al Suwaidi": { wa: "+971 50 918 3345" },
    "Sunita Pawar": { wa: "+971 54 902 3361" },
  };
  for (const c of cases) {
    const p = waMap[c.customer];
    if (p) {
      c.whatsapp = p.wa;
      c.waGroup = p.group ?? null;
    }
  }

  const instructions: Instruction[] = [
    { id: 1, caseId: 1, issuedBy: 4, instruction: "Client has gone quiet on documents. Do a home visit before Friday — do not let this slip to 'no response'.", assignedTo: 5, dueDate: inDaysISO(2), status: "Open", createdAt: ts(2, 3), completedAt: null,
      replies: [
        { id: 1, userId: 5, text: "Home visit done yesterday evening. 4 of 6 statements collected — balance promised Friday morning.", at: ts(1, 2) },
        { id: 2, userId: 4, text: "Good. If Friday slips, we pull the file from ADCB and re-submit to FAB.", at: ts(0, 6) },
      ] },
    { id: 2, caseId: 4, issuedBy: 1, instruction: "This HSBC query is a day overdue. Call the RM directly today and close the spouse income point.", assignedTo: 7, dueDate: inDaysISO(0), status: "Open", createdAt: ts(1, 5), completedAt: null,
      replies: [{ id: 3, userId: 7, text: "On it — RM confirmed an 11:30 call today.", at: ts(0, 4) }] },
    { id: 3, caseId: 7, issuedBy: 3, instruction: "Confirm Mashreq disbursement with the client and update the tracker the same day.", assignedTo: 7, dueDate: daysAgoISO(1), status: "Done", createdAt: ts(3, 2), completedAt: ts(1, 4),
      replies: [{ id: 4, userId: 7, text: "Disbursed AED 1.6M confirmed with client. Tracker updated.", at: ts(1, 3) }] },
    { id: 4, caseId: 17, issuedBy: 1, instruction: "If the legal opinion is not in by Monday, switch to our empanelled vendor. This file is worth AED 4.8M.", assignedTo: 6, dueDate: inDaysISO(3), status: "Open", createdAt: ts(1, 1), completedAt: null, replies: [] },
    { id: 5, caseId: 5, issuedBy: 2, instruction: "Run the affordability calculator and shortlist two banks for this client by tomorrow.", assignedTo: 9, dueDate: inDaysISO(1), status: "Open", createdAt: ts(1, 2), completedAt: null, replies: [] },
  ];

  const bulletin: BulletinItem[] = [
    { id: 1, date: todayISO(), issuedBy: 4, task: "Morning huddle 9:30 sharp — everyone bring their overdue files. We clear the Pre-Approval backlog today, no file older than 5 days leaves the room unresolved.", caseId: null, targets: [5, 6, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 7),
      replies: [{ id: 5, userId: 9, text: "Bringing John Okafor — shortlist is ready for review.", at: ts(0, 5) }] },
    { id: 2, date: todayISO(), issuedBy: 1, task: "HSBC file CASE-000114 is a day overdue on the spouse-income query. Owner to call the RM before 12:00 — no email ping-pong on this one.", caseId: 4, targets: [7], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 6), replies: [] },
    { id: 3, date: todayISO(), issuedBy: 3, task: "Daniel Osei — Ejari + tenancy contract is the third reminder now. If silent by 17:00, schedule a home visit for tomorrow morning.", caseId: 22, targets: [9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 5), replies: [] },
    { id: 4, date: todayISO(), issuedBy: 2, task: "All WhatsApp groups created yesterday must have the document checklist pinned today. Audit at EOD.", caseId: null, targets: [5, 6, 7, 8, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 4), replies: [] },
    { id: 5, date: daysAgoISO(1), issuedBy: 4, task: "Every valuation report older than 2 days gets chased with the valuer before EOD. Valuation Report stage is our biggest leak.", caseId: null, targets: [5, 6], status: "Done", completedAt: ts(0, 9), completedBy: 6, createdAt: ts(1, 6),
      replies: [{ id: 6, userId: 6, text: "Both chased — Grace Muthoni's report lands tomorrow morning, Lucia's invoice uploaded.", at: ts(1, 2) }] },
    { id: 6, date: daysAgoISO(1), issuedBy: 1, task: "Falcon Properties introduced 3 files this week — acknowledge each lead with a same-day WhatsApp. Agents remember speed.", caseId: null, targets: [5], status: "Done", completedAt: ts(1, 1), completedBy: 5, createdAt: ts(1, 8), replies: [] },
    /* missed yesterday — still open, will surface as MISSED */
    { id: 7, date: daysAgoISO(1), issuedBy: 2, task: "Reconcile the Ajman Bank login fees for last week's files and post the total in the group.", caseId: null, targets: [5, 6], status: "Open", completedAt: null, completedBy: null, createdAt: ts(1, 5), replies: [] },
    /* carried forward from two days ago */
    { id: 8, date: todayISO(), issuedBy: 1, task: "Get the ADCB rate-lock confirmation for the Al Mansoori file in writing — this is the third ask, escalate to the branch manager.", caseId: null, targets: [7], status: "Open", completedAt: null, completedBy: null, createdAt: ts(2, 4), carriedFrom: daysAgoISO(2), replies: [{ id: 7, userId: 7, text: "RM promised it by 2pm yesterday, nothing yet. Escalating now.", at: ts(0, 3) }] },
    /* dropped, not done */
    { id: 9, date: daysAgoISO(3), issuedBy: 2, task: "Re-type the old SPO checklist from the shared drive.", caseId: null, targets: [9], status: "Done", dropped: true, completedAt: ts(3, 1), completedBy: 2, createdAt: ts(3, 6), replies: [{ id: 8, userId: 2, text: "Dropped — superseded by the new checklist directive, ignore this one.", at: ts(3, 1) }] },
    /* routine templates — materialized into a fresh instance every eligible morning */
    { id: 10, date: daysAgoISO(6), issuedBy: 4, task: "Routine: clear your overdue chase list before EOD and mark each file's task done.", caseId: null, targets: [5, 6, 7, 8, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(6, 8), replies: [], repeat: "weekdays", isTemplate: true },
    { id: 11, date: daysAgoISO(6), issuedBy: 1, task: "Routine: post a one-line EOD update per active case in your book.", caseId: null, targets: [5, 6, 7, 8, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(6, 7), replies: [], repeat: "daily", isTemplate: true },
  ];

  /* a directive pinned to an already-booked case — will auto-resolve on load */
  const bookedCase = cases.find((c) => c.caseStatus === "Closed");
  if (bookedCase) {
    bulletin.push({ id: 12, date: daysAgoISO(2), issuedBy: 3, task: "Chase the liability release letter for this file before the weekend.", caseId: bookedCase.id, targets: [7], status: "Open", completedAt: null, completedBy: null, createdAt: ts(2, 6), replies: [] });
  }

  const mkCheck = (
    id: number, caseId: number | null, customerName: string, createdBy: number, createdAgo: number,
    input: { mi: number; oi: number; emi: number; age: number; emp: "Salaried" | "Self-Employed"; pv: number; bank: string; rate: number | null; ten: number | null }
  ): AffordabilityCheck => {
    const r = computeAffordability({
      monthlyIncome: input.mi, otherIncome: input.oi, existingEmis: input.emi, age: input.age,
      employmentType: input.emp, propertyValue: input.pv, bank: input.bank,
      interestRate: input.rate, tenureYears: input.ten,
    });
    return {
      id, caseId, customerName, createdBy, createdAt: ts(createdAgo, id),
      monthlyIncome: input.mi, otherIncome: input.oi, existingEmis: input.emi, age: input.age,
      employmentType: input.emp, propertyValue: input.pv, bank: input.bank,
      interestRate: r.rateUsed, tenureYears: r.tenureUsed,
      applicableLtv: r.applicableLtv, maxLoanByLtv: r.maxLoanByLtv, maxDbrPct: r.maxDbrPct,
      availableDbrEmi: r.availableDbrEmi, maxLoanByDbr: r.maxLoanByDbr, maxTenureByAge: r.maxTenureByAge,
      finalEligibleLoan: r.finalEligibleLoan, estimatedEmi: r.estimatedEmi, eligible: r.eligible,
    };
  };

  const affordabilityChecks: AffordabilityCheck[] = [
    mkCheck(1, 3, "Ahmed Khan", 7, 6, { mi: 24000, oi: 3000, emi: 2800, age: 31, emp: "Salaried", pv: 1500000, bank: "DIB", rate: 4.65, ten: 25 }),
    mkCheck(2, null, "Tariq Aziz", 7, 3, { mi: 16000, oi: 0, emi: 6500, age: 38, emp: "Self-Employed", pv: 1100000, bank: "UAB", rate: null, ten: null }),
    mkCheck(3, null, "Neha Kothari", 3, 1, { mi: 45000, oi: 6000, emi: 8000, age: 29, emp: "Salaried", pv: 3600000, bank: "ADCB", rate: null, ten: 25 }),
    mkCheck(4, 5, "John Okafor", 9, 1, { mi: 30000, oi: 0, emi: 4500, age: 34, emp: "Salaried", pv: 1900000, bank: "FAB", rate: null, ten: 20 }),
  ];

  /* seed a realistic email log so the Email Log screen is alive on first open —
     emails that flowed through the SalesProgressionDL / VIRTUALRM1 group mailboxes */
  const emails: import("./types").EmailLog[] = [];
  const nowMs = Date.now();
  const mkEmail = (
    id: string, customerName: string, bankName: string | null, topic: string,
    dir: "out" | "in", hoursAgo: number, fromName: string, fromAddress: string, snippet: string, link: boolean
  ) => {
    const c = link ? cases.find((x) => x.customer === customerName && x.caseStatus === "Active") : undefined;
    const at = new Date(nowMs - hoursAgo * 3600000).toISOString();
    emails.push({
      id,
      subject: `${customerName} – ${bankName ?? "bank TBC"} – ${topic}`,
      fromName, fromAddress,
      direction: dir,
      customer: customerName, bank: bankName,
      caseId: c?.id ?? null,
      receivedAt: at,
      snippet,
      linkedAt: c ? at : null,
      linkedBy: null,
    });
  };
  mkEmail("seed-q1", "Mohammed Al Mansoori", "ADCB", "salary certificate clarification", "out", 52, "HFMC Mortgages", "operations@hfmcgroupuae.com", "Sent to ADCB credit team · CC SalesProgressionDL, VIRTUALRM1", true);
  mkEmail("seed-r1", "Mohammed Al Mansoori", "ADCB", "salary certificate clarification", "in", 30, "ADCB · Relationship Manager", "credit.adcb@adcb.com", "Please provide the latest salary certificate with breakdown of allowances.", true);
  mkEmail("seed-q2", "Fatima Noor", "FAB", "liability letter chase (3rd)", "out", 44, "HFMC Mortgages", "operations@hfmcgroupuae.com", "Third reminder to FAB ops — liability letter still outstanding.", true);
  mkEmail("seed-q3", "Priya Menon", "HSBC", "spouse income declaration", "out", 26, "HFMC Mortgages", "operations@hfmcgroupuae.com", "Query raised on spouse income — declaration attached for review.", true);
  mkEmail("seed-r3", "Priya Menon", "HSBC", "spouse income declaration", "in", 8, "HSBC · Credit Processing", "mortgages@hsbc.ae", "Declaration received. One further point on the allowance structure.", true);
  mkEmail("seed-q4", "Khalid Bin Omar", "ADIB", "transfer date confirmation", "out", 20, "HFMC Mortgages", "operations@hfmcgroupuae.com", "Asked ADIB to confirm the funds transfer date with the trustee.", true);
  mkEmail("seed-q5", "David Chen", "Mashreq", "disbursement confirmation", "out", 70, "HFMC Mortgages", "operations@hfmcgroupuae.com", "Awaiting disbursement confirmation from Mashreq back office.", true);
  mkEmail("seed-x1", "Omar Al Farsi", "Mashreq", "pre-approval status", "out", 12, "HFMC Mortgages", "operations@hfmcgroupuae.com", "Customer not in the pipeline yet — create a case or link manually.", false);
  mkEmail("seed-x2", "Huda Ibrahim", "CBD", "documents received", "in", 5, "CBD · Credit Processing", "creditprocessing@cbd.ae", "Documents received for the above customer. No pipeline match found.", false);

  return {
    version: 10, users, designations, cases, tasks, activities, stages, whyPending, waitingFor,
    banks, partners, slaRules, instructions, bulletin, affordabilityChecks, emails,
  };
}
