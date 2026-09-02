export type Role = string; // open — designations are admin-managed

export type CaseStatus = "On Track" | "At Risk" | "Overdue" | "No Action";
export type TaskStatus = "Open" | "Done";
export type CaseState = "Active" | "Closed" | "Lost";
export type CaseSource = "Direct" | "Agent" | "Broker" | "Website" | "Referral";
export type PartnerKind = "Agent" | "Broker" | "Referral";
export type RepeatKind = "none" | "daily" | "weekdays";

export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: string; // designation label
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
  banks: string[];
  wonBank: string | null;
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

export interface CasePartner {
  kind: PartnerKind;
  name: string;
  sharePct: number;
}

export interface Task {
  id: number;
  caseId: number;
  description: string;
  ownerId: number;
  createdBy: number; // who opened / assigned the task
  waitingFor: string;
  whyPending: string;
  createdAt: string;
  dueDate: string;
  status: TaskStatus;
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
  date: string; // ISO date this directive belongs to
  issuedBy: number;
  task: string;
  caseId: number | null; // optional — pins the directive to a case
  targets: number[];
  status: "Open" | "Done";
  completedAt: string | null;
  completedBy: number | null;
  createdAt: string;
  replies: Reply[];
  carriedFrom?: string | null;
  dropped?: boolean;
  repeat?: RepeatKind; // on templates only
  templateId?: number | null; // spawned instances point back to their template
  isTemplate?: boolean; // hidden from the feed; spawns one instance per eligible day
}

export interface SlaRule {
  id: number;
  stage: string;
  bank: string | null; // null = all banks
  maxDays: number;
  active: boolean;
}

export interface StageItem {
  id: number;
  label: string;
  active: boolean;
  sortOrder: number;
}

export interface MasterItem {
  id: number;
  label: string;
  active: boolean;
}

export interface BankItem {
  id: number;
  name: string;
  ratePct: number; // our commission rate on the loan amount
  active: boolean;
}

export interface PartnerItem {
  id: number;
  kind: PartnerKind;
  name: string;
  defaultSharePct: number; // % of OUR commission owed to them
  active: boolean;
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
  payload?: string; // JSON snapshot of full mortgage input
}

/* one email that flowed through the SalesProgressionDL / VIRTUALRM1 group mailboxes */
export interface EmailLog {
  id: string; // Graph message id, or "sim-N" for simulated inbox items
  subject: string;
  fromName: string;
  fromAddress: string;
  direction: "out" | "in"; // out = our query to the bank · in = reply from bank / client
  customer: string | null; // parsed from the subject line
  bank: string | null; // parsed from the subject line
  caseId: number | null; // linked pipeline case
  receivedAt: string; // ISO timestamp
  snippet: string;
  linkedAt: string | null;
  linkedBy: number | null;
}

export interface DB {
  version: number;
  users: User[];
  designations: Designation[];
  cases: LoanCase[];
  tasks: Task[];
  activities: Activity[];
  stages: StageItem[];
  whyPending: MasterItem[];
  waitingFor: MasterItem[];
  banks: BankItem[];
  partners: PartnerItem[];
  slaRules: SlaRule[];
  instructions: Instruction[];
  bulletin: BulletinItem[];
  affordabilityChecks: AffordabilityCheck[];
  emails: EmailLog[];
}

export type Route =
  | { name: "dashboard" }
  | { name: "case"; id: number }
  | { name: "tasks" }
  | { name: "bulletin" }
  | { name: "emails" }
  | { name: "calculator" }
  | { name: "reports" }
  | { name: "admin" };

export type Tone = "mint" | "amber" | "coral" | "sky" | "slate";

export const SOURCES: CaseSource[] = ["Direct", "Agent", "Broker", "Website", "Referral"];
export const PARTNER_SHARES = [10, 15, 20, 30];
