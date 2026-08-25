import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { computeEscalations, useStore } from "../lib/store";
import type { CaseStatus, LoanCase } from "../lib/types";
import {
  TONE_HEX, ageDays, caseStatusOf, commissionFor, downloadCSV, fmtMoney, fmtRate, primaryBank, rateFor, todayISO,
} from "../lib/format";
import { Avatar, Chip, DueChip, StatusChip } from "../components/ui";
import { BarList, Donut } from "../components/charts";
import { IDownload, IInbox } from "../components/icons";

function ReportCard({ title, sub, onExport, children, span, extra }: { title: string; sub: string; onExport: () => void; children: ReactNode; span?: string; extra?: ReactNode }) {
  return (
    <div className={`card p-4 anim-fade-up ${span ?? ""}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="font-disp font-semibold text-[14px] m-0">{title}</h3>
          <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-0">{sub}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {extra}
          <button className="btn btn-ghost btn-sm" onClick={onExport} title="Download CSV">
            <IDownload size={14} /> CSV
          </button>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="col-span-1 lg:col-span-2 flex items-center gap-3 mt-2">
      <span className="font-disp font-bold text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--amber)" }}>{children}</span>
      <span className="h-px flex-1" style={{ background: "var(--line-soft)" }} />
    </div>
  );
}

const PALETTE = ["#f2b04c", "#57c2ea", "#43d69b", "#f27363", "#b48ef2", "#8ca6b0", "#e8c15a", "#6fd3c7"];

export default function Reports() {
  const { db, nav, visibleCases, visibleTasks, userById, toast } = useStore();
  const cases = useMemo(() => visibleCases(), [visibleCases]);
  const tasks = useMemo(() => visibleTasks(), [visibleTasks]);
  const statusOf = (c: LoanCase): CaseStatus => caseStatusOf(c, db.tasks);
  const openTasks = tasks.filter((t) => t.status === "Open");
  const today = todayISO();
  const openCases = cases.filter((c) => c.caseStatus === "Active");
  const booked = cases.filter((c) => c.caseStatus === "Closed");

  const [bizBank, setBizBank] = useState("All");
  const [bizOwner, setBizOwner] = useState("All");

  /* 1 — why pending */
  const whyRows = db.whyPending
    .map((w) => ({ label: w.label, value: openTasks.filter((t) => t.whyPending === w.label).length, color: TONE_HEX.amber }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  /* 2 — waiting for */
  const waitSegs = db.waitingFor
    .map((w, i) => ({ label: w.label, value: openTasks.filter((t) => t.waitingFor === w.label).length, color: PALETTE[i % PALETTE.length] }))
    .filter((s) => s.value > 0);

  /* 3 — overdue & at risk */
  const risky = openCases
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
      const inStage = openCases.filter((c) => c.stage === s.label);
      const avg = inStage.length ? Math.round(inStage.reduce((sum, c) => sum + ageDays(c.createdAt), 0) / inStage.length) : 0;
      return { label: s.label, value: avg, color: avg > 25 ? TONE_HEX.coral : avg > 14 ? TONE_HEX.amber : TONE_HEX.mint, sub: `${inStage.length} case${inStage.length === 1 ? "" : "s"}` };
    })
    .filter((r) => r.value > 0);

  /* 6 — no next action */
  const noAction = openCases.filter((c) => statusOf(c) === "No Action").sort((a, b) => ageDays(b.createdAt) - ageDays(a.createdAt));

  /* 7 — monthly business */
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const monthLabel = (m: string) => new Date(m + "-02").toLocaleDateString("en-GB", { month: "short" });
  const bizFiltered = booked.filter((c) => (bizBank === "All" || c.wonBank === bizBank) && (bizOwner === "All" || c.ownerId === Number(bizOwner)));
  const monthly = months.map((m) => ({
    m,
    label: monthLabel(m),
    volume: bizFiltered.filter((c) => (c.closedDate ?? "").slice(0, 7) === m).reduce((s, c) => s + c.loanAmount, 0),
    count: bizFiltered.filter((c) => (c.closedDate ?? "").slice(0, 7) === m).length,
    earn: bizFiltered.filter((c) => (c.closedDate ?? "").slice(0, 7) === m).reduce((s, c) => s + commissionFor(c, db.banks).gross, 0),
  }));

  /* 8 — conversion */
  const conv = months.map((m) => {
    const opened = cases.filter((c) => c.createdAt.slice(0, 7) === m).length;
    const won = booked.filter((c) => (c.closedDate ?? "").slice(0, 7) === m).length;
    const lost = cases.filter((c) => c.caseStatus === "Lost" && (c.closedDate ?? "").slice(0, 7) === m).length;
    return { m, label: monthLabel(m), opened, won, lost };
  });
  const totOpened = conv.reduce((s, x) => s + x.opened, 0);
  const totWon = conv.reduce((s, x) => s + x.won, 0);
  const totLost = conv.reduce((s, x) => s + x.lost, 0);

  /* 9 — leaderboard */
  const leaders = db.users
    .map((u) => {
      const won = booked.filter((c) => c.ownerId === u.id);
      const thisMonth = won.filter((c) => (c.closedDate ?? "").slice(0, 7) === today.slice(0, 7));
      return { u, count: won.length, amount: won.reduce((s, c) => s + c.loanAmount, 0), earn: won.reduce((s, c) => s + commissionFor(c, db.banks).net, 0), monthCount: thisMonth.length, monthAmount: thisMonth.reduce((s, c) => s + c.loanAmount, 0) };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.amount - a.amount);

  /* 10 — commission earnings per bank */
  const earnRows = db.banks
    .map((b) => {
      const won = booked.filter((c) => c.wonBank === b.name);
      const volume = won.reduce((s, c) => s + c.loanAmount, 0);
      const gross = won.reduce((s, c) => s + commissionFor(c, db.banks).gross, 0);
      const payout = won.reduce((s, c) => s + commissionFor(c, db.banks).partnerCut, 0);
      const inPlay = openCases.filter((c) => c.banks.includes(b.name));
      return { b, count: won.length, volume, gross, payout, net: gross - payout, inPlay: inPlay.length, pipeline: inPlay.reduce((s, c) => s + c.loanAmount, 0) };
    })
    .filter((r) => r.count > 0 || r.inPlay > 0)
    .sort((a, b) => b.gross - a.gross);

  /* 11 — partner commission */
  const partnerNames = Array.from(new Set(cases.filter((c) => c.partner).map((c) => c.partner!.name)));
  const partnerRows = partnerNames
    .map((name) => {
      const intro = cases.filter((c) => c.partner?.name === name);
      const wonB = intro.filter((c) => c.caseStatus === "Closed");
      const gross = wonB.reduce((s, c) => s + commissionFor(c, db.banks).gross, 0);
      const payout = wonB.reduce((s, c) => s + commissionFor(c, db.banks).partnerCut, 0);
      const pendingCases = intro.filter((c) => c.caseStatus === "Active");
      const pendingPayout = pendingCases.reduce((s, c) => s + commissionFor(c, db.banks).partnerCut, 0);
      return { kind: intro[0].partner!.kind, name, share: intro[0].partner!.sharePct, intro: intro.length, bookedN: wonB.length, bookedVol: wonB.reduce((s, c) => s + c.loanAmount, 0), gross, payout, pendingCases: pendingCases.length, pendingPayout };
    })
    .sort((a, b) => b.payout - a.payout);

  /* 12 — bank performance */
  const bankPerf = db.banks
    .map((b) => {
      const submitted = openCases.filter((c) => c.banks.includes(b.name));
      const won = booked.filter((c) => c.wonBank === b.name);
      const avgTurn = won.length ? Math.round(won.reduce((s, c) => s + Math.max(0, Math.round((new Date(c.closedDate!).getTime() - new Date(c.createdAt).getTime()) / 86400000)), 0) / won.length) : 0;
      const avgAge = submitted.length ? Math.round(submitted.reduce((s, c) => s + ageDays(c.createdAt), 0) / submitted.length) : 0;
      return { b, inProgress: submitted.length, closed: won.length, volume: won.reduce((s, c) => s + c.loanAmount, 0), avgTurn, avgAge };
    })
    .filter((r) => r.inProgress > 0 || r.closed > 0)
    .sort((a, b) => b.volume - a.volume);

  /* 13 — bank × stage ageing */
  const ageStages = [...db.stages].filter((s) => s.label !== "Closed").sort((a, b) => a.sortOrder - b.sortOrder);
  const bankAge = db.banks
    .map((b) => ({ b, cells: ageStages.map((st) => { const cs = openCases.filter((c) => c.banks.includes(b.name) && c.stage === st.label); return cs.length ? Math.round(cs.reduce((s, c) => s + ageDays(c.createdAt), 0) / cs.length) : null; }) }))
    .filter((r) => r.cells.some((x) => x != null));

  /* 14 — escalations */
  const escalations = computeEscalations(db, cases);

  const exportOk = (name: string, header: string[], rows: (string | number)[][]) => {
    downloadCSV(name, header, rows);
    toast("success", `${name} downloaded.`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <GroupLabel>Operational — the floor, today</GroupLabel>

      <ReportCard title="Why pending" sub={`${openTasks.length} open tasks classified by blocker`} onExport={() => exportOk("why-pending.csv", ["Reason", "Open tasks"], whyRows.map((r) => [r.label, r.value]))}>
        {whyRows.length ? <BarList items={whyRows} /> : <p className="text-[12.5px] text-[var(--ink-faint)]">No open tasks to classify.</p>}
      </ReportCard>

      <ReportCard title="Waiting for" sub="Where the clock is actually running" onExport={() => exportOk("waiting-for.csv", ["Waiting for", "Open tasks"], waitSegs.map((s) => [s.label, s.value]))}>
        {waitSegs.length ? <Donut segments={waitSegs} centerLabel="open" size={140} /> : <p className="text-[12.5px] text-[var(--ink-faint)]">No open tasks in scope.</p>}
      </ReportCard>

      <ReportCard title="Overdue & at risk" sub={`${risky.length} cases need a decision this week`} onExport={() => exportOk("overdue-at-risk.csv", ["Case", "Customer", "Banks", "Stage", "Owner", "Status", "Next task", "Due"], risky.map((r) => [r.c.caseNumber, r.c.customer, r.c.banks.join(" / ") || "TBC", r.c.stage, userById(r.c.ownerId)?.name ?? "", r.s, r.nt?.description ?? "—", r.nt?.dueDate ?? "—"]))}>
        {risky.length === 0 ? (
          <p className="text-[12.5px] text-[var(--ink-faint)]">Nothing overdue or at risk. Enjoy it while it lasts.</p>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
            {risky.map(({ c, s, nt }) => (
              <button key={c.id} className="w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-lg transition-colors hover:bg-[rgba(232,241,239,0.045)]" onClick={() => nav({ name: "case", id: c.id })}>
                <span className={s === "Overdue" ? "dot-overdue shrink-0" : "w-[7px] h-[7px] rounded-full shrink-0"} style={s === "At Risk" ? { background: "var(--amber)" } : undefined} />
                <span className="min-w-0 flex-1">
                  <span className="mono text-[11.5px] block" style={{ color: "var(--amber)" }}>{c.caseNumber}</span>
                  <span className="text-[12px] text-[var(--ink-dim)] block truncate">{c.customer} · {c.banks.join(" / ") || "bank TBC"} · {nt?.description ?? "no task"}</span>
                </span>
                {nt && <DueChip dueISO={nt.dueDate} />}
                <StatusChip status={s} />
              </button>
            ))}
          </div>
        )}
      </ReportCard>

      <ReportCard title="Owner workload" sub="Open tasks and stuck value per teammate" onExport={() => exportOk("owner-workload.csv", ["Owner", "Open tasks", "Overdue", "Value at stake"], owners.map((o) => [o.name, o.open, o.od, o.value]))}>
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
                        <span className="text-[var(--ink-faint)]"> · {fmtMoney(o.value)}</span>
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

      <ReportCard title="Stage ageing" sub="Average case age by stage — red means the stage is a parking lot" onExport={() => exportOk("stage-ageing.csv", ["Stage", "Avg age (days)", "Cases"], stageRows.map((r) => [r.label, r.value, r.sub]))}>
        {stageRows.length ? <BarList items={stageRows} unit="d" /> : <p className="text-[12.5px] text-[var(--ink-faint)]">No live cases.</p>}
      </ReportCard>

      <ReportCard title="No next action" sub="Open cases with nobody owning the next step — the silent killers" onExport={() => exportOk("no-next-action.csv", ["Case", "Customer", "Stage", "Owner", "Age (days)"], noAction.map((c) => [c.caseNumber, c.customer, c.stage, userById(c.ownerId)?.name ?? "", ageDays(c.createdAt)]))}>
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

      <GroupLabel>Business — what the firm earns</GroupLabel>

      <ReportCard
        title="Monthly business"
        sub="Booked volume and bank commission per month"
        extra={
          <>
            <select className="select !w-auto !py-1 text-[11.5px]" value={bizBank} onChange={(e) => setBizBank(e.target.value)}>
              <option>All banks</option>
              {db.banks.map((b) => <option key={b.id}>{b.name}</option>)}
            </select>
            <select className="select !w-auto !py-1 text-[11.5px]" value={bizOwner} onChange={(e) => setBizOwner(e.target.value)}>
              <option value="All">All owners</option>
              {db.users.filter((u) => u.role !== "Head of Company" && u.role !== "PA to HoC").map((u) => <option key={u.id} value={u.id}>{u.name.split(" ")[0]}</option>)}
            </select>
          </>
        }
        onExport={() => exportOk("monthly-business.csv", ["Month", "Cases", "Volume (AED)", "Commission (AED)"], monthly.map((r) => [r.m, r.count, r.volume, Math.round(r.earn)]))}
      >
        {(() => {
          const max = Math.max(...monthly.map((r) => r.volume), 1);
          return (
            <div className="flex items-end gap-2 h-[150px] pt-2">
              {monthly.map((r, i) => (
                <div key={r.m} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="mono text-[10px] text-[var(--ink-dim)]">{r.count > 0 ? fmtMoney(r.volume) : ""}</span>
                  <div className="w-full max-w-[46px] rounded-t-md" style={{ height: `${Math.max((r.volume / max) * 100, r.volume > 0 ? 4 : 1)}%`, background: `linear-gradient(180deg, ${TONE_HEX.amber}, ${TONE_HEX.amber}66)`, transition: `height 0.8s cubic-bezier(0.22,1,0.36,1) ${i * 60}ms` }} title={`${r.volume ? fmtMoney(r.earn) + " commission" : "no bookings"}`} />
                  <span className="text-[10.5px] text-[var(--ink-faint)] font-disp">{r.label}</span>
                </div>
              ))}
            </div>
          );
        })()}
        <div className="flex gap-4 mt-3 pt-2 text-[11.5px]" style={{ borderTop: "1px dashed var(--line)" }}>
          <span className="text-[var(--ink-faint)]">Period commission <span className="mono text-[var(--mint)]">{fmtMoney(monthly.reduce((s, r) => s + r.earn, 0))}</span></span>
          <span className="text-[var(--ink-faint)]">Volume <span className="mono text-[var(--ink)]">{fmtMoney(monthly.reduce((s, r) => s + r.volume, 0))}</span></span>
        </div>
      </ReportCard>

      <ReportCard
        title="Conversion"
        sub="Opened vs booked vs lost per month"
        onExport={() => exportOk("conversion.csv", ["Month", "Opened", "Booked", "Lost"], conv.map((r) => [r.m, r.opened, r.won, r.lost]))}
      >
        <div className="flex items-end gap-2 h-[130px] pt-2">
          {conv.map((r, i) => {
            const max = Math.max(...conv.map((x) => x.opened), 1);
            return (
              <div key={r.m} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <div className="flex items-end gap-[3px] h-full w-full max-w-[56px] justify-center">
                  {[
                    { v: r.opened, c: "rgba(232,241,239,0.25)" },
                    { v: r.won, c: TONE_HEX.mint },
                    { v: r.lost, c: TONE_HEX.coral },
                  ].map((seg, j) => (
                    <div key={j} className="w-[30%] rounded-t-sm" style={{ height: `${Math.max((seg.v / max) * 100, seg.v > 0 ? 4 : 1)}%`, background: seg.c, transition: `height 0.8s cubic-bezier(0.22,1,0.36,1) ${i * 60 + j * 40}ms` }} />
                  ))}
                </div>
                <span className="text-[10.5px] text-[var(--ink-faint)] font-disp">{r.label}</span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 pt-2 text-[11.5px]" style={{ borderTop: "1px dashed var(--line)" }}>
          <span className="text-[var(--ink-faint)]">Opened <span className="mono text-[var(--ink)]">{totOpened}</span></span>
          <span className="text-[var(--ink-faint)]">Booked <span className="mono" style={{ color: "var(--mint)" }}>{totWon}</span></span>
          <span className="text-[var(--ink-faint)]">Lost <span className="mono" style={{ color: "var(--coral)" }}>{totLost}</span></span>
          <span className="text-[var(--ink-faint)] ml-auto">Hit rate <span className="mono text-[var(--amber)]">{totOpened ? Math.round((totWon / totOpened) * 100) : 0}%</span></span>
        </div>
      </ReportCard>

      <ReportCard
        title="Owner leaderboard"
        sub="Lifetime booked business + net commission per owner, this month in brackets"
        onExport={() => exportOk("leaderboard.csv", ["Owner", "Cases", "Volume (AED)", "Net commission (AED)", "This month cases", "This month volume"], leaders.map((r) => [r.u.name, r.count, r.amount, Math.round(r.earn), r.monthCount, r.monthAmount]))}
      >
        <div className="space-y-2">
          {leaders.length === 0 && <p className="text-[12.5px] text-[var(--ink-faint)]">No booked cases yet.</p>}
          {leaders.map((r, i) => (
            <div key={r.u.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg" style={{ background: i === 0 ? "rgba(242,176,76,0.06)" : undefined }}>
              <span className="mono text-[12px] w-5 text-center" style={{ color: i === 0 ? "var(--amber)" : "var(--ink-faint)" }}>{i + 1}</span>
              <Avatar name={r.u.name} size={26} />
              <span className="text-[12.5px] flex-1 truncate">{r.u.name}</span>
              <span className="text-right">
                <span className="mono text-[12px] block">{fmtMoney(r.amount)} <span className="text-[var(--ink-faint)]">({r.monthCount} this mo)</span></span>
                <span className="mono text-[11px] block" style={{ color: "var(--mint)" }}>{fmtMoney(r.earn)} net</span>
              </span>
            </div>
          ))}
        </div>
      </ReportCard>

      <ReportCard
        title="Commission earnings by bank"
        sub="Our take per bank at admin-managed rates — partners already deducted"
        onExport={() => exportOk("commission-earnings.csv", ["Bank", "Rate %", "Booked", "Volume (AED)", "Gross (AED)", "Partner payout (AED)", "Net (AED)", "In play", "Pipeline (AED)"], earnRows.map((r) => [r.b.name, r.b.ratePct, r.count, r.volume, Math.round(r.gross), Math.round(r.payout), Math.round(r.net), r.inPlay, r.pipeline]))}
        span="lg:col-span-2"
      >
        {earnRows.length === 0 ? (
          <p className="text-[12.5px] text-[var(--ink-faint)]">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[760px]">
              <thead>
                <tr><th>Bank</th><th>Rate</th><th>Booked</th><th>Volume</th><th>Gross</th><th>Paid to partners</th><th>Net to firm</th><th>In play</th><th>Pipeline</th></tr>
              </thead>
              <tbody>
                {earnRows.map((r) => (
                  <tr key={r.b.id} style={{ cursor: "default" }}>
                    <td className="font-medium">{r.b.name}</td>
                    <td className="mono">{fmtRate(r.b.ratePct)}</td>
                    <td className="mono">{r.count}</td>
                    <td className="mono">{fmtMoney(r.volume)}</td>
                    <td className="mono">{fmtMoney(r.gross)}</td>
                    <td className="mono" style={{ color: r.payout > 0 ? "var(--coral)" : "var(--ink-faint)" }}>{r.payout > 0 ? `− ${fmtMoney(r.payout)}` : "—"}</td>
                    <td className="mono font-semibold" style={{ color: "var(--mint)" }}>{fmtMoney(r.net)}</td>
                    <td className="mono text-[var(--ink-dim)]">{r.inPlay}</td>
                    <td className="mono text-[var(--ink-dim)]">{fmtMoney(r.pipeline)}</td>
                  </tr>
                ))}
                <tr style={{ cursor: "default", background: "rgba(242,176,76,0.04)" }}>
                  <td className="font-disp font-semibold">Total</td>
                  <td />
                  <td className="mono font-semibold">{earnRows.reduce((s, r) => s + r.count, 0)}</td>
                  <td className="mono font-semibold">{fmtMoney(earnRows.reduce((s, r) => s + r.volume, 0))}</td>
                  <td className="mono font-semibold">{fmtMoney(earnRows.reduce((s, r) => s + r.gross, 0))}</td>
                  <td className="mono font-semibold" style={{ color: "var(--coral)" }}>− {fmtMoney(earnRows.reduce((s, r) => s + r.payout, 0))}</td>
                  <td className="mono font-bold" style={{ color: "var(--mint)" }}>{fmtMoney(earnRows.reduce((s, r) => s + r.net, 0))}</td>
                  <td className="mono">{earnRows.reduce((s, r) => s + r.inPlay, 0)}</td>
                  <td className="mono">{fmtMoney(earnRows.reduce((s, r) => s + r.pipeline, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>

      <ReportCard
        title="Partner commission"
        sub="What agents, brokers and referrers have earned — and what's accruing on live files"
        onExport={() => exportOk("partner-commission.csv", ["Kind", "Partner", "Share %", "Introduced", "Booked", "Booked volume (AED)", "Gross commission (AED)", "Payout due (AED)", "Live files", "Accruing payout (AED)"], partnerRows.map((r) => [r.kind, r.name, r.share, r.intro, r.bookedN, r.bookedVol, Math.round(r.gross), Math.round(r.payout), r.pendingCases, Math.round(r.pendingPayout)]))}
        span="lg:col-span-2"
      >
        {partnerRows.length === 0 ? (
          <p className="text-[12.5px] text-[var(--ink-faint)]">No sourced cases yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[720px]">
              <thead>
                <tr><th>Partner</th><th>Kind</th><th>Share</th><th>Introduced</th><th>Booked</th><th>Gross</th><th>Payout due</th><th>Accruing on live</th></tr>
              </thead>
              <tbody>
                {partnerRows.map((r) => (
                  <tr key={r.name} style={{ cursor: "default" }}>
                    <td className="font-medium">{r.name}</td>
                    <td><Chip tone={r.kind === "Agent" ? "amber" : r.kind === "Broker" ? "sky" : "coral"}>{r.kind}</Chip></td>
                    <td className="mono">{r.share}%</td>
                    <td className="mono">{r.intro}</td>
                    <td className="mono">{r.bookedN} · {fmtMoney(r.bookedVol)}</td>
                    <td className="mono">{fmtMoney(r.gross)}</td>
                    <td className="mono font-semibold" style={{ color: "var(--amber)" }}>{fmtMoney(r.payout)}</td>
                    <td className="mono text-[var(--ink-dim)]">{r.pendingCases} files · {fmtMoney(r.pendingPayout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>

      <GroupLabel>Bank & SLA — where files stall</GroupLabel>

      <ReportCard
        title="Bank performance"
        sub="Per bank: files in play, booked volume, turnaround and live-file age"
        onExport={() => exportOk("bank-performance.csv", ["Bank", "In progress", "Closed", "Volume (AED)", "Avg turnaround (days)", "Avg live age (days)"], bankPerf.map((r) => [r.b.name, r.inProgress, r.closed, r.volume, r.avgTurn, r.avgAge]))}
      >
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
          {bankPerf.map((r) => (
            <div key={r.b.id} className="flex items-center gap-3 px-2.5 py-2 rounded-lg" style={{ background: "rgba(232,241,239,0.02)" }}>
              <span className="font-disp font-semibold text-[12.5px] w-[86px] shrink-0">{r.b.name}</span>
              <span className="mono text-[11.5px] text-[var(--ink-dim)]">{r.inProgress} live · {r.closed} booked</span>
              <span className="mono text-[11.5px] ml-auto">{fmtMoney(r.volume)}</span>
              <span className="mono text-[11px] text-[var(--ink-faint)] w-[120px] text-right">{r.avgTurn ? `${r.avgTurn}d turnaround` : "—"}{r.avgAge ? ` · ${r.avgAge}d age` : ""}</span>
            </div>
          ))}
          {bankPerf.length === 0 && <p className="text-[12.5px] text-[var(--ink-faint)]">No bank activity yet.</p>}
        </div>
      </ReportCard>

      <ReportCard
        title="Bank × stage ageing"
        sub="Average live-case age where each bank meets each stage — spot the slow lane"
        onExport={() => exportOk("bank-stage-ageing.csv", ["Bank", ...ageStages.map((s) => s.label)], bankAge.map((r) => [r.b.name, ...r.cells.map((x) => (x == null ? "" : x))]))}
      >
        <div className="overflow-x-auto">
          <table className="tbl" style={{ minWidth: 560 }}>
            <thead>
              <tr><th>Bank</th>{ageStages.map((s) => <th key={s.id} className="!px-1.5 text-[9px]">{s.label.split(" ")[0]}</th>)}</tr>
            </thead>
            <tbody>
              {bankAge.map((r) => (
                <tr key={r.b.id} style={{ cursor: "default" }}>
                  <td className="font-medium text-[12px]">{r.b.name}</td>
                  {r.cells.map((x, i) => (
                    <td key={i} className="!px-1.5 !py-1.5 text-center">
                      {x == null ? (
                        <span className="text-[var(--ink-faint)] opacity-40">·</span>
                      ) : (
                        <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: x > 25 ? "rgba(242,115,99,0.16)" : x > 14 ? "rgba(242,176,76,0.14)" : "rgba(67,214,155,0.1)", color: x > 25 ? "var(--coral)" : x > 14 ? "var(--amber)" : "var(--mint)" }}>{x}d</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {bankAge.length === 0 && <tr><td colSpan={ageStages.length + 1} className="text-[12.5px] text-[var(--ink-faint)]">No live cases submitted to banks.</td></tr>}
            </tbody>
          </table>
        </div>
      </ReportCard>

      <ReportCard
        title="SLA escalations"
        sub="Cases past the allowed days in their current stage (bank-specific rules win)"
        onExport={() => exportOk("sla-escalations.csv", ["Case", "Customer", "Stage", "Bank", "Days in stage", "SLA max", "Over by"], escalations.map((e) => [e.c.caseNumber, e.c.customer, e.c.stage, primaryBank(e.c) ?? "TBC", e.days, e.rule.maxDays, e.days - e.rule.maxDays]))}
        span="lg:col-span-2"
      >
        {escalations.length === 0 ? (
          <div className="flex items-center gap-2 text-[12.5px] py-2" style={{ color: "var(--mint)" }}>
            <IInbox size={16} /> Every active case is inside its stage SLA.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {escalations.map((e) => (
              <button key={e.c.id} className="flex items-center gap-3 text-left px-3 py-2.5 rounded-lg transition-colors hover:bg-[rgba(242,115,99,0.08)]" style={{ border: "1px solid rgba(242,115,99,0.25)" }} onClick={() => nav({ name: "case", id: e.c.id })}>
                <span className="dot-overdue shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="mono text-[11.5px] block" style={{ color: "var(--coral)" }}>{e.c.caseNumber}</span>
                  <span className="text-[12px] text-[var(--ink-dim)] block truncate">{e.c.customer} · {e.c.stage} @ {primaryBank(e.c) ?? "bank TBC"}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="mono text-[13px] font-semibold block" style={{ color: "var(--coral)" }}>{e.days}d</span>
                  <span className="text-[10.5px] text-[var(--ink-faint)] block">SLA {e.rule.maxDays}d · over {e.days - e.rule.maxDays}d</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </ReportCard>
    </div>
  );
}
