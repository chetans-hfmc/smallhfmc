import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { activityPerDay, computeKpis, useStore } from "../lib/store";
import type { CaseStatus, LoanCase, Task } from "../lib/types";
import { TONE_HEX, ageDays, caseStatusOf, fmtMoney, relTime, todayISO } from "../lib/format";
import { Avatar, Chip, DueChip, EmptyState, StatusChip } from "../components/ui";
import { BarList, Donut, Spark, useCountUp } from "../components/charts";
import { IAlert, IBriefcase, IClock, IInbox, ISearch, IZap } from "../components/icons";

function StatCard({ label, value, sub, color, icon, pulse }: { label: string; value: ReactNode; sub: string; color: string; icon: ReactNode; pulse?: boolean }) {
  return (
    <div className="card card-hover p-4 relative overflow-hidden">
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: color }} />
      <div className="flex items-center justify-between">
        <p className="font-disp text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)] m-0">{label}</p>
        <span style={{ color, opacity: 0.9 }} className={pulse ? "blink" : ""}>{icon}</span>
      </div>
      <p className="font-disp font-bold text-[27px] leading-none mt-2.5 mb-1 mono" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p className="text-[11.5px] text-[var(--ink-faint)] m-0 truncate">{sub}</p>
    </div>
  );
}

type SortKey = "urgency" | "newest" | "amount" | "ageing";
const STATUS_RANK: Record<CaseStatus, number> = { Overdue: 0, "At Risk": 1, "No Action": 2, "On Track": 3 };

export default function Dashboard() {
  const { db, nav, visibleCases, visibleTasks, userById, session } = useStore();
  const [query, setQuery] = useState("");
  const [stageF, setStageF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [sort, setSort] = useState<SortKey>("urgency");

  const cases = useMemo(() => visibleCases(), [visibleCases]);
  const tasks = useMemo(() => visibleTasks(), [visibleTasks]);
  const statusOf = useMemo(() => (c: LoanCase) => caseStatusOf(c, db.tasks), [db.tasks]);
  const nextTaskOf = useMemo(() => {
    const m = new Map<number, Task>();
    for (const t of tasks) {
      if (t.status !== "Open") continue;
      const cur = m.get(t.caseId);
      if (!cur || t.dueDate < cur.dueDate) m.set(t.caseId, t);
    }
    return m;
  }, [tasks]);

  const kpis = useMemo(() => computeKpis(cases, tasks, statusOf), [cases, tasks, statusOf]);
  const spark = useMemo(() => {
    const ids = new Set(cases.map((c) => c.id));
    return activityPerDay(db.activities.filter((a) => ids.has(a.caseId)), 14);
  }, [db.activities, cases]);
  const sparkTotal = spark.reduce((a, b) => a + b, 0);
  const pipelineL = useCountUp(Math.round(kpis.pipelineValue / 100000));

  const stages = useMemo(() => [...db.stages].sort((a, b) => a.sortOrder - b.sortOrder), [db.stages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = cases.filter((c) => {
      if (stageF !== "all" && c.stage !== stageF) return false;
      if (statusF !== "all" && statusOf(c) !== statusF) return false;
      if (q) {
        const owner = userById(c.ownerId)?.name.toLowerCase() ?? "";
        const hay = `${c.caseNumber} ${c.customer} ${c.bank} ${owner}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const due = (c: LoanCase) => nextTaskOf.get(c.id)?.dueDate ?? "9999-99-99";
    if (sort === "urgency")
      list = [...list].sort((a, b) => {
        const closed = (x: LoanCase) => (x.stage === "Closed" ? 1 : 0);
        return closed(a) - closed(b) || STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)] || due(a).localeCompare(due(b));
      });
    else if (sort === "newest") list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === "amount") list = [...list].sort((a, b) => b.loanAmount - a.loanAmount);
    else list = [...list].sort((a, b) => ageDays(b.createdAt) - ageDays(a.createdAt));
    return list;
  }, [cases, query, stageF, statusF, sort, statusOf, userById, nextTaskOf]);

  const openTasks = tasks.filter((t) => t.status === "Open");
  const donutSegs = useMemo(() => {
    const palette = ["#f2b04c", "#57c2ea", "#43d69b", "#f27363", "#b48ef2", "#8ca6b0"];
    return db.waitingFor
      .map((w, i) => ({ label: w.label, value: openTasks.filter((t) => t.waitingFor === w.label).length, color: palette[i % palette.length] }))
      .filter((s) => s.value > 0);
  }, [db.waitingFor, openTasks]);

  const whyBars = useMemo(() => {
    const counts = db.whyPending
      .map((w) => ({ label: w.label, value: openTasks.filter((t) => t.whyPending === w.label).length, color: TONE_HEX.amber }))
      .filter((w) => w.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    return counts;
  }, [db.whyPending, openTasks]);

  const ownerBars = useMemo(() => {
    const owners = Array.from(new Set(openTasks.map((t) => t.ownerId)))
      .map((id) => ({ id, name: userById(id)?.name ?? "Unassigned", open: openTasks.filter((t) => t.ownerId === id).length, od: openTasks.filter((t) => t.ownerId === id && t.dueDate < todayISO()).length }))
      .sort((a, b) => b.open - a.open);
    return {
      owners,
      items: owners.map((o) => ({ label: o.name, value: o.open, color: TONE_HEX.mint, sub: o.od > 0 ? `· ${o.od} overdue` : undefined })),
    };
  }, [openTasks, userById]);

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 stagger">
        <StatCard label="Cases in flight" value={kpis.openCases} sub={`${cases.length - kpis.openCases} closed · all time`} color={TONE_HEX.sky} icon={<IBriefcase size={16} />} />
        <StatCard label="Overdue" value={kpis.overdue} sub={kpis.overdue > 0 ? "needs today’s attention" : "nothing slipping"} color={TONE_HEX.coral} icon={<IAlert size={16} />} pulse={kpis.overdue > 0} />
        <StatCard label="At risk" value={kpis.atRisk} sub="due within 48 hours" color={TONE_HEX.amber} icon={<IClock size={16} />} />
        <StatCard label="No next action" value={kpis.noAction} sub="open cases without a task" color={TONE_HEX.slate} icon={<IInbox size={16} />} />
        <StatCard label="Open tasks" value={kpis.openTasks} sub={`${kpis.dueToday} due today`} color="#b48ef2" icon={<IZap size={16} />} />
        <div className="card card-hover p-4 relative overflow-hidden">
          <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: TONE_HEX.amber }} />
          <div className="flex items-center justify-between">
            <p className="font-disp text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)] m-0">Team activity</p>
            <span className="text-[var(--ink-faint)]"><IZap size={15} /></span>
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              <p className="font-disp font-bold text-[22px] leading-none mono">{sparkTotal}</p>
              <p className="text-[11px] text-[var(--ink-faint)] mt-1 mb-0">actions · 14d</p>
            </div>
            <Spark points={spark} color={TONE_HEX.amber} width={96} height={34} />
          </div>
        </div>
      </div>

      {/* main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* case table */}
        <div className="xl:col-span-2 card anim-fade-up">
          <div className="flex flex-wrap items-center gap-2.5 px-4 pt-4 pb-3">
            <div>
              <h2 className="font-disp font-semibold text-[15px] m-0">Case book</h2>
              <p className="text-[11.5px] text-[var(--ink-faint)] m-0">{filtered.length} of {cases.length} shown · pipeline {fmtMoney(kpis.pipelineValue)}</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"><ISearch size={14} /></span>
                <input className="input !pl-8 !py-[6.5px] w-[168px]" placeholder="Search cases…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="select !w-auto !py-[6.5px] text-[12.5px]" value={stageF} onChange={(e) => setStageF(e.target.value)}>
                <option value="all">All stages</option>
                {stages.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
              </select>
              <select className="select !w-auto !py-[6.5px] text-[12.5px]" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
                <option value="all">All status</option>
                <option>On Track</option><option>At Risk</option><option>Overdue</option><option>No Action</option>
              </select>
              <select className="select !w-auto !py-[6.5px] text-[12.5px]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="urgency">Sort · urgency</option>
                <option value="newest">Sort · newest</option>
                <option value="amount">Sort · amount</option>
                <option value="ageing">Sort · oldest</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<ISearch size={20} />} title="No cases match" body="Loosen the filters or clear the search to see the full book." />
          ) : (
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="tbl min-w-[760px]">
                <thead>
                  <tr>
                    <th>Case</th><th>Customer</th><th>Amount</th><th>Stage</th><th>Owner</th><th>Next action</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const owner = userById(c.ownerId);
                    const nt = nextTaskOf.get(c.id);
                    const st = statusOf(c);
                    const closed = c.stage === "Closed";
                    return (
                      <tr key={c.id} onClick={() => nav({ name: "case", id: c.id })} style={{ opacity: closed ? 0.55 : 1 }}>
                        <td className="mono text-[12px] whitespace-nowrap" style={{ color: "var(--amber)" }}>{c.caseNumber}</td>
                        <td>
                          <p className="font-medium m-0 leading-tight">{c.customer}</p>
                          <p className="text-[11px] text-[var(--ink-faint)] m-0">{c.bank} · {ageDays(c.createdAt)}d old</p>
                        </td>
                        <td className="mono whitespace-nowrap">{fmtMoney(c.loanAmount)}</td>
                        <td><Chip tone={closed ? "mint" : "sky"}>{c.stage}</Chip></td>
                        <td>
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <Avatar name={owner?.name ?? "?"} size={24} />
                            <span className="text-[12.5px]">{owner?.name.split(" ")[0] ?? "—"}</span>
                          </span>
                        </td>
                        <td className="max-w-[220px]">
                          {nt ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[12.5px] text-[var(--ink-dim)] truncate">{nt.description}</span>
                              <span className="shrink-0"><DueChip dueISO={nt.dueDate} /></span>
                            </div>
                          ) : (
                            <span className="text-[12px] text-[var(--ink-faint)] italic">{closed ? "file archived" : "no task open"}</span>
                          )}
                        </td>
                        <td>{closed ? <Chip tone="mint">Closed</Chip> : <StatusChip status={st} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* right rail */}
        <div className="space-y-4">
          <div className="card p-4 anim-fade-up">
            <h3 className="font-disp font-semibold text-[13.5px] m-0">Waiting for</h3>
            <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-4">Where open tasks are stuck</p>
            {donutSegs.length ? (
              <Donut segments={donutSegs} centerLabel="open" size={138} />
            ) : (
              <p className="text-[12.5px] text-[var(--ink-faint)]">No open tasks in your scope.</p>
            )}
          </div>
          <div className="card p-4 anim-fade-up">
            <h3 className="font-disp font-semibold text-[13.5px] m-0">Why pending</h3>
            <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-4">Top blockers right now</p>
            {whyBars.length ? (
              <BarList items={whyBars} />
            ) : (
              <p className="text-[12.5px] text-[var(--ink-faint)]">Nothing pending.</p>
            )}
          </div>
        </div>
      </div>

      {/* owner workload */}
      <div className="card p-4 anim-fade-up">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h3 className="font-disp font-semibold text-[13.5px] m-0">Owner workload</h3>
            <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-0">Open tasks per teammate{session?.role === "Admin" || session?.role === "Team Lead" ? "" : " · your view"}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => nav({ name: "reports" })}>Full report →</button>
        </div>
        {ownerBars.items.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <BarList items={ownerBars.items.slice(0, Math.ceil(ownerBars.items.length / 2))} />
            {ownerBars.items.length > 1 && <BarList items={ownerBars.items.slice(Math.ceil(ownerBars.items.length / 2))} />}
          </div>
        ) : (
          <p className="text-[12.5px] text-[var(--ink-faint)]">No open tasks assigned yet.</p>
        )}
      </div>

      {/* recent activity ticker */}
      <div className="card p-4 anim-fade-up">
        <h3 className="font-disp font-semibold text-[13.5px] mb-3 mt-0">Latest activity</h3>
        <div className="space-y-2">
          {[...db.activities]
            .filter((a) => cases.some((c) => c.id === a.caseId))
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 6)
            .map((a) => {
              const c = db.cases.find((x) => x.id === a.caseId);
              const u = userById(a.userId);
              return (
                <button key={a.id} className="w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-lg transition-colors hover:bg-[rgba(232,241,239,0.04)]" onClick={() => nav({ name: "case", id: a.caseId })}>
                  <Avatar name={u?.name ?? "System"} size={24} />
                  <span className="text-[12.5px] min-w-0 flex-1 truncate">
                    <b>{u?.name ?? "System"}</b>
                    <span className="text-[var(--ink-dim)]"> · {a.action.toLowerCase()}{a.newValue ? ` → ${a.newValue}` : ""} · </span>
                    <span className="mono text-[var(--amber)]">{c?.caseNumber ?? "—"}</span>
                  </span>
                  <span className="mono text-[11px] text-[var(--ink-faint)] shrink-0">{relTime(a.at)}</span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
