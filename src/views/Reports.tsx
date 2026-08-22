import { useMemo } from "react";
import type { ReactNode } from "react";
import { useStore } from "../lib/store";
import type { CaseStatus, LoanCase } from "../lib/types";
import { TONE_HEX, ageDays, caseStatusOf, downloadCSV, fmtMoney, todayISO } from "../lib/format";
import { Avatar, Chip, DueChip, StatusChip } from "../components/ui";
import { BarList, Donut } from "../components/charts";
import { IDownload, IInbox } from "../components/icons";

function ReportCard({ title, sub, onExport, children, span }: { title: string; sub: string; onExport: () => void; children: ReactNode; span?: string }) {
  return (
    <div className={`card p-4 anim-fade-up ${span ?? ""}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="font-disp font-semibold text-[14px] m-0">{title}</h3>
          <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-0">{sub}</p>
        </div>
        <button className="btn btn-ghost btn-sm shrink-0" onClick={onExport} title="Download CSV">
          <IDownload size={14} /> CSV
        </button>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function Reports() {
  const { db, nav, visibleCases, visibleTasks, userById, toast } = useStore();
  const cases = useMemo(() => visibleCases(), [visibleCases]);
  const tasks = useMemo(() => visibleTasks(), [visibleTasks]);
  const statusOf = (c: LoanCase): CaseStatus => caseStatusOf(c, db.tasks);
  const openTasks = tasks.filter((t) => t.status === "Open");
  const today = todayISO();
  const openCases = cases.filter((c) => c.stage !== "Closed");

  /* 1 — why pending */
  const whyRows = db.whyPending
    .map((w) => ({ label: w.label, value: openTasks.filter((t) => t.whyPending === w.label).length, color: TONE_HEX.amber }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  /* 2 — overdue & at risk */
  const risky = openCases
    .map((c) => ({ c, s: statusOf(c), nt: openTasks.filter((t) => t.caseId === c.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] }))
    .filter((r) => r.s === "Overdue" || r.s === "At Risk")
    .sort((a, b) => (a.nt?.dueDate ?? "9999").localeCompare(b.nt?.dueDate ?? "9999"));

  /* 3 — owner workload */
  const owners = Array.from(new Set(openTasks.map((t) => t.ownerId)))
    .map((id) => {
      const mine = openTasks.filter((t) => t.ownerId === id);
      return { id, name: userById(id)?.name ?? "Unassigned", open: mine.length, od: mine.filter((t) => t.dueDate < today).length, value: mine.reduce((s, t) => s + (db.cases.find((c) => c.id === t.caseId)?.loanAmount ?? 0), 0) };
    })
    .sort((a, b) => b.open - a.open);

  /* 4 — waiting for */
  const palette = ["#f2b04c", "#57c2ea", "#43d69b", "#f27363", "#b48ef2", "#8ca6b0"];
  const waitSegs = db.waitingFor
    .map((w, i) => ({ label: w.label, value: openTasks.filter((t) => t.waitingFor === w.label).length, color: palette[i % palette.length] }))
    .filter((s) => s.value > 0);

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
  const noAction = openCases
    .filter((c) => statusOf(c) === "No Action")
    .sort((a, b) => ageDays(b.createdAt) - ageDays(a.createdAt));

  const exportOk = (name: string, header: string[], rows: (string | number)[][]) => {
    downloadCSV(name, header, rows);
    toast("success", `${name} downloaded.`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ReportCard
        title="Why pending"
        sub={`${openTasks.length} open tasks classified by blocker`}
        onExport={() => exportOk("why-pending.csv", ["Reason", "Open tasks"], whyRows.map((r) => [r.label, r.value]))}
      >
        {whyRows.length ? <BarList items={whyRows} /> : <p className="text-[12.5px] text-[var(--ink-faint)]">No open tasks to classify.</p>}
      </ReportCard>

      <ReportCard
        title="Waiting for"
        sub="Where the clock is actually running"
        onExport={() => exportOk("waiting-for.csv", ["Waiting for", "Open tasks"], waitSegs.map((s) => [s.label, s.value]))}
      >
        {waitSegs.length ? <Donut segments={waitSegs} centerLabel="open" size={140} /> : <p className="text-[12.5px] text-[var(--ink-faint)]">No open tasks in scope.</p>}
      </ReportCard>

      <ReportCard
        title="Overdue & at risk"
        sub={`${risky.length} cases need a decision this week`}
        onExport={() =>
          exportOk("overdue-at-risk.csv", ["Case", "Customer", "Bank", "Stage", "Owner", "Status", "Next task", "Due"],
            risky.map((r) => [r.c.caseNumber, r.c.customer, r.c.bank, r.c.stage, userById(r.c.ownerId)?.name ?? "", r.s, r.nt?.description ?? "—", r.nt?.dueDate ?? "—"]))
        }
      >
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

      <ReportCard
        title="Owner workload"
        sub="Open tasks and stuck value per teammate"
        onExport={() => exportOk("owner-workload.csv", ["Owner", "Open tasks", "Overdue", "Value at stake"], owners.map((o) => [o.name, o.open, o.od, o.value]))}
      >
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

      <ReportCard
        title="Stage ageing"
        sub="Average days cases have spent alive, by stage — red means the stage is a parking lot"
        onExport={() => exportOk("stage-ageing.csv", ["Stage", "Avg age (days)", "Cases"], stageRows.map((r) => [r.label, r.value, r.sub]))}
      >
        {stageRows.length ? <BarList items={stageRows} unit="d" /> : <p className="text-[12.5px] text-[var(--ink-faint)]">No live cases.</p>}
      </ReportCard>

      <ReportCard
        title="No next action"
        sub="Open cases with nobody owning the next step — the silent killers"
        onExport={() => exportOk("no-next-action.csv", ["Case", "Customer", "Stage", "Owner", "Age (days)"], noAction.map((c) => [c.caseNumber, c.customer, c.stage, userById(c.ownerId)?.name ?? "", ageDays(c.createdAt)]))}
      >
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
    </div>
  );
}
