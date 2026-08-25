export type Role = "Admin" | "Team Lead" | "SPO" | "VRM";

export type CaseStatus = "On Track" | "At Risk" | "Overdue" | "No Action";
export type CaseState = "Active" | "Closed" | "Lost";
export type TaskStatus = "Open" | "Done";
export type InstructionStatus = "Open" | "Done";

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

export interface LoanCase {
  id: number;
  caseNumber: string;
  customer: string;
  bank: string;
  loanAmount: number; // rupees
  stage: string;
  caseStatus: CaseState;
  closedDate: string | null; // set when caseStatus changes to Closed / Lost
  ownerId: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: number;
  caseId: number;
  description: string;
  ownerId: number;
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

export interface MasterItem {
  id: number;
  label: string;
  active: boolean;
}

export interface StageItem extends MasterItem {
  sortOrder: number;
}

export interface SlaRule {
  id: number;
  stage: string;
  bank: string | null; // null = applies to all banks
  maxDays: number;
  active: boolean;
}

export interface Instruction {
  id: number;
  caseId: number;
  issuedBy: number;
  instruction: string;
  assignedTo: number;
  dueDate: string;
  status: InstructionStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface AffordabilityCheck {
  id: number;
  caseId: number | null; // nullable: can run before a case exists
  customerName: string;
  // inputs
  monthlyIncome: number;
  otherIncome: number;
  existingEmis: number;
  age: number;
  employmentType: "Salaried" | "Self-Employed";
  propertyValue: number;
  bank: string;
  interestRate: number; // annual %
  tenureYears: number;
  // outputs (computed, stored for audit)
  applicableLtv: number; // %
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

export interface DB {
  version: number;
  users: User[];
  cases: LoanCase[];
  tasks: Task[];
  activities: Activity[];
  stages: StageItem[];
  whyPending: MasterItem[];
  waitingFor: MasterItem[];
  banks: MasterItem[];
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
