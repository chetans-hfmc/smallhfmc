import { useMemo, useState } from "react";
import { slaFor, stageEnteredAt, useStore } from "../lib/store";
import type { LoanCase, Task } from "../lib/types";
import {
  ageDays, caseStatusOf, fmtDate, fmtDateTime, fmtMoney, inDaysISO, primaryBank, relTime, todayISO,
} from "../lib/format";
import { Avatar, Chip, DueChip, Modal, StatusChip } from "../components/ui";
import { BankChips, CaseStateChip, CommissionPanel, ConfirmModal, SourceChip, WaButtons } from "../components/bits";
import {
  IArrowR, IBank, ICalc, IChevronL, IClock, IFlag, IHistory, IPlus, ITrash, IZap,
} from "../components/icons";

function EditableTask({ task }: { task: Task }) {
  const { db, canEditTask, updateTask, completeTask, toast, userById } = useStore();
  const editable = canEditTask(task);
  const [remarks, setRemarks] = useState("");

  return (
    <div className="card p-4" style={{ borderColor: "rgba(242,176,76,0.3)" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-disp font-semibold" style={{ color: "var(--amber)" }}>
          <IZap size={14} /> Current task
        </div>
        <DueChip dueISO={task.dueDate} />
      </div>
      <p className="text-[15px] font-medium mt-0 mb-1">{task.description}</p>
      <p className="text-[11.5px] text-[var(--ink-faint)] mt-0 mb-3">
        opened by <span className="text-[var(--ink-dim)]">{userById(task.createdBy)?.name ?? "—"}</span> · {relTime(task.createdAt)} · assigned to {userById(task.ownerId)?.name ?? "—"}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="label">Owner</label>
          <select className="select" value={task.ownerId} disabled={!editable} onChange={(e) => updateTask(task.id, { ownerId: parseInt(e.target.value, 10) })}>
            {db.users.filter((u) => u.active).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Waiting for</label>
          <select className="select" value={task.waitingFor} disabled={!editable} onChange={(e) => updateTask(task.id, { waitingFor: e.target.value })}>
            {db.waitingFor.filter((w) => w.active).map((w) => (
              <option key={w.id}>{w.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Why pending</label>
          <select className="select" value={task.whyPending} disabled={!editable} onChange={(e) => updateTask(task.id, { whyPending: e.target.value })}>
            {db.whyPending.filter((w) => w.active).map((w) => (
              <option key={w.id}>{w.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Due date</label>
          <input className="input mono" type="date" value={task.dueDate} disabled={!editable} onChange={(e) => e.target.value && updateTask(task.id, { dueDate: e.target.value })} />
        </div>
      </div>
      {editable && (
        <div className="flex items-center gap-2 mt-4">
          <input className="input" style={{ flex: 1 }} placeholder="Remarks on completion (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          <button
            className="btn btn-mint"
            onClick={() => {
              completeTask(task.id, remarks);
              toast("success", "Task marked done.");
            }}
          >
            Mark done
          </button>
        </div>
      )}
    </div>
  );
}

function NextTaskModal({ c, open, onClose }: { c: LoanCase; open: boolean; onClose: () => void }) {
  const { db, createTask, toast } = useStore();
  const [desc, setDesc] = useState("");
  const [ownerId, setOwnerId] = useState(c.ownerId);
  const [waiting, setWaiting] = useState(db.waitingFor[0]?.label ?? "Client");
  const [why, setWhy] = useState(db.whyPending[0]?.label ?? "");
  const [due, setDue] = useState(inDaysISO(3));
  const [err, setErr] = useState("");

  if (!open) return null;

  const submit = () => {
    if (!desc.trim()) return setErr("Describe the next action.");
    createTask(c.id, { description: desc, ownerId, waitingFor: waiting, whyPending: why, dueDate: due });
    toast("success", "Next task opened — previous task archived.");
    setDesc("");
    setErr("");
    onClose();
  };

  return (
    <Modal onClose={onClose} title={`Next task · ${c.caseNumber}`} width={520}>
      <p className="text-[12px] text-[var(--ink-faint)] mt-0 mb-3">
        You are recorded as the <strong className="text-[var(--ink-dim)]">opener</strong>; the owner below is who executes it. Opening a task supersedes the current one, so every case always has exactly one next action.
      </p>
      <div className="space-y-3">
        <div>
          <label className="label">What needs to happen next?</label>
          <input className="input" autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Chase bank RM for sanction memo" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Owner</label>
            <select className="select" value={ownerId} onChange={(e) => setOwnerId(parseInt(e.target.value, 10))}>
              {db.users.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
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
          <div>
            <label className="label">Why pending</label>
            <select className="select" value={why} onChange={(e) => setWhy(e.target.value)}>
              {db.whyPending.filter((w) => w.active).map((w) => (
                <option key={w.id}>{w.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {err && <p className="text-[12.5px] mt-2 mb-0" style={{ color: "var(--coral)" }}>{err}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}>Open task</button>
      </div>
    </Modal>
  );
}

function InstructionsPanel({ c }: { c: LoanCase }) {
  const { db, session, addInstruction, completeInstruction, canInstruct, userById, toast } = useStore();
  const list = db.instructions.filter((i) => i.caseId === c.id).sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "Open" ? -1 : 1));
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState(c.ownerId);
  const [due, setDue] = useState(inDaysISO(2));
  const manager = canInstruct();

  return (
    <div className="card">
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--line-soft)" }}>
        <IFlag size={15} className="text-[var(--sky)]" />
        <h3 className="font-disp font-semibold text-[13.5px] m-0">Manager instructions</h3>
        <span className="mono text-[11px] text-[var(--ink-faint)] ml-auto">{list.filter((i) => i.status === "Open").length} open</span>
      </div>
      <div className="p-4 space-y-2.5">
        {list.length === 0 && <p className="text-[12.5px] text-[var(--ink-faint)] m-0">No directives on this case.</p>}
        {list.map((i) => {
          const overdue = i.status === "Open" && i.dueDate < todayISO();
          return (
            <div key={i.id} className="rounded-lg p-3 flex items-start gap-3" style={{ background: i.status === "Open" ? "rgba(87,194,234,0.05)" : "rgba(232,241,239,0.02)", border: `1px solid ${i.status === "Open" ? "rgba(87,194,234,0.18)" : "var(--line-soft)"}` }}>
              <Avatar name={userById(i.issuedBy)?.name ?? "?"} size={28} />
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] m-0 ${i.status === "Done" ? "line-through text-[var(--ink-faint)]" : ""}`}>{i.instruction}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-[var(--ink-faint)]">
                  <span>by <span className="text-[var(--ink-dim)]">{userById(i.issuedBy)?.name ?? "—"}</span></span>
                  <span>→ <span className="text-[var(--ink-dim)]">{userById(i.assignedTo)?.name ?? "—"}</span></span>
                  <span className={overdue ? "font-semibold" : ""} style={overdue ? { color: "var(--coral)" } : undefined}>due {fmtDate(i.dueDate)}</span>
                  {i.status === "Done" && i.completedAt && <span>done {relTime(i.completedAt)}</span>}
                </div>
              </div>
              {i.status === "Open" && (manager || i.assignedTo === session?.id) && (
                <button className="btn btn-ghost btn-sm shrink-0" onClick={() => { completeInstruction(i.id); toast("success", "Instruction marked done."); }}>
                  Done
                </button>
              )}
            </div>
          );
        })}

        {manager && c.caseStatus === "Active" && (
          <div className="pt-2 mt-1" style={{ borderTop: "1px dashed var(--line)" }}>
            <label className="label">Issue an instruction</label>
            <textarea className="textarea" rows={2} placeholder="e.g. Call the client today and get the NOC — do not let this slip." value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex flex-wrap gap-2 mt-2">
              <select className="select" style={{ width: 170 }} value={assignee} onChange={(e) => setAssignee(parseInt(e.target.value, 10))}>
                {db.users.filter((u) => u.active).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <input className="input mono" style={{ width: 150 }} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  if (!text.trim()) return toast("error", "Write the instruction first.");
                  addInstruction(c.id, { instruction: text, assignedTo: assignee, dueDate: due });
                  setText("");
                  toast("success", "Instruction issued.");
                }}
              >
                <IFlag size={13} /> Issue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CaseDetail({ id }: { id: number }) {
  const { db, nav, canEditCase, canEditTask, updateCase, setCaseState, deleteCase, userById, toast, session } = useStore();
  const c = db.cases.find((x) => x.id === id);
  const [showNext, setShowNext] = useState(false);
  const [confirm, setConfirm] = useState<"book" | "lost" | "reopen" | "delete" | null>(null);
  const [bookBank, setBookBank] = useState<string>("");

  const caseTasks = useMemo(() => db.tasks.filter((t) => t.caseId === id), [db.tasks, id]);
  const openTask = caseTasks.find((t) => t.status === "Open");
  const doneTasks = caseTasks.filter((t) => t.status === "Done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const trail = useMemo(() => db.activities.filter((a) => a.caseId === id).sort((a, b) => b.at.localeCompare(a.at)), [db.activities, id]);
  const checks = db.affordabilityChecks.filter((k) => k.caseId === id);

  if (!c) {
    return (
      <div className="card p-10 text-center anim-fade-up">
        <h2 className="font-disp font-semibold text-[18px] mb-2">Case not found</h2>
        <p className="text-[13px] text-[var(--ink-dim)]">It may have been deleted, or it's outside your scope.</p>
        <button className="btn btn-ghost mt-3 mx-auto" onClick={() => nav({ name: "dashboard" })}>
          <IChevronL size={15} /> Back to dashboard
        </button>
      </div>
    );
  }

  const status = caseStatusOf(c, db.tasks);
  const stages = [...db.stages].filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const stageIdx = stages.findIndex((s) => s.label === c.stage);
  const editable = canEditCase(c);
  const isActive = c.caseStatus === "Active";
  const rule = slaFor(db.slaRules, c.stage, primaryBank(c));
  const daysInStage = isActive ? Math.max(0, Math.floor((Date.now() - new Date(stageEnteredAt(c, db.activities)).getTime()) / 86400000)) : null;

  const moveStage = (label: string) => {
    if (!editable || label === c.stage) return;
    if (!isActive) return toast("error", "Reopen the case to move stages.");
    updateCase(c.id, { stage: label });
    toast("info", `Stage → ${label}`);
  };

  return (
    <div className="space-y-4">
      <button className="flex items-center gap-1 text-[12.5px] text-[var(--ink-dim)] hover:text-[var(--ink)] transition-colors" onClick={() => nav({ name: "dashboard" })}>
        <IChevronL size={15} /> All cases
      </button>

      {/* WhatsApp chase bar — first thing on the case */}
      {(c.whatsapp || c.waGroup) && (
        <div className="card px-4 py-2.5 flex flex-wrap items-center gap-3 anim-fade-up" style={{ borderColor: "rgba(67,214,155,0.3)" }}>
          <span className="text-[11px] uppercase tracking-[0.12em] font-disp font-semibold" style={{ color: "var(--mint)" }}>
            Client chase
          </span>
          <span className="mono text-[12px] text-[var(--ink-dim)]">{c.whatsapp}</span>
          <div className="ml-auto">
            <WaButtons c={c} agentName={session?.name.split(" ")[0] ?? "HFMC"} />
          </div>
        </div>
      )}

      {/* header */}
      <div className="card p-5 anim-fade-up">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="mono text-[13px] font-semibold" style={{ color: "var(--amber)" }}>{c.caseNumber}</span>
              <StatusChip status={status} />
              <CaseStateChip state={c.caseStatus} />
              {c.closedDate && <span className="text-[11.5px] text-[var(--ink-faint)]">{c.caseStatus === "Lost" ? "lost" : "booked"} {fmtDate(c.closedDate)}</span>}
            </div>
            <h1 className="font-disp font-bold text-[24px] tracking-tight mt-1 mb-1">{c.customer}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-[var(--ink-dim)]">
              <span className="inline-flex items-center gap-1.5"><IBank size={14} className="text-[var(--ink-faint)]" /> <BankChips c={c} max={3} /></span>
              <span className="inline-flex items-center gap-1.5"><SourceChip source={c.source} />{c.partner && <span className="text-[var(--ink-faint)]">{c.partner.name} @ {c.partner.sharePct}%</span>}</span>
              <span className="mono">{fmtMoney(c.loanAmount)}</span>
              <span className="inline-flex items-center gap-1.5"><IClock size={14} className="text-[var(--ink-faint)]" /> {ageDays(c.createdAt)}d old</span>
              {daysInStage != null && rule && (
                <span className="inline-flex items-center gap-1.5" style={{ color: daysInStage > rule.maxDays ? "var(--coral)" : undefined }}>
                  <IFlag size={13} /> {daysInStage}d in stage · SLA {rule.maxDays}d{rule.bank ? ` (${rule.bank})` : ""}
                </span>
              )}
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {isActive ? (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setBookBank(c.wonBank ?? c.banks[0] ?? db.banks[0]?.name ?? "");
                    setConfirm("book");
                  }}
                >
                  Mark booked
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirm("lost")}>
                  Mark lost
                </button>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm("reopen")}>
                Reopen case
              </button>
            )}
            {session?.role === "Head of Company" && (
              <button className="btn btn-danger btn-sm" onClick={() => setConfirm("delete")} title="Delete case (Head of Company only)">
                <ITrash size={14} />
              </button>
            )}
          </div>
        </div>

        {/* stage stepper */}
        <div className="mt-5 overflow-x-auto pb-1">
          <div className="flex items-center min-w-max">
            {stages.map((s, i) => {
              const reached = i < stageIdx || c.stage === "Closure" || c.stage === "Closed";
              const current = s.label === c.stage;
              const lost = c.caseStatus === "Lost";
              return (
                <div key={s.id} className="flex items-center">
                  <button
                    className="flex flex-col items-center gap-1.5 group"
                    onClick={() => moveStage(s.label)}
                    disabled={!editable}
                    title={editable ? `Move to ${s.label}` : s.label}
                  >
                    <span
                      className="w-[26px] h-[26px] rounded-full flex items-center justify-center mono text-[11px] font-semibold transition-all"
                      style={
                        current
                          ? { background: lost ? "var(--coral)" : "var(--amber)", color: "#231a08", boxShadow: `0 0 0 4px ${lost ? "rgba(242,115,99,0.18)" : "rgba(242,176,76,0.16)"}` }
                          : reached
                          ? { background: "rgba(67,214,155,0.16)", color: "var(--mint)", border: "1px solid rgba(67,214,155,0.4)" }
                          : { background: "var(--bg2)", color: "var(--ink-faint)", border: "1px solid var(--line)" }
                      }
                    >
                      {i + 1}
                    </span>
                    <span className={`text-[10.5px] font-disp whitespace-nowrap transition-colors ${current ? "text-[var(--ink)] font-semibold" : "text-[var(--ink-faint)] group-hover:text-[var(--ink-dim)]"}`}>
                      {s.label}
                    </span>
                  </button>
                  {i < stages.length - 1 && (
                    <div className="w-7 h-px mx-1 mb-[22px]" style={{ background: i < stageIdx ? "rgba(67,214,155,0.5)" : "var(--line)" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!isActive && (
        <div className="card px-4 py-3 text-[13px] anim-fade-up" style={{ borderColor: c.caseStatus === "Lost" ? "rgba(242,115,99,0.3)" : "rgba(87,194,234,0.3)", color: "var(--ink-dim)" }}>
          This case is <strong style={{ color: c.caseStatus === "Lost" ? "var(--coral)" : "var(--sky)" }}>{c.caseStatus === "Lost" ? "lost" : "booked"}</strong> — the task engine is paused. Reopen it to resume work.
        </div>
      )}

      {/* task + side panels */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
        <div className="space-y-4">
          {isActive && openTask && <EditableTask task={openTask} />}
          {isActive && !openTask && (
            <div className="card p-6 text-center anim-fade-up" style={{ borderColor: "rgba(242,115,99,0.35)" }}>
              <p className="font-disp font-semibold text-[15px] m-0" style={{ color: "var(--coral)" }}>No next action on this case</p>
              <p className="text-[12.5px] text-[var(--ink-dim)] mt-1 mb-4">It's silently sitting in “{c.stage}”. Open the next step so someone owns it.</p>
              <button className="btn btn-primary mx-auto" onClick={() => setShowNext(true)}>
                <IPlus size={15} /> Open next task
              </button>
            </div>
          )}
          {isActive && (
            <div className="flex justify-end">
              {openTask && (
                <button className="btn btn-ghost" onClick={() => setShowNext(true)}>
                  <IArrowR size={15} /> Open next task
                </button>
              )}
            </div>
          )}

          {/* completed tasks */}
          <div className="card anim-fade-up">
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--line-soft)" }}>
              <h3 className="font-disp font-semibold text-[13.5px] m-0">Task history</h3>
            </div>
            {doneTasks.length === 0 ? (
              <p className="text-[12.5px] text-[var(--ink-faint)] p-4 m-0">No completed tasks yet.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
                {doneTasks.map((t) => (
                  <div key={t.id} className="px-4 py-3 flex items-start gap-3" style={{ borderColor: "var(--line-soft)" }}>
                    <span className="mt-0.5 w-[18px] h-[18px] rounded-full shrink-0 flex items-center justify-center" style={{ background: "rgba(67,214,155,0.14)", color: "var(--mint)", fontSize: 10 }}>✓</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] m-0">{t.description}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-[var(--ink-faint)]">
                        <span>by {userById(t.createdBy)?.name.split(" ")[0] ?? "—"}</span>
                        <span>→ {userById(t.ownerId)?.name.split(" ")[0] ?? "—"}</span>
                        {t.completedAt && <span>done {relTime(t.completedAt)}</span>}
                        {t.remarks && <span className="italic">“{t.remarks}”</span>}
                      </div>
                    </div>
                    <Chip tone="slate">{t.waitingFor}</Chip>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* affordability checks */}
          {checks.length > 0 && (
            <div className="card anim-fade-up">
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--line-soft)" }}>
                <ICalc size={15} className="text-[var(--amber)]" />
                <h3 className="font-disp font-semibold text-[13.5px] m-0">Affordability checks</h3>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
                {checks.map((k) => (
                  <div key={k.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ borderColor: "var(--line-soft)" }}>
                    {k.eligible ? <Chip tone="mint">Eligible</Chip> : <Chip tone="coral">Declined</Chip>}
                    <span className="mono font-semibold text-[13.5px]">{k.finalEligibleLoan > 0 ? fmtMoney(k.finalEligibleLoan) : "—"}</span>
                    <span className="text-[12px] text-[var(--ink-dim)]">
                      income {fmtMoney(k.monthlyIncome + k.otherIncome)} · EMIs {fmtMoney(k.existingEmis)} · {k.age}y {k.employmentType.toLowerCase()} · {k.bank} @{k.interestRate}%
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)] ml-auto">
                      by {userById(k.createdBy)?.name ?? "—"} · {relTime(k.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* right rail */}
        <div className="space-y-4">
          <CommissionPanel c={c} />

          {isActive && editable && (
            <div className="card p-4 anim-fade-up">
              <h3 className="font-disp font-semibold text-[13.5px] m-0 mb-1">Submitted banks</h3>
              <p className="text-[11px] text-[var(--ink-faint)] mt-0 mb-2.5">Toggle where this file is in play. The first bank sets the SLA override &amp; commission estimate.</p>
              <div className="flex flex-wrap gap-1.5">
                {db.banks.filter((b) => b.active).map((b) => {
                  const on = c.banks.includes(b.name);
                  return (
                    <button
                      key={b.id}
                      className="chip transition-all"
                      onClick={() => updateCase(c.id, { banks: on ? c.banks.filter((x) => x !== b.name) : [...c.banks, b.name] })}
                      style={on ? { background: "rgba(87,194,234,0.12)", borderColor: "var(--sky)", color: "var(--sky)" } : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
              {c.banks.length === 0 && <p className="text-[11.5px] mt-2 mb-0" style={{ color: "var(--amber)" }}>Bank not yet decided.</p>}
            </div>
          )}

          <InstructionsPanel c={c} />

          <div className="card anim-fade-up">
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--line-soft)" }}>
              <IHistory size={15} className="text-[var(--ink-faint)]" />
              <h3 className="font-disp font-semibold text-[13.5px] m-0">Activity trail</h3>
            </div>
            <div className="p-4 max-h-[420px] overflow-y-auto">
              {trail.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ink-faint)] m-0">No activity yet.</p>
              ) : (
                <div className="space-y-0">
                  {trail.map((a, i) => (
                    <div key={a.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: i === 0 ? "var(--amber)" : "var(--line)" }} />
                        {i < trail.length - 1 && <span className="w-px flex-1" style={{ background: "var(--line-soft)" }} />}
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className="text-[12.5px] m-0 leading-snug">
                          <span className="text-[var(--ink-dim)]">{userById(a.userId)?.name ?? "System"}</span>{" "}
                          <span className="font-medium">{a.action.toLowerCase()}</span>
                        </p>
                        {(a.oldValue || a.newValue) && (
                          <p className="text-[11.5px] text-[var(--ink-faint)] m-0 truncate">
                            {a.oldValue ? `${a.oldValue} → ` : ""}{a.newValue ?? ""}
                          </p>
                        )}
                        <p className="mono text-[10.5px] text-[var(--ink-faint)] mt-0.5 mb-0">{fmtDateTime(a.at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <NextTaskModal c={c} open={showNext} onClose={() => setShowNext(false)} />

      <ConfirmModal
        open={confirm === "book"}
        onClose={() => setConfirm(null)}
        tone="mint"
        title="Mark this case as booked?"
        body={
          <div>
            <p className="mt-0 mb-3">
              <strong>{c.caseNumber}</strong> · {c.customer} · {fmtMoney(c.loanAmount)} will be counted as closed business on {fmtDate(todayISO())}.
            </p>
            <label className="label">Which bank won the file?</label>
            <select className="select" value={bookBank} onChange={(e) => setBookBank(e.target.value)}>
              {c.banks.length > 0 && <optgroup label="Submitted to">{c.banks.map((b) => <option key={b}>{b}</option>)}</optgroup>}
              <optgroup label="Other banks">
                {db.banks.filter((b) => b.active && !c.banks.includes(b.name)).map((b) => (
                  <option key={b.id}>{b.name}</option>
                ))}
              </optgroup>
            </select>
            <p className="text-[11px] text-[var(--ink-faint)] mt-2 mb-0">Commission is booked at that bank's rate · admin-editable in Banks &amp; rates.</p>
          </div>
        }
        confirmLabel="Book case"
        onConfirm={() => {
          setCaseState(c.id, "Closed", bookBank);
          toast("success", `${c.caseNumber} booked with ${bookBank} — ${fmtMoney(c.loanAmount)} added to the book.`);
        }}
      />
      <ConfirmModal
        open={confirm === "lost"}
        onClose={() => setConfirm(null)}
        title="Mark this case as lost?"
        body={<span><strong>{c.caseNumber}</strong> · {c.customer} will move out of the live pipeline and into conversion reports as lost.</span>}
        confirmLabel="Mark lost"
        onConfirm={() => {
          setCaseState(c.id, "Lost");
          toast("info", `${c.caseNumber} marked lost.`);
        }}
      />
      <ConfirmModal
        open={confirm === "reopen"}
        onClose={() => setConfirm(null)}
        tone="primary"
        title="Reopen this case?"
        body={<span><strong>{c.caseNumber}</strong> returns to the active pipeline. The closed date is cleared and tasks can resume.</span>}
        confirmLabel="Reopen"
        onConfirm={() => {
          setCaseState(c.id, "Active");
          toast("success", `${c.caseNumber} reopened.`);
        }}
      />
      <ConfirmModal
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title="Delete this case permanently?"
        body={<span>This wipes <strong>{c.caseNumber}</strong>, its tasks, instructions and activity trail. This cannot be undone.</span>}
        confirmLabel="Delete case"
        onConfirm={() => {
          deleteCase(c.id);
          toast("info", `${c.caseNumber} deleted.`);
          nav({ name: "dashboard" });
        }}
      />
    </div>
  );
}

/* keep canEditTask referenced for future inline edits */
export type { Task };
