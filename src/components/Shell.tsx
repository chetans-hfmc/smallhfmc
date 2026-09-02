import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { CasePartner, CaseSource, Route } from "../lib/types";
import { PARTNER_SHARES, SOURCES } from "../lib/types";
import { bulletinVisible, computeEscalations, useStore } from "../lib/store";
import { fmtMoney, inDaysISO, todayISO } from "../lib/format";
import { Avatar, Chip, Modal, ThemeToggle } from "./ui";
import {
  IBank, IBriefcase, ICalc, IChart, IChevronL, IChevronR, IDownload, IFlag, IGrid, ILogout, IPlus, IShield, ITasks, LogoMark,
} from "./icons";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="mono text-[12px] text-[var(--ink-faint)] hidden md:inline-block">
      {now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}
      {" · "}
      {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
    </span>
  );
}

function MenuIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function NewCaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, session, createCase, toast, nav } = useStore();
  const stages = [...db.stages].filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const [customer, setCustomer] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [waGroup, setWaGroup] = useState("");
  const [banks, setBanks] = useState<string[]>([]);
  const [amount, setAmount] = useState("1500000");
  const [stage, setStage] = useState(stages[0]?.label ?? "WhatsApp Group Creation");
  const [ownerId, setOwnerId] = useState(session?.id ?? 0);
  const [source, setSource] = useState<CaseSource>("Direct");
  const [partnerName, setPartnerName] = useState("");
  const [share, setShare] = useState(20);
  const [customShare, setCustomShare] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskDue, setTaskDue] = useState(inDaysISO(3));
  const [err, setErr] = useState("");

  if (!open) return null;

  const needsPartner = source === "Agent" || source === "Broker" || source === "Referral";
  const partnerOptions = db.partners.filter((p) => p.active && p.kind === source);

  const toggleBank = (name: string) =>
    setBanks((prev) => (prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name]));

  const submit = () => {
    if (!customer.trim()) return setErr("Customer name is required.");
    const amt = Number(amount);
    if (!amt || amt <= 0) return setErr("Enter a valid loan amount in AED.");
    if (needsPartner && !partnerName) return setErr(`Pick the ${source.toLowerCase()} who sourced this case.`);
    const sharePct = share === 0 ? Number(customShare) : share;
    if (needsPartner && (!sharePct || sharePct <= 0 || sharePct > 100)) return setErr("Enter a valid partner share %.");
    const partner: CasePartner | null = needsPartner
      ? { kind: source as "Agent" | "Broker" | "Referral", name: partnerName, sharePct: sharePct }
      : null;
    const c = createCase({
      customer,
      banks,
      loanAmount: amt,
      stage,
      ownerId,
      source,
      partner,
      whatsapp,
      waGroup: waGroup.trim() || null,
      task: taskDesc.trim()
        ? { description: taskDesc, dueDate: taskDue, waitingFor: "Internal", whyPending: "Internal review", ownerId }
        : undefined,
    });
    toast("success", `${c.caseNumber} opened for ${c.customer}.`);
    setCustomer("");
    setWhatsapp("");
    setWaGroup("");
    setBanks([]);
    setTaskDesc("");
    setErr("");
    onClose();
    nav({ name: "case", id: c.id });
  };

  return (
    <Modal onClose={onClose} title="Open a new case" width={580}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Customer name</label>
            <input className="input" autoFocus value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Mohammed Al Mansoori" />
          </div>
          <div>
            <label className="label">Loan amount (AED)</label>
            <input className="input mono" type="number" min={0} step={10000} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Client WhatsApp</label>
            <input className="input mono" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+971 50 123 4567" />
          </div>
          <div>
            <label className="label">WhatsApp group link <span className="normal-case tracking-normal" style={{ color: "var(--ink-faint)" }}>— optional, paste the invite</span></label>
            <input className="input mono" value={waGroup} onChange={(e) => setWaGroup(e.target.value)} placeholder="https://chat.whatsapp.com/…" />
          </div>
        </div>

        <div>
          <label className="label">Banks submitted to <span className="normal-case tracking-normal" style={{ color: "var(--ink-faint)" }}>— leave none for “bank not yet decided”</span></label>
          <div className="flex flex-wrap gap-1.5">
            {db.banks.filter((b) => b.active).map((b) => {
              const on = banks.includes(b.name);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBank(b.name)}
                  className="chip transition-all"
                  style={
                    on
                      ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" }
                      : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }
                  }
                >
                  {b.name} <span className="opacity-70">{b.ratePct}%</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--ink-faint)] mt-1.5 mb-0">
            Multiple banks can be in play — the winning bank is recorded when the case books. Percentages shown are our commission rate.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Stage</label>
            <select className="select" value={stage} onChange={(e) => setStage(e.target.value)}>
              {stages.map((s) => (
                <option key={s.id} value={s.label}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Case owner</label>
            <select className="select" value={ownerId} onChange={(e) => setOwnerId(parseInt(e.target.value, 10))}>
              {db.users.filter((u) => u.active && u.role !== "Head of Company" && u.role !== "PA to HoC").map((u) => (
                <option key={u.id} value={u.id}>{u.name} · {u.role}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Where did it come from?</label>
            <select
              className="select"
              value={source}
              onChange={(e) => {
                setSource(e.target.value as CaseSource);
                setPartnerName("");
              }}
            >
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {needsPartner && (
          <div className="rounded-lg p-3 anim-fade-up" style={{ background: "rgba(242,176,76,0.05)", border: "1px solid rgba(242,176,76,0.2)" }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">{source} name</label>
                {partnerOptions.length === 0 ? (
                  <p className="text-[12px] text-[var(--ink-faint)] m-0 py-2">No {source.toLowerCase()}s registered yet — add them in Admin → Partners.</p>
                ) : (
                  <select className="select" value={partnerName} onChange={(e) => setPartnerName(e.target.value)}>
                    <option value="">Select…</option>
                    {partnerOptions.map((p) => (
                      <option key={p.id} value={p.name}>{p.name} (default {p.defaultSharePct}%)</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="label">Their share of our commission</label>
                <div className="flex flex-wrap gap-1.5">
                  {PARTNER_SHARES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="chip transition-all"
                      onClick={() => setShare(s)}
                      style={
                        share === s
                          ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" }
                          : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }
                      }
                    >
                      {s}%
                    </button>
                  ))}
                  <button
                    type="button"
                    className="chip transition-all"
                    onClick={() => setShare(0)}
                    style={
                      share === 0
                        ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" }
                        : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }
                    }
                  >
                    Custom
                  </button>
                  {share === 0 && (
                    <input
                      className="input mono"
                      style={{ width: 84 }}
                      type="number"
                      min={1}
                      max={100}
                      placeholder="%"
                      value={customShare}
                      onChange={(e) => setCustomShare(e.target.value)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="label">First task (optional)</label>
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <input className="input" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="e.g. Collect KYC & income documents" />
            <input className="input mono" type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
          </div>
        </div>
      </div>

      {err && <p className="text-[12.5px] mt-2.5 mb-0" style={{ color: "var(--coral)" }}>{err}</p>}

      <div className="flex items-center justify-between gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
        <span className="text-[11.5px] text-[var(--ink-faint)]">
          {banks.length === 0 ? <Chip tone="slate">Bank TBC</Chip> : `${banks.length} bank${banks.length > 1 ? "s" : ""} in play`}
        </span>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Open case</button>
        </div>
      </div>
    </Modal>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { db, session, route, nav, logout, visibleCases, canInstruct, toast } = useStore();
  const [showNew, setShowNew] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("hfmc.sidebar.collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const doInstall = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    const choice = await installEvt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallEvt(null);
      toast("success", "HFMC installed — find it on your home screen.");
    }
  };

  const toggleCollapse = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("hfmc.sidebar.collapsed", c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const breaches = computeEscalations(db, visibleCases()).length;
  const openInstr = db.instructions.filter((i) => i.status === "Open").length;
  const pipeline = visibleCases().filter((c) => c.caseStatus === "Active").reduce((s, c) => s + c.loanAmount, 0);
  const isAdmin = session?.role === "Head of Company" || session?.role === "Mortgage Head";

  const myOpenDirectives = session
    ? db.bulletin.filter((b) => !b.isTemplate && !b.dropped && b.date === todayISO() && b.status === "Open" && bulletinVisible(b, session, db) && b.targets.includes(session.id)).length
    : 0;

  const navItems: { label: string; route: Route; icon: (p: { size?: number; className?: string }) => ReactNode; badge?: number }[] = [
    { label: "Dashboard", route: { name: "dashboard" as const }, icon: IGrid },
    { label: "Morning Bulletin", route: { name: "bulletin" as const }, icon: IFlag, badge: myOpenDirectives },
    { label: "Calculator", route: { name: "calculator" as const }, icon: ICalc },
    { label: "Task Queue", route: { name: "tasks" as const }, icon: ITasks },
    { label: "Reports", route: { name: "reports" as const }, icon: IChart },
    ...(isAdmin ? [{ label: "Admin", route: { name: "admin" as const }, icon: IShield }] : []),
  ];

  const title =
    route.name === "dashboard" ? "Dashboard" :
    route.name === "case" ? "Case 360" :
    route.name === "tasks" ? "Task Queue" :
    route.name === "bulletin" ? "Morning Bulletin" :
    route.name === "calculator" ? "Calculator" :
    route.name === "reports" ? "Reports" : "Admin";

  const go = (r: Route) => {
    nav(r);
    setMobileOpen(false);
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <div className="app-bg" />

      {/* mobile scrim */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden anim-fade-in"
          style={{ background: "rgba(4, 10, 13, 0.6)", backdropFilter: "blur(2px)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* sidebar — off-canvas drawer on mobile, collapsible rail on desktop */}
      <aside
        className={`side-dark shrink-0 border-r flex flex-col z-50
          fixed inset-y-0 left-0 w-[268px] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:static lg:translate-x-0 lg:transition-[width]
          ${mobileOpen ? "translate-x-0 shadow-[24px_0_60px_-20px_rgba(0,0,0,0.7)]" : "-translate-x-full"}
          ${collapsed ? "lg:w-[70px]" : "lg:w-[232px]"}`}
        style={{ borderColor: "#18313b", background: "rgba(11,23,29,0.94)", backdropFilter: "blur(8px)" }}
      >
        <div className={`flex items-center gap-2.5 px-4 pt-safe py-4 ${collapsed ? "lg:px-0 lg:justify-center" : ""}`}>
          <LogoMark size={30} />
          <div className={collapsed ? "lg:hidden" : ""}>
            <div className="font-disp font-bold text-[15px] tracking-[0.04em] leading-none">HFMC</div>
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-[var(--ink-faint)] mt-1">Mortgage · UAE</div>
          </div>
          {/* collapse toggle — desktop only */}
          <button
            className="hidden lg:inline-flex ml-auto btn btn-ghost btn-sm !px-1.5 !py-1.5"
            onClick={toggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <IChevronR size={14} /> : <IChevronL size={14} />}
          </button>
          {/* close drawer — mobile only */}
          <button className="lg:hidden ml-auto text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors p-1" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <nav className={`px-3 mt-2 space-y-1 flex-1 overflow-y-auto scroll-slim ${collapsed ? "lg:px-2" : ""}`}>
          {navItems.map((n) => {
            const active = route.name === n.route.name || (route.name === "case" && n.route.name === "dashboard");
            return (
              <button
                key={n.label}
                title={n.label}
                className={`nav-item w-full text-left ${active ? "active" : ""} ${collapsed ? "lg:rail-btn" : ""}`}
                onClick={() => go(n.route)}
              >
                <n.icon size={17} />
                <span className={collapsed ? "lg:hidden" : ""}>{n.label}</span>
                {!!n.badge && n.badge > 0 && (
                  <span
                    className={`ml-auto mono text-[10px] px-1.5 py-0.5 rounded-full ${collapsed ? "lg:hidden" : ""}`}
                    style={{ background: "rgba(242,176,76,0.18)", color: "var(--amber)", border: "1px solid rgba(242,176,76,0.4)" }}
                  >
                    {n.badge}
                  </span>
                )}
                {n.label === "Task Queue" && openInstr > 0 && canInstruct() && (
                  <span className={`ml-auto mono text-[10px] px-1.5 py-0.5 rounded ${collapsed ? "lg:hidden" : ""}`} style={{ background: "rgba(87,194,234,0.15)", color: "var(--sky)" }}>
                    {openInstr}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className={`p-3 pt-safe ${collapsed ? "lg:p-2" : ""}`}>
          {/* live pipeline mini-panel */}
          <div className={`card p-3 mb-2 ${collapsed ? "lg:p-2 lg:text-center" : ""}`}>
            <div className={`text-[10.5px] uppercase tracking-[0.12em] text-[var(--ink-faint)] font-disp font-semibold mb-1.5 ${collapsed ? "lg:hidden" : ""}`}>SLA breaches</div>
            <div className={`flex items-center gap-2 ${collapsed ? "lg:justify-center" : ""}`}>
              {breaches > 0 ? <span className="dot-overdue" /> : <span className="dot-live" />}
              <span className="font-disp font-bold text-[20px]" style={{ color: breaches > 0 ? "var(--coral)" : "var(--mint)" }}>{breaches}</span>
              <span className={`text-[11px] text-[var(--ink-faint)] ${collapsed ? "lg:hidden" : ""}`}>stage{breaches === 1 ? "" : "s"} past SLA</span>
            </div>
            <div className={`mt-2 pt-2 text-[11px] text-[var(--ink-faint)] ${collapsed ? "lg:hidden" : ""}`} style={{ borderTop: "1px dashed var(--line)" }}>
              Active pipeline <span className="mono text-[var(--ink-dim)]">{fmtMoney(pipeline)}</span>
            </div>
          </div>

          {/* install affordance — appears when the browser offers it */}
          {installEvt && (
            <button className={`btn btn-ghost btn-sm w-full justify-center mb-2 ${collapsed ? "lg:!px-1" : ""}`} onClick={doInstall} title="Install HFMC on this device">
              <IDownload size={13} />
              <span className={collapsed ? "lg:hidden" : ""}>Install app</span>
            </button>
          )}

          <div className={`flex items-center gap-2.5 px-2 py-2 rounded-lg ${collapsed ? "lg:px-1 lg:justify-center" : ""}`} style={{ background: "var(--tint)" }}>
            <Avatar name={session?.name ?? "?"} size={32} />
            <div className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
              <div className="text-[12.5px] font-medium truncate">{session?.name}</div>
              <div className="text-[10.5px] text-[var(--ink-faint)] truncate">{session?.role}</div>
            </div>
            <button className={`text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors ${collapsed ? "lg:hidden" : ""}`} onClick={logout} title="Sign out">
              <ILogout size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="pt-safe h-[54px] shrink-0 border-b flex items-center gap-3 px-3.5 sm:px-5"
          style={{ borderColor: "var(--line-soft)", background: "color-mix(in srgb, var(--bg) 78%, transparent)", backdropFilter: "blur(6px)" }}
        >
          <button className="lg:hidden btn btn-ghost btn-sm !px-2" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <MenuIcon />
          </button>
          <h1 className="font-disp font-semibold text-[15px] sm:text-[16px] m-0 truncate">{title}</h1>
          {route.name === "case" && (
            <span className="text-[12px] text-[var(--ink-faint)] hidden sm:inline">the full story of one file</span>
          )}
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Clock />
            <ThemeToggle compact />
            <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
              <IPlus size={14} /> <span className="hidden min-[420px]:inline">New case</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div key={JSON.stringify(route)} className="max-w-[1240px] mx-auto px-3.5 sm:px-5 py-4 sm:py-5 anim-fade-in pb-8 xl:pb-5">
            {children}
          </div>
        </main>
      </div>

      <NewCaseModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
