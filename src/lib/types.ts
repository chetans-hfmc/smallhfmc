export type Role =
  | "Head of Company"
  | "PA to HoC"
  | "Mortgage Head"
  | "Team Leader SPO"
  | "Team Leader VRM"
  | "SPO"
  | "VRM";

export type CaseStatus = "On Track" | "At Risk" | "Overdue" | "No Action";
export type TaskStatus = "Open" | "Done";
export type CaseState = "Active" | "Closed" | "Lost";
export type CaseSource = "Direct" | "Agent" | "Broker" | "Website" | "Referral";
export type PartnerKind = "Agent" | "Broker" | "Referral";

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

export interface CasePartner {
  kind: PartnerKind;
  name: string;
  sharePct: number; // % of our bank commission paid to the partner
}

export interface LoanCase {
  id: number;
  caseNumber: string;
  customer: string;
  banks: string[]; // banks the case has been submitted to — empty = "not yet decided"
  wonBank: string | null; // set when the case books
  loanAmount: number; // AED
  stage: string;
  caseStatus: CaseState;
  closedDate: string | null;
  ownerId: number;
  source: CaseSource;
  partner: CasePartner | null;
  createdAt: string;
  updatedAt: string;
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
  dueDate: string; // yyyy-mm-dd
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

export interface Instruction {
  id: number;
  caseId: number;
  issuedBy: number;
  instruction: string;
  assignedTo: number;
  dueDate: string;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
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
  ratePct: number; // our commission rate on loan amount
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
  bank: string | null; // null = applies to all banks
  maxDays: number;
  active: boolean;
}

export interface DB {
  version: number;
  users: User[];
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
  affordabilityChecks: AffordabilityCheck[];
}

export type Route =
  | { name: "dashboard" }
  | { name: "case"; id: number }
  | { name: "tasks" }
  | { name: "calculator" }
  | { name: "reports" }
  | { name: "admin" };

export type Tone = "mint" | "amber" | "coral" | "sky" | "slate";

export const ROLE_SENIORITY: Role[] = [
  "Head of Company",
  "PA to HoC",
  "Mortgage Head",
  "Team Leader SPO",
  "Team Leader VRM",
  "SPO",
  "VRM",
];

export const SOURCES: CaseSource[] = ["Direct", "Agent", "Broker", "Website", "Referral"];
export const PARTNER_SHARES = [10, 15, 20, 30];
