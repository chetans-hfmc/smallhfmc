export type Role = string; // open — designations are user-defined
export type Tone = "mint" | "amber" | "coral" | "sky" | "slate";
export type CaseStatus = "On Track" | "At Risk" | "Overdue" | "No Action";
export type CaseState = "Active" | "Closed" | "Lost";
export type CaseSource = "Direct" | "Agent" | "Broker" | "Website" | "Referral";
export type PartnerKind = "Agent" | "Broker" | "Referral";

export const SOURCES: CaseSource[] = ["Direct", "Agent", "Broker", "Website", "Referral"];
export const PARTNER_SHARES = [10, 15, 20, 30];

export interface CasePartner {
  kind: PartnerKind;
  name: string;
  sharePct: number; // % of OUR commission paid to the partner
}

export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: Role;
  team: string;
  active: boolean;
  createdAt: string;
}

export interface Designation {
  id: number;
  name: string;
  scope: "all" | "team" | "own";
  issueTasks: boolean;
  admin: boolean;
  super: boolean;
  builtIn: boolean;
}

export interface LoanCase {
  id: number;
  caseNumber: string;
  customer: string;
  banks: string[]; // submitted to; empty = bank not yet decided
  wonBank: string | null; // set when booked
  loanAmount: number;
  stage: string;
  caseStatus: CaseState;
  closedDate: string | null;
  ownerId: number;
  source: CaseSource;
  partner: CasePartner | null;
  whatsapp: string;
  waGroup: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: number;
  caseId: number;
  description: string;
  ownerId: number;
  createdBy: number; // who opened / assigned it
  waitingFor: string;
  whyPending: string;
  createdAt: string;
  dueDate: string;
  status: "Open" | "Done";
  completedAt: string | null;
  remarks: string;
}

export interface Activity {
  id: number;
  caseId: number;
  userId: number;
  at: string;
  action: string;
  oldValue?: string;
  newValue?: string;
}

export interface Reply {
  id: number;
  userId: number;
  text: string;
  at: string;
}

export interface Instruction {
  id: number;
  caseId: number;
  issuedBy: number;
  instruction: string;
  assignedTo: number;
  dueDate: string;
  status: "Open" | "Done";
  createdAt: string;
  completedAt: string | null;
  replies: Reply[];
}

export interface BulletinItem {
  id: number;
  date: string;
  issuedBy: number;
  task: string;
  caseId: number | null;
  targets: number[];
  status: "Open" | "Done";
  completedAt: string | null;
  completedBy: number | null;
  createdAt: string;
  replies: Reply[];
  carriedFrom?: string;
  dropped?: boolean;
  repeat?: "none" | "daily" | "weekdays";
  templateId?: number | null;
  isTemplate?: boolean;
}

export interface AffordabilityCheck {
  id: number;
  caseId: number | null;
  customerName: string;
  monthlyIncome: number;
  otherIncome: number;
  existingEmis: number;
  age: number;
  employmentType: "Salaried" | "Self-Employed";
  propertyValue: number;
  bank: string;
  interestRate: number;
  tenureYears: number;
  applicableLtv: number;
  maxLoanByLtv: number;
  maxDbrPct: number;
  availableDbrEmi: number;
  maxLoanByDbr: number;
  maxTenureByAge: number;
  finalEligibleLoan: number;
  estimatedEmi: number;
  eligible: boolean;
  createdBy: number;
  createdAt: string;
  payload?: string;
}

export interface MasterItem {
  id: number;
  label: string;
  active: boolean;
}

export interface StageItem extends MasterItem {
  sortOrder: number;
}

export interface BankItem {
  id: number;
  name: string;
  ratePct: number;
  active: boolean;
}

export interface PartnerItem {
  id: number;
  kind: PartnerKind;
  name: string;
  defaultSharePct: number;
  active: boolean;
}

export interface SlaRule {
  id: number;
  stage: string;
  bank: string | null;
  maxDays: number;
  active: boolean;
}

/* ---------------- emails ---------------- */

export interface EmailLog {
  id: number;
  caseId: number | null;
  direction: "sent" | "received";
  subject: string;
  preview: string; // ~180-char scannable snippet
  from: string;
  to: string;
  at: string;
  webLink?: string; // "Open in Outlook" — the real message URL
  graphId?: string; // dedupe key for Graph-synced mail
  awaitingReply?: boolean;
}

export interface DB {
  version: number;
  users: User[];
  designations: Designation[];
  cases: LoanCase[];
  tasks: Task[];
  activities: Activity[];
  instructions: Instruction[];
  bulletin: BulletinItem[];
  stages: StageItem[];
  whyPending: MasterItem[];
  waitingFor: MasterItem[];
  banks: BankItem[];
  partners: PartnerItem[];
  slaRules: SlaRule[];
  affordabilityChecks: AffordabilityCheck[];
  emails: EmailLog[];
}

export type Route =
  | { name: "dashboard" }
  | { name: "case"; id: number }
  | { name: "tasks" }
  | { name: "bulletin" }
  | { name: "calculator" }
  | { name: "emails" }
  | { name: "reports" }
  | { name: "admin" };
