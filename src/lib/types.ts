export type Role = "Admin" | "Team Lead" | "SPO" | "VRM";

export type CaseStatus = "On Track" | "At Risk" | "Overdue" | "No Action";
export type TaskStatus = "Open" | "Done";

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

export interface DB {
  version: number;
  users: User[];
  cases: LoanCase[];
  tasks: Task[];
  activities: Activity[];
  stages: StageItem[];
  whyPending: MasterItem[];
  waitingFor: MasterItem[];
}

export type Route =
  | { name: "dashboard" }
  | { name: "case"; id: number }
  | { name: "tasks" }
  | { name: "reports" }
  | { name: "admin" };

export type Tone = "mint" | "amber" | "coral" | "sky" | "slate";
