import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import type { Task } from "../lib/types";
import { fmtDateTime, relTime, todayISO } from "../lib/format";
import { Avatar, Chip, DueChip, EmptyState, Modal, Seg } from "../components/ui";
import { ICheck, ISearch, ITasks } from "../components/icons";

type Tab = "open" | "done" | "all";

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
      <textarea className="textarea" rows={3} placeholder="What happened?" value={remarks} onChange={(e) => setRemarks(e.target.value)} autoFocus />
    </Modal>
  );
}

export default function Tasks() {
  const { db, nav, visibleTasks, visibleCases, userById, canEditTask } = useStore();
  const [tab, setTab] = useState<Tab>("open");
  const [ownerF, setOwnerF] = useState("all");
  const [waitingF, setWaitingF] = useState("all");
  const [query, setQuery] = useState("");
  const [doneTarget, setDoneTarget] = useState<Task | null>(null);

  const all = useMemo(() => visibleTasks(), [visibleTasks]);
  const caseById = useMemo(() => {
    const m = new Map(visibleCases().map((c) => [c.id, c]));
    // also allow looking up any case referenced (e.g. closed ones outside scope filters)
    for (const c of db.cases) if (!m.has(c.id)) m.set(c.id, c);
    return m;
  }, [visibleCases, db.cases]);

  const open = all.filter((t) => t.status === "Open");
  const done = all.filter((t) => t.status === "Done");
  const owners = useMemo(() => {
    const ids = Array.from(new Set(all.map((t) => t.ownerId)));
    return ids.map((id) => ({ id, name: userById(id)?.name ?? "Unassigned" })).sort((a, b) => a.name.localeCompare(b.name));
  }, [all, userById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = all;
    if (tab === "open") list = list.filter((t) => t.status === "Open");
    if (tab === "done") list = list.filter((t) => t.status === "Done");
    if (ownerF !== "all") list = list.filter((t) => t.ownerId === Number(ownerF));
    if (waitingF !== "all") list = list.filter((t) => t.waitingFor === waitingF);
    if (q) {
      list = list.filter((t) => {
        const c = caseById.get(t.caseId);
        const owner = userById(t.ownerId)?.name ?? "";
        return `${t.description} ${t.whyPending} ${c?.caseNumber ?? ""} ${c?.customer ?? ""} ${owner}`.toLowerCase().includes(q);
      });
    }
    const today = todayISO();
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === "Open" ? -1 : 1;
      if (a.status === "Open") return a.dueDate.localeCompare(b.dueDate) || (a.dueDate < today ? -1 : 1);
      return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
    });
  }, [all, tab, ownerF, waitingF, query, caseById, userById]);

  const overdue = open.filter((t) => t.dueDate < todayISO()).length;

  return (
    <div className="space-y-4">
      <div className="card p-4 anim-fade-up">
        <div className="flex flex-wrap items-center gap-3">
          <Seg<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "open", label: "Open", count: open.length },
              { value: "done", label: "Done", count: done.length },
              { value: "all", label: "All" },
            ]}
          />
          {overdue > 0 && tab !== "done" && (
            <Chip tone="coral" dot>{overdue} overdue</Chip>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"><ISearch size={14} /></span>
              <input className="input !pl-8 !py-[6.5px] w-[180px]" placeholder="Search tasks…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <select className="select !w-auto !py-[6.5px] text-[12.5px]" value={ownerF} onChange={(e) => setOwnerF(e.target.value)}>
              <option value="all">All owners</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select className="select !w-auto !py-[6.5px] text-[12.5px]" value={waitingF} onChange={(e) => setWaitingF(e.target.value)}>
              <option value="all">Waiting on anyone</option>
              {db.waitingFor.map((w) => <option key={w.id} value={w.label}>{w.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card anim-fade-up">
        {filtered.length === 0 ? (
          <EmptyState icon={<ITasks size={20} />} title="Queue is clear" body="No tasks match these filters. Open a case to log the next action." />
        ) : (
          <div className="overflow-x-auto max-h-[calc(100vh-260px)] overflow-y-auto">
            <table className="tbl min-w-[860px]">
              <thead>
                <tr>
                  <th>Task</th><th>Case</th><th>Owner</th><th>Waiting for</th><th>Why pending</th><th>Due / done</th><th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const c = caseById.get(t.caseId);
                  const owner = userById(t.ownerId);
                  const isOpen = t.status === "Open";
                  const od = isOpen && t.dueDate < todayISO();
                  return (
                    <tr key={t.id} style={{ opacity: isOpen ? 1 : 0.62 }}>
                      <td className="max-w-[260px]">
                        <p className="font-medium m-0 leading-snug" style={{ textDecoration: isOpen ? undefined : "line-through", textDecorationColor: "rgba(232,241,239,0.3)" }}>
                          {t.description}
                        </p>
                        <p className="text-[11px] text-[var(--ink-faint)] m-0 mt-0.5 truncate">
                          opened by <span className="text-[var(--ink-dim)]">{userById(t.createdBy)?.name.split(" ")[0] ?? "—"}</span> · {relTime(t.createdAt)}
                        </p>
                        {!isOpen && t.remarks && <p className="text-[11px] text-[var(--ink-faint)] m-0 mt-0.5 truncate">“{t.remarks}”</p>}
                      </td>
                      <td>
                        <button
                          className="text-left group"
                          onClick={() => nav({ name: "case", id: t.caseId })}
                        >
                          <span className="mono text-[12px] block transition-colors" style={{ color: "var(--amber)" }}>{c?.caseNumber ?? "—"}</span>
                          <span className="text-[11.5px] text-[var(--ink-faint)] group-hover:text-[var(--ink-dim)] transition-colors">{c?.customer ?? "deleted"} · {c?.stage ?? "—"}</span>
                        </button>
                      </td>
                      <td>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <Avatar name={owner?.name ?? "?"} size={22} />
                          <span className="text-[12.5px]">{owner?.name.split(" ")[0] ?? "—"}</span>
                        </span>
                      </td>
                      <td><Chip tone={t.waitingFor === "Client" ? "sky" : t.waitingFor === "Bank" ? "amber" : t.waitingFor === "Internal" ? "slate" : "coral"}>{t.waitingFor}</Chip></td>
                      <td className="text-[12.5px] text-[var(--ink-dim)] whitespace-nowrap">{t.whyPending}</td>
                      <td>{isOpen ? <DueChip dueISO={t.dueDate} /> : <span className="mono text-[11.5px] text-[var(--ink-faint)] whitespace-nowrap">{t.completedAt ? fmtDateTime(t.completedAt) : "—"}</span>}</td>
                      <td className="text-right">
                        {isOpen && canEditTask(t) ? (
                          <button className="btn btn-mint btn-sm" onClick={() => setDoneTarget(t)}>
                            <ICheck size={13} /> Done
                          </button>
                        ) : isOpen ? (
                          <span className="text-[11px] text-[var(--ink-faint)]">not yours</span>
                        ) : (
                          <span className="text-[11px]" style={{ color: od ? "var(--coral)" : "var(--mint)" }}>{od ? "was late" : "completed"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {doneTarget && <DoneModal t={doneTarget} onClose={() => setDoneTarget(null)} />}
    </div>
  );
}
