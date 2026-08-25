import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { computeEscalations, useStore } from "../lib/store";
import type { Route } from "../lib/types";
import { inDaysISO } from "../lib/format";
import { Avatar, Chip, Modal } from "./ui";
import {
  IAlert, IBriefcase, ICalc, IChart, IGrid, ILogout, IPlus, IShield, ITasks, LogoMark,
} from "./icons";

function NewCaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, session, createCase, toast, nav } = useStore();
  const stages = [...db.stages].filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const owners = db.users.filter((u) => u.active);

  const [customer, setCustomer] = useState("");
  const [bank, setBank] = useState(db.banks[0]?.label ?? "");
  const [amount, setAmount] = useState("45");
  const [stage, setStage] = useState(stages[0]?.label ?? "");
  const [ownerId, setOwnerId] = useState(session?.id ?? 1);
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState(inDaysISO(3));
  const [waiting, setWaiting] = useState(db.waitingFor[0]?.label ?? "Client");
  const [why, setWhy] = useState(db.whyPending[0]?.label ?? "");
  const [err, setErr] = useState("");

  const submit = () => {
    const amt = parseFloat(amount);
    if (!customer.trim()) return setErr("Customer name is required.");
    if (Number.isNaN(amt) || amt <= 0) return setErr("Enter a valid loan amount (₹ lakh).");
    const c = createCase({
      customer,
      bank,
      loanAmount: Math.round(amt * 100000),
      stage,
      ownerId,
      task: desc.trim()
        ? { description: desc, ownerId, waitingFor: waiting, whyPending: why, dueDate: due }
        : undefined,
    });
    toast("success", `${c.caseNumber} created for ${c.customer}.`);
    onClose();
    setCustomer("");
    setDesc("");
    setErr("");
    nav({ name: "case", id: c.id });
  };

  if (!open) return null;
  return (
    <Modal onClose={onClose} title="New case" width={560}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Customer name</label>
          <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Ramesh Iyer" autoFocus />
        </div>
        <div>
          <label className="label">Bank</label>
          <select className="select" value={bank} onChange={(e) => setBank(e.target.value)}>
            {db.banks.filter((b) => b.active).map((b) => (
              <option key={b.id}>{b.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Loan amount (₹ L)</label>
          <input className="input mono" type="number" min="1" step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Stage</label>
          <select className="select" value={stage} onChange={(e) => setStage(e.target.value)}>
            {stages.map((s) => (
              <option key={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Owner</label>
          <select className="select" value={ownerId} onChange={(e) => setOwnerId(parseInt(e.target.value, 10))}>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 mt-1 pt-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
          <label className="label">First task (optional)</label>
          <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Collect KYC + income proof" />
        </div>
        <div>
          <label className="label">Due date</label>
          <input className="input mono" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div>
          <label className="label">Waiting for</label>
          <select className="select" value={waiting} onChange={(e) => setWaiting(e.target.value)}>
            {db.waitingFor.filter((w) => w.active).map((w) => (
              <option key={w.id}>{w.label}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Why pending</label>
          <select className="select" value={why} onChange={(e) => setWhy(e.target.value)}>
            {db.whyPending.filter((w) => w.active).map((w) => (
              <option key={w.id}>{w.label}</option>
            ))}
          </select>
        </div>
      </div>
      {err && <p className="text-[12.5px] mt-2 mb-0" style={{ color: "var(--coral)" }}>{err}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}>Create case</button>
      </div>
    </Modal>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { session, route, nav, logout, db, visibleCases } = useStore();
  const [now, setNow] = useState(new Date());
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const breaches = computeEscalations(db, visibleCases()).length;

  const navItems: { label: string; route: Route; icon: (p: { size?: number }) => ReactNode }[] = [
    { label: "Dashboard", route: { name: "dashboard" as const }, icon: IGrid },
    { label: "Task queue", route: { name: "tasks" as const }, icon: ITasks },
    { label: "Affordability", route: { name: "calculator" as const }, icon: ICalc },
    { label: "Reports", route: { name: "reports" as const }, icon: IChart },
  ];
  if (session?.role === "Admin") navItems.push({ label: "Admin", route: { name: "admin" as const }, icon: IShield });

  return (
    <div className="min-h-screen">
      <div className="app-bg" />
      <aside className="fixed left-0 top-0 bottom-0 w-[228px] border-r flex flex-col z-20" style={{ borderColor: "var(--line-soft)", background: "rgba(11, 23, 29, 0.92)", backdropFilter: "blur(8px)" }}>
        <div className="flex items-center gap-2.5 px-5 h-[60px] border-b" style={{ borderColor: "var(--line-soft)" }}>
          <LogoMark size={30} />
          <div className="leading-tight">
            <div className="font-disp font-bold text-[15px] tracking-tight">HFMC</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">Case Tracker</div>
          </div>
        </div>

        <nav className="p-3 space-y-1.5 flex-1">
          {navItems.map((n) => {
            const active = route.name === n.route.name || (route.name === "case" && n.route.name === "dashboard");
            const Icon = n.icon;
            return (
              <button key={n.label} className={`nav-item w-full text-left ${active ? "active" : ""}`} onClick={() => nav(n.route)}>
                <Icon size={17} />
                {n.label}
                {n.label === "Reports" && breaches > 0 && (
                  <span className="ml-auto chip" style={{ color: "var(--coral)", borderColor: "rgba(242,115,99,0.35)", background: "rgba(242,115,99,0.08)", padding: "1px 6px" }}>
                    {breaches}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: "var(--line-soft)" }}>
          {session && (
            <div className="flex items-center gap-2.5 px-2 py-2">
              <Avatar name={session.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">{session.name}</div>
                <div className="text-[11px] text-[var(--ink-faint)] truncate">{session.role} · {session.team}</div>
              </div>
              <button className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors" onClick={logout} title="Sign out">
                <ILogout size={17} />
              </button>
            </div>
          )}
        </div>
      </aside>

      <header className="fixed top-0 right-0 left-[228px] h-[60px] z-10 flex items-center gap-4 px-6 border-b" style={{ borderColor: "var(--line-soft)", background: "rgba(11, 23, 29, 0.85)", backdropFilter: "blur(8px)" }}>
        <div className="flex items-center gap-2">
          <span className="dot-live" />
          <span className="mono text-[11px] text-[var(--ink-dim)]">{now.toLocaleTimeString("en-IN", { hour12: false })} IST</span>
        </div>
        <span className="text-[12px] text-[var(--ink-faint)]">
          {now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {breaches > 0 && (
            <button className="flex items-center gap-1.5 text-[12px] transition-transform hover:scale-[1.03]" onClick={() => nav({ name: "reports" })} title="Open escalations report" style={{ color: "var(--coral)" }}>
              <IAlert size={15} />
              <span className="mono">{breaches} SLA breach{breaches > 1 ? "es" : ""}</span>
            </button>
          )}
          {session && (
            <Chip tone={session.role === "Admin" ? "coral" : session.role === "Team Lead" ? "sky" : "amber"}>
              <IBriefcase size={11} />
              {session.role}
            </Chip>
          )}
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <IPlus size={15} /> New case
          </button>
        </div>
      </header>

      <main className="pl-[228px] pt-[60px]">
        <div className="p-6 max-w-[1400px] mx-auto">{children}</div>
      </main>

      <NewCaseModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
