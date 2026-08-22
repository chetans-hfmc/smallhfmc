import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useStore } from "../lib/store";
import type { NewCaseInput, } from "../lib/store";
import type { Route } from "../lib/types";
import { BANKS } from "../lib/data";
import { caseStatusOf, inDaysISO, todayISO } from "../lib/format";
import { Avatar, Chip, Modal } from "./ui";
import {
  LogoMark, IGrid, ITasks, IChart, IShield, ILogout, IPlus, IBriefcase,
} from "./icons";

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-lg" style={{ border: "1px solid var(--line-soft)", background: "var(--bg2)" }}>
      <span className="dot-live" />
      <span className="mono text-[12px] text-[var(--ink-dim)]">
        {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
      </span>
    </div>
  );
}

const NAV: { route: Route; label: string; icon: (p: { size?: number }) => ReactNode; adminOnly?: boolean }[] = [
  { route: { name: "dashboard" }, label: "Dashboard", icon: (p) => <IGrid {...p} /> },
  { route: { name: "tasks" }, label: "Task Queue", icon: (p) => <ITasks {...p} /> },
  { route: { name: "reports" }, label: "Reports", icon: (p) => <IChart {...p} /> },
  { route: { name: "admin" }, label: "Admin", icon: (p) => <IShield {...p} />, adminOnly: true },
];

function NewCaseModal({ onClose }: { onClose: () => void }) {
  const { db, session, createCase, nav, toast } = useStore();
  const assignable = db.users.filter((u) => u.active && u.role !== "Admin");
  const [customer, setCustomer] = useState("");
  const [bank, setBank] = useState(BANKS[0]);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState(db.stages[0]?.label ?? "New Login");
  const [ownerId, setOwnerId] = useState<number>(
    session && session.role !== "Admin" ? session.id : assignable[0]?.id ?? 0
  );
  const [tDesc, setTDesc] = useState("");
  const [tDue, setTDue] = useState(inDaysISO(5));
  const [tWaiting, setTWaiting] = useState(db.waitingFor[0]?.label ?? "Client");
  const [tWhy, setTWhy] = useState(db.whyPending[0]?.label ?? "");
  const [err, setErr] = useState("");

  const submit = () => {
    const amt = parseFloat(amount);
    if (!customer.trim()) return setErr("Customer name is required.");
    if (!amt || amt <= 0) return setErr("Enter a valid loan amount in lakhs.");
    if (tDesc.trim() && !tDue) return setErr("Pick a due date for the first task.");
    const input: NewCaseInput = {
      customer,
      bank,
      loanAmount: Math.round(amt * 100000),
      stage,
      ownerId,
      task: tDesc.trim()
        ? { description: tDesc, dueDate: tDue, waitingFor: tWaiting, whyPending: tWhy, ownerId }
        : undefined,
    };
    const c = createCase(input);
    toast("success", `${c.caseNumber} created for ${c.customer}.`);
    onClose();
    nav({ name: "case", id: c.id });
  };

  const sortedStages = [...db.stages].filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Modal title="New case" sub="Log a fresh login into the shared pipeline" onClose={onClose} width={520}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}><IPlus size={15} /> Create case</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2">
          <label className="label">Customer name</label>
          <input className="input" placeholder="e.g. Ramesh Iyer" value={customer} onChange={(e) => setCustomer(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Bank / lender</label>
          <select className="select" value={bank} onChange={(e) => setBank(e.target.value)}>
            {BANKS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Loan amount (₹ lakh)</label>
          <input className="input mono" type="number" min="1" placeholder="45" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Stage</label>
          <select className="select" value={stage} onChange={(e) => setStage(e.target.value)}>
            {sortedStages.filter((s) => s.label !== "Closed").map((s) => <option key={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Case owner</label>
          <select className="select" value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value))}>
            {assignable.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 pt-4" style={{ borderTop: "1px dashed var(--line)" }}>
        <p className="font-disp text-[11px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-faint)] mb-2.5 mt-0">
          First task <span className="normal-case tracking-normal font-normal">(optional — a case without a task shows “No Action”)</span>
        </p>
        <div className="grid grid-cols-2 gap-3.5">
          <div className="col-span-2">
            <input className="input" placeholder="e.g. Collect KYC + income proof set" value={tDesc} onChange={(e) => setTDesc(e.target.value)} />
          </div>
          <div>
            <label className="label">Due date</label>
            <input className="input mono" type="date" min={todayISO()} value={tDue} onChange={(e) => setTDue(e.target.value)} />
          </div>
          <div>
            <label className="label">Waiting for</label>
            <select className="select" value={tWaiting} onChange={(e) => setTWaiting(e.target.value)}>
              {db.waitingFor.filter((w) => w.active).map((w) => <option key={w.id}>{w.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Why pending</label>
            <select className="select" value={tWhy} onChange={(e) => setTWhy(e.target.value)}>
              {db.whyPending.filter((w) => w.active).map((w) => <option key={w.id}>{w.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {err && <p className="text-[12.5px] mt-3 mb-0" style={{ color: "var(--coral)" }}>{err}</p>}
    </Modal>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { route, session, nav, logout, db, visibleCases, visibleTasks, toast } = useStore();
  const [mobileNav, setMobileNav] = useState(false);
  const [newCase, setNewCase] = useState(false);

  const openTaskCount = useMemo(() => visibleTasks().filter((t) => t.status === "Open").length, [visibleTasks]);
  const pulse = useMemo(() => {
    const cases = visibleCases();
    const count = (s: string) => cases.filter((c) => c.stage !== "Closed" && caseStatusOf(c, db.tasks) === s).length;
    return [
      { label: "On Track", n: count("On Track"), color: "var(--mint)" },
      { label: "At Risk", n: count("At Risk"), color: "var(--amber)" },
      { label: "Overdue", n: count("Overdue"), color: "var(--coral)" },
      { label: "No Action", n: count("No Action"), color: "var(--slate)" },
    ];
  }, [visibleCases, db.tasks]);

  if (!session) return null;

  const titles: Record<string, { t: string; s: string }> = {
    dashboard: { t: "Pipeline Dashboard", s: "Every case in flight, one honest view" },
    tasks: { t: "Task Queue", s: "Open work across the team — oldest and overdue first" },
    reports: { t: "Standing Reports", s: "Six reports the review meeting always asks for" },
    admin: { t: "Admin Console", s: "Users, roles and master lists" },
    case: { t: "Case 360", s: "Stage, task, waiting-for and full history" },
  };
  const head = titles[route.name];
  const navItems = NAV.filter((n) => !n.adminOnly || session.role === "Admin");

  const sidebar = (
    <div className="flex flex-col h-full">
      <button className="flex items-center gap-3 px-4 pt-5 pb-4 text-left w-full" onClick={() => nav({ name: "dashboard" })}>
        <LogoMark size={34} />
        <span>
          <span className="font-disp font-bold text-[15.5px] leading-none block tracking-tight">Case Tracker</span>
          <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)] block mt-1">HFMC · Home Finance</span>
        </span>
      </button>

      <nav className="px-3 space-y-1 mt-2">
        {navItems.map((n) => {
          const active = route.name === n.route.name || (route.name === "case" && n.route.name === "dashboard");
          return (
            <button key={n.label} className={`nav-item w-full ${active ? "active" : ""}`} onClick={() => { nav(n.route); setMobileNav(false); }}>
              {n.icon({ size: 17 })}
              <span className="flex-1 text-left">{n.label}</span>
              {n.route.name === "tasks" && openTaskCount > 0 && (
                <span className="mono text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: "rgba(242,176,76,0.14)", color: "var(--amber)" }}>
                  {openTaskCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mx-3 mt-6 p-3 rounded-lg" style={{ border: "1px solid var(--line-soft)", background: "rgba(11,23,29,0.5)" }}>
        <p className="font-disp text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[var(--ink-faint)] mt-0 mb-2.5">Pipeline pulse</p>
        <div className="space-y-1.5">
          {pulse.map((p) => (
            <div key={p.label} className="flex items-center gap-2 text-[12px]">
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: p.color }} />
              <span className="text-[var(--ink-dim)]">{p.label}</span>
              <span className="mono ml-auto text-[var(--ink)]">{p.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto p-3">
        <div className="flex items-center gap-2.5 p-2.5 rounded-lg" style={{ border: "1px solid var(--line-soft)", background: "var(--bg2)" }}>
          <Avatar name={session.name} size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold truncate m-0 leading-tight">{session.name}</p>
            <p className="text-[11px] text-[var(--ink-faint)] m-0">{session.role} · {session.team}</p>
          </div>
          <button
            className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors p-1.5"
            onClick={() => { logout(); toast("info", "Signed out. See you tomorrow."); }}
            aria-label="Sign out"
            title="Sign out"
          >
            <ILogout size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="app-bg" />

      {/* desktop sidebar */}
      <aside className="hidden md:block fixed inset-y-0 left-0 w-[236px] z-30" style={{ borderRight: "1px solid var(--line-soft)", background: "rgba(14,29,36,0.88)", backdropFilter: "blur(6px)" }}>
        {sidebar}
      </aside>

      {/* mobile sidebar */}
      {mobileNav && (
        <div className="md:hidden fixed inset-0 z-40 anim-fade-in" style={{ background: "rgba(6,13,17,0.7)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setMobileNav(false); }}>
          <aside className="w-[248px] h-full anim-slide-right" style={{ background: "var(--bg2)", borderRight: "1px solid var(--line)" }}>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="md:pl-[236px]">
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 md:px-7 h-[60px]" style={{ borderBottom: "1px solid var(--line-soft)", background: "rgba(11,23,29,0.85)", backdropFilter: "blur(8px)" }}>
          <button className="md:hidden btn btn-ghost btn-sm !px-2" onClick={() => setMobileNav(true)} aria-label="Open menu">
            <IGrid size={17} />
          </button>
          <div className="min-w-0">
            <h1 className="font-disp font-semibold text-[16.5px] leading-tight m-0 truncate">{head.t}</h1>
            <p className="text-[11.5px] text-[var(--ink-faint)] m-0 hidden sm:block truncate">{head.s}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <LiveClock />
            {route.name !== "case" && (
              <button className="btn btn-primary" onClick={() => setNewCase(true)}>
                <IPlus size={15} /> <span className="hidden sm:inline">New case</span><span className="sm:hidden">New</span>
              </button>
            )}
          </div>
        </header>

        <main className="px-4 md:px-7 py-6 max-w-[1240px]">{children}</main>

        <footer className="px-4 md:px-7 pb-6 max-w-[1240px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink-faint)] pt-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <span className="flex items-center gap-1.5"><IBriefcase size={13} /> HFMC Case Tracker · internal build</span>
            <span className="mono">{db.cases.length} cases · {db.users.length} users on record</span>
            <span className="ml-auto mono">data syncs to this browser’s local store</span>
          </div>
        </footer>
      </div>

      {newCase && <NewCaseModal onClose={() => setNewCase(false)} />}
    </div>
  );
}
