import type {
  Activity, AffordabilityCheck, BankItem, DB, Designation, Instruction, LoanCase, MasterItem,
  PartnerItem, SlaRule, StageItem, Task, User,
} from "./types";
import { daysAgoISO, inDaysISO } from "./format";
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
    "New Login", "Documents & KYC", "Credit Appraisal", "Valuation", "Legal & Technical",
    "Sanction", "Offer & Acceptance", "Disbursement", "Post-Disbursement", "Closed",
  ].map((label, i) => ({ id: i + 1, label, active: true, sortOrder: i + 1 }));

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
    { id: 1, stage: "New Login", bank: null, maxDays: 3, active: true },
    { id: 2, stage: "Documents & KYC", bank: null, maxDays: 6, active: true },
    { id: 3, stage: "Credit Appraisal", bank: null, maxDays: 7, active: true },
    { id: 4, stage: "Credit Appraisal", bank: "ADCB", maxDays: 5, active: true },
    { id: 5, stage: "Valuation", bank: null, maxDays: 5, active: true },
    { id: 6, stage: "Legal & Technical", bank: null, maxDays: 10, active: true },
    { id: 7, stage: "Sanction", bank: null, maxDays: 5, active: true },
    { id: 8, stage: "Sanction", bank: "FAB", maxDays: 7, active: true },
    { id: 9, stage: "Offer & Acceptance", bank: null, maxDays: 5, active: true },
    { id: 10, stage: "Disbursement", bank: null, maxDays: 4, active: true },
    { id: 11, stage: "Post-Disbursement", bank: null, maxDays: 12, active: true },
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
      trail: [[7, 26, "Case created"], [7, 9, "Stage moved", "Legal & Technical", "Sanction"]] },
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
      trail: [[8, 16, "Case created"]] },
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
      stage: s.stage,
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
    activities.push({ id: aid, caseId: id, userId: s.owner, at: createdAt, action: "Case created", newValue: s.stage });
    if (s.partner) {
      aid += 1;
      activities.push({ id: aid, caseId: id, userId: s.owner, at: createdAt, action: "Source logged", newValue: `${s.source} · ${s.partner.name} @ ${s.partner.share}%` });
    }
    for (const [u, ago, action, ov, nv] of s.trail ?? []) {
      aid += 1;
      activities.push({ id: aid, caseId: id, userId: u, at: ts(ago, (id + ago) % 5), action, oldValue: ov, newValue: nv });
    }
  }

  const waMap: Record<string, { wa: string; group?: string }> = {
    "Suresh Patil": { wa: "+971 50 234 8811", group: "https://chat.whatsapp.com/HfmcSureshPatil01" },
    "Meera Krishnan": { wa: "+971 55 810 2245" },
    "Kavita Deshpande": { wa: "+971 52 667 9034", group: "https://chat.whatsapp.com/HfmcKavitaFile04" },
    "Rajiv Malhotra": { wa: "+971 50 445 1278" },
    "Deepak Nair": { wa: "+971 56 300 7719" },
    "Vinod Kamble": { wa: "+971 54 902 3361" },
  };
  for (const c of cases) {
    const p = waMap[c.customer];
    if (p) {
      c.whatsapp = p.wa;
      c.waGroup = p.group ?? null;
    }
  }

  const instructions: Instruction[] = [
    { id: 1, caseId: 1, issuedBy: 4, instruction: "Client has gone quiet on documents. Do a home visit before Friday — do not let this slip to 'no response'.", assignedTo: 5, dueDate: inDaysISO(2), status: "Open", createdAt: ts(2, 3), completedAt: null },
    { id: 2, caseId: 4, issuedBy: 1, instruction: "This HSBC query is a day overdue. Call the RM directly today and close the spouse income point.", assignedTo: 7, dueDate: inDaysISO(0), status: "Open", createdAt: ts(1, 5), completedAt: null },
    { id: 3, caseId: 7, issuedBy: 3, instruction: "Confirm Mashreq disbursement with the client and update the tracker the same day.", assignedTo: 7, dueDate: daysAgoISO(1), status: "Done", createdAt: ts(3, 2), completedAt: ts(1, 4) },
    { id: 4, caseId: 17, issuedBy: 1, instruction: "If the legal opinion is not in by Monday, switch to our empanelled vendor. This file is worth AED 4.8M.", assignedTo: 6, dueDate: inDaysISO(3), status: "Open", createdAt: ts(1, 1), completedAt: null },
    { id: 5, caseId: 5, issuedBy: 2, instruction: "Run the affordability calculator and shortlist two banks for this client by tomorrow.", assignedTo: 9, dueDate: inDaysISO(1), status: "Open", createdAt: ts(1, 2), completedAt: null },
  ];

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

  return {
    version: 7, users, designations, cases, tasks, activities, stages, whyPending, waitingFor,
    banks, partners, slaRules, instructions, affordabilityChecks,
  };
}
