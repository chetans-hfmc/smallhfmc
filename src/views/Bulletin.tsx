import { useMemo, useState } from "react";
import { bulletinCanAct, bulletinVisible, flagsFor, useStore } from "../lib/store";
import type { BulletinItem, Reply } from "../lib/types";
import { fmtDate, relTime, todayISO } from "../lib/format";
import { Avatar, Chip, EmptyState } from "../components/ui";
import { IArrowR, ICheck, IFlag, IInbox, IPlus } from "../components/icons";

function ReplyThread({ replies, onSend }: { replies: Reply[]; onSend: (text: string) => void }) {
  const { userById } = useStore();
  const [draft, setDraft] = useState("");
  const send = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  };
  return (
    <div className="mt-3 space-y-2">
      {replies.map((r) => (
        <div key={r.id} className="flex items-start gap-2 anim-fade-in">
          <Avatar name={userById(r.userId)?.name ?? "?"} size={22} />
          <div className="min-w-0 flex-1 rounded-lg px-3 py-2" style={{ background: "rgba(232,241,239,0.035)", border: "1px solid var(--line-soft)" }}>
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-semibold">{userById(r.userId)?.name ?? "—"}</span>
              <span className="mono text-[10px] text-[var(--ink-faint)]">{relTime(r.at)}</span>
            </div>
            <p className="text-[12.5px] text-[var(--ink-dim)] m-0 mt-0.5 leading-snug">{r.text}</p>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Reply… (press Enter)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn btn-ghost btn-sm shrink-0" onClick={send} disabled={!draft.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

function DirectiveItem({ b }: { b: BulletinItem }) {
  const { db, session, nav, userById, completeBulletin, replyToBulletin, toast } = useStore();
  const [showThread, setShowThread] = useState(b.replies.length > 0);
  const me = session;
  if (!me) return null;
  const canAct = bulletinCanAct(b, me, db);
  const linkedCase = b.caseId ? db.cases.find((c) => c.id === b.caseId) : null;
  const issuer = userById(b.issuedBy);
  const doneBy = b.completedBy != null ? userById(b.completedBy) : null;

  return (
    <div
      className="card card-hover p-4 anim-fade-up"
      style={{ borderLeft: `3px solid ${b.status === "Open" ? "var(--amber)" : "var(--line)"}`, opacity: b.status === "Done" ? 0.72 : 1 }}
    >
      <div className="flex items-start gap-3">
        <Avatar name={issuer?.name ?? "?"} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-disp font-semibold text-[13.5px]">{issuer?.name ?? "—"}</span>
            <span className="text-[11px] text-[var(--ink-faint)]">{issuer?.role}</span>
            <span className="mono text-[10.5px] text-[var(--ink-faint)]">· {relTime(b.createdAt)}</span>
          </div>
          <p className={`text-[14px] leading-relaxed mt-1 mb-1.5 ${b.status === "Done" ? "line-through text-[var(--ink-faint)]" : "text-[var(--ink)]"}`}>
            {b.task}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold mr-0.5">to</span>
            {b.targets.map((t) => (
              <span key={t} className="chip" style={{ background: "rgba(87,194,234,0.08)", borderColor: "rgba(87,194,234,0.3)", color: "var(--sky)" }}>
                {userById(t)?.name.split(" ")[0] ?? "—"}
              </span>
            ))}
            {linkedCase && (
              <button
                className="chip transition-colors"
                style={{ background: "rgba(242,176,76,0.08)", borderColor: "rgba(242,176,76,0.35)", color: "var(--amber)", cursor: "pointer" }}
                onClick={() => nav({ name: "case", id: linkedCase.id })}
                title={`Open ${linkedCase.caseNumber}`}
              >
                {linkedCase.caseNumber} · {linkedCase.customer} <IArrowR size={11} />
              </button>
            )}
          </div>

          {b.status === "Done" && (
            <div className="flex items-center gap-1.5 mt-2 text-[11.5px]" style={{ color: "var(--mint)" }}>
              <ICheck size={13} /> done{doneBy ? ` by ${doneBy.name.split(" ")[0]}` : ""} {b.completedAt ? `· ${relTime(b.completedAt)}` : ""}
            </div>
          )}
        </div>

        {b.status === "Open" && canAct && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              className="btn btn-mint btn-sm"
              onClick={() => {
                completeBulletin(b.id);
                toast("success", "Directive marked done.");
              }}
            >
              <ICheck size={13} /> Done
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2.5 pl-[46px]">
        <button className="btn btn-ghost btn-sm" onClick={() => setShowThread((s) => !s)}>
          Reply {b.replies.length > 0 && <span className="mono">({b.replies.length})</span>}
        </button>
      </div>

      {showThread && (
        <div className="pl-[46px]">
          <ReplyThread replies={b.replies} onSend={(t) => replyToBulletin(b.id, t)} />
        </div>
      )}
    </div>
  );
}

export default function Bulletin() {
  const { db, session, nav, userById, issueBulletin, canInstruct, toast } = useStore();
  const me = session;
  const isIssuer = canInstruct();

  const [task, setTask] = useState("");
  const [date, setDate] = useState(todayISO());
  const [caseId, setCaseId] = useState<number>(0);
  const [targets, setTargets] = useState<number[]>(() => {
    if (!me) return [];
    const f = flagsFor(db.designations, me.role);
    const pool = db.users.filter((u) => u.active && u.id !== me.id);
    return f.scope === "team" ? pool.filter((u) => u.team === me.team).map((u) => u.id) : pool.map((u) => u.id);
  });

  const visible = useMemo(
    () => (me ? db.bulletin.filter((b) => bulletinVisible(b, me, db)) : []),
    [db, me]
  );

  const byDate = useMemo(() => {
    const groups = new Map<string, BulletinItem[]>();
    for (const b of [...visible].sort((a, z) => z.date.localeCompare(a.date) || z.createdAt.localeCompare(a.createdAt))) {
      const list = groups.get(b.date) ?? [];
      list.push(b);
      groups.set(b.date, list);
    }
    return Array.from(groups.entries());
  }, [visible]);

  if (!me) return null;

  const dateLabel = (iso: string) => {
    if (iso === todayISO()) return "Today";
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (iso === yest) return "Yesterday";
    return fmtDate(iso);
  };

  const toggleTarget = (id: number) =>
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const issue = () => {
    if (!task.trim()) return toast("error", "Write the directive first.");
    if (targets.length === 0) return toast("error", "Pick at least one teammate to address.");
    issueBulletin({ date, task, caseId: caseId || null, targets });
    toast("success", `Directive issued to ${targets.length} teammate${targets.length === 1 ? "" : "s"}.`);
    setTask("");
    setCaseId(0);
  };

  const targetPool = db.users.filter((u) => u.active && u.id !== me.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-disp font-bold text-[24px] tracking-tight m-0 flex items-center gap-2.5">
          <IFlag size={22} className="text-[var(--amber)]" /> Morning Bulletin
        </h1>
        <p className="text-[13px] text-[var(--ink-dim)] mt-0.5 mb-0">
          Directives issued daily to the team. Mark <strong>Done</strong> or <strong>Reply</strong> so everyone stays in the loop — no chasing on WhatsApp.
        </p>
      </div>

      {isIssuer && (
        <div className="card p-4 anim-fade-up">
          <h3 className="font-disp font-semibold text-[14px] m-0 mb-3">Issue a directive</h3>
          <textarea
            className="textarea"
            rows={2}
            placeholder="e.g. Everyone bring their overdue Pre-Approval files to the 9:30 huddle — we clear the backlog today."
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="label">For date</label>
              <input className="input mono" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Link to a case (optional)</label>
              <select className="select" value={caseId} onChange={(e) => setCaseId(parseInt(e.target.value, 10))}>
                <option value={0}>No case — general directive</option>
                {db.cases.filter((c) => c.caseStatus === "Active").map((c) => (
                  <option key={c.id} value={c.id}>{c.caseNumber} · {c.customer}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-1.5">
              <label className="label" style={{ margin: 0 }}>Address to</label>
              <button className="btn btn-ghost btn-sm" onClick={() => setTargets(targetPool.filter((u) => u.team === me.team).map((u) => u.id))}>
                My team
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setTargets(targetPool.map((u) => u.id))}>
                Everyone
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {targetPool.map((u) => {
                const on = targets.includes(u.id);
                return (
                  <button key={u.id} className="chip transition-all" onClick={() => toggleTarget(u.id)}
                    style={on ? { background: "rgba(67,214,155,0.12)", borderColor: "var(--mint)", color: "var(--mint)" } : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}>
                    {u.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button className="btn btn-primary" onClick={issue}>
              <IPlus size={15} /> Issue directive
            </button>
          </div>
        </div>
      )}

      {!isIssuer && (
        <div className="card px-4 py-3 text-[12.5px] text-[var(--ink-dim)] anim-fade-up" style={{ borderColor: "rgba(87,194,234,0.25)" }}>
          Directives are issued by your Team Lead or management. Yours appear below — mark them <strong>Done</strong> or <strong>Reply</strong>.
        </div>
      )}

      {byDate.length === 0 ? (
        <div className="card p-6">
          <EmptyState icon={<IInbox size={26} />} title="No directives yet" body="Nothing has been issued to you. When your lead posts the morning bulletin, it lands here." />
        </div>
      ) : (
        <div className="space-y-6">
          {byDate.map(([d, items]) => (
            <div key={d}>
              <div className="flex items-center gap-3 mb-2.5">
                <span className="font-disp font-semibold text-[13px] uppercase tracking-[0.1em]" style={{ color: d === todayISO() ? "var(--amber)" : "var(--ink-faint)" }}>
                  {dateLabel(d)}
                </span>
                <span className="mono text-[11px] text-[var(--ink-faint)]">{items.length} directive{items.length === 1 ? "" : "s"}</span>
                <span className="flex-1 h-px" style={{ background: "var(--line-soft)" }} />
              </div>
              <div className="space-y-3">
                {items.map((b) => <DirectiveItem key={b.id} b={b} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-[11.5px] text-[var(--ink-faint)] px-1">
        <Avatar name={me.name} size={20} />
        Directives are the management layer — they never change a case's stage or its next task. Use <button className="btn btn-ghost btn-sm" style={{ padding: "2px 8px" }} onClick={() => nav({ name: "tasks" })}>Task Queue</button> for file work.
      </div>
    </div>
  );
}
