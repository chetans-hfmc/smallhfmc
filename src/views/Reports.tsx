import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { computeEscalations, slaFor, stageEnteredAt, useStore } from "../lib/store";
import type { CaseStatus, LoanCase } from "../lib/types";
import { TONE_HEX, ageDays, caseStatusOf, downloadCSV, fmtMoney, fmtMoneyCompact, relTime, todayISO } from "../lib/format";
import { Avatar, Chip, DueChip, StatusChip } from "../components/ui";
import { BarList, Donut } from "../components/charts";
import { IDownload, IInbox, ITrophy } from "../components/icons";

function ReportCard({ title, sub, onExport, children, span, extra }: { title: string; sub: string; onExport: () => void; children: ReactNode; span?: string; extra?: ReactNode }) {
  return (
    <div className={`card p-4 anim-fade-up ${span ?? ""}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h3 className="font-disp font-semibold text-[14px] m-0">{title}</h3>
          <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-0">{sub}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {extra}
          <button className="btn btn-ghost btn-sm" onClick={onExport} title="Download CSV">
            <IDownload size={13} /> CSV
          </button>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SectionHead({ no, title, sub }: { no: string; title: string; sub: string }) {
  return (
    <div className="col-span-full flex items-baseline gap-3 mt-2 first:mt-0">
      <span className="mono text-[12px] font-semibold" style={{ color: "var(--amber)" }}>{no}</span>
      <h2 className="font-disp font-bold text-[17px] tracking-tight m-0">{title}</h2>
      <span className="text-[12px] text-[var(--ink-faint)] hidden md:inline">{sub}</span>
      <span className="flex-1 h-px" style={{ background: "var(--line-soft)" }} />
    </div>
  );
}

/* month helpers */
function lastMonths(n: number): { key: string; label: string; from: Date; to: Date }[] {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-IN", { month: "short" }),
      from: d,
      to,
    });
  }
  return out;
}
const inMonth = (iso: string | null, m: { from: Date; to: Date }) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= m.from.getTime() && t < m.to.getTime();
};

export default function Reports() {
  const { db, nav, visibleCases, visibleTasks, userById, toast } = useStore();
  const cases = useMemo(() => visibleCases(), [visibleCases]);
  const tasks = useMemo(() => visibleTasks(), [visibleTasks]);
  const statusOf = (c: LoanCase): CaseStatus => caseStatusOf(c, db.tasks);
  const openTasks = tasks.filter((t) => t.status === "Open");
  const today = todayISO();
  const activeCases = cases.filter((c) => c.caseStatus === "Active");
  const closedCases = cases.filter((c) => c.caseStatus === "Closed");
  const lostCases = cases.filter((c) => c.caseStatus === "Lost");

  /* monthly business filters */
  const [bizBank, setBizBank] = useState("All");
  const [bizOwner, setBizOwner] = useState("All");
  const bizFiltered = closedCases.filter(
    (c) => (bizBank === "All" || c.bank === bizBank) && (bizOwner === "All" || c.ownerId === parseInt(bizOwner, 10))
  );

  /* 1 — why pending */
  const whyRows = db.whyPending
    .map((w) => ({ label: w.label, value: openTasks.filter((t) => t.whyPending === w.label).length, color: TONE_HEX.amber }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  /* 2 — waiting for */
  const palette = ["#f2b04c", "#57c2ea", "#43d69b", "#f27363", "#b48ef2", "#8ca6b0"];
  const waitSegs = db.waitingFor
    .map((w, i) => ({ label: w.label, value: openTasks.filter((t) => t.waitingFor === w.label).length, color: palette[i % palette.length] }))
    .filter((s) => s.value > 0);

  /* 3 — overdue & at risk */
  const risky = activeCases
    .map((c) => ({ c, s: statusOf(c), nt: openTasks.filter((t) => t.caseId === c.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] }))
    .filter((r) => r.s === "Overdue" || r.s === "At Risk")
    .sort((a, b) => (a.nt?.dueDate ?? "9999").localeCompare(b.nt?.dueDate ?? "9999"));

  /* 4 — owner workload */
  const owners = Array.from(new Set(openTasks.map((t) => t.ownerId)))
    .map((id) => {
      const mine = openTasks.filter((t) => t.ownerId === id);
      return { id, name: userById(id)?.name ?? "Unassigned", open: mine.length, od: mine.filter((t) => t.dueDate < today).length, value: mine.reduce((s, t) => s + (db.cases.find((c) => c.id === t.caseId)?.loanAmount ?? 0), 0) };
    })
    .sort((a, b) => b.open - a.open);

  /* 5 — stage ageing */
  const stageRows = [...db.stages]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => {
      const inStage = activeCases.filter((c) => c.stage === s.label);
      const avg = inStage.length ? Math.round(inStage.reduce((sum, c) => sum + ageDays(c.createdAt), 0) / inStage.length) : 0;
      return { label: s.label, value: avg, color: avg > 25 ? TONE_HEX.coral : avg > 14 ? TONE_HEX.amber : TONE_HEX.mint, sub: `${inStage.length} case${inStage.length === 1 ? "" : "s"}` };
    })
    .filter((r) => r.value > 0);

  /* 6 — no next action */
  const noAction = activeCases.filter((c) => statusOf(c) === "No Action").sort((a, b) => ageDays(b.createdAt) - ageDays(a.createdAt));

  /* 7 — monthly business */
  const months = lastMonths(6);
  const bizRows = months.map((m) => ({
    m,
    value: bizFiltered.filter((c) => inMonth(c.closedDate, m)).reduce((s, c) => s + c.loanAmount, 0),
  }));
  const maxBiz = Math.max(...bizRows.map((r) => r.value), 1);

  /* 8 — conversion */
  const convRows = months.map((m) => ({
    m,
    opened: cases.filter((c) => inMonth(c.createdAt, m)).length,
    closed: closedCases.filter((c) => inMonth(c.closedDate, m)).length,
    lost: lostCases.filter((c) => inMonth(c.closedDate, m)).length,
  }));

  /* 9 — leaderboard (this month) */
  const curMonth = months[months.length - 1];
  const board = Array.from(
    closedCases.filter((c) => inMonth(c.closedDate, curMonth)).reduce((map, c) => {
      const e = map.get(c.ownerId) ?? { count: 0, amount: 0 };
      e.count += 1;
      e.amount += c.loanAmount;
      map.set(c.ownerId, e);
      return map;
    }, new Map<number, { count: number; amount: number }>())
  )
    .map(([id, v]) => ({ id, name: userById(id)?.name ?? "Unassigned", ...v }))
    .sort((a, b) => b.amount - a.amount);
  const medal = ["#f2b04c", "#c9d6d4", "#cd8f5e"];

  /* 10 — bank performance */
  const bankNames = Array.from(new Set(cases.map((c) => c.bank)));
  const bankPerf = bankNames.map((b) => {
    const mine = cases.filter((c) => c.bank === b);
    const prog = mine.filter((c) => c.caseStatus === "Active");
    const done = mine.filter((c) => c.caseStatus === "Closed");
    const booked = done.reduce((s, c) => s + c.loanAmount, 0);
    const turn = done.length ? Math.round(done.reduce((s, c) => s + Math.max(0, (new Date(c.closedDate!).getTime() - new Date(c.createdAt).getTime()) / 86400000), 0) / done.length) : null;
    const avgAge = prog.length ? Math.round(prog.reduce((s, c) => s + ageDays(c.createdAt), 0) / prog.length) : null;
    return { bank: b, prog: prog.length, done: done.length, booked, turn, avgAge };
  }).sort((a, b) => b.booked - a.booked);

  /* 11 — bank × stage ageing matrix */
  const stageCols = [...db.stages].filter((s) => s.active && s.label !== "Closed").sort((a, b) => a.sortOrder - b.sortOrder);
  const cellColor = (v: number | null) =>
    v == null ? "transparent" : v > 25 ? "rgba(242,115,99,0.22)" : v > 14 ? "rgba(242,176,76,0.16)" : v > 7 ? "rgba(87,194,234,0.10)" : "rgba(232,241,239,0.03)";
  const matrix = bankNames.map((b) => ({
    bank: b,
    cells: stageCols.map((s) => {
      const list = activeCases.filter((c) => c.bank === b && c.stage === s.label);
      return list.length ? Math.round(list.reduce((sum, c) => sum + ageDays(c.createdAt), 0) / list.length) : null;
    }),
  }));

  /* 12 — escalations */
  const escalations = computeEscalations(db, cases);

  const exportOk = (name: string, header: string[], rows: (string | number)[][]) => {
    downloadCSV(name, header, rows);
    toast("success", `${name} downloaded.`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SectionHead no="A" title="Operational" sub="what's stuck right now" />

      <ReportCard title="Why pending" sub={`${openTasks.length} open tasks classified by blocker`}
        onExport={() => exportOk("why-pending.csv", ["Reason", "Open tasks"], whyRows.map((r) => [r.label, r.value]))}>
        {whyRows.length ? <BarList items={whyRows} /> : <p className="text-[12.5px] text-[var(--ink-faint)]">No open tasks to classify.</p>}
      </ReportCard>

      <ReportCard title="Waiting for" sub="Where the clock is actually running"
        onExport={() => exportOk("waiting-for.csv", ["Waiting for", "Open tasks"], waitSegs.map((s) => [s.label, s.value]))}>
        {waitSegs.length ? <Donut segments={waitSegs} centerLabel="open" size={140} /> : <p className="text-[12.5px] text-[var(--ink-faint)]">No open tasks in scope.</p>}
      </ReportCard>

      <ReportCard title="Overdue & at risk" sub={`${risky.length} cases need a decision this week`}
        onExport={() =>
          exportOk("overdue-at-risk.csv", ["Case", "Customer", "Bank", "Stage", "Owner", "Status", "Next task", "Due"],
            risky.map((r) => [r.c.caseNumber, r.c.customer, r.c.bank, r.c.stage, userById(r.c.ownerId)?.name ?? "", r.s, r.nt?.description ?? "—", r.nt?.dueDate ?? "—"]))
        }>
        {risky.length === 0 ? (
          <p className="text-[12.5px] text-[var(--ink-faint)]">Nothing overdue or at risk. Enjoy it while it lasts.</p>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
            {risky.map(({ c, s, nt }) => (
              <button key={c.id} className="w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-lg transition-colors hover:bg-[rgba(232,241,239,0.045)]" onClick={() => nav({ name: "case", id: c.id })}>
                <span className={s === "Overdue" ? "dot-overdue shrink-0" : "w-[7px] h-[7px] rounded-full shrink-0"} style={s === "At Risk" ? { background: "var(--amber)" } : undefined} />
                <span className="min-w-0 flex-1">
                  <span className="mono text-[11.5px] block" style={{ color: "var(--amber)" }}>{c.caseNumber}</span>
                  <span className="text-[12px] text-[var(--ink-dim)] block truncate">{c.customer} · {nt?.description ?? "no task"}</span>
                </span>
                {nt && <DueChip dueISO={nt.dueDate} />}
                <StatusChip status={s} />
              </button>
            ))}
          </div>
        )}
      </ReportCard>

      <ReportCard title="Owner workload" sub="Open tasks and stuck value per teammate"
        onExport={() => exportOk("owner-workload.csv", ["Owner", "Open tasks", "Overdue", "Value at stake"], owners.map((o) => [o.name, o.open, o.od, o.value]))}>
        {owners.length ? (
          <div className="space-y-2.5">
            {owners.map((o) => {
              const max = owners[0].open || 1;
              return (
                <div key={o.id} className="flex items-center gap-3">
                  <Avatar name={o.name} size={26} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-[12.5px] truncate">{o.name}</span>
                      <span className="mono text-[11.5px]">
                        {o.open} open{o.od > 0 && <span style={{ color: "var(--coral)" }}> · {o.od} od</span>}
                        <span className="text-[var(--ink-faint)]"> · {fmtMoneyCompact(o.value)}</span>
                      </span>
                    </div>
                    <div className="h-[6px] rounded-full overflow-hidden" style={{ background: "rgba(232,241,239,0.06)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(o.open / max) * 100}%`, background: o.od > 0 ? `linear-gradient(90deg, ${TONE_HEX.mint}, ${TONE_HEX.coral})` : TONE_HEX.mint, transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[12.5px] text-[var(--ink-faint)]">No open tasks assigned.</p>
        )}
      </ReportCard>

      <ReportCard title="Stage ageing" sub="Average case age by stage — red means the stage is a parking lot"
        onExport={() => exportOk("stage-ageing.csv", ["Stage", "Avg age (days)", "Cases"], stageRows.map((r) => [r.label, r.value, r.sub]))}>
        {stageRows.length ? <BarList items={stageRows} unit="d" /> : <p className="text-[12.5px] text-[var(--ink-faint)]">No live cases.</p>}
      </ReportCard>

      <ReportCard title="No next action" sub="Open cases with nobody owning the next step — the silent killers"
        onExport={() => exportOk("no-next-action.csv", ["Case", "Customer", "Stage", "Owner", "Age (days)"], noAction.map((c) => [c.caseNumber, c.customer, c.stage, userById(c.ownerId)?.name ?? "", ageDays(c.createdAt)]))}>
        {noAction.length === 0 ? (
          <div className="flex items-center gap-2 text-[12.5px] py-2" style={{ color: "var(--mint)" }}>
            <IInbox size={16} /> Every open case has an owner and a task. Textbook.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {noAction.map((c) => (
              <button key={c.id} className="w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-lg transition-colors hover:bg-[rgba(232,241,239,0.045)]" onClick={() => nav({ name: "case", id: c.id })}>
                <Chip tone="slate">{ageDays(c.createdAt)}d</Chip>
                <span className="min-w-0 flex-1">
                  <span className="mono text-[11.5px] block" style={{ color: "var(--amber)" }}>{c.caseNumber}</span>
                  <span className="text-[12px] text-[var(--ink-dim)] block truncate">{c.customer} · stuck in {c.stage}</span>
                </span>
                <Avatar name={userById(c.ownerId)?.name ?? "?"} size={24} />
              </button>
            ))}
          </div>
        )}
      </ReportCard>

      <SectionHead no="B" title="Business" sub="what the book actually produced" />

      <ReportCard title="Monthly business" sub="Loan amount booked per month"
        extra={
          <>
            <select className="select" style={{ width: 110, padding: "4px 26px 4px 9px", fontSize: 12 }} value={bizBank} onChange={(e) => setBizBank(e.target.value)}>
              <option>All</option>
              {bankNames.map((b) => <option key={b}>{b}</option>)}
            </select>
            <select className="select" style={{ width: 130, padding: "4px 26px 4px 9px", fontSize: 12 }} value={bizOwner} onChange={(e) => setBizOwner(e.target.value)}>
              <option value="All">All owners</option>
              {db.users.filter((u) => u.role !== "Admin").map((u) => <option key={u.id} value={u.id}>{u.name.split(" ")[0]}</option>)}
            </select>
          </>
        }
        onExport={() => exportOk("monthly-business.csv", ["Month", "Booked (₹)"], bizRows.map((r) => [r.m.key, r.value]))}>
        <div className="flex items-end gap-3 h-[150px] pt-4">
          {bizRows.map(({ m, value }, i) => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5 group">
              <span className="mono text-[10.5px] text-[var(--ink-dim)] opacity-0 group-hover:opacity-100 transition-opacity">{value > 0 ? fmtMoneyCompact(value) : ""}</span>
              <div className="w-full rounded-t-md relative overflow-hidden" style={{ background: "rgba(232,241,239,0.05)", height: 100 }}>
                <div className="absolute bottom-0 left-0 right-0 rounded-t-md" style={{
                  height: `${(value / maxBiz) * 100}%`,
                  background: i === bizRows.length - 1 ? "linear-gradient(180deg, #ffca70, #d99427)" : "linear-gradient(180deg, rgba(242,176,76,0.55), rgba(242,176,76,0.25))",
                  transition: "height 0.8s cubic-bezier(0.22,1,0.36,1)",
                }} />
              </div>
              <span className={`text-[11px] font-disp ${i === bizRows.length - 1 ? "text-[var(--amber)] font-semibold" : "text-[var(--ink-faint)]"}`}>{m.label}</span>
            </div>
          ))}
        </div>
        <p className="mono text-[11.5px] text-[var(--ink-faint)] mt-2 mb-0">
          6-month booked: <span className="text-[var(--ink)]">{fmtMoney(bizRows.reduce((s, r) => s + r.value, 0))}</span>
          {bizBank !== "All" || bizOwner !== "All" ? " · filtered" : ""}
        </p>
      </ReportCard>

      <ReportCard title="Conversion" sub="Opened vs booked vs lost, per month"
        onExport={() => exportOk("conversion.csv", ["Month", "Opened", "Booked", "Lost"], convRows.map((r) => [r.m.key, r.opened, r.closed, r.lost]))}>
        <div className="space-y-2.5">
          <div className="flex gap-4 text-[11px] text-[var(--ink-faint)]">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: TONE_HEX.sky }} /> Opened</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: TONE_HEX.mint }} /> Booked</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: TONE_HEX.coral }} /> Lost</span>
          </div>
          {convRows.map(({ m, opened, closed, lost }) => {
            const max = Math.max(opened, closed, lost, 1);
            return (
              <div key={m.key} className="flex items-center gap-3">
                <span className="mono text-[11px] text-[var(--ink-faint)] w-8">{m.label}</span>
                <div className="flex-1 space-y-1">
                  {[
                    { v: opened, c: TONE_HEX.sky },
                    { v: closed, c: TONE_HEX.mint },
                    { v: lost, c: TONE_HEX.coral },
                  ].map((b, i) => (
                    <div key={i} className="h-[7px] rounded-full overflow-hidden" style={{ background: "rgba(232,241,239,0.05)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(b.v / max) * 100}%`, background: b.c, transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)", minWidth: b.v > 0 ? 6 : 0 }} />
                    </div>
                  ))}
                </div>
                <span className="mono text-[11px] text-[var(--ink-dim)] w-14 text-right">{opened}/{closed}/{lost}</span>
              </div>
            );
          })}
        </div>
      </ReportCard>

      <ReportCard title="Leaderboard" sub={`Cases booked in ${curMonth.label} — count and amount`}
        span="lg:col-span-2"
        onExport={() => exportOk("leaderboard.csv", ["Owner", "Cases booked", "Amount (₹)"], board.map((b) => [b.name, b.count, b.amount]))}>
        {board.length === 0 ? (
          <p className="text-[12.5px] text-[var(--ink-faint)]">Nothing booked yet this month — the bar is on the floor.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {board.map((b, i) => (
              <div key={b.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: "rgba(232,241,239,0.03)", border: `1px solid ${i === 0 ? "rgba(242,176,76,0.35)" : "var(--line-soft)"}` }}>
                <span className="font-disp font-bold text-[17px] w-6 text-center" style={{ color: medal[i] ?? "var(--ink-faint)" }}>{i + 1}</span>
                <Avatar name={b.name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{b.name}</div>
                  <div className="text-[11px] text-[var(--ink-faint)]">{b.count} case{b.count > 1 ? "s" : ""} booked</div>
                </div>
                <span className="mono font-semibold text-[14px]" style={{ color: i === 0 ? "var(--amber)" : undefined }}>{fmtMoneyCompact(b.amount)}</span>
                {i === 0 && <ITrophy size={16} className="text-[var(--amber)]" />}
              </div>
            ))}
          </div>
        )}
      </ReportCard>

      <SectionHead no="C" title="Bank & SLA" sub="where the friction actually lives" />

      <ReportCard title="Bank performance" sub="Pipeline, booked business and turnaround by bank" span="lg:col-span-2"
        onExport={() => exportOk("bank-performance.csv", ["Bank", "In progress", "Booked", "Booked (₹)", "Avg turnaround (d)", "Avg active age (d)"], bankPerf.map((b) => [b.bank, b.prog, b.done, b.booked, b.turn ?? "", b.avgAge ?? ""]))}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Bank</th><th>In progress</th><th>Booked</th><th>Amount booked</th><th>Avg turnaround</th><th>Avg age (active)</th></tr>
            </thead>
            <tbody>
              {bankPerf.map((b) => (
                <tr key={b.bank} style={{ cursor: "default" }}>
                  <td className="font-medium">{b.bank}</td>
                  <td className="mono">{b.prog}</td>
                  <td className="mono">{b.done}</td>
                  <td className="mono font-semibold" style={{ color: "var(--amber)" }}>{b.booked > 0 ? fmtMoney(b.booked) : "—"}</td>
                  <td className="mono">
                    {b.turn == null ? "—" : (
                      <span style={{ color: b.turn > 45 ? "var(--coral)" : b.turn > 30 ? "var(--amber)" : "var(--mint)" }}>{b.turn}d</span>
                    )}
                  </td>
                  <td className="mono">
                    {b.avgAge == null ? "—" : (
                      <span style={{ color: b.avgAge > 25 ? "var(--coral)" : b.avgAge > 14 ? "var(--amber)" : undefined }}>{b.avgAge}d</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportCard>

      <ReportCard title="Bank × stage ageing" sub="Average age of active cases where a bank and a stage meet — spots the exact choke point" span="lg:col-span-2"
        onExport={() => exportOk("bank-stage-ageing.csv", ["Bank", ...stageCols.map((s) => s.label)], matrix.map((r) => [r.bank, ...r.cells.map((c) => c ?? "")]))}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Bank</th>
                {stageCols.map((s) => (
                  <th key={s.id} className="text-center" style={{ minWidth: 74 }}>{s.label.split(" ")[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((r) => (
                <tr key={r.bank} style={{ cursor: "default" }}>
                  <td className="font-medium whitespace-nowrap">{r.bank}</td>
                  {r.cells.map((v, i) => (
                    <td key={i} className="text-center" style={{ padding: 4 }}>
                      <span className="mono inline-block w-[52px] py-1.5 rounded-md text-[12px]" style={{ background: cellColor(v), color: v == null ? "var(--ink-faint)" : undefined }}>
                        {v == null ? "·" : `${v}d`}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[var(--ink-faint)] mt-2 mb-0">Red &gt; 25d · amber &gt; 14d · blue &gt; 7d</p>
      </ReportCard>

      <ReportCard title="SLA escalations" sub="Active cases past the allowed days in their current stage" span="lg:col-span-2"
        onExport={() => exportOk("escalations.csv", ["Case", "Customer", "Bank", "Stage", "Days in stage", "SLA max", "Over by"], escalations.map((e) => [e.c.caseNumber, e.c.customer, e.c.bank, e.c.stage, e.daysInStage, e.rule.maxDays, e.overBy]))}>
        {escalations.length === 0 ? (
          <div className="flex items-center gap-2 text-[12.5px] py-2" style={{ color: "var(--mint)" }}>
            <IInbox size={16} /> Every active case is inside its stage SLA.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
            {escalations.map((e) => (
              <button key={e.c.id} className="w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-lg transition-colors hover:bg-[rgba(232,241,239,0.045)]" onClick={() => nav({ name: "case", id: e.c.id })}>
                <span className="dot-overdue shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="mono text-[11.5px] block" style={{ color: "var(--amber)" }}>{e.c.caseNumber}</span>
                  <span className="text-[12px] text-[var(--ink-dim)] block truncate">
                    {e.c.customer} · {e.c.stage} @ {e.c.bank} · {e.daysInStage}d in stage (SLA {e.rule.maxDays}d{e.rule.bank ? ", bank rule" : ""})
                  </span>
                </span>
                <Chip tone="coral">+{e.overBy}d over</Chip>
                <Avatar name={userById(e.c.ownerId)?.name ?? "?"} size={24} />
              </button>
            ))}
          </div>
        )}
      </ReportCard>

      <p className="col-span-full text-[11px] text-[var(--ink-faint)] m-0 pt-1">
        Stage dwell time is read from the activity trail ({relTime(new Date().toISOString())} snapshot) · SLA rules are managed in Admin.
      </p>
    </div>
  );
}
