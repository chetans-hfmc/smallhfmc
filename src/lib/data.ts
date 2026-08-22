import type { Activity, DB, LoanCase, MasterItem, StageItem, Task, User } from "./types";
import { daysAgoISO, inDaysISO } from "./format";

const DAY = 86400000;
const ts = (daysBack: number, hourJitter = 0) =>
  new Date(Date.now() - daysBack * DAY - hourJitter * 3600000).toISOString();

export function seedDb(): DB {
  const users: User[] = [
    { id: 1, name: "Arvind Menon", email: "admin@hfmc.in", password: "admin123", role: "Admin", team: "Operations", active: true, createdAt: ts(210) },
    { id: 2, name: "Sara Iyer", email: "sara@hfmc.in", password: "demo123", role: "Team Lead", team: "Mumbai North", active: true, createdAt: ts(180) },
    { id: 3, name: "Rohan Kulkarni", email: "rohan@hfmc.in", password: "demo123", role: "SPO", team: "Mumbai North", active: true, createdAt: ts(160) },
    { id: 4, name: "Priya Nair", email: "priya@hfmc.in", password: "demo123", role: "SPO", team: "Mumbai North", active: true, createdAt: ts(150) },
    { id: 5, name: "Vikram Shetty", email: "vikram@hfmc.in", password: "demo123", role: "SPO", team: "Mumbai North", active: true, createdAt: ts(120) },
    { id: 6, name: "Anjali Rao", email: "anjali@hfmc.in", password: "demo123", role: "VRM", team: "Mumbai North", active: true, createdAt: ts(90) },
    { id: 7, name: "Farhan Khan", email: "farhan@hfmc.in", password: "demo123", role: "Team Lead", team: "Pune West", active: true, createdAt: ts(100) },
    { id: 8, name: "Neha Joshi", email: "neha@hfmc.in", password: "demo123", role: "SPO", team: "Pune West", active: true, createdAt: ts(80) },
  ];

  const stages: StageItem[] = [
    "New Login", "Documents & KYC", "Credit Appraisal", "Valuation", "Legal & Technical",
    "Sanction", "Offer & Acceptance", "Disbursement", "Post-Disbursement", "Closed",
  ].map((label, i) => ({ id: i + 1, label, active: true, sortOrder: i + 1 }));

  const whyPending: MasterItem[] = [
    "Awaiting client documents", "Bank query raised", "Valuer visit pending", "Legal opinion pending",
    "Internal review", "Payment confirmation", "System / portal issue", "No response from client",
  ].map((label, i) => ({ id: i + 1, label, active: true }));

  const waitingFor: MasterItem[] = ["Client", "Bank", "Valuer", "Legal", "Internal"].map((label, i) => ({
    id: i + 1, label, active: true,
  }));

  const cases: LoanCase[] = [];
  const tasks: Task[] = [];
  const activities: Activity[] = [];
  let cid = 0;
  let tid = 0;
  let aid = 0;

  interface DoneSeed { desc: string; owner: number; waiting: string; why: string; doneAgo: number; remarks?: string }
  interface OpenSeed { desc: string; owner: number; waiting: string; why: string; dueIn: number; openedAgo: number }
  interface CaseSeed {
    customer: string; bank: string; amountL: number; stage: string; owner: number; age: number;
    open?: OpenSeed; done?: DoneSeed[];
    trail?: [number, number, string, string?, string?][]; // userId, daysAgo, action, old, new
  }

  const seeds: CaseSeed[] = [
    { customer: "Suresh Patil", bank: "HDFC", amountL: 45, stage: "Credit Appraisal", owner: 3, age: 21,
      open: { desc: "Collect latest salary slips & Form 16", owner: 3, waiting: "Client", why: "Awaiting client documents", dueIn: -3, openedAgo: 6 },
      done: [
        { desc: "Login case & verify KYC set", owner: 3, waiting: "Internal", why: "Internal review", doneAgo: 17, remarks: "PAN + Aadhaar verified, OK." },
        { desc: "Send document checklist to client", owner: 3, waiting: "Client", why: "Awaiting client documents", doneAgo: 12, remarks: "Sent on WhatsApp + email." },
      ],
      trail: [[3, 21, "Case created"], [3, 12, "Stage moved", "Documents & KYC", "Credit Appraisal"]] },
    { customer: "Meera Krishnan", bank: "ICICI", amountL: 62, stage: "Valuation", owner: 4, age: 14,
      open: { desc: "Confirm valuer site visit with client", owner: 4, waiting: "Valuer", why: "Valuer visit pending", dueIn: 0, openedAgo: 3 },
      done: [{ desc: "Upload property papers to bank portal", owner: 4, waiting: "Bank", why: "Bank query raised", doneAgo: 5, remarks: "Portal accepted, ref #IC-8842." }],
      trail: [[4, 14, "Case created"], [4, 6, "Stage moved", "Credit Appraisal", "Valuation"]] },
    { customer: "Arjun Mehta", bank: "SBI", amountL: 38, stage: "Documents & KYC", owner: 3, age: 6,
      open: { desc: "Follow up on missing bank statements", owner: 3, waiting: "Client", why: "Awaiting client documents", dueIn: 4, openedAgo: 2 },
      trail: [[3, 6, "Case created"]] },
    { customer: "Kavita Deshpande", bank: "Axis", amountL: 55, stage: "Sanction", owner: 5, age: 26,
      open: { desc: "Answer bank query on co-applicant income", owner: 5, waiting: "Bank", why: "Bank query raised", dueIn: -1, openedAgo: 4 },
      done: [{ desc: "Submit sanction file to credit team", owner: 5, waiting: "Internal", why: "Internal review", doneAgo: 8, remarks: "File complete as per checklist." }],
      trail: [[5, 26, "Case created"], [5, 9, "Stage moved", "Legal & Technical", "Sanction"]] },
    { customer: "Rahul Verma", bank: "Kotak", amountL: 28, stage: "New Login", owner: 8, age: 2,
      open: { desc: "Pre-login eligibility check", owner: 8, waiting: "Internal", why: "Internal review", dueIn: 6, openedAgo: 2 },
      trail: [[8, 2, "Case created"]] },
    { customer: "Ananya Iyer", bank: "LIC HFL", amountL: 74, stage: "Legal & Technical", owner: 4, age: 30,
      done: [
        { desc: "Coordinate legal vendor for title search", owner: 4, waiting: "Legal", why: "Legal opinion pending", doneAgo: 7, remarks: "Vendor assigned: LexVerify." },
        { desc: "Share valuation report with bank", owner: 4, waiting: "Bank", why: "Bank query raised", doneAgo: 13 },
      ],
      trail: [[4, 30, "Case created"], [4, 13, "Stage moved", "Valuation", "Legal & Technical"], [4, 7, "Task completed", "Coordinate legal vendor for title search"]] },
    { customer: "Vikas Joshi", bank: "PNB HFL", amountL: 33, stage: "Disbursement", owner: 5, age: 34,
      open: { desc: "Track disbursal credit & confirm with client", owner: 5, waiting: "Bank", why: "Payment confirmation", dueIn: 1, openedAgo: 2 },
      done: [{ desc: "Collect signed offer & cheque copy", owner: 5, waiting: "Client", why: "Awaiting client documents", doneAgo: 4, remarks: "Both received, scanned." }],
      trail: [[5, 34, "Case created"], [5, 4, "Stage moved", "Offer & Acceptance", "Disbursement"]] },
    { customer: "Sneha Kulkarni", bank: "HDFC", amountL: 51, stage: "Offer & Acceptance", owner: 3, age: 18,
      open: { desc: "Get offer letter signed by both applicants", owner: 3, waiting: "Client", why: "No response from client", dueIn: 5, openedAgo: 3 },
      trail: [[3, 18, "Case created"], [3, 5, "Stage moved", "Sanction", "Offer & Acceptance"]] },
    { customer: "Manoj Gupta", bank: "Bajaj Finserv", amountL: 47, stage: "Credit Appraisal", owner: 6, age: 9,
      open: { desc: "Re-check CIBIL after dispute resolution", owner: 6, waiting: "Internal", why: "Internal review", dueIn: -5, openedAgo: 8 },
      trail: [[6, 9, "Case created"]] },
    { customer: "Ritu Sharma", bank: "ICICI", amountL: 40, stage: "Documents & KYC", owner: 8, age: 4,
      done: [{ desc: "Collect KYC + income proof set", owner: 8, waiting: "Client", why: "Awaiting client documents", doneAgo: 1, remarks: "Awaiting 2 more payslips." }],
      trail: [[8, 4, "Case created"], [8, 1, "Task completed", "Collect KYC + income proof set"]] },
    { customer: "Deepak Nair", bank: "SBI", amountL: 88, stage: "Valuation", owner: 4, age: 12,
      open: { desc: "Reschedule valuer visit — client unavailable", owner: 4, waiting: "Valuer", why: "Valuer visit pending", dueIn: 3, openedAgo: 2 },
      trail: [[4, 12, "Case created"], [4, 4, "Stage moved", "Credit Appraisal", "Valuation"]] },
    { customer: "Pooja Hegde", bank: "Axis", amountL: 29, stage: "New Login", owner: 5, age: 1,
      open: { desc: "Collect login form + fee cheque", owner: 5, waiting: "Client", why: "Awaiting client documents", dueIn: 7, openedAgo: 1 },
      trail: [[5, 1, "Case created"]] },
    { customer: "Sanjay Bansal", bank: "Kotak", amountL: 66, stage: "Sanction", owner: 3, age: 23,
      open: { desc: "Push credit team for sanction memo", owner: 3, waiting: "Bank", why: "Bank query raised", dueIn: 0, openedAgo: 5 },
      done: [{ desc: "Clarify property chain query", owner: 3, waiting: "Legal", why: "Legal opinion pending", doneAgo: 6, remarks: "Chain clear since 1998." }],
      trail: [[3, 23, "Case created"], [3, 7, "Stage moved", "Legal & Technical", "Sanction"]] },
    { customer: "Nisha Reddy", bank: "HDFC", amountL: 35, stage: "Post-Disbursement", owner: 6, age: 41,
      open: { desc: "Collect original property docs for custody", owner: 6, waiting: "Client", why: "No response from client", dueIn: 10, openedAgo: 4 },
      trail: [[6, 41, "Case created"], [6, 6, "Stage moved", "Disbursement", "Post-Disbursement"]] },
    { customer: "Amit Chawla", bank: "LIC HFL", amountL: 58, stage: "Credit Appraisal", owner: 7, age: 16,
      open: { desc: "Third call — income proof still pending", owner: 7, waiting: "Client", why: "No response from client", dueIn: -2, openedAgo: 5 },
      trail: [[7, 16, "Case created"]] },
    { customer: "Lakshmi Venkatesh", bank: "PNB HFL", amountL: 24, stage: "Documents & KYC", owner: 8, age: 5,
      done: [{ desc: "Verify employment with HR desk", owner: 8, waiting: "Client", why: "Awaiting client documents", doneAgo: 2, remarks: "HR confirmed, letter issued." }],
      trail: [[8, 5, "Case created"], [8, 2, "Task completed", "Verify employment with HR desk"]] },
    { customer: "Rajiv Malhotra", bank: "ICICI", amountL: 92, stage: "Legal & Technical", owner: 4, age: 28,
      open: { desc: "Chase legal opinion — 2nd reminder sent", owner: 4, waiting: "Legal", why: "Legal opinion pending", dueIn: 2, openedAgo: 6 },
      done: [{ desc: "Book technical inspection", owner: 4, waiting: "Valuer", why: "Valuer visit pending", doneAgo: 9, remarks: "Report received, value OK." }],
      trail: [[4, 28, "Case created"], [4, 10, "Stage moved", "Valuation", "Legal & Technical"]] },
    { customer: "Sunita Pawar", bank: "SBI", amountL: 43, stage: "Closed", owner: 3, age: 55,
      done: [
        { desc: "Disbursal confirmation & welcome kit", owner: 3, waiting: "Client", why: "Payment confirmation", doneAgo: 12, remarks: "₹43L credited. Client happy." },
        { desc: "Close file & archive documents", owner: 3, waiting: "Internal", why: "Internal review", doneAgo: 11 },
      ],
      trail: [[3, 55, "Case created"], [3, 12, "Stage moved", "Post-Disbursement", "Closed"]] },
    { customer: "Harish Rao", bank: "Axis", amountL: 39, stage: "Offer & Acceptance", owner: 5, age: 15,
      open: { desc: "Negotiate rate reset clause with bank RM", owner: 5, waiting: "Bank", why: "Bank query raised", dueIn: 4, openedAgo: 3 },
      trail: [[5, 15, "Case created"], [5, 4, "Stage moved", "Sanction", "Offer & Acceptance"]] },
    { customer: "Divya Menon", bank: "Kotak", amountL: 31, stage: "New Login", owner: 6, age: 3,
      open: { desc: "Resolve login portal error #KT-5521", owner: 6, waiting: "Internal", why: "System / portal issue", dueIn: 8, openedAgo: 1 },
      trail: [[6, 3, "Case created"]] },
    { customer: "Girish Bhatt", bank: "HDFC", amountL: 57, stage: "Credit Appraisal", owner: 2, age: 11,
      open: { desc: "Prepare credit note for underwriting", owner: 2, waiting: "Internal", why: "Internal review", dueIn: 2, openedAgo: 2 },
      trail: [[2, 11, "Case created"], [2, 3, "Stage moved", "Documents & KYC", "Credit Appraisal"]] },
    { customer: "Farida Sheikh", bank: "SBI", amountL: 36, stage: "Valuation", owner: 4, age: 8,
      open: { desc: "Upload valuation invoice for reimbursement", owner: 4, waiting: "Client", why: "Payment confirmation", dueIn: 6, openedAgo: 1 },
      trail: [[4, 8, "Case created"]] },
  ];

  for (const s of seeds) {
    cid += 1;
    const id = cid;
    const createdAt = ts(s.age, id % 5);
    cases.push({
      id,
      caseNumber: `CASE-${String(111 + id).padStart(6, "0")}`,
      customer: s.customer,
      bank: s.bank,
      loanAmount: s.amountL * 100000,
      stage: s.stage,
      ownerId: s.owner,
      createdAt,
      updatedAt: ts(Math.max(0.02, (s.open?.openedAgo ?? s.done?.[0]?.doneAgo ?? 1) * 0.4), id % 3),
    });

    for (const d of s.done ?? []) {
      tid += 1;
      tasks.push({
        id: tid, caseId: id, description: d.desc, ownerId: d.owner, waitingFor: d.waiting,
        whyPending: d.why, createdAt: ts(d.doneAgo + 2, id % 4), dueDate: daysAgoISO(d.doneAgo - 1),
        status: "Done", completedAt: ts(d.doneAgo, id % 6), remarks: d.remarks ?? "",
      });
    }
    if (s.open) {
      tid += 1;
      tasks.push({
        id: tid, caseId: id, description: s.open.desc, ownerId: s.open.owner, waitingFor: s.open.waiting,
        whyPending: s.open.why, createdAt: ts(s.open.openedAgo, id % 4),
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

  return { version: 3, users, cases, tasks, activities, stages, whyPending, waitingFor };
}

export const BANKS = ["HDFC", "ICICI", "SBI", "Axis", "Kotak", "LIC HFL", "PNB HFL", "Bajaj Finserv"];
