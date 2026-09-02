import { useMemo, useState } from "react";
import { bulletinCanAct, bulletinCanDelete, bulletinCanManage, bulletinVisible, flagsFor, useStore } from "../lib/store";
import type { BulletinItem, Reply } from "../lib/types";
import { daysBetween, downloadCSV, fmtDate, relTime, todayISO } from "../lib/format";
import { Avatar, Chip, EmptyState } from "../components/ui";
import { ConfirmModal } from "../components/bits";
import { IArrowR, ICalendar, ICheck, IDownload, IFlag, IHistory, IInbox, IPlus, ITrash, IX } from "../components/icons";

/* ---------------- shared bits ---------------- */

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
          <div className="min-w-0 flex-1 rounded-lg px-3 py-2" style={{ background: "var(--tint)", border: "1px solid var(--line-soft)" }}>
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

function StatusPill({ b }: { b: BulletinItem }) {
  const today = todayISO();
  if (b.dropped) return <Chip tone="slate">dropped</Chip>;
  if (b.status === "Done") return <Chip tone="mint">done</Chip>;
  if (b.date < today) return <Chip tone="coral">missed</Chip>;
  return <Chip tone="amber">open</Chip>;
}

function DirectiveCard({ b, dense = false }: { b: BulletinItem; dense?: boolean }) {
  const { db, session, nav, userById, completeBulletin, replyToBulletin, carryBulletin, dropBulletin, toast } = useStore();
  const [showThread, setShowThread] = useState(b.replies.length > 0);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const me = session;
  if (!me) return null;

  const today = todayISO();
  const canAct = bulletinCanAct(b, me, db) && b.status === "Open" && !b.dropped;
  const canManage = bulletinCanManage(b, me, db);
  const linkedCase = b.caseId ? db.cases.find((c) => c.id === b.caseId) : null;
  const openCaseTask = linkedCase && linkedCase.caseStatus === "Active" ? db.tasks.find((t) => t.caseId === linkedCase.id && t.status === "Open") : null;
  const issuer = userById(b.issuedBy);
  const doneBy = b.completedBy != null ? userById(b.completedBy) : null;
  const missed = b.date < today && b.status === "Open" && !b.dropped;

  const edge = b.dropped ? "var(--line)" : missed ? "var(--coral)" : b.status === "Done" ? "var(--mint)" : "var(--amber)";

  return (
    <div className="card card-hover p-4 anim-fade-up" style={{ borderLeft: `3px solid ${edge}`, opacity: b.status === "Done" || b.dropped ? 0.7 : 1 }}>
      <div className="flex items-start gap-3 max-sm:flex-wrap">
        <Avatar name={issuer?.name ?? "?"} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-disp font-semibold text-[13.5px]">{issuer?.name ?? "—"}</span>
            <span className="text-[11px] text-[var(--ink-faint)]">{issuer?.role}</span>
            <span className="mono text-[10.5px] text-[var(--ink-faint)]">· {fmtDate(b.date)} · {relTime(b.createdAt)}</span>
          </div>
          <p className={`text-[14px] leading-relaxed mt-1 mb-1.5 ${b.status === "Done" || b.dropped ? "line-through text-[var(--ink-faint)]" : ""}`}>{b.task}</p>

          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill b={b} />
            {b.carriedFrom && <Chip tone="sky">carried from {fmtDate(b.carriedFrom)}</Chip>}
            {b.templateId && !b.isTemplate && <Chip tone="slate">routine</Chip>}
            {linkedCase && (
              <button className="chip transition-colors hover:opacity-80" style={{ background: "var(--tint)", borderColor: "var(--line)", color: "var(--ink-dim)", cursor: "pointer" }} onClick={() => nav({ name: "case", id: linkedCase.id })}>
                <span className="mono" style={{ color: "var(--amber)" }}>{linkedCase.caseNumber}</span> {linkedCase.customer}
              </button>
            )}
            {linkedCase && linkedCase.caseStatus !== "Active" && <Chip tone="slate">case {linkedCase.caseStatus === "Closed" ? "booked" : "lost"}</Chip>}
            <span className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold ml-1">to</span>
            {b.targets.map((t) => (
              <span key={t} className="text-[11.5px] text-[var(--ink-dim)]">{userById(t)?.name.split(" ")[0] ?? "?"}</span>
            ))}
          </div>

          {b.status === "Done" && b.completedAt && (
            <p className="text-[11px] mt-1.5 mb-0" style={{ color: "var(--mint)" }}>
              ✓ {doneBy ? `done by ${doneBy.name}` : "resolved automatically"} · {relTime(b.completedAt)}
            </p>
          )}
        </div>

        {/* actions */}
        {!dense && (
          <div className="flex flex-col items-end gap-1.5 sm:shrink-0 max-sm:flex-row max-sm:flex-wrap max-sm:items-center max-sm:justify-end max-sm:w-full">
            {canAct && (
              <>
                <button
                  className="btn btn-mint btn-sm"
                  onClick={() => {
                    completeBulletin(b.id);
                    toast("success", "Directive marked done.");
                  }}
                >
                  <ICheck size={13} /> Done
                </button>
                {openCaseTask && (
                  <button
                    className="btn btn-ghost btn-sm"
                    title={`Also closes the case task: ${openCaseTask.description}`}
                    onClick={() => {
                      completeBulletin(b.id, { alsoTaskDone: true });
                      toast("success", `Done — case task closed too (“${openCaseTask.description}”).`);
                    }}
                  >
                    <ICheck size={13} /> Done + close case task
                  </button>
                )}
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowThread((s) => !s)}>
              Reply {b.replies.length > 0 && <span className="mono">({b.replies.length})</span>}
            </button>
            {canManage && missed && (
              <>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    carryBulletin(b.id);
                    toast("info", "Carried to today's bulletin.");
                  }}
                >
                  <IArrowR size={13} /> Carry to today
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDrop(true)}>
                  <IX size={13} /> Drop
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {showThread && !dense && (
        <div className="pl-[44px]">
          <ReplyThread replies={b.replies} onSend={(t) => replyToBulletin(b.id, t)} />
        </div>
      )}

      <ConfirmModal
        open={confirmDrop}
        onClose={() => setConfirmDrop(false)}
        title="Drop this directive?"
        body={<span>It will be closed as <strong>dropped</strong> — kept in the archive for the record, but it won't count as missed any more.</span>}
        confirmLabel="Drop it"
        onConfirm={() => {
          dropBulletin(b.id);
          toast("info", "Directive dropped.");
        }}
      />
    </div>
  );
}

/* ---------------- composer ---------------- */

function Composer({ onIssued }: { onIssued: () => void }) {
  const { db, session, issueBulletin, toast, visibleCases } = useStore();
  const me = session!;
  const f = flagsFor(db.designations, me.role);
  const teamUsers = db.users.filter((u) => u.active && u.id !== me.id && (f.scope === "all" || u.team === me.team));
  const [text, setText] = useState("");
  const [targets, setTargets] = useState<number[]>(teamUsers.map((u) => u.id));
  const [caseId, setCaseId] = useState<number | null>(null);
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekdays">("none");
  const cases = visibleCases().filter((c) => c.caseStatus === "Active");

  const toggle = (id: number) => setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const issue = () => {
    if (!text.trim()) return toast("error", "Write the directive first.");
    if (targets.length === 0) return toast("error", "Pick at least one teammate.");
    issueBulletin({ date: todayISO(), task: text, caseId, targets, repeat, asTemplate: repeat !== "none" });
    toast("success", repeat === "none" ? "Directive issued for today." : `Routine saved — issued today and every ${repeat === "daily" ? "day" : "working day (Mon–Fri)"}.`);
    setText("");
    setCaseId(null);
    setRepeat("none");
    onIssued();
  };

  return (
    <div className="card p-4 anim-fade-up" style={{ borderColor: "var(--amber-line)" }}>
      <div className="flex items-center gap-2 mb-3">
        <IFlag size={15} className="text-[var(--amber)]" />
        <h2 className="font-disp font-semibold text-[14px] m-0">Issue a directive</h2>
        <span className="text-[11.5px] text-[var(--ink-faint)] ml-auto hidden sm:inline">lands on your team's morning bulletin</span>
      </div>
      <textarea
        className="textarea"
        rows={2}
        autoFocus
        placeholder="e.g. Every file stuck in Pre-Approval more than 5 days gets an RM call before noon — report back here."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <select className="select" style={{ width: 210 }} value={caseId ?? ""} onChange={(e) => setCaseId(e.target.value ? parseInt(e.target.value, 10) : null)}>
          <option value="">General — no case link</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caseNumber} · {c.customer}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 190 }} value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
          <option value="none">One-off (today only)</option>
          <option value="daily">Repeat · every day</option>
          <option value="weekdays">Repeat · Mon–Fri</option>
        </select>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold">to</span>
          {teamUsers.map((u) => (
            <button
              key={u.id}
              className="chip transition-all"
              style={
                targets.includes(u.id)
                  ? { background: "var(--amber-tint)", borderColor: "var(--amber)", color: "var(--amber)" }
                  : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }
              }
              onClick={() => toggle(u.id)}
            >
              {u.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <p className="text-[11px] text-[var(--ink-faint)] m-0">
          Case-linked directives auto-resolve when the case is booked or lost. Routines spawn a fresh item each morning.
        </p>
        <button className="btn btn-primary btn-sm shrink-0" onClick={issue}>
          <IPlus size={13} /> Issue{repeat !== "none" ? " routine" : ""}
        </button>
      </div>
    </div>
  );
}

/* ---------------- scoreboard ---------------- */

function Scoreboard({ items }: { items: BulletinItem[] }) {
  const { db, userById } = useStore();
  const rows = useMemo(() => {
    const map = new Map<number, { done: number; total: number }>();
    for (const b of items) {
      if (b.isTemplate || b.dropped) continue;
      for (const t of b.targets) {
        const cur = map.get(t) ?? { done: 0, total: 0 };
        cur.total += 1;
        if (b.status === "Done") cur.done += 1;
        map.set(t, cur);
      }
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, name: userById(id)?.name ?? "?", ...v }))
      .sort((a, b) => b.total - a.total);
  }, [items, userById]);

  if (rows.length === 0) return null;
  return (
    <div className="card p-4 anim-fade-up">
      <h3 className="font-disp font-semibold text-[13.5px] m-0 mb-1">Team pulse · today</h3>
      <p className="text-[11px] text-[var(--ink-faint)] m-0 mb-3">directives cleared per teammate</p>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const pct = r.total ? (r.done / r.total) * 100 : 0;
          const clean = r.done === r.total && r.total > 0;
          return (
            <div key={r.id} className="flex items-center gap-2.5">
              <Avatar name={r.name} size={24} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="text-[12px] truncate">{r.name}</span>
                  <span className="mono text-[11px]" style={{ color: clean ? "var(--mint)" : pct < 50 ? "var(--coral)" : "var(--ink-dim)" }}>
                    {r.done}/{r.total}
                  </span>
                </div>
                <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "var(--track)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: clean ? "var(--mint)" : pct < 50 ? "var(--coral)" : "var(--amber)", transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- main view ---------------- */

type Tab = "today" | "missed" | "archive";

export default function Bulletin() {
  const { db, session, userById, deleteBulletin, canInstruct, toast } = useStore();
  const me = session;
  const [tab, setTab] = useState<Tab>("today");
  const [deleting, setDeleting] = useState<BulletinItem | null>(null);
  const [showComposer, setShowComposer] = useState(true);

  const today = todayISO();
  const manager = canInstruct();

  const visible = useMemo(
    () => (me ? db.bulletin.filter((b) => !b.isTemplate && bulletinVisible(b, me, db)) : []),
    [db, me]
  );
  const todayItems = visible
    .filter((b) => b.date === today)
    .sort((a, b) => (a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === "Open" ? -1 : 1));
  const missedItems = visible
    .filter((b) => b.date < today && b.status === "Open" && !b.dropped)
    .sort((a, b) => b.date.localeCompare(a.date));
  const archiveItems = visible
    .filter((b) => b.date < today || b.dropped || (b.date === today && b.status === "Done"))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const templates = useMemo(
    () => (me ? db.bulletin.filter((b) => b.isTemplate && (bulletinCanManage(b, me, db) || bulletinVisible(b, me, db))) : []),
    [db, me]
  );

  if (!me) return null;

  const archiveGroups = new Map<string, BulletinItem[]>();
  for (const b of archiveItems) {
    const list = archiveGroups.get(b.date) ?? [];
    list.push(b);
    archiveGroups.set(b.date, list);
  }
  const groupDates = [...archiveGroups.keys()].sort((a, b) => b.localeCompare(a));

  const exportArchive = () => {
    downloadCSV(
      "directive-archive.csv",
      ["Date", "Task", "Issued by", "Role", "Targets", "Case", "Status", "Completed"],
      archiveItems.map((b) => [
        b.date,
        b.task,
        userById(b.issuedBy)?.name ?? "",
        userById(b.issuedBy)?.role ?? "",
        b.targets.map((t) => userById(t)?.name ?? "").join("; "),
        b.caseId ? db.cases.find((c) => c.id === b.caseId)?.caseNumber ?? "" : "",
        b.dropped ? "Dropped" : b.status,
        b.completedAt ? relTime(b.completedAt) : "",
      ])
    );
    toast("success", "Archive exported to CSV.");
  };

  const tabs: { key: Tab; label: string; count: number; alert?: boolean }[] = [
    { key: "today", label: "Today", count: todayItems.filter((b) => b.status === "Open" && !b.dropped).length },
    { key: "missed", label: "Missed", count: missedItems.length, alert: missedItems.length > 0 },
    { key: "archive", label: "Archive", count: archiveItems.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-disp font-bold text-[24px] tracking-tight m-0 flex items-center gap-2.5">
            <IFlag size={22} className="text-[var(--amber)]" /> Morning Bulletin
          </h1>
          <p className="text-[13px] text-[var(--ink-dim)] mt-0.5 mb-0">
            Directives for {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · issue once, the team answers with Done or a reply
          </p>
        </div>
        {manager && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowComposer((s) => !s)}>
            <IPlus size={14} /> {showComposer ? "Hide composer" : "Issue directive"}
          </button>
        )}
      </div>

      {manager && showComposer && <Composer onIssued={() => setTab("today")} />}

      <div className="flex items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            className="chip transition-all"
            style={
              tab === t.key
                ? t.alert
                  ? { background: "color-mix(in srgb, var(--coral) 14%, transparent)", borderColor: "var(--coral)", color: "var(--coral)" }
                  : { background: "var(--amber-tint)", borderColor: "var(--amber)", color: "var(--amber)" }
                : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }
            }
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="mono font-semibold">{t.count}</span>
          </button>
        ))}
        {tab === "archive" && archiveItems.length > 0 && (
          <button className="btn btn-ghost btn-sm ml-auto" onClick={exportArchive}>
            <IDownload size={13} /> Export CSV
          </button>
        )}
      </div>

      {tab === "today" && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start">
          <div className="space-y-3">
            {todayItems.length === 0 ? (
              <div className="card p-8">
                <EmptyState
                  icon={<IInbox size={26} />}
                  title="Nothing on today's bulletin"
                  body={manager ? "Issue the first directive of the day above — it lands on your team's feed instantly." : "No directives addressed to you today. Enjoy the calm."}
                />
              </div>
            ) : (
              todayItems.map((b) => <DirectiveCard key={b.id} b={b} />)
            )}
          </div>
          {manager && <Scoreboard items={todayItems} />}
        </div>
      )}

      {tab === "missed" && (
        <div className="space-y-3">
          {missedItems.length === 0 ? (
            <div className="card p-8">
              <EmptyState
                icon={<ICheck size={26} />}
                title="Nothing slipped through"
                body="Every past directive was either completed, carried forward, or dropped. That's the loop working."
              />
            </div>
          ) : (
            <>
              <div className="card px-4 py-3 text-[13px] anim-fade-up" style={{ borderColor: "color-mix(in srgb, var(--coral) 40%, transparent)" }}>
                <strong style={{ color: "var(--coral)" }}>{missedItems.length} directive{missedItems.length === 1 ? "" : "s"}</strong>{" "}
                <span className="text-[var(--ink-dim)]">
                  went past their day unfinished. Carry them forward to today's bulletin — or drop them and keep the record clean.
                </span>
              </div>
              {missedItems.map((b) => (
                <DirectiveCard key={b.id} b={b} />
              ))}
            </>
          )}
        </div>
      )}

      {tab === "archive" && (
        <div className="space-y-4">
          {templates.length > 0 && (
            <div className="card anim-fade-up">
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--line-soft)" }}>
                <ICalendar size={14} className="text-[var(--amber)]" />
                <h3 className="font-disp font-semibold text-[13.5px] m-0">Recurring routines</h3>
                <span className="text-[11px] text-[var(--ink-faint)] ml-auto">spawn a fresh item every working morning</span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
                {templates.map((t) => (
                  <div key={t.id} className="px-4 py-3 flex flex-wrap items-center gap-2.5" style={{ borderColor: "var(--line-soft)" }}>
                    <Chip tone="amber">{t.repeat === "daily" ? "daily" : "Mon–Fri"}</Chip>
                    <span className="text-[13px] flex-1 min-w-[220px] truncate">{t.task}</span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      by {userById(t.issuedBy)?.name ?? "—"} · since {fmtDate(t.date)} · to {t.targets.map((x) => userById(x)?.name.split(" ")[0] ?? "?").join(", ")}
                    </span>
                    {bulletinCanDelete(t, me, db) && (
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleting(t)}>
                        <ITrash size={13} /> Retire
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {groupDates.length === 0 ? (
            <div className="card p-8">
              <EmptyState icon={<IHistory size={26} />} title="Archive is empty" body="Completed, carried, dropped and auto-resolved directives collect here, date by date." />
            </div>
          ) : (
            groupDates.map((date) => {
              const items = archiveGroups.get(date)!;
              const daysAgo = daysBetween(date, today);
              return (
                <div key={date}>
                  <div className="flex items-baseline gap-2.5 px-1 mb-2">
                    <span className="font-disp font-semibold text-[13px]">{daysAgo === 1 ? "Yesterday" : fmtDate(date)}</span>
                    <span className="mono text-[10.5px] text-[var(--ink-faint)]">{daysAgo}d ago</span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      {items.filter((i) => i.status === "Done" && !i.dropped).length} done · {items.filter((i) => i.dropped).length} dropped
                    </span>
                    <span className="flex-1 h-px" style={{ background: "var(--line-soft)" }} />
                  </div>
                  <div className="space-y-2.5">
                    {items.map((b) => (
                      <ArchiveRow key={b.id} b={b} onDelete={() => bulletinCanDelete(b, me, db) && setDeleting(b)} canDelete={bulletinCanDelete(b, me, db)} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={deleting?.isTemplate ? "Retire this routine?" : "Delete this archive entry?"}
        body={
          deleting?.isTemplate ? (
            <span>The routine stops spawning future items. <strong>Past instances stay in the archive</strong> as the record.</span>
          ) : (
            <span>Removes the directive and its replies from the archive permanently.</span>
          )
        }
        confirmLabel={deleting?.isTemplate ? "Retire routine" : "Delete"}
        onConfirm={() => {
          if (!deleting) return;
          deleteBulletin(deleting.id);
          toast("info", deleting.isTemplate ? "Routine retired — no more spawns." : "Archive entry deleted.");
        }}
      />
    </div>
  );
}

function ArchiveRow({ b, onDelete, canDelete }: { b: BulletinItem; onDelete: () => void; canDelete: boolean }) {
  const { db, session, nav, userById } = useStore();
  const me = session;
  const [showThread, setShowThread] = useState(false);
  if (!me) return null;
  const issuer = userById(b.issuedBy);
  const linkedCase = b.caseId ? db.cases.find((c) => c.id === b.caseId) : null;
  return (
    <div className="card p-3.5 anim-fade-up" style={{ opacity: 0.85, borderLeft: `3px solid ${b.dropped ? "var(--line)" : "var(--mint)"}` }}>
      <div className="flex items-start gap-3">
        <Avatar name={issuer?.name ?? "?"} size={26} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-disp font-semibold text-[12.5px]">{issuer?.name ?? "—"}</span>
            <span className="mono text-[10.5px] text-[var(--ink-faint)]">{relTime(b.createdAt)}</span>
            <StatusPill b={b} />
            {b.carriedFrom && <Chip tone="sky">carried from {fmtDate(b.carriedFrom)}</Chip>}
            {linkedCase && (
              <button className="chip transition-colors hover:opacity-80" style={{ background: "var(--tint)", borderColor: "var(--line)", color: "var(--ink-dim)", cursor: "pointer" }} onClick={() => nav({ name: "case", id: linkedCase.id })}>
                <span className="mono" style={{ color: "var(--amber)" }}>{linkedCase.caseNumber}</span>
              </button>
            )}
          </div>
          <p className="text-[13px] text-[var(--ink-dim)] m-0 mt-1 leading-snug">{b.task}</p>
          <p className="text-[11px] text-[var(--ink-faint)] m-0 mt-0.5">
            to {b.targets.map((t) => userById(t)?.name.split(" ")[0] ?? "?").join(", ")}
            {b.status === "Done" && b.completedAt && ` · done ${relTime(b.completedAt)}${b.completedBy ? ` by ${userById(b.completedBy)?.name ?? ""}` : " (auto)"}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {b.replies.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowThread((s) => !s)}>
              Replies ({b.replies.length})
            </button>
          )}
          {canDelete && (
            <button className="btn btn-ghost btn-sm" onClick={onDelete} title="Delete from archive">
              <ITrash size={13} />
            </button>
          )}
        </div>
      </div>
      {showThread && (
        <div className="pl-[38px] mt-2 space-y-2">
          {b.replies.map((rp) => (
            <div key={rp.id} className="rounded-lg px-3 py-2 anim-fade-in" style={{ background: "var(--tint)", border: "1px solid var(--line-soft)" }}>
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-semibold">{userById(rp.userId)?.name ?? "—"}</span>
                <span className="mono text-[10px] text-[var(--ink-faint)]">{relTime(rp.at)}</span>
              </div>
              <p className="text-[12.5px] text-[var(--ink-dim)] m-0 mt-0.5">{rp.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
