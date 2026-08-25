import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  Activity, AffordabilityCheck, CaseState, DB, Instruction, LoanCase, MasterItem, Route, SlaRule, StageItem, Task, User,
} from "./types";
import { computeAffordability } from "./calc";
import type { CalcInput } from "./calc";
import { seedDb } from "./data";
import { ageDays } from "./format";

const DB_KEY = "hfmc.casetracker.db.v4";
const SESSION_KEY = "hfmc.casetracker.session.v4";

export interface ToastMsg {
  id: number;
  kind: "success" | "error" | "info";
  msg: string;
}

export interface NewCaseInput {
  customer: string;
  bank: string;
  loanAmount: number;
  stage: string;
  ownerId: number;
  linkCheckId?: number;
  task?: { description: string; dueDate: string; waitingFor: string; whyPending: string; ownerId: number };
}

export interface TaskInput {
  description: string;
  ownerId: number;
  waitingFor: string;
  whyPending: string;
  dueDate: string;
}

type MasterKind = "stages" | "whyPending" | "waitingFor" | "banks";

interface StoreShape {
  db: DB;
  session: User | null;
  route: Route;
  toasts: ToastMsg[];
  nav: (r: Route) => void;
  login: (email: string, password: string) => string | null;
  logout: () => void;
  toast: (kind: ToastMsg["kind"], msg: string) => void;
  dismissToast: (id: number) => void;
  createCase: (input: NewCaseInput) => LoanCase;
  updateCase: (id: number, patch: Partial<Omit<LoanCase, "id" | "createdAt">>) => void;
  setCaseState: (id: number, state: CaseState, note?: string) => void;
  deleteCase: (id: number) => void;
  createTask: (caseId: number, input: TaskInput) => void;
  updateTask: (id: number, patch: Partial<Omit<Task, "id" | "caseId" | "createdAt">>) => void;
  completeTask: (id: number, remarks: string) => void;
  addInstruction: (caseId: number, input: { instruction: string; assignedTo: number; dueDate: string }) => void;
  completeInstruction: (id: number) => void;
  runCheck: (input: CalcInput & { customerName: string }) => AffordabilityCheck;
  attachCheck: (checkId: number, caseId: number) => void;
  saveUser: (u: User) => void;
  deleteUser: (id: number) => string | null;
  addMaster: (kind: MasterKind, label: string) => string | null;
  toggleMaster: (kind: MasterKind, id: number) => void;
  deleteMaster: (kind: MasterKind, id: number) => string | null;
  moveStage: (id: number, dir: -1 | 1) => void;
  addSlaRule: (rule: { stage: string; bank: string | null; maxDays: number }) => string | null;
  updateSlaRule: (id: number, maxDays: number) => void;
  toggleSlaRule: (id: number) => void;
  deleteSlaRule: (id: number) => void;
  userById: (id: number) => User | undefined;
  visibleCases: () => LoanCase[];
  visibleTasks: () => Task[];
  canEditCase: (c: LoanCase) => boolean;
  canEditTask: (t: Task) => boolean;
  canInstruct: () => boolean;
}

const Ctx = createContext<StoreShape | null>(null);

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [a, b] = h.split("/");
  if (a === "case" && b && !Number.isNaN(parseInt(b, 10))) return { name: "case", id: parseInt(b, 10) };
  if (a === "tasks") return { name: "tasks" };
  if (a === "calculator") return { name: "calculator" };
  if (a === "reports") return { name: "reports" };
  if (a === "admin") return { name: "admin" };
  return { name: "dashboard" };
}

export function routeToHash(r: Route): string {
  switch (r.name) {
    case "case":
      return `#/case/${r.id}`;
    case "dashboard":
      return "#/";
    default:
      return `#/${r.name}`;
  }
}

const nextId = (arr: { id: number }[]) => arr.reduce((m, x) => Math.max(m, x.id), 0) + 1;
const nowISO = () => new Date().toISOString();

function loadDb(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && parsed.version === 5 && Array.isArray(parsed.cases) && Array.isArray(parsed.slaRules)) return parsed;
    }
  } catch {
    /* fall through to seed */
  }
  return seedDb();
}

/* ---------------- pure report helpers (shared with views) ---------------- */

export function slaFor(rules: SlaRule[], stage: string, bank: string): SlaRule | null {
  const candidates = rules.filter((r) => r.active && r.stage === stage);
  return candidates.find((r) => r.bank === bank) ?? candidates.find((r) => r.bank === null) ?? null;
}

export function stageEnteredAt(c: LoanCase, activities: Activity[]): string {
  const moves = activities.filter((a) => a.caseId === c.id && a.action === "Stage moved");
  return moves.length ? moves[moves.length - 1].at : c.createdAt;
}

export interface Escalation {
  c: LoanCase;
  rule: SlaRule;
  daysInStage: number;
  overBy: number;
}

export function computeEscalations(db: DB, cases: LoanCase[]): Escalation[] {
  const out: Escalation[] = [];
  for (const c of cases) {
    if (c.caseStatus !== "Active") continue;
    const rule = slaFor(db.slaRules, c.stage, c.bank);
    if (!rule) continue;
    const daysInStage = Math.max(0, Math.floor((Date.now() - new Date(stageEnteredAt(c, db.activities)).getTime()) / 86400000));
    if (daysInStage > rule.maxDays) out.push({ c, rule, daysInStage, overBy: daysInStage - rule.maxDays });
  }
  return out.sort((a, b) => b.overBy - a.overBy);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(loadDb);
  const [sessionId, setSessionId] = useState<number | null>(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? parseInt(raw, 10) : null;
  });
  const [route, setRoute] = useState<Route>(parseHash);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }, [db]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = useCallback((r: Route) => {
    const h = routeToHash(r);
    if (window.location.hash === h) setRoute(r);
    else window.location.hash = h;
  }, []);

  const toast = useCallback((kind: ToastMsg["kind"], msg: string) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((t) => [...t, { id, kind, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const session = sessionId != null ? db.users.find((u) => u.id === sessionId) ?? null : null;

  const userById = useCallback((id: number) => db.users.find((u) => u.id === id), [db]);

  const logAct = (list: Activity[], caseId: number, userId: number, action: string, oldValue?: string, newValue?: string): Activity[] => [
    ...list,
    { id: nextId(list), caseId, userId, at: nowISO(), action, oldValue, newValue },
  ];

  /* ---------------- auth ---------------- */

  const login = useCallback(
    (email: string, password: string): string | null => {
      const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u) return "No account found with that email.";
      if (!u.active) return "This account has been deactivated. Contact your admin.";
      if (u.password !== password) return "Incorrect password. Try again.";
      setSessionId(u.id);
      localStorage.setItem(SESSION_KEY, String(u.id));
      return null;
    },
    [db.users]
  );

  const logout = useCallback(() => {
    setSessionId(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  /* ---------------- scoping ---------------- */

  const visibleCases = useCallback((): LoanCase[] => {
    if (!session) return [];
    if (session.role === "Admin") return db.cases;
    if (session.role === "Team Lead")
      return db.cases.filter((c) => {
        if (c.ownerId === session.id) return true;
        const owner = db.users.find((u) => u.id === c.ownerId);
        return owner?.team === session.team;
      });
    return db.cases.filter((c) => c.ownerId === session.id);
  }, [db, session]);

  const visibleTasks = useCallback((): Task[] => {
    if (!session) return [];
    if (session.role === "Admin") return db.tasks;
    if (session.role === "Team Lead") {
      const teamIds = new Set(db.users.filter((u) => u.team === session.team).map((u) => u.id));
      const caseIds = new Set(visibleCases().map((c) => c.id));
      return db.tasks.filter((t) => caseIds.has(t.caseId) || teamIds.has(t.ownerId));
    }
    return db.tasks.filter((t) => t.ownerId === session.id);
  }, [db, session, visibleCases]);

  const canEditCase = useCallback(
    (c: LoanCase): boolean => {
      if (!session) return false;
      if (session.role === "Admin") return true;
      if (session.role === "Team Lead") {
        if (c.ownerId === session.id) return true;
        const owner = db.users.find((u) => u.id === c.ownerId);
        return owner?.team === session.team;
      }
      return c.ownerId === session.id;
    },
    [db.users, session]
  );

  const canEditTask = useCallback(
    (t: Task): boolean => {
      if (!session) return false;
      if (session.role === "Admin") return true;
      if (session.role === "Team Lead") {
        if (t.ownerId === session.id) return true;
        const owner = db.users.find((u) => u.id === t.ownerId);
        return owner?.team === session.team;
      }
      return t.ownerId === session.id;
    },
    [db.users, session]
  );

  const canInstruct = useCallback((): boolean => {
    return session?.role === "Admin" || session?.role === "Team Lead";
  }, [session]);

  /* ---------------- cases ---------------- */

  const createCase = useCallback(
    (input: NewCaseInput): LoanCase => {
      const me = session;
      const maxNum = db.cases.reduce((m, c) => Math.max(m, parseInt(c.caseNumber.split("-")[1] ?? "0", 10)), 0);
      const c: LoanCase = {
        id: nextId(db.cases),
        caseNumber: `CASE-${String(maxNum + 1).padStart(6, "0")}`,
        customer: input.customer.trim(),
        bank: input.bank,
        loanAmount: input.loanAmount,
        stage: input.stage,
        caseStatus: "Active",
        closedDate: null,
        ownerId: input.ownerId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      setDb((prev) => {
        let tasks = prev.tasks;
        if (input.task && input.task.description.trim()) {
          tasks = [
            ...tasks,
            {
              id: nextId(tasks),
              caseId: c.id,
              description: input.task!.description.trim(),
              ownerId: input.task!.ownerId,
              createdBy: me?.id ?? 0,
              waitingFor: input.task!.waitingFor,
              whyPending: input.task!.whyPending,
              createdAt: nowISO(),
              dueDate: input.task!.dueDate,
              status: "Open",
              completedAt: null,
              remarks: "",
            },
          ];
        }
        return {
          ...prev,
          cases: [...prev.cases, c],
          tasks,
          activities: logAct(prev.activities, c.id, me?.id ?? 0, "Case created", undefined, c.stage),
          affordabilityChecks: input.linkCheckId
            ? prev.affordabilityChecks.map((k) => (k.id === input.linkCheckId ? { ...k, caseId: c.id } : k))
            : prev.affordabilityChecks,
        };
      });
      return c;
    },
    [db.cases, session]
  );

  const updateCase = useCallback(
    (id: number, patch: Partial<Omit<LoanCase, "id" | "createdAt">>) => {
      const me = session;
      setDb((prev) => {
        const before = prev.cases.find((c) => c.id === id);
        if (!before) return prev;
        let acts = prev.activities;
        if (patch.stage !== undefined && patch.stage !== before.stage)
          acts = logAct(acts, id, me?.id ?? 0, "Stage moved", before.stage, patch.stage);
        if (patch.ownerId !== undefined && patch.ownerId !== before.ownerId)
          acts = logAct(
            acts, id, me?.id ?? 0, "Owner changed",
            prev.users.find((u) => u.id === before.ownerId)?.name ?? "—",
            prev.users.find((u) => u.id === patch.ownerId)?.name ?? "—"
          );
        if (patch.customer !== undefined && patch.customer !== before.customer)
          acts = logAct(acts, id, me?.id ?? 0, "Customer updated", before.customer, patch.customer);
        if (patch.bank !== undefined && patch.bank !== before.bank)
          acts = logAct(acts, id, me?.id ?? 0, "Bank updated", before.bank, patch.bank);
        if (patch.loanAmount !== undefined && patch.loanAmount !== before.loanAmount)
          acts = logAct(acts, id, me?.id ?? 0, "Loan amount updated", String(before.loanAmount), String(patch.loanAmount));
        return {
          ...prev,
          cases: prev.cases.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: nowISO() } : c)),
          activities: acts,
        };
      });
    },
    [session]
  );

  const setCaseState = useCallback(
    (id: number, state: CaseState, note?: string) => {
      const me = session;
      setDb((prev) => {
        const before = prev.cases.find((c) => c.id === id);
        if (!before) return prev;
        let acts = prev.activities;
        if (state === "Active") {
          acts = logAct(acts, id, me?.id ?? 0, "Case reopened", before.caseStatus);
        } else if (state === "Closed") {
          acts = logAct(acts, id, me?.id ?? 0, "Case booked", before.stage, "Closed");
        } else {
          acts = logAct(acts, id, me?.id ?? 0, "Case marked lost", before.stage, note || undefined);
        }
        return {
          ...prev,
          cases: prev.cases.map((c) =>
            c.id === id
              ? {
                  ...c,
                  caseStatus: state,
                  closedDate: state === "Active" ? null : new Date().toISOString().slice(0, 10),
                  stage: state === "Closed" ? (prev.stages.some((s) => s.label === "Closed") ? "Closed" : c.stage) : c.stage,
                  updatedAt: nowISO(),
                }
              : c
          ),
          activities: acts,
        };
      });
    },
    [session]
  );

  const deleteCase = useCallback((id: number) => {
    setDb((prev) => ({
      ...prev,
      cases: prev.cases.filter((c) => c.id !== id),
      tasks: prev.tasks.filter((t) => t.caseId !== id),
      activities: prev.activities.filter((a) => a.caseId !== id),
      instructions: prev.instructions.filter((i) => i.caseId !== id),
      affordabilityChecks: prev.affordabilityChecks.map((k) => (k.caseId === id ? { ...k, caseId: null } : k)),
    }));
  }, []);

  /* ---------------- tasks ---------------- */

  const createTask = useCallback(
    (caseId: number, input: TaskInput) => {
      const me = session;
      setDb((prev) => {
        const superseded = prev.tasks.filter((t) => t.caseId === caseId && t.status === "Open");
        let acts = prev.activities;
        const tasks = prev.tasks.map((t) =>
          t.caseId === caseId && t.status === "Open"
            ? { ...t, status: "Done" as const, completedAt: nowISO(), remarks: t.remarks || "Superseded by a newer task." }
            : t
        );
        for (const s of superseded) acts = logAct(acts, caseId, me?.id ?? 0, "Task superseded", s.description);
        const t: Task = {
          id: nextId(tasks),
          caseId,
          description: input.description.trim(),
          ownerId: input.ownerId,
          createdBy: me?.id ?? 0,
          waitingFor: input.waitingFor,
          whyPending: input.whyPending,
          createdAt: nowISO(),
          dueDate: input.dueDate,
          status: "Open",
          completedAt: null,
          remarks: "",
        };
        acts = logAct(acts, caseId, me?.id ?? 0, "Task opened", undefined, `${t.description} · due ${t.dueDate}`);
        return { ...prev, tasks: [...tasks, t], activities: acts };
      });
    },
    [session]
  );

  const updateTask = useCallback(
    (id: number, patch: Partial<Omit<Task, "id" | "caseId" | "createdAt">>) => {
      const me = session;
      setDb((prev) => {
        const before = prev.tasks.find((t) => t.id === id);
        if (!before) return prev;
        let acts = prev.activities;
        if (patch.ownerId !== undefined && patch.ownerId !== before.ownerId)
          acts = logAct(acts, before.caseId, me?.id ?? 0, "Task owner changed",
            prev.users.find((u) => u.id === before.ownerId)?.name ?? "—",
            prev.users.find((u) => u.id === patch.ownerId)?.name ?? "—");
        if (patch.waitingFor !== undefined && patch.waitingFor !== before.waitingFor)
          acts = logAct(acts, before.caseId, me?.id ?? 0, "Waiting-for changed", before.waitingFor, patch.waitingFor);
        if (patch.whyPending !== undefined && patch.whyPending !== before.whyPending)
          acts = logAct(acts, before.caseId, me?.id ?? 0, "Why-pending changed", before.whyPending, patch.whyPending);
        if (patch.dueDate !== undefined && patch.dueDate !== before.dueDate)
          acts = logAct(acts, before.caseId, me?.id ?? 0, "Due date changed", before.dueDate, patch.dueDate);
        return {
          ...prev,
          tasks: prev.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          activities: acts,
        };
      });
    },
    [session]
  );

  const completeTask = useCallback(
    (id: number, remarks: string) => {
      const me = session;
      setDb((prev) => {
        const before = prev.tasks.find((t) => t.id === id);
        if (!before) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === id ? { ...t, status: "Done" as const, completedAt: nowISO(), remarks: remarks.trim() } : t
          ),
          activities: logAct(prev.activities, before.caseId, me?.id ?? 0, "Task completed", before.description, remarks.trim() || undefined),
        };
      });
    },
    [session]
  );

  /* ---------------- instructions ---------------- */

  const addInstruction = useCallback(
    (caseId: number, input: { instruction: string; assignedTo: number; dueDate: string }) => {
      const me = session;
      setDb((prev) => {
        const inst: Instruction = {
          id: nextId(prev.instructions),
          caseId,
          issuedBy: me?.id ?? 0,
          instruction: input.instruction.trim(),
          assignedTo: input.assignedTo,
          dueDate: input.dueDate,
          status: "Open",
          createdAt: nowISO(),
          completedAt: null,
        };
        return {
          ...prev,
          instructions: [...prev.instructions, inst],
          activities: logAct(prev.activities, caseId, me?.id ?? 0, "Instruction issued", undefined, inst.instruction),
        };
      });
    },
    [session]
  );

  const completeInstruction = useCallback(
    (id: number) => {
      const me = session;
      setDb((prev) => {
        const before = prev.instructions.find((i) => i.id === id);
        if (!before) return prev;
        return {
          ...prev,
          instructions: prev.instructions.map((i) => (i.id === id ? { ...i, status: "Done" as const, completedAt: nowISO() } : i)),
          activities: logAct(prev.activities, before.caseId, me?.id ?? 0, "Instruction completed", before.instruction),
        };
      });
    },
    [session]
  );

  /* ---------------- affordability calculator ---------------- */

  const runCheck = useCallback(
    (input: CalcInput & { customerName: string }): AffordabilityCheck => {
      const me = session;
      const r = computeAffordability(input);
      const check: AffordabilityCheck = {
        id: nextId(db.affordabilityChecks),
        caseId: null,
        customerName: input.customerName.trim() || "Unnamed enquiry",
        monthlyIncome: input.monthlyIncome,
        otherIncome: input.otherIncome,
        existingEmis: input.existingEmis,
        age: input.age,
        employmentType: input.employmentType,
        propertyValue: input.propertyValue,
        bank: input.bank,
        interestRate: r.rateUsed,
        tenureYears: r.tenureUsed,
        applicableLtv: r.applicableLtv,
        maxLoanByLtv: r.maxLoanByLtv,
        maxDbrPct: r.maxDbrPct,
        availableDbrEmi: r.availableDbrEmi,
        maxLoanByDbr: r.maxLoanByDbr,
        maxTenureByAge: r.maxTenureByAge,
        finalEligibleLoan: r.finalEligibleLoan,
        estimatedEmi: r.estimatedEmi,
        eligible: r.eligible,
        createdBy: me?.id ?? 0,
        createdAt: nowISO(),
      };
      setDb((prev) => ({ ...prev, affordabilityChecks: [...prev.affordabilityChecks, check] }));
      return check;
    },
    [db.affordabilityChecks, session]
  );

  const attachCheck = useCallback((checkId: number, caseId: number) => {
    setDb((prev) => ({
      ...prev,
      affordabilityChecks: prev.affordabilityChecks.map((k) => (k.id === checkId ? { ...k, caseId } : k)),
    }));
  }, []);

  /* ---------------- admin: users ---------------- */

  const saveUser = useCallback((u: User) => {
    setDb((prev) => {
      const exists = prev.users.some((x) => x.id === u.id);
      return {
        ...prev,
        users: exists ? prev.users.map((x) => (x.id === u.id ? u : x)) : [...prev.users, { ...u, id: nextId(prev.users), createdAt: nowISO() }],
      };
    });
  }, []);

  const deleteUser = useCallback(
    (id: number): string | null => {
      const ownedCases = db.cases.filter((c) => c.ownerId === id).length;
      const openTasks = db.tasks.filter((t) => t.ownerId === id && t.status === "Open").length;
      if (ownedCases > 0 || openTasks > 0)
        return `Blocked: ${ownedCases} case(s) and ${openTasks} open task(s) still assigned. Reassign first.`;
      setDb((prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== id) }));
      return null;
    },
    [db.cases, db.tasks]
  );

  /* ---------------- admin: master lists ---------------- */

  const addMaster = useCallback(
    (kind: MasterKind, label: string): string | null => {
      const clean = label.trim();
      if (!clean) return "Label cannot be empty.";
      const list = db[kind];
      if (list.some((m) => m.label.toLowerCase() === clean.toLowerCase())) return "That label already exists.";
      setDb((prev) => {
        if (kind === "stages") {
          const maxSort = (prev.stages as StageItem[]).reduce((m, s) => Math.max(m, s.sortOrder), 0);
          return { ...prev, stages: [...prev.stages, { id: nextId(prev.stages), label: clean, active: true, sortOrder: maxSort + 1 }] };
        }
        const item: MasterItem = { id: nextId(prev[kind]), label: clean, active: true };
        return { ...prev, [kind]: [...prev[kind], item] };
      });
      return null;
    },
    [db]
  );

  const toggleMaster = useCallback((kind: MasterKind, id: number) => {
    setDb((prev) => ({
      ...prev,
      [kind]: (prev[kind] as MasterItem[]).map((m) => (m.id === id ? { ...m, active: !m.active } : m)),
    }));
  }, []);

  const deleteMaster = useCallback(
    (kind: MasterKind, id: number): string | null => {
      const list = db[kind];
      const item = list.find((m) => m.id === id);
      if (!item) return "Item not found.";
      let used = 0;
      if (kind === "stages") used = db.cases.filter((c) => c.stage === item.label).length;
      if (kind === "whyPending") used = db.tasks.filter((t) => t.status === "Open" && t.whyPending === item.label).length;
      if (kind === "waitingFor") used = db.tasks.filter((t) => t.status === "Open" && t.waitingFor === item.label).length;
      if (kind === "banks") used = db.cases.filter((c) => c.caseStatus === "Active" && c.bank === item.label).length;
      if (used > 0) return `Blocked: "${item.label}" is in use by ${used} record(s). Deactivate it instead.`;
      setDb((prev) => ({ ...prev, [kind]: (prev[kind] as MasterItem[]).filter((m) => m.id !== id) }));
      return null;
    },
    [db]
  );

  const moveStage = useCallback((id: number, dir: -1 | 1) => {
    setDb((prev) => {
      const sorted = [...prev.stages].sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = sorted.findIndex((s) => s.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= sorted.length) return prev;
      const a = sorted[idx];
      const b = sorted[swap];
      return {
        ...prev,
        stages: prev.stages.map((s) => (s.id === a.id ? { ...s, sortOrder: b.sortOrder } : s.id === b.id ? { ...s, sortOrder: a.sortOrder } : s)),
      };
    });
  }, []);

  /* ---------------- admin: SLA rules ---------------- */

  const addSlaRule = useCallback(
    (rule: { stage: string; bank: string | null; maxDays: number }): string | null => {
      if (rule.maxDays < 1) return "Max days must be at least 1.";
      const dup = db.slaRules.find((r) => r.stage === rule.stage && r.bank === rule.bank && r.active);
      if (dup) return `A rule already exists for ${rule.stage}${rule.bank ? ` · ${rule.bank}` : ""}. Edit it instead.`;
      setDb((prev) => ({ ...prev, slaRules: [...prev.slaRules, { id: nextId(prev.slaRules), ...rule, active: true }] }));
      return null;
    },
    [db.slaRules]
  );

  const updateSlaRule = useCallback((id: number, maxDays: number) => {
    setDb((prev) => ({ ...prev, slaRules: prev.slaRules.map((r) => (r.id === id ? { ...r, maxDays: Math.max(1, maxDays) } : r)) }));
  }, []);

  const toggleSlaRule = useCallback((id: number) => {
    setDb((prev) => ({ ...prev, slaRules: prev.slaRules.map((r) => (r.id === id ? { ...r, active: !r.active } : r)) }));
  }, []);

  const deleteSlaRule = useCallback((id: number) => {
    setDb((prev) => ({ ...prev, slaRules: prev.slaRules.filter((r) => r.id !== id) }));
  }, []);

  const value: StoreShape = {
    db, session, route, toasts, nav, login, logout, toast, dismissToast,
    createCase, updateCase, setCaseState, deleteCase,
    createTask, updateTask, completeTask,
    addInstruction, completeInstruction,
    runCheck, attachCheck,
    saveUser, deleteUser, addMaster, toggleMaster, deleteMaster, moveStage,
    addSlaRule, updateSlaRule, toggleSlaRule, deleteSlaRule,
    userById, visibleCases, visibleTasks, canEditCase, canEditTask, canInstruct,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreShape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used within StoreProvider");
  return v;
}

/* ---------------- shared derived data ---------------- */

export interface Kpis {
  openCases: number;
  overdue: number;
  atRisk: number;
  noAction: number;
  openTasks: number;
  escalations: number;
  pipelineValue: number;
}

export function computeKpis(
  cases: LoanCase[],
  tasks: Task[],
  statusOf: (c: LoanCase) => "On Track" | "At Risk" | "Overdue" | "No Action",
  escalationCount: number
): Kpis {
  const open = cases.filter((c) => c.caseStatus === "Active");
  let overdue = 0, atRisk = 0, noAction = 0;
  for (const c of open) {
    const s = statusOf(c);
    if (s === "Overdue") overdue += 1;
    else if (s === "At Risk") atRisk += 1;
    else if (s === "No Action") noAction += 1;
  }
  const openTasks = tasks.filter((t) => t.status === "Open");
  return {
    openCases: open.length,
    overdue,
    atRisk,
    noAction,
    openTasks: openTasks.length,
    escalations: escalationCount,
    pipelineValue: open.reduce((s, c) => s + c.loanAmount, 0),
  };
}

export function activityPerDay(activities: Activity[], days: number): number[] {
  const out = new Array(days).fill(0) as number[];
  for (const a of activities) {
    const d = new Date(a.at);
    const today = new Date();
    const diff = Math.floor(
      (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
        86400000
    );
    if (diff >= 0 && diff < days) out[days - 1 - diff] += 1;
  }
  return out;
}

export { ageDays };
