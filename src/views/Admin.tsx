import { useState } from "react";
import { useStore } from "../lib/store";
import type { MasterItem, Role, StageItem, User } from "../lib/types";
import { fmtDate } from "../lib/format";
import { Avatar, Chip, ConfirmModal, Modal, Seg } from "../components/ui";
import { IChevronL, IChevronR, IPencil, IPlus, IShield, ITrash, IX } from "../components/icons";

type Tab = "users" | "masters";

function UserModal({ initial, onClose }: { initial: User | null; onClose: () => void }) {
  const { db, saveUser, toast } = useStore();
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState(initial?.password ?? "demo123");
  const [role, setRole] = useState<Role>(initial?.role ?? "SPO");
  const [team, setTeam] = useState(initial?.team ?? "Mumbai North");
  const [err, setErr] = useState("");
  const teams = [...new Set(db.users.map((u) => u.team))];

  const submit = () => {
    if (!name.trim()) return setErr("Name is required.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr("Enter a valid email address.");
    if (db.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.id !== initial?.id))
      return setErr("That email is already registered.");
    if (password.length < 6) return setErr("Password needs at least 6 characters.");
    saveUser({
      id: initial?.id ?? 0,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role,
      team: team.trim() || "General",
      active: initial?.active ?? true,
      createdAt: initial?.createdAt ?? "",
    });
    toast("success", initial ? `${name.trim()} updated.` : `${name.trim()} added to the team.`);
    onClose();
  };

  return (
    <Modal title={initial ? `Edit ${initial.name}` : "Add teammate"} sub={initial ? undefined : "They can sign in immediately"} onClose={onClose} width={460}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>{initial ? "Save changes" : "Create account"}</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2">
          <label className="label">Full name</label>
          <input className="input" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} autoFocus />
        </div>
        <div className="col-span-2">
          <label className="label">Email</label>
          <input className="input mono" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input mono" value={password} onChange={(e) => { setPassword(e.target.value); setErr(""); }} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option>Admin</option><option>Team Lead</option><option>SPO</option><option>VRM</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Team</label>
          <input className="input" list="team-list" value={team} onChange={(e) => setTeam(e.target.value)} />
          <datalist id="team-list">{teams.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
      </div>
      {err && <p className="text-[12.5px] mt-3 mb-0" style={{ color: "var(--coral)" }}>{err}</p>}
      <p className="text-[11.5px] text-[var(--ink-faint)] mt-3 mb-0">
        Admin — everything · Team Lead — team’s cases & reports · SPO / VRM — own cases & workload.
      </p>
    </Modal>
  );
}

function MasterPanel({ kind, title, hint, ordered }: { kind: "stages" | "whyPending" | "waitingFor"; title: string; hint: string; ordered?: boolean }) {
  const { db, addMaster, toggleMaster, deleteMaster, moveStage, toast } = useStore();
  const [label, setLabel] = useState("");
  const [confirmDel, setConfirmDel] = useState<MasterItem | null>(null);
  const items = (kind === "stages"
    ? [...(db.stages as StageItem[])].sort((a, b) => a.sortOrder - b.sortOrder)
    : db[kind]) as (MasterItem & { sortOrder?: number })[];

  const add = () => {
    const err = addMaster(kind, label);
    if (err) { toast("error", err); return; }
    toast("success", `“${label.trim()}” added to ${title.toLowerCase()}.`);
    setLabel("");
  };

  return (
    <div className="card p-4 anim-fade-up">
      <div className="flex items-start justify-between mb-1">
        <h3 className="font-disp font-semibold text-[14px] m-0">{title}</h3>
        <Chip tone="sky">{items.filter((i) => i.active).length} live</Chip>
      </div>
      <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-3">{hint}</p>
      <div className="flex gap-2 mb-3">
        <input
          className="input"
          placeholder="Add new label…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn btn-primary shrink-0" onClick={add} aria-label={`Add to ${title}`}><IPlus size={15} /></button>
      </div>
      <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
        {items.map((m, idx) => (
          <div key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg group" style={{ background: "rgba(232,241,239,0.025)", opacity: m.active ? 1 : 0.5 }}>
            {ordered && (
              <span className="flex flex-col">
                <button className="text-[var(--ink-faint)] hover:text-[var(--amber)] disabled:opacity-25 transition-colors" disabled={idx === 0} onClick={() => moveStage(m.id, -1)} aria-label="Move up"><IChevronL size={12} className="rotate-90" /></button>
                <button className="text-[var(--ink-faint)] hover:text-[var(--amber)] disabled:opacity-25 transition-colors" disabled={idx === items.length - 1} onClick={() => moveStage(m.id, 1)} aria-label="Move down"><IChevronR size={12} className="rotate-90" /></button>
              </span>
            )}
            <span className="text-[13px] flex-1 truncate" style={{ textDecoration: m.active ? undefined : "line-through" }}>{m.label}</span>
            <button
              className="btn btn-ghost btn-sm !py-[3px]"
              onClick={() => { toggleMaster(kind, m.id); toast("info", `“${m.label}” ${m.active ? "deactivated" : "reactivated"}.`); }}
            >
              {m.active ? "Deactivate" : "Activate"}
            </button>
            <button className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors p-1" onClick={() => setConfirmDel(m)} aria-label={`Delete ${m.label}`}>
              <ITrash size={14} />
            </button>
          </div>
        ))}
      </div>
      {confirmDel && (
        <ConfirmModal
          title="Remove label?"
          danger
          confirmLabel="Remove"
          body={<>Remove <b>“{confirmDel.label}”</b> from {title.toLowerCase()}? In-use labels are protected and will be blocked.</>}
          onConfirm={() => {
            const err = deleteMaster(kind, confirmDel.id);
            if (err) toast("error", err);
            else toast("success", `“${confirmDel.label}” removed.`);
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

export default function Admin() {
  const { session, db, saveUser, deleteUser, toast } = useStore();
  const [tab, setTab] = useState<Tab>("users");
  const [editing, setEditing] = useState<User | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState<User | null>(null);

  if (!session || session.role !== "Admin") {
    return (
      <div className="card p-10 text-center anim-fade-up max-w-[520px] mx-auto mt-10">
        <span className="inline-flex w-12 h-12 items-center justify-center rounded-xl mb-4" style={{ background: "rgba(242,115,99,0.1)", color: "var(--coral)", border: "1px solid rgba(242,115,99,0.3)" }}>
          <IShield size={22} />
        </span>
        <h2 className="font-disp font-bold text-[20px] mt-0 mb-1.5">Admin access only</h2>
        <p className="text-[13px] text-[var(--ink-faint)] m-0">
          Your role (<b>{session?.role}</b>) can’t open the admin console. Ask an Admin if a master list or account needs changing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Seg<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "users", label: "Users & roles", count: db.users.length },
            { value: "masters", label: "Master lists" },
          ]}
        />
        {tab === "users" && (
          <button className="btn btn-primary ml-auto" onClick={() => setAdding(true)}><IPlus size={15} /> Add teammate</button>
        )}
      </div>

      {tab === "users" ? (
        <div className="card anim-fade-up overflow-x-auto">
          <table className="tbl min-w-[720px]">
            <thead>
              <tr><th>User</th><th>Role</th><th>Team</th><th>Joined</th><th>Status</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {db.users.map((u) => {
                const ownCases = db.cases.filter((c) => c.ownerId === u.id).length;
                return (
                  <tr key={u.id} style={{ cursor: "default", opacity: u.active ? 1 : 0.55 }}>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={u.name} size={30} />
                        <span>
                          <span className="font-medium block leading-tight">{u.name} {u.id === session.id && <span className="text-[10.5px] text-[var(--ink-faint)]">(you)</span>}</span>
                          <span className="mono text-[11px] text-[var(--ink-faint)] block">{u.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <Chip tone={u.role === "Admin" ? "coral" : u.role === "Team Lead" ? "amber" : "sky"}>{u.role}</Chip>
                    </td>
                    <td className="text-[12.5px]">{u.team}</td>
                    <td className="mono text-[12px] text-[var(--ink-dim)]">{u.createdAt ? fmtDate(u.createdAt) : "—"}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          if (u.id === session.id) { toast("error", "You can’t deactivate your own account."); return; }
                          saveUser({ ...u, active: !u.active });
                          toast("info", `${u.name} ${u.active ? "deactivated" : "reactivated"}.`);
                        }}
                      >
                        {u.active ? <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--mint)" }} /> Active</span> : <span className="flex items-center gap-1.5"><IX size={12} /> Inactive</span>}
                      </button>
                    </td>
                    <td>
                      <span className="flex justify-end gap-1.5">
                        <button className="btn btn-ghost btn-sm !px-2" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}><IPencil size={13} /></button>
                        <button
                          className="btn btn-ghost btn-sm !px-2 hover:!text-[var(--coral)]"
                          onClick={() => {
                            if (u.id === session.id) { toast("error", "You can’t delete your own account."); return; }
                            setConfirmDel(u);
                          }}
                          aria-label={`Delete ${u.name}`}
                        >
                          <ITrash size={13} />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <MasterPanel kind="stages" title="Workflow stages" hint="Ordered pipeline steps. Reorder with the arrows; deactivate instead of deleting live stages." ordered />
          <MasterPanel kind="whyPending" title="Why-pending reasons" hint="The blockers your team reports on every open task." />
          <MasterPanel kind="waitingFor" title="Waiting-for types" hint="Who is holding the ball right now." />
        </div>
      )}

      {(adding || editing) && <UserModal initial={editing} onClose={() => { setAdding(false); setEditing(null); }} />}
      {confirmDel && (
        <ConfirmModal
          title="Remove teammate?"
          danger
          confirmLabel="Remove account"
          body={<>Remove <b>{confirmDel.name}</b> ({confirmDel.email})? Accounts with cases or open tasks are protected and the delete will be blocked.</>}
          onConfirm={() => {
            const err = deleteUser(confirmDel.id);
            if (err) toast("error", err);
            else toast("success", `${confirmDel.name} removed.`);
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
