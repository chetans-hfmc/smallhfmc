import type {
  Activity, AffordabilityCheck, BankItem, BulletinItem, DB, Designation, Instruction, LoanCase, MasterItem,
  PartnerItem, SlaRule, StageItem, Task, User,
} from "./types";
import { daysAgoISO, inDaysISO, todayISO } from "./format";
import { computeMortgage, defaultInput } from "./calc";

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
    { id: 2, name: "Nadia Haddad", email: "pa@meridian.ae", password: "demo123", role: "PA to HoC", team: "Management", active: true, createdAt: ts(380) },
    { id: 3, name: "Omar Siddiqui", email: "omar@meridian.ae", password: "demo123", role: "Mortgage Head", team: "Management", active: true, createdAt: ts(360) },
    { id: 4, name: "Imran Qureshi", email: "imran@meridian.ae", password: "demo123", role: "Team Leader SPO", team: "Dubai", active: true, createdAt: ts(300) },
    { id: 5, name: "Fatima Zahra", email: "fatima@meridian.ae", password: "demo123", role: "Team Leader VRM", team: "Abu Dhabi", active: true, createdAt: ts(290) },
    { id: 6, name: "Aisha Khan", email: "aisha@meridian.ae", password: "demo123", role: "SPO", team: "Dubai", active: true, createdAt: ts(250) },
    { id: 7, name: "Vikram Shetty", email: "vikram@meridian.ae", password: "demo123", role: "SPO", team: "Dubai", active: true, createdAt: ts(200) },
    { id: 8, name: "Neha Joshi", email: "neha@meridian.ae", password: "demo123", role: "SPO", team: "Abu Dhabi", active: true, createdAt: ts(180) },
    { id: 9, name: "Grace Muthoni", email: "grace@meridian.ae", password: "demo123", role: "VRM", team: "Abu Dhabi", active: true, createdAt: ts(150) },
  ];

  const stageLabels = [
    "WhatsApp Group Creation", "Document collection and QC", "Bank Submission", "Pre-Approval", "Bank Query",
    "Pre-Approval QC", "Valuation", "Valuation Report", "FOL Conversion", "FOL", "DDA/Signing",
    "Loan Booking", "Liability/Release", "Final Transfer", "Title Deed QC", "Closure",
  ];
  const stages: StageItem[] = stageLabels.map((label, i) => ({ id: i + 1, label, active: true, sortOrder: i + 1 }));

  const whyPending: MasterItem[] = [
    "Awaiting client documents", "Bank query raised", "Valuer visit pending", "Legal opinion pending",
    "Internal review", "Payment confirmation", "System / portal issue", "No response from client", "Ejari / tenancy pending",
  ].map((label, i) => ({ id: i + 1, label, active: true }));

  const waitingFor: MasterItem[] = ["Client", "Bank", "Valuer", "Legal", "Internal", "Land Department"].map((label, i) => ({
    id: i + 1, label, active: true,
  }));

  const banks: BankItem[] = [
    ["ADCB", 1], ["ADIB", 0.95], ["Ajman Bank", 0.7], ["Al Hilal", 0.7], ["Arab Bank", 0.7], ["CBD", 1],
    ["DIB", 0.75], ["EIB", 0.7], ["ENBD", 0.85], ["FAB", 0.75], ["HSBC", 0.85], ["Mashreq", 1],
    ["NBF", 0.7], ["RAK Bank", 0.75], ["SCB", 0.825], ["UAB", 0.9],
  ].map(([name, rate], i) => ({ id: i + 1, name: name as string, ratePct: rate as number, active: true }));

  const partners: PartnerItem[] = [
    { id: 1, kind: "Agent", name: "Falcon Properties", defaultSharePct: 20, active: true },
    { id: 2, kind: "Broker", name: "BlueWave Brokers", defaultSharePct: 15, active: true },
    { id: 3, kind: "Referral", name: "Salman Al Rashid", defaultSharePct: 10, active: true },
    { id: 4, kind: "Broker", name: "PrimeGate Realty", defaultSharePct: 30, active: true },
    { id: 5, kind: "Referral", name: "Hessa Al Suwaidi", defaultSharePct: 10, active: true },
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
    closedAgo?: number; won?: string;
  }

  const P = (name: string) => partners.find((p) => p.name === name)!;
  const pt = (name: string) => ({ kind: P(name).kind, name, share: P(name).defaultSharePct });

  const seeds: CaseSeed[] = [
    { customer: "Mohammed Al Mansoori", banks: ["FAB", "ADCB"], amountK: 1850, stage: "Pre-Approval", owner: 6, age: 12, source: "Agent", partner: pt("Falcon Properties"),
      open: { desc: "Chase FAB credit team for pre-approval letter", owner: 6, waiting: "Bank", why: "Bank query raised", dueIn: -3, openedAgo: 6, by: 4 },
      done: [{ desc: "Collect passport, visa & salary certificates", owner: 6, waiting: "Client", why: "Awaiting client documents", doneAgo: 9, remarks: "All docs QC-passed." }],
      trail: [[6, 12, "Case created"], [6, 9, "Stage moved", "Document collection and QC", "Bank Submission"], [6, 8, "Stage moved", "Bank Submission", "Pre-Approval"]] },
    { customer: "Sarah Thompson", banks: ["HSBC"], amountK: 2400, stage: "Valuation", owner: 7, age: 21, source: "Website",
      open: { desc: "Book valuer visit — client available only after 5pm", owner: 7, waiting: "Valuer", why: "Valuer visit pending", dueIn: 0, openedAgo: 3 },
      done: [{ desc: "Answer HSBC query on spouse income", owner: 7, waiting: "Bank", why: "Bank query raised", doneAgo: 4, remarks: "Spouse salary cert uploaded." }],
      trail: [[7, 21, "Case created"], [7, 5, "Stage moved", "Pre-Approval QC", "Valuation"]] },
    { customer: "Ahmed Bin Saeed", banks: ["ADIB"], amountK: 950, stage: "Document collection and QC", owner: 6, age: 4, source: "Direct",
      open: { desc: "Get Ejari + last 6 months bank statements", owner: 6, waiting: "Client", why: "Ejari / tenancy pending", dueIn: 4, openedAgo: 2 },
      trail: [[6, 4, "Case created"]] },
    { customer: "Priya Menon", banks: ["ENBD", "Mashreq"], amountK: 1600, stage: "Bank Query", owner: 7, age: 26, source: "Broker", partner: pt("BlueWave Brokers"),
      open: { desc: "Resolve ENBD query on 2 bounced cheques (2023)", owner: 7, waiting: "Bank", why: "Bank query raised", dueIn: -1, openedAgo: 4, by: 4 },
      done: [{ desc: "Submit file to ENBD & Mashreq portals", owner: 7, waiting: "Internal", why: "Internal review", doneAgo: 7 }],
      trail: [[7, 26, "Case created"], [7, 7, "Stage moved", "Pre-Approval", "Bank Query"]] },
    { customer: "John Okafor", banks: [], amountK: 1200, stage: "WhatsApp Group Creation", owner: 9, age: 2, source: "Referral", partner: pt("Salman Al Rashid"),
      open: { desc: "Create WhatsApp group & share document checklist", owner: 9, waiting: "Internal", why: "Internal review", dueIn: 1, openedAgo: 1 },
      trail: [[9, 2, "Case created"]] },
    { customer: "Lucia Fernandez", banks: ["SCB"], amountK: 3100, stage: "Valuation Report", owner: 8, age: 17, source: "Agent", partner: pt("PrimeGate Realty"),
      open: { desc: "Upload valuer invoice for client reimbursement", owner: 8, waiting: "Client", why: "Payment confirmation", dueIn: 2, openedAgo: 2 },
      done: [{ desc: "Chase SCB for valuation order", owner: 8, waiting: "Bank", why: "Bank query raised", doneAgo: 5, remarks: "Valuer: Trowers." }],
      trail: [[8, 17, "Case created"], [8, 4, "Stage moved", "Valuation", "Valuation Report"]] },
    { customer: "Khalid Bin Omar", banks: ["DIB"], amountK: 2050, stage: "Final Transfer", owner: 6, age: 44, source: "Direct",
      open: { desc: "Confirm DIB transfer date with trustee office", owner: 6, waiting: "Bank", why: "Payment confirmation", dueIn: 1, openedAgo: 2 },
      done: [{ desc: "Sign DDA & collect manager's cheque", owner: 6, waiting: "Client", why: "Awaiting client documents", doneAgo: 3, remarks: "DDA signed at branch." }],
      trail: [[6, 44, "Case created"], [6, 6, "Stage moved", "Liability/Release", "Final Transfer"]] },
    { customer: "Elena Petrova", banks: ["RAK Bank"], amountK: 780, stage: "FOL Conversion", owner: 7, age: 29, source: "Website",
      open: { desc: "Convert pre-approval to FOL — client chose 5yr fixed", owner: 7, waiting: "Bank", why: "Internal review", dueIn: -5, openedAgo: 8, by: 4 },
      trail: [[7, 29, "Case created"], [7, 9, "Stage moved", "Pre-Approval QC", "FOL Conversion"]] },
    { customer: "Hassan Farooqui", banks: ["CBD"], amountK: 1350, stage: "DDA/Signing", owner: 6, age: 33, source: "Agent", partner: pt("Falcon Properties"),
      open: { desc: "Schedule DDA signing — client travels Friday", owner: 6, waiting: "Client", why: "No response from client", dueIn: 3, openedAgo: 2 },
      trail: [[6, 33, "Case created"], [6, 3, "Stage moved", "FOL", "DDA/Signing"]] },
    { customer: "Mei-Ling Chen", banks: ["Mashreq"], amountK: 1900, stage: "Pre-Approval QC", owner: 9, age: 11, source: "Broker", partner: pt("BlueWave Brokers"),
      open: { desc: "QC pre-approval terms vs client's ask (rate 3.99)", owner: 9, waiting: "Internal", why: "Internal review", dueIn: 1, openedAgo: 1 },
      trail: [[9, 11, "Case created"], [9, 2, "Stage moved", "Pre-Approval", "Pre-Approval QC"]] },
    { customer: "Abdul Rahman", banks: ["Al Hilal"], amountK: 2600, stage: "Loan Booking", owner: 8, age: 38, source: "Direct",
      open: { desc: "Confirm booking & raise commission invoice to Al Hilal", owner: 8, waiting: "Bank", why: "Payment confirmation", dueIn: 2, openedAgo: 1 },
      done: [{ desc: "Complete liability release with previous bank", owner: 8, waiting: "Bank", why: "Bank query raised", doneAgo: 4 }],
      trail: [[8, 38, "Case created"], [8, 2, "Stage moved", "DDA/Signing", "Loan Booking"]] },
    { customer: "Fatima Noor", banks: ["UAB"], amountK: 1100, stage: "FOL Conversion", owner: 6, age: 31, source: "Referral", partner: pt("Hessa Al Suwaidi"),
      open: { desc: "UAB needs updated liability letter — 3rd chase", owner: 6, waiting: "Bank", why: "No response from client", dueIn: -2, openedAgo: 6, by: 3 },
      trail: [[6, 31, "Case created"], [6, 13, "Stage moved", "Pre-Approval QC", "FOL Conversion"]] },
    { customer: "Daniel Osei", banks: ["NBF"], amountK: 890, stage: "Document collection and QC", owner: 9, age: 16, source: "Website",
      open: { desc: "Third call — income proof still pending", owner: 9, waiting: "Client", why: "No response from client", dueIn: -2, openedAgo: 5, by: 5 },
      trail: [[9, 16, "Case created"], [9, 10, "Stage moved", "WhatsApp Group Creation", "Document collection and QC"]] },
    { customer: "Aisha Al Zaabi", banks: ["ADCB"], amountK: 4200, stage: "Title Deed QC", owner: 7, age: 51, source: "Agent", partner: pt("PrimeGate Realty"),
      open: { desc: "QC title deed at DLD before final release", owner: 7, waiting: "Land Department", why: "Legal opinion pending", dueIn: 2, openedAgo: 1 },
      done: [{ desc: "Final transfer completed — funds released", owner: 7, waiting: "Bank", why: "Payment confirmation", doneAgo: 2, remarks: "AED 4.2M transferred." }],
      trail: [[7, 51, "Case created"], [7, 3, "Stage moved", "Final Transfer", "Title Deed QC"]] },
    { customer: "Rajiv Malhotra", banks: ["EIB"], amountK: 1450, stage: "Pre-Approval", owner: 8, age: 28, source: "Direct",
      open: { desc: "EIB pre-approval due — follow up with RM Amira", owner: 8, waiting: "Bank", why: "Bank query raised", dueIn: 5, openedAgo: 3 },
      trail: [[8, 28, "Case created"], [8, 6, "Stage moved", "Bank Submission", "Pre-Approval"]] },
    { customer: "Grace Adeyemi", banks: ["Ajman Bank"], amountK: 650, stage: "Bank Submission", owner: 9, age: 6, source: "Broker", partner: pt("BlueWave Brokers"),
      open: { desc: "Submit file to Ajman Bank portal", owner: 9, waiting: "Internal", why: "Internal review", dueIn: 1, openedAgo: 1 },
      trail: [[9, 6, "Case created"]] },
    { customer: "Tariq Hussain", banks: ["Arab Bank"], amountK: 1750, stage: "Liability/Release", owner: 6, age: 47, source: "Direct",
      open: { desc: "Previous lender settlement figure pending (CBD)", owner: 6, waiting: "Bank", why: "Payment confirmation", dueIn: 4, openedAgo: 2 },
      trail: [[6, 47, "Case created"], [6, 4, "Stage moved", "Loan Booking", "Liability/Release"]] },
    /* ---- booked history ---- */
    { customer: "Vinod Kamble", banks: ["ADCB"], amountK: 2100, stage: "Closure", owner: 6, age: 62, state: "Closed", closedAgo: 6, won: "ADCB", source: "Agent", partner: pt("Falcon Properties"),
      trail: [[6, 62, "Case created"], [6, 6, "Case booked", undefined, "ADCB"]] },
    { customer: "Asha Pillai", banks: ["ENBD"], amountK: 1650, stage: "Closure", owner: 7, age: 70, state: "Closed", closedAgo: 14, won: "ENBD", source: "Website",
      trail: [[7, 70, "Case created"], [7, 14, "Case booked", undefined, "ENBD"]] },
    { customer: "Prakash Jain", banks: ["FAB", "ADCB"], amountK: 2900, stage: "Closure", owner: 6, age: 84, state: "Closed", closedAgo: 21, won: "FAB", source: "Direct",
      trail: [[6, 84, "Case created"], [6, 21, "Case booked", undefined, "FAB"]] },
    { customer: "Rukmini Rao", banks: ["HSBC"], amountK: 3400, stage: "Closure", owner: 7, age: 95, state: "Closed", closedAgo: 33, won: "HSBC", source: "Broker", partner: pt("PrimeGate Realty"),
      trail: [[7, 95, "Case created"], [7, 33, "Case booked", undefined, "HSBC"]] },
    { customer: "Salim Ansari", banks: ["Mashreq"], amountK: 1250, stage: "Closure", owner: 9, age: 108, state: "Closed", closedAgo: 45, won: "Mashreq", source: "Referral", partner: pt("Salman Al Rashid"),
      trail: [[9, 108, "Case created"], [9, 45, "Case booked", undefined, "Mashreq"]] },
    { customer: "Bhavna Trivedi", banks: ["SCB"], amountK: 2350, stage: "Closure", owner: 8, age: 121, state: "Closed", closedAgo: 58, won: "SCB", source: "Direct",
      trail: [[8, 121, "Case created"], [8, 58, "Case booked", undefined, "SCB"]] },
    { customer: "Kiran Bedi", banks: ["UAB"], amountK: 1480, stage: "Closure", owner: 6, age: 137, state: "Closed", closedAgo: 72, won: "UAB", source: "Agent", partner: pt("Falcon Properties"),
      trail: [[6, 137, "Case created"], [6, 72, "Case booked", undefined, "UAB"]] },
    { customer: "Mahesh Yadav", banks: ["DIB"], amountK: 980, stage: "Closure", owner: 9, age: 152, state: "Closed", closedAgo: 88, won: "DIB", source: "Website",
      trail: [[9, 152, "Case created"], [9, 88, "Case booked", undefined, "DIB"]] },
    { customer: "Geeta Sundaram", banks: ["CBD"], amountK: 2750, stage: "Closure", owner: 7, age: 165, state: "Closed", closedAgo: 101, won: "CBD", source: "Broker", partner: pt("BlueWave Brokers"),
      trail: [[7, 165, "Case created"], [7, 101, "Case booked", undefined, "CBD"]] },
    { customer: "Nilesh Phadke", banks: ["ADIB"], amountK: 1950, stage: "Closure", owner: 6, age: 178, state: "Closed", closedAgo: 118, won: "ADIB", source: "Direct",
      trail: [[6, 178, "Case created"], [6, 118, "Case booked", undefined, "ADIB"]] },
    /* ---- lost ---- */
    { customer: "Om Prakash", banks: ["RAK Bank"], amountK: 1150, stage: "Pre-Approval", owner: 9, age: 63, state: "Lost", closedAgo: 12, source: "Website",
      trail: [[9, 63, "Case created"], [9, 12, "Case marked lost", "Pre-Approval", "Went with another broker"]] },
    { customer: "Jyoti Naik", banks: ["NBF"], amountK: 1620, stage: "FOL", owner: 8, age: 115, state: "Lost", closedAgo: 47, source: "Agent", partner: pt("PrimeGate Realty"),
      trail: [[8, 115, "Case created"], [8, 47, "Case marked lost", "FOL", "Bank declined — DBR"]] },
  ];

  for (const s of seeds) {
    cid += 1;
    const id = cid;
    const createdAt = ts(s.age, id % 5);
    cases.push({
      id,
      caseNumber: `CASE-${String(100 + id).padStart(6, "0")}`,
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
        whyPending: d.why, createdAt: ts(d.doneAgo + 2, id % 4), dueDate: daysAgoISO(Math.max(0, d.doneAgo - 1)),
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
    for (const [u, ago, action, ov, nv] of s.trail ?? []) {
      aid += 1;
      activities.push({ id: aid, caseId: id, userId: u, at: ts(ago, (id + ago) % 5), action, oldValue: ov, newValue: nv });
    }
  }

  const waMap: Record<string, { wa: string; group?: string }> = {
    "Mohammed Al Mansoori": { wa: "+971 50 234 8811", group: "https://chat.whatsapp.com/HfmcMansoori01" },
    "Sarah Thompson": { wa: "+971 55 810 2245" },
    "Priya Menon": { wa: "+971 52 667 9034", group: "https://chat.whatsapp.com/HfmcMenonFile04" },
    "Khalid Bin Omar": { wa: "+971 50 445 1278" },
    "Fatima Noor": { wa: "+971 56 300 7719", group: "https://chat.whatsapp.com/HfmcNoorFile06" },
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
    { id: 1, caseId: 1, issuedBy: 4, instruction: "FAB pre-approval is 3 days overdue. Call the credit manager directly today — no more portal pings.", assignedTo: 6, dueDate: inDaysISO(1), status: "Open", createdAt: ts(2, 3), completedAt: null,
      replies: [{ id: 1, userId: 6, text: "On it — RM call booked 11:30, will update here.", at: ts(1, 5) }] },
    { id: 2, caseId: 4, issuedBy: 1, instruction: "The bounced-cheque query decides this file. Prepare the client's explanation letter before the bank asks again.", assignedTo: 7, dueDate: inDaysISO(0), status: "Open", createdAt: ts(1, 5), completedAt: null, replies: [] },
    { id: 3, caseId: 12, issuedBy: 3, instruction: "UAB liability letter is the third chase. Escalate to their ops head if silent by EOD.", assignedTo: 6, dueDate: daysAgoISO(1), status: "Done", createdAt: ts(3, 2), completedAt: ts(1, 4),
      replies: [{ id: 2, userId: 6, text: "Escalated — letter received this morning.", at: ts(1, 6) }] },
  ];

  const today = todayISO();
  const bulletin: BulletinItem[] = [
    { id: 1, date: today, issuedBy: 4, task: "Morning huddle 9:30 sharp — everyone bring their overdue files. We clear the Pre-Approval backlog today, no file older than 5 days leaves the room unresolved.", caseId: null, targets: [6, 7, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 7),
      replies: [{ id: 3, userId: 9, text: "Bringing John Okafor — shortlist is ready for review.", at: ts(0, 5) }] },
    { id: 2, date: today, issuedBy: 1, task: "ENBD file CASE-000104 is a day overdue on the bounced-cheque query. Owner to call the RM before 12:00 — no email ping-pong on this one.", caseId: 4, targets: [7], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 6), replies: [] },
    { id: 3, date: today, issuedBy: 3, task: "Daniel Osei — Ejari + income proof is the third reminder now. If silent by 17:00, schedule a home visit for tomorrow morning.", caseId: 13, targets: [9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 5), replies: [] },
    { id: 4, date: today, issuedBy: 2, task: "All WhatsApp groups created yesterday must have the document checklist pinned today. Audit at EOD.", caseId: null, targets: [5, 6, 7, 8, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 4), replies: [] },
    { id: 5, date: daysAgoISO(1), issuedBy: 4, task: "Every valuation report older than 2 days gets chased with the valuer before EOD. Valuation Report stage is our biggest leak.", caseId: null, targets: [6, 7], status: "Done", completedAt: ts(0, 9), completedBy: 7, createdAt: ts(1, 6),
      replies: [{ id: 4, userId: 7, text: "Both chased — Lucia's report lands tomorrow morning, invoice uploaded.", at: ts(1, 2) }] },
    { id: 6, date: daysAgoISO(1), issuedBy: 1, task: "Falcon Properties introduced 3 files this week — acknowledge each lead with a same-day WhatsApp. Agents remember speed.", caseId: null, targets: [6], status: "Done", completedAt: ts(1, 1), completedBy: 6, createdAt: ts(1, 8), replies: [] },
    { id: 7, date: daysAgoISO(2), issuedBy: 3, task: "Chase the CBD settlement figure for Tariq Hussain before the weekend.", caseId: 17, targets: [6], status: "Open", completedAt: null, completedBy: null, createdAt: ts(2, 6), replies: [] },
    { id: 8, date: daysAgoISO(1), issuedBy: 4, task: "Send welcome kits to the two files booked this week.", caseId: null, targets: [8], status: "Open", completedAt: null, completedBy: null, createdAt: ts(1, 7), dropped: true, replies: [] },
    { id: 10, date: daysAgoISO(3), issuedBy: 1, task: "Call every At-Risk file before noon and update the tracker.", caseId: null, targets: [6, 7], status: "Open", completedAt: null, completedBy: null, createdAt: ts(3, 6), carriedFrom: daysAgoISO(4), replies: [] },
    /* routine template + instances */
    { id: 11, date: daysAgoISO(6), issuedBy: 3, task: "EOD: every file that moved stage today has its WhatsApp group updated + next-step message pinned.", caseId: null, targets: [6, 7, 8, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(6, 8), replies: [], repeat: "daily", templateId: null, isTemplate: true },
    { id: 12, date: daysAgoISO(1), issuedBy: 3, task: "EOD: every file that moved stage today has its WhatsApp group updated + next-step message pinned.", caseId: null, targets: [6, 7, 8, 9], status: "Done", completedAt: ts(1, 2), completedBy: 6, createdAt: ts(1, 8), replies: [], templateId: 11 },
    { id: 13, date: today, issuedBy: 3, task: "EOD: every file that moved stage today has its WhatsApp group updated + next-step message pinned.", caseId: null, targets: [6, 7, 8, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 8), replies: [], templateId: 11 },
    /* pinned to a booked case — demonstrates auto-resolution */
    { id: 14, date: daysAgoISO(8), issuedBy: 5, task: "Nudge Vinod Kamble for the post-disbursement documents.", caseId: 18, targets: [6], status: "Done", completedAt: ts(5, 3), completedBy: null, createdAt: ts(8, 5),
      replies: [{ id: 5, userId: 6, text: "Case closed — directive resolved automatically, no action needed.", at: ts(5, 3) }] },
  ];

  const mkCheck = (
    id: number, caseId: number | null, customerName: string, createdBy: number, createdAgo: number,
    patch: Partial<ReturnType<typeof defaultInput>>
  ): AffordabilityCheck => {
    const input = { ...defaultInput(), ...patch };
    const r = computeMortgage(input);
    return {
      id, caseId, customerName, createdBy, createdAt: ts(createdAgo, id),
      monthlyIncome: r.eligibleIncome, otherIncome: 0, existingEmis: r.existingEmis, age: r.ageNowYears,
      employmentType: input.employment, propertyValue: r.calcBasis, bank: "", interestRate: r.assessmentRate,
      tenureYears: Math.round(r.maxTenorMonths / 12), applicableLtv: r.actualLtv, maxLoanByLtv: r.ltvMpbf,
      maxDbrPct: 50, availableDbrEmi: r.availableEmi, maxLoanByDbr: r.dbrMpbf, maxTenureByAge: Math.round(r.maxTenorMonths / 12),
      finalEligibleLoan: r.finalMpbf, estimatedEmi: r.newEmi, eligible: r.finalMpbf > 0,
      payload: JSON.stringify({ v: 1, input }),
    };
  };

  const affordabilityChecks: AffordabilityCheck[] = [
    mkCheck(1, 3, "Ahmed Bin Saeed", 9, 6, { name: "Ahmed Bin Saeed", whatsapp: "+971 50 111 2233", propertyValue: 1350000, requested: 950000, incomes: [{ id: "i1", source: "Basic Salary", frequency: "Monthly", amount: 28000, eligiblePct: 100 }, { id: "i2", source: "Housing Allowance", frequency: "Monthly", amount: 8000, eligiblePct: 100 }], liabilities: [{ id: "l1", name: "Car Loan", type: "Car Loan", limitOrOutstanding: 45000, monthlyEmi: 1900, method: "Actual EMI" }] }),
    mkCheck(2, null, "Imran Test Client", 9, 3, { name: "Imran Test Client", propertyValue: 1000000, requested: 800000, incomes: [{ id: "i3", source: "Basic Salary", frequency: "Monthly", amount: 15000, eligiblePct: 100 }], liabilities: [{ id: "l2", name: "Credit Card", type: "Credit Card", limitOrOutstanding: 40000, monthlyEmi: 0, method: "5% of Limit" }] }),
    mkCheck(3, null, "Neha Kothari", 5, 1, { name: "Neha Kothari", applicantType: "UAE National", propertyValue: 2800000, requested: 2100000, incomes: [{ id: "i4", source: "Basic Salary", frequency: "Monthly", amount: 55000, eligiblePct: 100 }, { id: "i5", source: "Rental Income", frequency: "Monthly", amount: 12000, eligiblePct: 80 }] }),
  ];

  return {
    version: 9, users, designations, cases, tasks, activities, stages, whyPending, waitingFor,
    banks, partners, slaRules, instructions, bulletin, affordabilityChecks,
  };
}
