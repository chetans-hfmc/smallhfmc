import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  Activity, AffordabilityCheck, BankItem, BulletinItem, CasePartner, CaseSource, CaseState, DB, Designation, LoanCase, MasterItem,
  PartnerItem, PartnerKind, Route, SlaRule, StageItem, Task, User,
} from "./types";
import { seedDb } from "./data";
import { computeAffordability } from "./calc";
import type { CalcInput } from "./calc";
import { ageDays, daysBetween, primaryBank, toISODate, todayISO } from "./format";

const DB_KEY = "meridian.casetracker.db.v6";
const SESSION_KEY = "meridian.casetracker.session.v6";

export interface ToastMsg {
  id: number;
  kind: "success" | "error" | "info";
  msg: string;
}

export interface NewCaseInput {
  customer: string;
  banks: string[];
  loanAmount: number;
  stage: string;
  ownerId: number;
  source: CaseSource;
  partner: CasePartner | null;
  whatsapp: string;
  waGroup: string | null;
  task?: { description: string; dueDate: string; waitingFor: string; whyPending: string; ownerId: number };
}

export interface TaskInput {
  description: string;
  ownerId: number;
  waitingFor: string;
  whyPending: string;
  dueDate: string;
}

/* ---------------- role model (designation-driven) ---------------- */

export interface RoleFlags {
  scope: "all" | "team" | "own";
  issueTasks: boolean;
  admin: boolean;
  super: boolean;
}

const SUPER_FLAGS: RoleFlags = { scope: "all", issueTasks: true, admin: true, super: true };
const DEFAULT_FLAGS: RoleFlags = { scope: "own", issueTasks: false, admin: false, super: false };

export function flagsFor(designations: Designation[], role: string): RoleFlags {
  if (role === "Super Admin") return SUPER_FLAGS;
  const d = designations.find((x) => x.name === role);
  return d ? { scope: d.scope, issueTasks: d.issueTasks, admin: d.admin, super: d.super } : DEFAULT_FLAGS;
}

/* who can see / act on a bulletin directive */
export function bulletinVisible(b: BulletinItem, me: User, db: DB): boolean {
  const f = flagsFor(db.designations, me.role);
  if (f.scope === "all") return true;
  if (b.issuedBy === me.id || b.targets.includes(me.id)) return true;
  if (f.scope === "team") {
    const issuer = db.users.find((u) => u.id === b.issuedBy);
    if (issuer?.team === me.team) return true;
    return b.targets.some((t) => db.users.find((u) => u.id === t)?.team === me.team);
  }
  return false;
}

export function bulletinCanAct(b: BulletinItem, me: User, db: DB): boolean {
  const f = flagsFor(db.designations, me.role);
  return f.scope === "all" || b.issuedBy === me.id || b.targets.includes(me.id);
}

/* carry / drop are manager moves: the issuer, or anyone with full scope */
export function bulletinCanManage(b: BulletinItem, me: User, db: DB): boolean {
  const f = flagsFor(db.designations, me.role);
  return f.scope === "all" || b.issuedBy === me.id;
}

export function bulletinCanDelete(b: BulletinItem, me: User, db: DB): boolean {
  return bulletinCanManage(b, me, db);
}

/* ---------------- bulletin lifecycle (spawn routines, resolve stale) ---------------- */

const MS_DAY = 86400000;
const SPAWN_BACK_LIMIT = 3; // don't drown a returning user: at most 3 past instances per template

function eligibleDays(fromISO: string, repeat: "daily" | "weekdays"): string[] {
  const out: string[] = [];
  const today = todayISO();
  const span = Math.min(daysBetween(fromISO, today), SPAWN_BACK_LIMIT + 1);
  for (let back = Math.max(0, span); back >= 0; back--) {
    const d = new Date(Date.now() - back * MS_DAY);
    const iso = toISODate(d);
    if (iso < fromISO) continue;
    if (repeat === "weekdays") {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue; // UAE weekend: Sat–Sun
    }
    out.push(iso);
  }
  return out;
}

export function spawnBulletinInstances(prev: DB): DB {
  const templates = prev.bulletin.filter((b) => b.isTemplate && b.repeat && b.repeat !== "none");
  if (templates.length === 0) return prev;
  let nid = prev.bulletin.reduce((m, b) => Math.max(m, b.id), 0) + 1;
  const added: BulletinItem[] = [];
  for (const t of templates) {
    for (const day of eligibleDays(t.date, t.repeat as "daily" | "weekdays")) {
      const exists = prev.bulletin.some((b) => b.templateId === t.id && b.date === day) || added.some((b) => b.templateId === t.id && b.date === day);
      if (exists) continue;
      added.push({
        ...t,
        id: nid++,
        date: day,
        templateId: t.id,
        isTemplate: false,
        repeat: "none",
        status: "Open",
        completedAt: null,
        completedBy: null,
        carriedFrom: null,
        dropped: false,
        createdAt: nowISO(),
        replies: [],
      });
    }
  }
  return added.length ? { ...prev, bulletin: [...prev.bulletin, ...added] } : prev;
}

export function resolveStaleBulletins(prev: DB): DB {
  const casesById = new Map(prev.cases.map((c) => [c.id, c]));
  let rid = prev.bulletin.reduce((m, b) => Math.max(m, b.id, ...b.replies.map((r) => r.id)), 0) + 1;
  let changed = false;
  const bulletin = prev.bulletin.map((b) => {
    if (b.caseId != null && b.status === "Open" && !b.isTemplate) {
      const c = casesById.get(b.caseId);
      if (!c || c.caseStatus !== "Active") {
        changed = true;
        return {
          ...b,
          status: "Done" as const,
          completedAt: nowISO(),
          completedBy: null,
          replies: [...b.replies, { id: rid++, userId: b.issuedBy, text: "Case closed — directive resolved automatically, no action needed.", at: nowISO() }],
        };
      }
    }
    return b;
  });
  return changed ? { ...prev, bulletin } : prev;
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
  setCaseState: (id: number, state: CaseState, wonBank?: string) => void;
  createTask: (caseId: number, input: TaskInput) => void;
  updateTask: (id: number, patch: Partial<Omit<Task, "id" | "caseId" | "createdAt" | "createdBy">>) => void;
  completeTask: (id: number, remarks: string) => void;
  addInstruction: (caseId: number, input: { instruction: string; assignedTo: number; dueDate: string }) => void;
  completeInstruction: (id: number) => void;
  replyToInstruction: (id: number, text: string) => void;
  issueBulletin: (input: { date: string; task: string; caseId: number | null; targets: number[]; repeat?: "none" | "daily" | "weekdays"; asTemplate?: boolean }) => void;
  completeBulletin: (id: number, opts?: { alsoTaskDone?: boolean }) => void;
  carryBulletin: (id: number) => void;
  dropBulletin: (id: number) => void;
  deleteBulletin: (id: number) => void;
  replyToBulletin: (id: number, text: string) => void;
  canInstruct: () => boolean;
  canAdmin: () => boolean;
  saveMortgageCheck: (name: string, whatsapp: string, payload: string, summary: { income: number; emi: number; final: number; rate: number; tenorMonths: number; ltv: number; eligible: boolean }) => number;
  addDesignation: (name: string) => string | null;
  updateDesignation: (id: number, patch: Partial<Omit<Designation, "id" | "builtIn" | "super">>) => void;
  deleteDesignation: (id: number) => string | null;
  runCheck: (input: CalcInput, customerName: string) => void;
  createCaseFromCheck: (checkId: number, submitToBank?: boolean, checkOverride?: AffordabilityCheck) => LoanCase | null;
  linkCheckToCase: (checkId: number, caseId: number) => void;
  saveUser: (u: User) => void;
  deleteUser: (id: number) => string | null;
  addMaster: (kind: "stages" | "whyPending" | "waitingFor", label: string) => string | null;
  toggleMaster: (kind: "stages" | "whyPending" | "waitingFor", id: number) => void;
  deleteMaster: (kind: "stages" | "whyPending" | "waitingFor", id: number) => string | null;
  moveStage: (id: number, dir: -1 | 1) => void;
  addBank: (name: string, ratePct: number) => string | null;
  updateBankRate: (id: number, ratePct: number) => void;
  toggleBank: (id: number) => void;
  deleteBank: (id: number) => string | null;
  addPartner: (kind: PartnerKind, name: string, sharePct: number) => string | null;
  updatePartnerShare: (id: number, sharePct: number) => void;
  togglePartner: (id: number) => void;
  deletePartner: (id: number) => string | null;
  saveSla: (rule: Omit<SlaRule, "id"> & { id?: number }) => void;
  toggleSla: (id: number) => void;
  deleteSla: (id: number) => void;
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
  if (a === "bulletin") return { name: "bulletin" };
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
      if (parsed && parsed.version === 9 && Array.isArray(parsed.designations) && Array.isArray(parsed.bulletin)) return parsed;
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

  /* bulletin lifecycle: spawn routine instances for any day without one (capped, so a
     returning user isn't flooded) and auto-resolve directives whose case has closed */
  useEffect(() => {
    setDb((prev) => resolveStaleBulletins(spawnBulletinInstances(prev)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
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
      if (!u.active) return "This account has been deactivated. Contact the Head of Company.";
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

  /* ---------------- permissions ---------------- */

  const canInstruct = useCallback(
    () => !!session && flagsFor(db.designations, session.role).issueTasks,
    [session, db.designations]
  );

  const canAdmin = useCallback(
    () => !!session && flagsFor(db.designations, session.role).admin,
    [session, db.designations]
  );

  const visibleCases = useCallback((): LoanCase[] => {
    if (!session) return [];
    const f = flagsFor(db.designations, session.role);
    if (f.scope === "all") return db.cases;
    if (f.scope === "team")
      return db.cases.filter((c) => {
        if (c.ownerId === session.id) return true;
        const owner = db.users.find((u) => u.id === c.ownerId);
        return owner?.team === session.team;
      });
    return db.cases.filter((c) => c.ownerId === session.id);
  }, [db, session]);

  const visibleTasks = useCallback((): Task[] => {
    if (!session) return [];
    const f = flagsFor(db.designations, session.role);
    if (f.scope === "all") return db.tasks;
    if (f.scope === "team") {
      const teamIds = new Set(db.users.filter((u) => u.team === session.team).map((u) => u.id));
      const caseIds = new Set(visibleCases().map((c) => c.id));
      return db.tasks.filter((t) => caseIds.has(t.caseId) || teamIds.has(t.ownerId));
    }
    return db.tasks.filter((t) => t.ownerId === session.id);
  }, [db, session, visibleCases]);

  const canEditCase = useCallback(
    (c: LoanCase): boolean => {
      if (!session) return false;
      const f = flagsFor(db.designations, session.role);
      if (f.scope === "all") return true;
      if (f.scope === "team") {
        if (c.ownerId === session.id) return true;
        const owner = db.users.find((u) => u.id === c.ownerId);
        return owner?.team === session.team;
      }
      return c.ownerId === session.id;
    },
    [db, session]
  );

  const canEditTask = useCallback(
    (t: Task): boolean => {
      if (!session) return false;
      const f = flagsFor(db.designations, session.role);
      if (f.scope === "all") return true;
      if (f.scope === "team") {
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
        banks: input.banks,
        wonBank: null,
        loanAmount: input.loanAmount,
        stage: input.stage,
        caseStatus: "Active",
        closedDate: null,
        ownerId: input.ownerId,
        source: input.source,
        partner: input.partner,
        whatsapp: input.whatsapp.trim(),
        waGroup: input.waGroup?.trim() || null,
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
        let acts = logAct(prev.activities, c.id, me?.id ?? 0, "Case created", undefined, c.stage);
        if (c.partner)
          acts = logAct(acts, c.id, me?.id ?? 0, "Source logged", undefined, `${c.source} · ${c.partner.name} @ ${c.partner.sharePct}%`);
        return { ...prev, cases: [...prev.cases, c], tasks, activities: acts };
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
          acts = logAct(acts, id, me?.id ?? 0, "Owner changed",
            prev.users.find((u) => u.id === before.ownerId)?.name ?? "—",
            prev.users.find((u) => u.id === patch.ownerId)?.name ?? "—");
        if (patch.customer !== undefined && patch.customer !== before.customer)
          acts = logAct(acts, id, me?.id ?? 0, "Customer updated", before.customer, patch.customer);
        if (patch.banks !== undefined && JSON.stringify(patch.banks) !== JSON.stringify(before.banks))
          acts = logAct(acts, id, me?.id ?? 0, "Bank submissions updated", before.banks.join(", ") || "TBC", patch.banks.join(", ") || "TBC");
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
    (id: number, state: CaseState, wonBank?: string) => {
      const me = session;
      setDb((prev) => {
        const before = prev.cases.find((c) => c.id === id);
        if (!before) return prev;
        let acts = prev.activities;
        if (state === "Closed")
          acts = logAct(acts, id, me?.id ?? 0, "Case booked", undefined, wonBank ?? before.wonBank ?? "—");
        if (state === "Lost") acts = logAct(acts, id, me?.id ?? 0, "Case marked lost", before.stage);
        if (state === "Active") acts = logAct(acts, id, me?.id ?? 0, "Case reopened", before.caseStatus);
        const next: DB = {
          ...prev,
          cases: prev.cases.map((c) =>
            c.id === id
              ? {
                  ...c,
                  caseStatus: state,
                  wonBank: state === "Closed" ? wonBank ?? c.wonBank ?? c.banks[0] ?? null : state === "Active" ? null : c.wonBank,
                  closedDate: state === "Active" ? null : todayISO(),
                  stage: state === "Closed" ? "Closure" : c.stage,
                  updatedAt: nowISO(),
                }
              : c
          ),
          activities: acts,
        };
        /* the moment a case leaves the live pipeline, any open directives pinned to it
           resolve themselves — no stale "chase this" items linger on a closed file */
        return state === "Active" ? next : resolveStaleBulletins(next);
      });
    },
    [session]
  );

  const deleteCase = useCallback((id: number) => {
    setDb((prev) => ({
      ...prev,
      cases: prev.cases.filter((c) => c.id !== id),
      tasks: prev.tasks.filter((t) => t.caseId !== id),
      instructions: prev.instructions.filter((i) => i.caseId !== id),
      activities: prev.activities.filter((a) => a.caseId !== id),
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
        const byName = prev.users.find((u) => u.id === t.createdBy)?.name ?? "—";
        const toName = prev.users.find((u) => u.id === t.ownerId)?.name ?? "—";
        acts = logAct(acts, caseId, me?.id ?? 0, t.ownerId === t.createdBy ? "Task opened" : `Task assigned to ${toName} (by ${byName})`, undefined, `${t.description} · due ${t.dueDate}`);
        return { ...prev, tasks: [...tasks, t], activities: acts };
      });
    },
    [session]
  );

  const updateTask = useCallback(
    (id: number, patch: Partial<Omit<Task, "id" | "caseId" | "createdAt" | "createdBy">>) => {
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
        const list = prev.instructions;
        const i = {
          id: nextId(list),
          caseId,
          issuedBy: me?.id ?? 0,
          instruction: input.instruction.trim(),
          assignedTo: input.assignedTo,
          dueDate: input.dueDate,
          status: "Open" as const,
          createdAt: nowISO(),
          completedAt: null,
          replies: [],
        };
        return {
          ...prev,
          instructions: [...list, i],
          activities: logAct(prev.activities, caseId, me?.id ?? 0, "Instruction issued", undefined, i.instruction),
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

  const nextReplyId = (prev: DB): number =>
    Math.max(
      0,
      ...prev.instructions.flatMap((i) => i.replies.map((r) => r.id)),
      ...prev.bulletin.flatMap((b) => b.replies.map((r) => r.id))
    ) + 1;

  const replyToInstruction = useCallback(
    (id: number, text: string) => {
      const me = session;
      const clean = text.trim();
      if (!clean || !me) return;
      setDb((prev) => ({
        ...prev,
        instructions: prev.instructions.map((i) =>
          i.id === id ? { ...i, replies: [...i.replies, { id: nextReplyId(prev), userId: me.id, text: clean, at: nowISO() }] } : i
        ),
      }));
    },
    [session]
  );

  /* ---------------- morning bulletin ---------------- */

  const issueBulletin = useCallback(
    (input: { date: string; task: string; caseId: number | null; targets: number[]; repeat?: "none" | "daily" | "weekdays"; asTemplate?: boolean }) => {
      const me = session;
      setDb((prev) => {
        let nid = nextId(prev.bulletin);
        const list = [...prev.bulletin];
        let acts = prev.activities;

        if (input.asTemplate && input.repeat && input.repeat !== "none") {
          // save the routine: a hidden template + today's live instance
          const templateId = nid++;
          list.push({
            id: templateId,
            date: input.date,
            issuedBy: me?.id ?? 0,
            task: input.task.trim(),
            caseId: input.caseId,
            targets: input.targets,
            status: "Open",
            completedAt: null,
            completedBy: null,
            createdAt: nowISO(),
            replies: [],
            repeat: input.repeat,
            templateId: null,
            isTemplate: true,
          });
          const inst: BulletinItem = {
            id: nid++,
            date: todayISO(),
            issuedBy: me?.id ?? 0,
            task: input.task.trim(),
            caseId: input.caseId,
            targets: input.targets,
            status: "Open",
            completedAt: null,
            completedBy: null,
            createdAt: nowISO(),
            replies: [],
            templateId,
            isTemplate: false,
          };
          list.push(inst);
          if (input.caseId) acts = logAct(acts, input.caseId, me?.id ?? 0, "Directive issued (routine)", undefined, inst.task);
          return { ...prev, bulletin: list, activities: acts };
        }

        const b: BulletinItem = {
          id: nid++,
          date: input.date,
          issuedBy: me?.id ?? 0,
          task: input.task.trim(),
          caseId: input.caseId,
          targets: input.targets,
          status: "Open",
          completedAt: null,
          completedBy: null,
          createdAt: nowISO(),
          replies: [],
        };
        if (input.caseId) acts = logAct(acts, input.caseId, me?.id ?? 0, "Directive issued", undefined, b.task);
        return { ...prev, bulletin: [...list, b], activities: acts };
      });
    },
    [session]
  );

  const completeBulletin = useCallback(
    (id: number, opts?: { alsoTaskDone?: boolean }) => {
      const me = session;
      setDb((prev) => {
        const before = prev.bulletin.find((b) => b.id === id);
        if (!before) return prev;
        let acts = prev.activities;
        let tasks = prev.tasks;
        if (before.caseId)
          acts = logAct(acts, before.caseId, me?.id ?? 0, "Directive completed", before.task);
        // smart link: optionally close the case's current task in the same move
        if (opts?.alsoTaskDone && before.caseId) {
          const open = tasks.find((t) => t.caseId === before.caseId && t.status === "Open");
          if (open) {
            tasks = tasks.map((t) =>
              t.id === open.id
                ? { ...t, status: "Done" as const, completedAt: nowISO(), remarks: t.remarks || "Closed from morning-bulletin directive." }
                : t
            );
            acts = logAct(acts, before.caseId, me?.id ?? 0, "Task completed", open.description, "via directive");
          }
        }
        return {
          ...prev,
          tasks,
          bulletin: prev.bulletin.map((b) =>
            b.id === id ? { ...b, status: "Done" as const, completedAt: nowISO(), completedBy: me?.id ?? null } : b
          ),
          activities: acts,
        };
      });
    },
    [session]
  );

  const carryBulletin = useCallback(
    (id: number) => {
      const me = session;
      setDb((prev) => {
        const before = prev.bulletin.find((b) => b.id === id);
        if (!before || before.status !== "Open" || before.dropped) return prev;
        const today = todayISO();
        let nid = nextId(prev.bulletin);
        const carried: BulletinItem = {
          ...before,
          id: nid++,
          date: today,
          carriedFrom: before.date,
          templateId: before.templateId ?? null,
          isTemplate: false,
          status: "Open",
          completedAt: null,
          completedBy: null,
          createdAt: nowISO(),
          replies: [],
          dropped: false,
        };
        let acts = prev.activities;
        if (before.caseId)
          acts = logAct(acts, before.caseId, me?.id ?? 0, "Directive carried forward", before.date, today);
        return {
          ...prev,
          bulletin: [
            ...prev.bulletin.map((b) => (b.id === id ? { ...b, dropped: true } : b)),
            carried,
          ],
          activities: acts,
        };
      });
    },
    [session]
  );

  const dropBulletin = useCallback((id: number) => {
    setDb((prev) => ({
      ...prev,
      bulletin: prev.bulletin.map((b) => (b.id === id ? { ...b, dropped: true } : b)),
    }));
  }, []);

  const deleteBulletin = useCallback((id: number) => {
    setDb((prev) => {
      const before = prev.bulletin.find((b) => b.id === id);
      if (!before) return prev;
      // deleting a template retires its future spawns; past instances stay as record
      return { ...prev, bulletin: prev.bulletin.filter((b) => b.id !== id) };
    });
  }, []);

  const replyToBulletin = useCallback(
    (id: number, text: string) => {
      const me = session;
      const clean = text.trim();
      if (!clean || !me) return;
      setDb((prev) => ({
        ...prev,
        bulletin: prev.bulletin.map((b) =>
          b.id === id ? { ...b, replies: [...b.replies, { id: nextReplyId(prev), userId: me.id, text: clean, at: nowISO() }] } : b
        ),
      }));
    },
    [session]
  );

  /* ---------------- affordability ---------------- */

  const runCheck = useCallback(
    (input: CalcInput, customerName: string) => {
      const me = session;
      const r = computeAffordability(input);
      setDb((prev) => ({
        ...prev,
        affordabilityChecks: [
          ...prev.affordabilityChecks,
          {
            id: nextId(prev.affordabilityChecks),
            caseId: null,
            customerName: customerName.trim(),
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
          },
        ],
      }));
    },
    [session]
  );

  const createCaseFromCheck = useCallback(
    (checkId: number, submitToBank = true, checkOverride?: AffordabilityCheck): LoanCase | null => {
      const me = session;
      const k = checkOverride ?? db.affordabilityChecks.find((x) => x.id === checkId);
      if (!k || !me) return null;
      const banks = submitToBank && k.bank ? [k.bank] : [];
      const maxNum = db.cases.reduce((m, c) => Math.max(m, parseInt(c.caseNumber.split("-")[1] ?? "0", 10)), 0);
      const c: LoanCase = {
        id: nextId(db.cases),
        caseNumber: `CASE-${String(maxNum + 1).padStart(6, "0")}`,
        customer: k.customerName,
        banks,
        wonBank: null,
        loanAmount: k.finalEligibleLoan,
        stage: "WhatsApp Group Creation",
        caseStatus: "Active",
        closedDate: null,
        ownerId: me.id,
        source: "Direct",
        partner: null,
        whatsapp: k.payload ? (JSON.parse(k.payload) as { input?: { whatsapp?: string } }).input?.whatsapp ?? "" : "",
        waGroup: null,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      setDb((prev) => {
        let tasks = prev.tasks;
        const first: Task = {
          id: nextId(tasks),
          caseId: c.id,
          description: `Collect income & property documents — file assessed for AED ${(k.finalEligibleLoan / 1000).toFixed(0)}K${k.bank ? ` at ${k.bank}` : ""}`,
          ownerId: me.id,
          createdBy: me.id,
          waitingFor: "Client",
          whyPending: "Awaiting client documents",
          createdAt: nowISO(),
          dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
          status: "Open",
          completedAt: null,
          remarks: "",
        };
        tasks = [...tasks, first];
        return {
          ...prev,
          cases: [...prev.cases, c],
          tasks,
          affordabilityChecks: prev.affordabilityChecks.map((x) => (x.id === checkId ? { ...x, caseId: c.id } : x)),
          activities: logAct(logAct([], c.id, me.id, "Case created", undefined, c.stage), c.id, me.id, "Affordability check linked", `#${k.id}`),
        };
      });
      return c;
    },
    [db.affordabilityChecks, db.cases, session]
  );

  const linkCheckToCase = useCallback((checkId: number, caseId: number) => {
    setDb((prev) => ({
      ...prev,
      affordabilityChecks: prev.affordabilityChecks.map((x) => (x.id === checkId ? { ...x, caseId } : x)),
      activities: logAct(prev.activities, caseId, prev.users[0]?.id ?? 0, "Affordability check linked", `#${checkId}`),
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

  type MasterKind = "stages" | "whyPending" | "waitingFor";

  const addMaster = useCallback(
    (kind: MasterKind, label: string): string | null => {
      const clean = label.trim();
      if (!clean) return "Label cannot be empty.";
      if (db[kind].some((m) => m.label.toLowerCase() === clean.toLowerCase())) return "That label already exists.";
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

  /* ---------------- admin: banks ---------------- */

  const addBank = useCallback(
    (name: string, ratePct: number): string | null => {
      const clean = name.trim();
      if (!clean) return "Bank name cannot be empty.";
      if (db.banks.some((b) => b.name.toLowerCase() === clean.toLowerCase())) return "That bank already exists.";
      if (Number.isNaN(ratePct) || ratePct < 0 || ratePct > 10) return "Rate must be between 0 and 10%.";
      setDb((prev) => ({ ...prev, banks: [...prev.banks, { id: nextId(prev.banks), name: clean, ratePct, active: true }] }));
      return null;
    },
    [db.banks]
  );

  const updateBankRate = useCallback((id: number, ratePct: number) => {
    setDb((prev) => ({ ...prev, banks: prev.banks.map((b) => (b.id === id ? { ...b, ratePct } : b)) }));
  }, []);

  const toggleBank = useCallback((id: number) => {
    setDb((prev) => ({ ...prev, banks: prev.banks.map((b) => (b.id === id ? { ...b, active: !b.active } : b)) }));
  }, []);

  const deleteBank = useCallback(
    (id: number): string | null => {
      const item = db.banks.find((b) => b.id === id);
      if (!item) return "Bank not found.";
      const used = db.cases.filter((c) => c.banks.includes(item.name) || c.wonBank === item.name).length;
      if (used > 0) return `Blocked: "${item.name}" is referenced by ${used} case(s). Deactivate it instead.`;
      setDb((prev) => ({ ...prev, banks: prev.banks.filter((b) => b.id !== id) }));
      return null;
    },
    [db.banks, db.cases]
  );

  /* ---------------- admin: partners ---------------- */

  const addPartner = useCallback(
    (kind: PartnerKind, name: string, sharePct: number): string | null => {
      const clean = name.trim();
      if (!clean) return "Name cannot be empty.";
      if (db.partners.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return "That partner already exists.";
      if (Number.isNaN(sharePct) || sharePct <= 0 || sharePct > 100) return "Share must be between 1 and 100%.";
      setDb((prev) => ({ ...prev, partners: [...prev.partners, { id: nextId(prev.partners), kind, name: clean, defaultSharePct: sharePct, active: true }] }));
      return null;
    },
    [db.partners]
  );

  const updatePartnerShare = useCallback((id: number, sharePct: number) => {
    setDb((prev) => ({ ...prev, partners: prev.partners.map((p) => (p.id === id ? { ...p, defaultSharePct: sharePct } : p)) }));
  }, []);

  const togglePartner = useCallback((id: number) => {
    setDb((prev) => ({ ...prev, partners: prev.partners.map((p) => (p.id === id ? { ...p, active: !p.active } : p)) }));
  }, []);

  const deletePartner = useCallback(
    (id: number): string | null => {
      const item = db.partners.find((p) => p.id === id);
      if (!item) return "Partner not found.";
      const used = db.cases.filter((c) => c.partner?.name === item.name).length;
      if (used > 0) return `Blocked: "${item.name}" is on ${used} case(s). Deactivate instead.`;
      setDb((prev) => ({ ...prev, partners: prev.partners.filter((p) => p.id !== id) }));
      return null;
    },
    [db.partners, db.cases]
  );

  /* ---------------- admin: SLA rules ---------------- */

  const saveSla = useCallback((rule: Omit<SlaRule, "id"> & { id?: number }) => {
    setDb((prev) => {
      if (rule.id != null)
        return { ...prev, slaRules: prev.slaRules.map((r) => (r.id === rule.id ? { ...rule, id: rule.id! } : r)) };
      return { ...prev, slaRules: [...prev.slaRules, { ...rule, id: nextId(prev.slaRules) }] };
    });
  }, []);

  const toggleSla = useCallback((id: number) => {
    setDb((prev) => ({ ...prev, slaRules: prev.slaRules.map((r) => (r.id === id ? { ...r, active: !r.active } : r)) }));
  }, []);

  const deleteSla = useCallback((id: number) => {
    setDb((prev) => ({ ...prev, slaRules: prev.slaRules.filter((r) => r.id !== id) }));
  }, []);

  /* ---------------- mortgage checks ---------------- */

  const saveMortgageCheck = useCallback(
    (
      name: string,
      whatsapp: string,
      payload: string,
      summary: { income: number; emi: number; final: number; rate: number; tenorMonths: number; ltv: number; eligible: boolean }
    ): number => {
      const me = session;
      const newId = nextId(db.affordabilityChecks);
      setDb((prev) => {
        return {
          ...prev,
          affordabilityChecks: [
            ...prev.affordabilityChecks.filter((k) => k.id !== newId),
            {
              id: newId,
              caseId: null,
              customerName: name.trim(),
              monthlyIncome: summary.income,
              otherIncome: 0,
              existingEmis: summary.emi,
              age: 0,
              employmentType: "Salaried",
              propertyValue: 0,
              bank: "",
              interestRate: summary.rate,
              tenureYears: Math.round(summary.tenorMonths / 12),
              applicableLtv: summary.ltv,
              maxLoanByLtv: 0,
              maxDbrPct: 50,
              availableDbrEmi: 0,
              maxLoanByDbr: 0,
              maxTenureByAge: Math.round(summary.tenorMonths / 12),
              finalEligibleLoan: summary.final,
              estimatedEmi: summary.emi,
              eligible: summary.eligible,
              createdBy: me?.id ?? 0,
              createdAt: nowISO(),
              payload,
            },
          ],
        };
      });
      // whatsapp piggybacks on payload; keep param for future use
      void whatsapp;
      return newId;
    },
    [session, db.affordabilityChecks]
  );

  /* ---------------- admin: designations ---------------- */

  const addDesignation = useCallback(
    (name: string): string | null => {
      const clean = name.trim();
      if (!clean) return "Designation name cannot be empty.";
      if (db.designations.some((d) => d.name.toLowerCase() === clean.toLowerCase())) return "That designation already exists.";
      setDb((prev) => ({
        ...prev,
        designations: [
          ...prev.designations,
          { id: nextId(prev.designations), name: clean, scope: "own", issueTasks: false, admin: false, super: false, builtIn: false },
        ],
      }));
      return null;
    },
    [db.designations]
  );

  const updateDesignation = useCallback((id: number, patch: Partial<Omit<Designation, "id" | "builtIn" | "super">>) => {
    setDb((prev) => {
      const before = prev.designations.find((d) => d.id === id);
      if (!before) return prev;
      const users =
        patch.name !== undefined && patch.name !== before.name
          ? prev.users.map((u) => (u.role === before.name ? { ...u, role: patch.name as string } : u))
          : prev.users;
      return {
        ...prev,
        users,
        designations: prev.designations.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      };
    });
  }, []);

  const deleteDesignation = useCallback(
    (id: number): string | null => {
      const item = db.designations.find((d) => d.id === id);
      if (!item) return "Designation not found.";
      if (item.builtIn) return "Built-in designations cannot be deleted — deactivate isn't needed; just stop using it.";
      const used = db.users.filter((u) => u.role === item.name).length;
      if (used > 0) return `Blocked: ${used} user(s) still hold "${item.name}". Change their designation first.`;
      setDb((prev) => ({ ...prev, designations: prev.designations.filter((d) => d.id !== id) }));
      return null;
    },
    [db.designations, db.users]
  );

  const value: StoreShape = {
    db, session, route, toasts, nav, login, logout, toast, dismissToast,
    createCase, updateCase, deleteCase, setCaseState, createTask, updateTask, completeTask,
    addInstruction, completeInstruction, replyToInstruction,
    issueBulletin, completeBulletin, carryBulletin, dropBulletin, deleteBulletin, replyToBulletin,
    canInstruct, canAdmin,
    saveMortgageCheck, addDesignation, updateDesignation, deleteDesignation,
    runCheck, createCaseFromCheck, linkCheckToCase,
    saveUser, deleteUser, addMaster, toggleMaster, deleteMaster, moveStage,
    addBank, updateBankRate, toggleBank, deleteBank,
    addPartner, updatePartnerShare, togglePartner, deletePartner,
    saveSla, toggleSla, deleteSla,
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
  estCommission: number;
  escalations: number;
}

export function computeKpis(
  cases: LoanCase[],
  tasks: Task[],
  statusOf: (c: LoanCase) => "On Track" | "At Risk" | "Overdue" | "No Action",
  banks: BankItem[],
  escalations: number
): Kpis {
  const open = cases.filter((c) => c.caseStatus === "Active");
  let overdue = 0, atRisk = 0, noAction = 0, estCommission = 0;
  for (const c of open) {
    const s = statusOf(c);
    if (s === "Overdue") overdue += 1;
    else if (s === "At Risk") atRisk += 1;
    else if (s === "No Action") noAction += 1;
    const b = banks.find((x) => x.name === primaryBank(c));
    estCommission += b ? (c.loanAmount * b.ratePct) / 100 : 0;
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
    estCommission: Math.round(estCommission),
    escalations,
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

export function stageEnteredAt(c: LoanCase, activities: Activity[]): string {
  const moves = activities
    .filter((a) => a.caseId === c.id && a.action === "Stage moved" && a.newValue === c.stage)
    .sort((a, b) => b.at.localeCompare(a.at));
  return moves[0]?.at ?? c.createdAt;
}

export function slaFor(rules: SlaRule[], stage: string, bank: string | null): SlaRule | null {
  const candidates = rules.filter((r) => r.active && r.stage === stage);
  return candidates.find((r) => r.bank === bank) ?? candidates.find((r) => r.bank === null) ?? null;
}

export interface Escalation {
  c: LoanCase;
  rule: SlaRule;
  days: number;
}

export function computeEscalations(db: DB, cases: LoanCase[]): Escalation[] {
  const out: Escalation[] = [];
  for (const c of cases) {
    if (c.caseStatus !== "Active") continue;
    const bank = primaryBank(c);
    const rule = slaFor(db.slaRules, c.stage, bank);
    if (!rule) continue;
    const days = Math.max(0, daysBetween(stageEnteredAt(c, db.activities).slice(0, 10), todayISO()));
    if (days > rule.maxDays) out.push({ c, rule, days });
  }
  return out.sort((a, b) => b.days - a.days);
}

export { ageDays };
