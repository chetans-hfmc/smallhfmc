import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Activity, DB, LoanCase, MasterItem, Route, StageItem, Task, User } from "./types";
import { seedDb } from "./data";
import { todayISO } from "./format";

const DB_KEY = "hfmc.casetracker.db.v3";
const SESSION_KEY = "hfmc.casetracker.session.v3";

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
  task?: { description: string; dueDate: string; waitingFor: string; whyPending: string; ownerId: number };
}

export interface TaskInput {
  description: string;
  ownerId: number;
  waitingFor: string;
  whyPending: string;
  dueDate: string;
}

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
  deleteCase: (id: number) => void;
  createTask: (caseId: number, input: TaskInput) => void;
  updateTask: (id: number, patch: Partial<Omit<Task, "id" | "caseId" | "createdAt">>) => void;
  completeTask: (id: number, remarks: string) => void;
  saveUser: (u: User) => void;
  deleteUser: (id: number) => string | null;
  addMaster: (kind: "stages" | "whyPending" | "waitingFor", label: string) => string | null;
  toggleMaster: (kind: "stages" | "whyPending" | "waitingFor", id: number) => void;
  deleteMaster: (kind: "stages" | "whyPending" | "waitingFor", id: number) => string | null;
  moveStage: (id: number, dir: -1 | 1) => void;
  userById: (id: number) => User | undefined;
  visibleCases: () => LoanCase[];
  visibleTasks: () => Task[];
  canEditCase: (c: LoanCase) => boolean;
  canEditTask: (t: Task) => boolean;
}

const Ctx = createContext<StoreShape | null>(null);

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [a, b] = h.split("/");
  if (a === "case" && b && !Number.isNaN(parseInt(b, 10))) return { name: "case", id: parseInt(b, 10) };
  if (a === "tasks") return { name: "tasks" };
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
      if (parsed && parsed.version === 3 && Array.isArray(parsed.cases)) return parsed;
    }
  } catch {
    /* fall through to seed */
  }
  return seedDb();
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

  const deleteCase = useCallback((id: number) => {
    setDb((prev) => ({
      ...prev,
      cases: prev.cases.filter((c) => c.id !== id),
      tasks: prev.tasks.filter((t) => t.caseId !== id),
      activities: prev.activities.filter((a) => a.caseId !== id),
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

  type MasterKind = "stages" | "whyPending" | "waitingFor";

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

  const value: StoreShape = {
    db, session, route, toasts, nav, login, logout, toast, dismissToast,
    createCase, updateCase, deleteCase, createTask, updateTask, completeTask,
    saveUser, deleteUser, addMaster, toggleMaster, deleteMaster, moveStage,
    userById, visibleCases, visibleTasks, canEditCase, canEditTask,
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
  dueToday: number;
  pipelineValue: number;
}

export function computeKpis(cases: LoanCase[], tasks: Task[], statusOf: (c: LoanCase) => "On Track" | "At Risk" | "Overdue" | "No Action"): Kpis {
  const open = cases.filter((c) => c.stage !== "Closed");
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
    dueToday: openTasks.filter((t) => t.dueDate === todayISO()).length,
    pipelineValue: open.reduce((s, c) => s + c.loanAmount, 0),
  };
}

export function activityPerDay(activities: Activity[], days: number): number[] {
  const out = new Array(days).fill(0) as number[];
  const today = new Date();
  for (const a of activities) {
    const d = new Date(a.at);
    const diff = Math.floor((today.setHours(0, 0, 0, 0) - d.setHours(0, 0, 0, 0)) / 86400000);
    if (diff >= 0 && diff < days) out[days - 1 - diff] += 1;
  }
  return out;
}
