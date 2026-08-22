import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import type { LoanCase, Task } from "../lib/types";
import { TONE_HEX, ageDays, caseStatusOf, fmtDate, fmtDateTime, fmtMoney, inDaysISO, relTime, todayISO } from "../lib/format";
import { Avatar, Chip, ConfirmModal, DueChip, EmptyState, Modal, StatusChip } from "../components/ui";
import { BANKS } from "../lib/data";
import { IAlert, IBank, ICalendar, ICheck, IChevronL, IChevronR, IHistory, IPencil, IPlus, ITrash, IZap } from "../components/icons";

const actIcon = (action: string) => {
  if (action.includes("created")) return <IPlus size={13} />;
  if (action.includes("Stage")) return <IChevronR size={13} />;
  if (action.includes("completed")) return <ICheck size={13} />;
  if (action.includes("Task")) return <IZap size={13} />;
  return <IPencil size={13} />;
};

/* ---------------- open task card (inline editing) ---------------- */

function OpenTaskCard({ t, onDone }: { t: Task; onDone: () => void }) {
  const { db, userById, canEditTask, updateTask, toast } = useStore();
  const editableTask = canEditTask(t);
  const [desc, setDesc] = useState(t.description);
  const [ownerId, setOwnerId] = useState(t.ownerId);
  const [waiting, setWaiting] = useState(t.waitingFor);
  const [why, setWhy] = useState(t.whyPending);
  const [due, setDue] = useState(t.dueDate);
  const dirty = desc !== t.description || ownerId !== t.ownerId || waiting !== t.waitingFor || why !== t.whyPending || due !== t.dueDate;
  const assignable = db.users.filter((u) => u.active);

  return (
    <div className="card p-4 anim-fade-up" style={{ borderColor: "rgba(242,176,76,0.3)", background: "linear-gradient(180deg, rgba(242,176,76,0.05), rgba(18,36,44,0.7))" }}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="w-2 h-2 rounded-full" style={{ background: "var(--amber)" }} />
        <p className="font-disp text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)] m-0">Current task · opened {relTime(t.createdAt)}</p>
        <span className="ml-auto"><DueChip dueISO={t.dueDate} /></span>
      </div>
      {editableTask ? (
        <input className="input font-medium !text-[14.5px]" value={desc} onChange={(e) => setDesc(e.target.value)} />
      ) : (
        <p className="font-medium text-[14.5px] m-0">{t.description}</p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <div>
          <label className="label">Owner</label>
          {editableTask ? (
            <select className="select" value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value))}>
              {assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          ) : (
            <p className="text-[13px] m-0 mt-1.5">{userById(t.ownerId)?.name ?? "—"}</p>
          )}
        </div>
        <div>
          <label className="label">Waiting for</label>
          {editableTask ? (
            <select className="select" value={waiting} onChange={(e) => setWaiting(e.target.value)}>
              {db.waitingFor.filter((w) => w.active).map((w) => <option key={w.id}>{w.label}</option>)}
            </select>
          ) : (
            <p className="text-[13px] m-0 mt-1.5">{t.waitingFor}</p>
          )}
        </div>
        <div>
          <label className="label">Why pending</label>
          {editableTask ? (
            <select className="select" value={why} onChange={(e) => setWhy(e.target.value)}>
              {db.whyPending.filter((w) => w.active).map((w) => <option key={w.id}>{w.label}</option>)}
            </select>
          ) : (
            <p className="text-[13px] m-0 mt-1.5">{t.whyPending}</p>
          )}
        </div>
        <div>
          <label className="label">Due date</label>
          {editableTask ? (
            <input className="input mono" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          ) : (
            <p className="mono text-[13px] m-0 mt-1.5 flex items-center gap-1.5"><ICalendar size={13} /> {fmtDate(t.dueDate)}</p>
          )}
        </div>
      </div>
      {editableTask && (
        <div className="flex items-center gap-2.5 mt-4">
          <button className="btn btn-mint" onClick={onDone}><ICheck size={15} /> Mark done</button>
          <button
            className="btn btn-ghost"
            disabled={!dirty}
            onClick={() => {
              updateTask(t.id, { description: desc.trim(), ownerId, waitingFor: waiting, whyPending: why, dueDate: due });
              toast("success", "Task updated — logged to the trail.");
            }}
          >
            Save changes {dirty && <span className="w-1.5 h-1.5 rounded-full blink" style={{ background: "var(--amber)" }} />}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- modals ---------------- */

function NewTaskModal({ caseId, defaultOwnerId, supersede, onClose }: { caseId: number; defaultOwnerId: number; supersede?: string; onClose: () => void }) {
  const { db, createTask, toast } = useStore();
  const assignable = db.users.filter((u) => u.active && u.role !== "Admin");
  const [desc, setDesc] = useState("");
  const [ownerId, setOwnerId] = useState(defaultOwnerId || assignable[0]?.id || 0);
  const [waiting, setWaiting] = useState(db.waitingFor.find((w) => w.active)?.label ?? "Client");
  const [why, setWhy] = useState(db.whyPending.find((w) => w.active)?.label ?? "");
  const [due, setDue] = useState(inDaysISO(5));
  const [err, setErr] = useState("");

  return (
    <Modal
      title="Open next task"
      sub={supersede ? `Closes the current task: “${supersede}”` : "One open task per case keeps ownership obvious"}
      onClose={onClose}
      width={500}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!desc.trim()) return setErr("Describe the task first.");
              if (!due) return setErr("Pick a due date.");
              createTask(caseId, { description: desc, ownerId, waitingFor: waiting, whyPending: why, dueDate: due });
              toast("success", `Task opened: “${desc.trim()}”.${supersede ? " Previous task superseded." : ""}`);
              onClose();
            }}
          >
            <IPlus size={15} /> Open task
          </button>
        </>
      }
    >
      <label className="label">Task</label>
      <input className="input" placeholder="e.g. Chase credit team for sanction memo" value={desc} onChange={(e) => { setDesc(e.target.value); setErr(""); }} autoFocus />
      <div className="grid grid-cols-2 gap-3 mt-3.5">
        <div>
          <label className="label">Owner</label>
          <select className="select" value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value))}>
            {assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Due date</label>
          <input className="input mono" type="date" min={todayISO()} value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div>
          <label className="label">Waiting for</label>
          <select className="select" value={waiting} onChange={(e) => setWaiting(e.target.value)}>
            {db.waitingFor.filter((w) => w.active).map((w) => <option key={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Why pending</label>
          <select className="select" value={why} onChange={(e) => setWhy(e.target.value)}>
            {db.whyPending.filter((w) => w.active).map((w) => <option key={w.id}>{w.label}</option>)}
          </select>
        </div>
      </div>
      {err && <p className="text-[12.5px] mt-3 mb-0" style={{ color: "var(--coral)" }}>{err}</p>}
    </Modal>
  );
}

function DoneModal({ t, onClose }: { t: Task; onClose: () => void }) {
  const { completeTask, toast } = useStore();
  const [remarks, setRemarks] = useState("");
  return (
    <Modal
      title="Complete task"
      sub={t.description}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Not yet</button>
          <button
            className="btn btn-mint"
            onClick={() => {
              completeTask(t.id, remarks);
              toast("success", `“${t.description}” marked done.`);
              onClose();
            }}
          >
            <ICheck size={15} /> Mark done
          </button>
        </>
      }
    >
      <label className="label">Remarks (optional)</label>
      <textarea className="textarea" rows={3} placeholder="e.g. Memo received, shared with client…" value={remarks} onChange={(e) => setRemarks(e.target.value)} autoFocus />
      <p className="text-[11.5px] text-[var(--ink-faint)] mt-2 mb-0">The case flips to “No Action” until the next task is opened.</p>
    </Modal>
  );
}

function EditCaseModal({ c, onClose }: { c: LoanCase; onClose: () => void }) {
  const { db, updateCase, toast } = useStore();
  const assignable = db.users.filter((u) => u.active);
  const [customer, setCustomer] = useState(c.customer);
  const [bank, setBank] = useState(c.bank);
  const [amountL, setAmountL] = useState(String(c.loanAmount / 100000));
  const [ownerId, setOwnerId] = useState(c.ownerId);
  return (
    <Modal
      title={`Edit ${c.caseNumber}`}
      sub="Changes are written to the activity trail"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const amt = parseFloat(amountL);
              if (!customer.trim() || !amt || amt <= 0) {
                toast("error", "Check customer name and loan amount.");
                return;
              }
              updateCase(c.id, { customer: customer.trim(), bank, loanAmount: Math.round(amt * 100000), ownerId });
              toast("success", "Case details saved.");
              onClose();
            }}
          >
            Save changes
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2">
          <label className="label">Customer</label>
          <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </div>
        <div>
          <label className="label">Bank</label>
          <select className="select" value={bank} onChange={(e) => setBank(e.target.value)}>
            {[...new Set([...BANKS, bank])].map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Loan (₹ lakh)</label>
          <input className="input mono" type="number" min="1" value={amountL} onChange={(e) => setAmountL(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Owner</label>
          <select className="select" value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value))}>
            {assignable.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- main view ---------------- */

export default function CaseDetail({ id }: { id: number }) {
  const { db, nav, session, userById, canEditCase, updateCase, deleteCase, toast } = useStore();
  const c = db.cases.find((x) => x.id === id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [doneTask, setDoneTask] = useState<Task | null>(null);

  const caseTasks = useMemo(() => db.tasks.filter((t) => t.caseId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.tasks, id]);
  const openTasks = caseTasks.filter((t) => t.status === "Open");
  const doneTasks = caseTasks.filter((t) => t.status === "Done");
  const acts = useMemo(() => db.activities.filter((a) => a.caseId === id).sort((a, b) => b.at.localeCompare(a.at)), [db.activities, id]);

  if (!c) {
    return (
      <div className="card">
        <EmptyState icon={<IAlert size={20} />} title="Case not found" body="It may have been deleted, or the link is stale." />
        <div className="flex justify-center pb-6">
          <button className="btn btn-ghost" onClick={() => nav({ name: "dashboard" })}><IChevronL size={15} /> Back to dashboard</button>
        </div>
      </div>
    );
  }

  const owner = userById(c.ownerId);
  const status = caseStatusOf(c, db.tasks);
  const editable = canEditCase(c);
  const closed = c.stage === "Closed";
  const stages = [...db.stages].filter((s) => s.active || s.label === c.stage).sort((a, b) => a.sortOrder - b.sortOrder);
  const curIdx = stages.findIndex((s) => s.label === c.stage);
  const statusColor = TONE_HEX[status === "On Track" ? "mint" : status === "At Risk" ? "amber" : status === "Overdue" ? "coral" : "slate"];

  return (
    <div className="space-y-4">
      <button className="btn btn-ghost btn-sm -ml-2" onClick={() => nav({ name: "dashboard" })}>
        <IChevronL size={15} /> All cases
      </button>

      {/* header */}
      <div className="card p-5 anim-fade-up relative overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${statusColor}, transparent 65%)` }} />
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="min-w-[220px]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="mono text-[13px] font-semibold" style={{ color: "var(--amber)" }}>{c.caseNumber}</span>
              {closed ? <Chip tone="mint">Closed</Chip> : <StatusChip status={status} />}
            </div>
            <h2 className="font-disp font-bold text-[24px] tracking-tight mt-1.5 mb-0.5">{c.customer}</h2>
            <p className="text-[12.5px] text-[var(--ink-faint)] m-0 flex items-center gap-1.5">
              <IBank size={13} /> {c.bank} · <span className="mono">{fmtMoney(c.loanAmount)}</span>
            </p>
          </div>
          <div className="flex gap-6 flex-wrap text-[12.5px]">
            <div>
              <p className="label !mb-1">Owner</p>
              <span className="flex items-center gap-2"><Avatar name={owner?.name ?? "?"} size={24} /> {owner?.name ?? "Unassigned"}</span>
            </div>
            <div>
              <p className="label !mb-1">Age</p>
              <p className="mono m-0 mt-[3px]">{ageDays(c.createdAt)} days <span className="text-[var(--ink-faint)]">(opened {fmtDate(c.createdAt)})</span></p>
            </div>
            <div>
              <p className="label !mb-1">Last activity</p>
              <p className="mono m-0 mt-[3px]">{relTime(c.updatedAt)}</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2 items-center flex-wrap">
            {editable && !closed && (
              <button className="btn btn-primary" onClick={() => setTaskOpen(true)}><IPlus size={15} /> New task</button>
            )}
            {editable && (
              <button className="btn btn-ghost" onClick={() => setEditOpen(true)}><IPencil size={14} /> Edit</button>
            )}
            {session?.role === "Admin" && (
              <button className="btn btn-danger btn-sm" onClick={() => setDeleteOpen(true)} aria-label="Delete case" title="Delete case"><ITrash size={14} /></button>
            )}
          </div>
        </div>
      </div>

      {/* stage stepper */}
      <div className="card p-4 anim-fade-up">
        <p className="label !mb-3">Workflow stage {closed && <span className="normal-case tracking-normal font-normal">· locked</span>}</p>
        <div className="flex items-start overflow-x-auto pb-1">
          {stages.map((s, i) => {
            const state = i < curIdx ? "done" : i === curIdx ? "now" : "next";
            return (
              <div key={s.id} className="flex items-start shrink-0">
                {i > 0 && <span className="mt-[9px] h-[2px] w-5 md:w-8 rounded" style={{ background: i <= curIdx ? "var(--amber)" : "var(--line)" }} />}
                <button
                  disabled={!editable || closed || i === curIdx}
                  onClick={() => {
                    updateCase(c.id, { stage: s.label });
                    toast("success", `${c.caseNumber} moved to ${s.label}.`);
                  }}
                  className="flex flex-col items-center gap-1.5 px-1.5 disabled:cursor-default"
                  title={editable && !closed && i !== curIdx ? `Move to ${s.label}` : s.label}
                >
                  <span
                    className="w-[20px] h-[20px] rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: state === "done" ? "rgba(67,214,155,0.16)" : state === "now" ? "var(--amber)" : "var(--bg2)",
                      border: `1.5px solid ${state === "done" ? "var(--mint)" : state === "now" ? "var(--amber)" : "var(--line)"}`,
                      color: state === "done" ? "var(--mint)" : state === "now" ? "#231a08" : "var(--ink-faint)",
                      boxShadow: state === "now" ? "0 0 0 4px rgba(242,176,76,0.15)" : undefined,
                    }}
                  >
                    {state === "done" ? <ICheck size={11} strokeWidth={2.6} /> : <span className="mono text-[9px] font-semibold">{i + 1}</span>}
                  </span>
                  <span
                    className="text-[10.5px] font-medium whitespace-nowrap max-w-[78px] truncate"
                    style={{ color: state === "now" ? "var(--ink)" : state === "done" ? "var(--ink-dim)" : "var(--ink-faint)" }}
                  >
                    {s.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 space-y-4">
          {openTasks.length === 0 ? (
            <div className="card p-6 anim-fade-up text-center">
              <p className="font-disp font-semibold text-[15px] mb-1 mt-0">{closed ? "File closed" : "No next action"}</p>
              <p className="text-[12.5px] text-[var(--ink-faint)] max-w-[380px] mx-auto mb-4 mt-0">
                {closed ? "This case completed its journey. History is preserved below." : "An open case without a task goes stale fast. Open the next action so someone owns it."}
              </p>
              {editable && !closed && <button className="btn btn-primary" onClick={() => setTaskOpen(true)}><IPlus size={15} /> Open the next task</button>}
            </div>
          ) : (
            openTasks.map((t) => <OpenTaskCard key={t.id} t={t} onDone={() => setDoneTask(t)} />)
          )}

          {doneTasks.length > 0 && (
            <div className="card anim-fade-up">
              <p className="font-disp font-semibold text-[13.5px] px-4 pt-4 pb-2 m-0">Completed tasks <span className="mono text-[11px] text-[var(--ink-faint)]">({doneTasks.length})</span></p>
              <div>
                {doneTasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
                    <span className="mt-[2px] w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(67,214,155,0.13)", color: "var(--mint)" }}>
                      <ICheck size={11} strokeWidth={2.6} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] m-0 leading-snug" style={{ textDecoration: "line-through", textDecorationColor: "rgba(232,241,239,0.25)" }}>{t.description}</p>
                      <p className="text-[11.5px] text-[var(--ink-faint)] m-0 mt-0.5">
                        {userById(t.ownerId)?.name ?? "—"} · done {t.completedAt ? fmtDateTime(t.completedAt) : "—"}
                        {t.remarks && <span className="text-[var(--ink-dim)]"> · “{t.remarks}”</span>}
                      </p>
                    </div>
                    <Chip tone="slate">{t.waitingFor}</Chip>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card anim-fade-up">
          <p className="font-disp font-semibold text-[13.5px] px-4 pt-4 pb-2 m-0 flex items-center gap-2"><IHistory size={15} /> Activity trail</p>
          <div className="px-4 pb-4 max-h-[520px] overflow-y-auto">
            {acts.map((a, i) => (
              <div key={a.id} className="flex gap-3 relative pb-4">
                {i < acts.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px" style={{ background: "var(--line-soft)" }} />}
                <span className="w-[27px] h-[27px] rounded-full flex items-center justify-center shrink-0 z-10" style={{ background: "var(--raised)", border: "1px solid var(--line)", color: "var(--amber)" }}>
                  {actIcon(a.action)}
                </span>
                <div className="min-w-0 pt-[2px]">
                  <p className="text-[12.5px] m-0 leading-snug">
                    <b>{userById(a.userId)?.name ?? "System"}</b>
                    <span className="text-[var(--ink-dim)]"> {a.action.toLowerCase()}</span>
                  </p>
                  {(a.oldValue || a.newValue) && (
                    <p className="mono text-[11px] text-[var(--ink-faint)] m-0 mt-0.5 truncate">
                      {a.oldValue ? `${a.oldValue} → ` : ""}{a.newValue ?? ""}
                    </p>
                  )}
                  <p className="text-[10.5px] text-[var(--ink-faint)] m-0 mt-0.5">{fmtDateTime(a.at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editOpen && <EditCaseModal c={c} onClose={() => setEditOpen(false)} />}
      {deleteOpen && (
        <ConfirmModal
          title="Delete this case?"
          danger
          confirmLabel="Delete permanently"
          body={<>This removes <b>{c.caseNumber}</b> ({c.customer}), its {caseTasks.length} task(s) and full activity trail. There is no undo.</>}
          onConfirm={() => {
            deleteCase(c.id);
            toast("info", `${c.caseNumber} deleted.`);
            nav({ name: "dashboard" });
          }}
          onClose={() => setDeleteOpen(false)}
        />
      )}
      {taskOpen && (
        <NewTaskModal
          caseId={c.id}
          defaultOwnerId={c.ownerId}
          supersede={openTasks[0]?.description}
          onClose={() => setTaskOpen(false)}
        />
      )}
      {doneTask && <DoneModal t={doneTask} onClose={() => setDoneTask(null)} />}
    </div>
  );
}
