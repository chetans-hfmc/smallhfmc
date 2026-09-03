import type {
  Activity, AffordabilityCheck, BankItem, BulletinItem, DB, Designation, EmailLog, Instruction, LoanCase, MasterItem,
  PartnerItem, SlaRule, StageItem, Task, User,
} from "./types";
import { daysAgoISO, inDaysISO, todayISO } from "./format";
import { computeMortgage, defaultInput } from "./mortgage";

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
    "WhatsApp Group Creation", "Document collection and QC", "Bank Submission", "Pre-Approval", "Bank Query",
    "Pre-Approval QC", "Valuation", "Valuation Report", "FOL Conversion", "FOL", "DDA/Signing",
    "Loan Booking", "Liability/Release", "Final Transfer", "Title Deed QC", "Closure",
  ].map((label, i) => ({ id: i + 1, label, active: true, sortOrder: i + 1 }));

  const whyPending: MasterItem[] = [
    "Awaiting client documents", "Bank query raised", "Valuer visit pending", "Legal opinion pending",
    "Internal review", "Payment confirmation", "System / portal issue", "No response from client", "Ejari / tenancy pending",
  ].map((label, i) => ({ id: i + 1, label, active: true }));

  const waitingFor: MasterItem[] = ["Client", "Bank", "Valuer", "Legal", "Internal", "Land Department"].map((label, i) => ({
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
    { customer: "Mohammed Al Mansoori", banks: ["ADCB", "FAB"], amountK: 1850, stage: "Pre-Approval", owner: 5, age: 21, source: "Agent", partner: { kind: "Agent", name: "Falcon Properties", share: 20 },
      open: { desc: "Collect latest 3 salary certificates & 6-mo statements", owner: 5, waiting: "Client", why: "Awaiting client documents", dueIn: -3, openedAgo: 6, by: 4 },
      done: [
        { desc: "Login case & verify KYC set", owner: 5, waiting: "Internal", why: "Internal review", doneAgo: 17, remarks: "Passport + Emirates ID verified." },
        { desc: "Send document checklist to client", owner: 5, waiting: "Client", why: "Awaiting client documents", doneAgo: 12 },
      ],
      trail: [[5, 21, "Case created"], [5, 12, "Stage moved", "Documents & KYC", "Pre-Approval"]] },
    { customer: "Sarah Thomson", banks: ["ENBD"], amountK: 2400, stage: "Valuation", owner: 6, age: 14, source: "Broker", partner: { kind: "Broker", name: "Mortgage Souq", share: 30 },
      open: { desc: "Confirm valuer visit — Marina apartment access", owner: 6, waiting: "Valuer", why: "Valuer visit pending", dueIn: 0, openedAgo: 3 },
      done: [{ desc: "Upload title deed to ENBD portal", owner: 6, waiting: "Bank", why: "Bank query raised", doneAgo: 5, remarks: "Ref #ENBD-8842." }],
      trail: [[6, 14, "Case created"], [6, 6, "Stage moved", "Pre-Approval", "Valuation"]] },
    { customer: "Ahmed Khan", banks: ["DIB", "ADIB", "Ajman Bank"], amountK: 950, stage: "Document collection and QC", owner: 5, age: 6, source: "Website",
      open: { desc: "Follow up on missing 6-month bank statements", owner: 5, waiting: "Client", why: "Awaiting client documents", dueIn: 4, openedAgo: 2 },
      trail: [[5, 6, "Case created"]] },
    { customer: "Priya Menon", banks: ["HSBC", "SCB"], amountK: 3100, stage: "Bank Query", owner: 7, age: 26, source: "Referral", partner: { kind: "Referral", name: "Hessa Al Qasimi", share: 15 },
      open: { desc: "Answer bank query on spouse income declaration", owner: 7, waiting: "Bank", why: "Bank query raised", dueIn: -1, openedAgo: 4, by: 3 },
      done: [{ desc: "Submit sanction file to credit team", owner: 7, waiting: "Internal", why: "Internal review", doneAgo: 8 }],
      trail: [[7, 26, "Case created"], [7, 5, "Stage moved", "Pre-Approval", "Bank Query"]] },
    { customer: "John Okafor", banks: [], amountK: 1200, stage: "WhatsApp Group Creation", owner: 9, age: 2, source: "Direct",
      open: { desc: "Pre-login eligibility check — bank not yet decided", owner: 9, waiting: "Internal", why: "Internal review", dueIn: 6, openedAgo: 2, by: 8 },
      trail: [[9, 2, "Case created"]] },
    { customer: "Fatima Noor", banks: ["FAB"], amountK: 4200, stage: "FOL Conversion", owner: 6, age: 30, source: "Agent", partner: { kind: "Agent", name: "Skyline Realty", share: 15 },
      done: [
        { desc: "Coordinate legal vendor for title search", owner: 6, waiting: "Legal", why: "Legal opinion pending", doneAgo: 7, remarks: "Vendor: Gulf Title Services." },
        { desc: "Share valuation report with bank", owner: 6, waiting: "Bank", why: "Bank query raised", doneAgo: 13 },
      ],
      trail: [[6, 30, "Case created"], [6, 13, "Stage moved", "Valuation", "FOL Conversion"]] },
    { customer: "David Chen", banks: ["Mashreq"], amountK: 1600, stage: "Loan Booking", owner: 7, age: 34, source: "Broker", partner: { kind: "Broker", name: "Capital Bridge", share: 20 },
      open: { desc: "Track disbursement & confirm with client", owner: 7, waiting: "Bank", why: "Payment confirmation", dueIn: 1, openedAgo: 2 },
      done: [{ desc: "Collect signed offer & security cheque", owner: 7, waiting: "Client", why: "Awaiting client documents", doneAgo: 4 }],
      trail: [[7, 34, "Case created"], [7, 4, "Stage moved", "DDA/Signing", "Loan Booking"]] },
    { customer: "Hamad Al Suwaidi", banks: ["ADCB"], amountK: 5600, stage: "DDA/Signing", owner: 5, age: 18, source: "Direct",
      open: { desc: "Get offer letter signed — both applicants", owner: 5, waiting: "Client", why: "No response from client", dueIn: 5, openedAgo: 3 },
      trail: [[5, 18, "Case created"], [5, 5, "Stage moved", "FOL", "DDA/Signing"]] },
    { customer: "Elena Petrova", banks: ["RAK Bank"], amountK: 800, stage: "Pre-Approval", owner: 7, age: 9, source: "Website",
      open: { desc: "Re-check Al Etihad credit bureau report", owner: 7, waiting: "Internal", why: "Internal review", dueIn: -5, openedAgo: 8, by: 4 },
      trail: [[7, 9, "Case created"]] },
    { customer: "Yusuf Karim", banks: ["UAB", "CBD"], amountK: 1450, stage: "Document collection and QC", owner: 9, age: 4, source: "Referral", partner: { kind: "Referral", name: "Nasser Al Mansoori", share: 10 },
      done: [{ desc: "Collect KYC + salary certificate set", owner: 9, waiting: "Client", why: "Awaiting client documents", doneAgo: 1, remarks: "2 payslips still pending." }],
      trail: [[9, 4, "Case created"], [9, 1, "Task completed", "Collect KYC + salary certificate set"]] },
    { customer: "Sunita Pawar", banks: ["ADCB"], amountK: 2150, stage: "Closure", owner: 5, age: 55, state: "Closed", won: "ADCB", closedAgo: 11, source: "Agent", partner: { kind: "Agent", name: "Falcon Properties", share: 20 },
      trail: [[5, 55, "Case created"], [5, 11, "Case booked", undefined, "ADCB"]] },
    { customer: "Vinod Kamble", banks: ["ENBD", "ADCB"], amountK: 1800, stage: "Closure", owner: 5, age: 32, state: "Closed", won: "ENBD", closedAgo: 4, source: "Direct",
      trail: [[5, 32, "Case created"], [5, 4, "Case booked", undefined, "ENBD"]] },
    { customer: "Asha Pillai", banks: ["FAB"], amountK: 3200, stage: "Closure", owner: 6, age: 40, state: "Closed", won: "FAB", closedAgo: 9, source: "Broker", partner: { kind: "Broker", name: "Mortgage Souq", share: 30 },
      trail: [[6, 40, "Case created"], [6, 9, "Case booked", undefined, "FAB"]] },
    { customer: "Om Prakash", banks: ["EIB"], amountK: 1300, stage: "Pre-Approval", owner: 7, age: 33, state: "Lost", closedAgo: 12, source: "Website",
      trail: [[7, 33, "Case created"], [7, 12, "Case marked lost", "Pre-Approval", "Went with another broker"]] },
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
    "Sarah Thomson": { wa: "+971 55 810 2245" },
    "Priya Menon": { wa: "+971 52 667 9034", group: "https://chat.whatsapp.com/HfmcMenon04" },
    "Fatima Noor": { wa: "+971 54 402 7789" },
    "David Chen": { wa: "+971 56 300 7719" },
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
      replies: [{ id: 1, userId: 5, text: "Home visit done yesterday evening. 4 of 6 statements collected — balance promised Friday morning.", at: ts(1, 2) }] },
    { id: 2, caseId: 4, issuedBy: 1, instruction: "This HSBC query is a day overdue. Call the RM directly today and close the spouse income point.", assignedTo: 7, dueDate: inDaysISO(0), status: "Open", createdAt: ts(1, 5), completedAt: null, replies: [] },
    { id: 3, caseId: 7, issuedBy: 3, instruction: "Confirm Mashreq disbursement with the client and update the tracker the same day.", assignedTo: 7, dueDate: daysAgoISO(1), status: "Done", createdAt: ts(3, 2), completedAt: ts(1, 4), replies: [] },
  ];

  const bulletin: BulletinItem[] = [
    { id: 1, date: todayISO(), issuedBy: 4, task: "Morning huddle 9:30 sharp — everyone bring their overdue files. We clear the Pre-Approval backlog today.", caseId: null, targets: [5, 6, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 7), replies: [] },
    { id: 2, date: todayISO(), issuedBy: 1, task: "HSBC file CASE-000114 is a day overdue on the spouse-income query. Owner to call the RM before 12:00.", caseId: 4, targets: [7], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 6), replies: [] },
    { id: 3, date: daysAgoISO(1), issuedBy: 2, task: "Reconcile the Ajman Bank login fees for last week's files and post the total in the group.", caseId: null, targets: [5, 6], status: "Open", completedAt: null, completedBy: null, createdAt: ts(1, 5), replies: [] },
    { id: 4, date: daysAgoISO(1), issuedBy: 4, task: "Every valuation report older than 2 days gets chased with the valuer before EOD.", caseId: null, targets: [5, 6], status: "Done", completedAt: ts(0, 9), completedBy: 6, createdAt: ts(1, 6), replies: [] },
    { id: 5, date: daysAgoISO(6), issuedBy: 3, task: "Routine: clear your overdue chase list before EOD and mark each file's task done.", caseId: null, targets: [5, 6, 7, 8, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(6, 8), replies: [], repeat: "weekdays", isTemplate: true },
    { id: 6, date: todayISO(), issuedBy: 3, task: "Routine: clear your overdue chase list before EOD and mark each file's task done.", caseId: null, targets: [5, 6, 7, 8, 9], status: "Open", completedAt: null, completedBy: null, createdAt: ts(0, 8), replies: [], templateId: 5 },
  ];

  const emails: EmailLog[] = [
    { id: 1, caseId: 4, direction: "received", subject: "RE: [CASE-000114] Priya Menon — spouse income clarification", preview: "Dear Aisha, please confirm whether the spouse's income is being declared as part of the joint application. We require a signed declaration and the latest 3 months of her salary certificates before we can proceed…", from: "Rachel D'Souza <rachel.dsouza@hsbc.com>", to: "Aisha Rahman", at: ts(1, 3), webLink: "https://outlook.office.com/mail/id/AAMkAGE-case114-spouse", awaitingReply: true },
    { id: 2, caseId: 4, direction: "sent", subject: "[CASE-000114] Priya Menon — spouse income declaration attached", preview: "Dear Rachel, Please find attached the signed spouse income declaration along with the latest 3 months of salary certificates as requested. Kindly confirm receipt and advise the next step for pre-approval…", from: "Aisha Rahman <aisha@meridian.ae>", to: "rachel.dsouza@hsbc.com", at: ts(0, 5), webLink: "https://outlook.office.com/mail/id/AAMkAGE-case114-sent", awaitingReply: false },
    { id: 3, caseId: 1, direction: "sent", subject: "[CASE-000111] Mohammed Al Mansoori — outstanding documents", preview: "Dear Mr. Al Mansoori, Following up on the pending documents for your mortgage application: (1) latest 3 salary certificates, (2) 6 months bank statements. Kindly share these at your earliest convenience…", from: "Imran Sheikh <imran@meridian.ae>", to: "m.almansoori@gmail.com", at: ts(2, 4), awaitingReply: true },
    { id: 4, caseId: 1, direction: "received", subject: "RE: [CASE-000111] Mohammed Al Mansoori — outstanding documents", preview: "Hi Imran, apologies for the delay. I will send the salary certificates today. The bank statements I need to request from my company's HR — should have them by Thursday…", from: "Mohammed Al Mansoori <m.almansoori@gmail.com>", to: "Imran Sheikh", at: ts(1, 6), webLink: "https://outlook.office.com/mail/id/AAMkAGE-case111-reply", awaitingReply: false },
    { id: 5, caseId: 2, direction: "sent", subject: "[CASE-000112] Sarah Thomson — valuation visit confirmation", preview: "Dear Sarah, The valuer is scheduled to visit your Marina apartment this Thursday between 2-4pm. Please ensure someone is available to provide access. Let us know if this works…", from: "Karim Fawaz <karim@meridian.ae>", to: "s.thomson@outlook.com", at: ts(0, 2), awaitingReply: true },
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
    mkCheck(1, 3, "Ahmed Khan", 7, 6, { name: "Ahmed Khan", propertyValue: 1350000, requested: 950000, incomes: [{ id: "i1", source: "Basic Salary", frequency: "Monthly", amount: 28000, eligiblePct: 100 }], liabilities: [{ id: "l1", name: "Car Loan", type: "Car Loan", limitOrOutstanding: 45000, monthlyEmi: 1900, method: "Actual EMI" }] }),
    mkCheck(2, null, "Neha Kothari", 5, 1, { name: "Neha Kothari", applicantType: "UAE National", propertyValue: 2800000, requested: 2100000, incomes: [{ id: "i4", source: "Basic Salary", frequency: "Monthly", amount: 55000, eligiblePct: 100 }] }),
  ];

  return {
    version: 10, users, designations, cases, tasks, activities, instructions, bulletin,
    stages, whyPending, waitingFor, banks, partners, slaRules, affordabilityChecks, emails,
  };
}
