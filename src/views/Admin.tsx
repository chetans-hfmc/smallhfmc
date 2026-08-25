import { useState } from "react";
import type { ReactNode } from "react";
import { useStore } from "../lib/store";
import type { MasterItem, Role, SlaRule, User } from "../lib/types";
import { fmtDate, relTime } from "../lib/format";
import { Avatar, Chip, Modal } from "../components/ui";
import { ConfirmModal } from "../components/bits";
import { IChevronL, IChevronR, IPencil, IPlus, ITrash, IUsers } from "../components/icons";

function Section({ title, sub, children, wide }: { title: string; sub: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`card p-4 anim-fade-up ${wide ? "xl:col-span-2" : ""}`}>
      <h3 className="font-disp font-semibold text-[14.5px] m-0">{title}</h3>
      <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-3">{sub}</p>
      {children}
    </div>
  );
}

function MasterList({ kind, title, sub, hint }: { kind: "whyPending" | "waitingFor" | "banks"; title: string; sub: string; hint: string }) {
  const { db, addMaster, toggleMaster, deleteMaster, toast } = useStore();
  const [val, setVal] = useState("");
  const items = db[kind] as MasterItem[];

  const add = () => {
    const err = addMaster(kind, val);
    if (err) return toast("error", err);
    setVal("");
    toast("success", `Added to ${title.toLowerCase()}.`);
  };

  return (
    <Section title={title} sub={sub}>
      <div className="flex gap-2 mb-3">
        <input
          className="input"
          placeholder={hint}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn btn-ghost shrink-0" onClick={add}>
          <IPlus size={14} /> Add
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((m) => (
          <span
            key={m.id}
            className="chip group"
            style={{
              color: m.active ? "var(--ink-dim)" : "var(--ink-faint)",
              borderColor: m.active ? "var(--line)" : "var(--line-soft)",
              background: m.active ? "rgba(232,241,239,0.03)" : "transparent",
              textDecoration: m.active ? "none" : "line-through",
            }}
          >
            <button className="hover:text-[var(--ink)] transition-colors" title={m.active ? "Deactivate" : "Activate"} onClick={() => toggleMaster(kind, m.id)}>
              {m.label}
            </button>
            <button
              className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors"
              title="Delete"
              onClick={() => {
                const err = deleteMaster(kind, m.id);
                if (err) toast("error", err);
                else toast("info", `"${m.label}" removed.`);
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </Section>
  );
}

function StagesManager() {
  const { db, addMaster, toggleMaster, deleteMaster, moveStage, toast } = useStore();
  const [val, setVal] = useState("");
  const stages = [...db.stages].sort((a, b) => a.sortOrder - b.sortOrder);

  const add = () => {
    const err = addMaster("stages", val);
    if (err) return toast("error", err);
    setVal("");
    toast("success", "Stage added at the end of the workflow.");
  };

  return (
    <Section title="Workflow stages" sub="The pipeline every case walks. Reorder with the arrows — the stepper follows.">
      <div className="flex gap-2 mb-3">
        <input className="input" placeholder="New stage name" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-ghost shrink-0" onClick={add}>
          <IPlus size={14} /> Add
        </button>
      </div>
      <ol className="space-y-1.5">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: "rgba(232,241,239,0.03)", border: "1px solid var(--line-soft)", opacity: s.active ? 1 : 0.5 }}>
            <span className="mono text-[11px] text-[var(--ink-faint)] w-5">{i + 1}</span>
            <span className={`text-[13px] flex-1 ${s.active ? "" : "line-through"}`}>{s.label}</span>
            <button className="text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:opacity-30 transition-colors" disabled={i === 0} onClick={() => moveStage(s.id, -1)} title="Move up">
              <IChevronL size={14} className="rotate-90" />
            </button>
            <button className="text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:opacity-30 transition-colors" disabled={i === stages.length - 1} onClick={() => moveStage(s.id, 1)} title="Move down">
              <IChevronR size={14} className="rotate-90" />
            </button>
            <button className="text-[11px] mono text-[var(--ink-faint)] hover:text-[var(--amber)] transition-colors" onClick={() => toggleMaster("stages", s.id)}>
              {s.active ? "active" : "off"}
            </button>
            <button
              className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors"
              title="Delete"
              onClick={() => {
                const err = deleteMaster("stages", s.id);
                if (err) toast("error", err);
                else toast("info", `"${s.label}" removed.`);
              }}
            >
              <ITrash size={14} />
            </button>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function SlaManager() {
  const { db, addSlaRule, updateSlaRule, toggleSlaRule, deleteSlaRule, toast } = useStore();
  const stages = [...db.stages].filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const [stage, setStage] = useState(stages[0]?.label ?? "");
  const [bank, setBank] = useState("");
  const [days, setDays] = useState("5");
  const rules = [...db.slaRules].sort((a, b) => {
    const sa = stages.findIndex((s) => s.label === a.stage);
    const sb = stages.findIndex((s) => s.label === b.stage);
    return sa - sb || (a.bank ?? "").localeCompare(b.bank ?? "");
  });

  const add = () => {
    const d = parseInt(days, 10);
    const err = addSlaRule({ stage, bank: bank || null, maxDays: Number.isNaN(d) ? 0 : d });
    if (err) return toast("error", err);
    toast("success", `SLA saved: ${stage}${bank ? ` · ${bank}` : ""} → ${d}d.`);
  };

  return (
    <Section title="SLA rules" sub="How many days a stage may take before it escalates. Bank-specific rules override the generic one." wide>
      <div className="flex flex-wrap gap-2 mb-3">
        <select className="select" style={{ width: 190 }} value={stage} onChange={(e) => setStage(e.target.value)}>
          {stages.map((s) => <option key={s.id}>{s.label}</option>)}
        </select>
        <select className="select" style={{ width: 160 }} value={bank} onChange={(e) => setBank(e.target.value)}>
          <option value="">All banks</option>
          {db.banks.filter((b) => b.active).map((b) => <option key={b.id}>{b.label}</option>)}
        </select>
        <input className="input mono" style={{ width: 90 }} type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} />
        <button className="btn btn-ghost" onClick={add}>
          <IPlus size={14} /> Add rule
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {rules.map((r: SlaRule) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: "rgba(232,241,239,0.03)", border: "1px solid var(--line-soft)", opacity: r.active ? 1 : 0.5 }}>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] truncate">{r.stage}</div>
              <div className="text-[11px] text-[var(--ink-faint)]">{r.bank ? `${r.bank} override` : "all banks"}</div>
            </div>
            <span className="text-[11px] text-[var(--ink-faint)]">max</span>
            <input
              className="input mono"
              style={{ width: 64, padding: "4px 8px" }}
              type="number"
              min="1"
              value={r.maxDays}
              onChange={(e) => updateSlaRule(r.id, parseInt(e.target.value, 10) || 1)}
            />
            <span className="text-[11px] text-[var(--ink-faint)]">days</span>
            <button className="text-[11px] mono text-[var(--ink-faint)] hover:text-[var(--amber)] transition-colors" onClick={() => toggleSlaRule(r.id)}>
              {r.active ? "on" : "off"}
            </button>
            <button className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors" onClick={() => { deleteSlaRule(r.id); toast("info", "Rule deleted."); }}>
              <ITrash size={14} />
            </button>
          </div>
        ))}
      </div>
      {rules.length === 0 && <p className="text-[12.5px] text-[var(--ink-faint)]">No rules yet — nothing can escalate.</p>}
    </Section>
  );
}

function UserModal({ editing, onClose }: { editing: User | null; onClose: () => void }) {
  const { saveUser, toast, db } = useStore();
  const isNew = editing === null;
  const [form, setForm] = useState<User>(
    editing ?? { id: 0, name: "", email: "", password: "demo123", role: "SPO", team: "Mumbai North", active: true, createdAt: new Date().toISOString() }
  );
  const [err, setErr] = useState("");

  const submit = () => {
    if (!form.name.trim()) return setErr("Name is required.");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setErr("Enter a valid email.");
    if (db.users.some((u) => u.id !== form.id && u.email.toLowerCase() === form.email.toLowerCase())) return setErr("That email is already taken.");
    if (!form.password) return setErr("Password is required.");
    saveUser(form);
    toast("success", isNew ? `${form.name} added to the team.` : `${form.name} updated.`);
    onClose();
  };

  return (
    <Modal onClose={onClose} title={isNew ? "Add teammate" : `Edit · ${editing?.name}`} width={480}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Full name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div className="col-span-2">
          <label className="label">Email (login)</label>
          <input className="input mono" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@hfmc.in" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {(["Admin", "Team Lead", "SPO", "VRM"] as Role[]).map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Team</label>
          <input className="input" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
        </div>
        <div className="flex items-end">
          <button
            className="btn btn-ghost w-full justify-center"
            style={form.active ? { color: "var(--mint)", borderColor: "rgba(67,214,155,0.35)" } : { color: "var(--coral)", borderColor: "rgba(242,115,99,0.35)" }}
            onClick={() => setForm({ ...form, active: !form.active })}
          >
            {form.active ? "Active — click to deactivate" : "Deactivated — click to activate"}
          </button>
        </div>
      </div>
      {err && <p className="text-[12.5px] mt-2 mb-0" style={{ color: "var(--coral)" }}>{err}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}>{isNew ? "Add teammate" : "Save changes"}</button>
      </div>
    </Modal>
  );
}

export default function Admin() {
  const { db, session, deleteUser, toast } = useStore();
  const [editing, setEditing] = useState<User | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);

  if (session?.role !== "Admin") {
    return (
      <div className="card p-10 text-center anim-fade-up">
        <h2 className="font-disp font-semibold text-[18px] mb-2">Admin access required</h2>
        <p className="text-[13px] text-[var(--ink-dim)]">User management, master lists and SLA rules are limited to Admins.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-disp font-bold text-[21px] tracking-tight m-0">Admin console</h1>
          <p className="text-[12.5px] text-[var(--ink-faint)] mt-0.5 mb-0">Team, master lists and SLA rules — changes apply everywhere instantly.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <IUsers size={15} /> Add teammate
        </button>
      </div>

      {/* users */}
      <div className="card anim-fade-up">
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--line-soft)" }}>
          <h3 className="font-disp font-semibold text-[14px] m-0">Team</h3>
          <span className="mono text-[11.5px] text-[var(--ink-faint)]">{db.users.filter((u) => u.active).length} active · {db.users.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Joined</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {db.users.map((u) => {
                const openCases = db.cases.filter((c) => c.ownerId === u.id && c.caseStatus === "Active").length;
                return (
                  <tr key={u.id} style={{ cursor: "default", opacity: u.active ? 1 : 0.55 }}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.name} size={28} />
                        <div>
                          <div className="font-medium text-[13px]">{u.name}</div>
                          <div className="text-[11px] text-[var(--ink-faint)]">{openCases} active case{openCases === 1 ? "" : "s"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono text-[12px] text-[var(--ink-dim)]">{u.email}</td>
                    <td>
                      <Chip tone={u.role === "Admin" ? "coral" : u.role === "Team Lead" ? "sky" : u.role === "VRM" ? "mint" : "amber"}>{u.role}</Chip>
                    </td>
                    <td className="text-[12.5px] text-[var(--ink-dim)]">{u.team}</td>
                    <td className="text-[12px] text-[var(--ink-faint)]">{fmtDate(u.createdAt)}</td>
                    <td>{u.active ? <Chip tone="mint">Active</Chip> : <Chip tone="slate">Deactivated</Chip>}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)} title="Edit">
                          <IPencil size={13} />
                        </button>
                        {u.id !== session.id && (
                          <button className="btn btn-ghost btn-sm" style={{ color: "var(--coral)" }} onClick={() => setDeleting(u)} title="Delete">
                            <ITrash size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* masters + sla */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <StagesManager />
        <div className="space-y-4">
          <MasterList kind="whyPending" title="Why-pending reasons" sub="The blockers a task can be tagged with." hint="e.g. NOC pending from society" />
          <MasterList kind="waitingFor" title="Waiting-for types" sub="Who holds the clock right now." hint="e.g. Insurance" />
          <MasterList kind="banks" title="Banks" sub="The lender list used on cases and the calculator." hint="e.g. Yes Bank" />
        </div>
        <SlaManager />
      </div>

      {(showAdd || editing) && <UserModal editing={editing} onClose={() => { setShowAdd(false); setEditing(null); }} />}

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Remove ${deleting?.name}?`}
        body={
          <span>
            Their login stops working immediately. Deletion is blocked while they still own cases or open tasks —
            {deleting ? ` they currently own ${db.cases.filter((c) => c.ownerId === deleting.id).length} case(s).` : ""}
          </span>
        }
        confirmLabel="Remove teammate"
        onConfirm={() => {
          if (!deleting) return;
          const err = deleteUser(deleting.id);
          if (err) toast("error", err);
          else toast("info", `${deleting.name} removed.`);
        }}
      />

      <p className="text-[11px] text-[var(--ink-faint)] m-0">
        Signed in as {session.name} · data snapshot {relTime(new Date().toISOString())}
      </p>
    </div>
  );
}
