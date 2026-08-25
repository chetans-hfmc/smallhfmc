import { useState } from "react";
import { useStore } from "../lib/store";
import type { Designation, PartnerKind, User } from "../lib/types";
import { fmtRate } from "../lib/format";
import { Avatar, Chip, Modal } from "../components/ui";
import { ConfirmModal } from "../components/bits";
import { IChevronL, IChevronR, IPencil, IPlus, ITrash, IX } from "../components/icons";

const TABS: { key: string; label: string }[] = [
  { key: "users", label: "Teammates" },
  { key: "designations", label: "Designations" },
  { key: "banks", label: "Banks & rates" },
  { key: "partners", label: "Partners" },
  { key: "stages", label: "Stages" },
  { key: "whyPending", label: "Why pending" },
  { key: "waitingFor", label: "Waiting for" },
  { key: "sla", label: "SLA rules" },
];

const TEAMS = ["Management", "Dubai", "Abu Dhabi"];

export default function Admin() {
  const store = useStore();
  const { db, session } = store;
  const [tab, setTab] = useState("users");

  if (!store.canAdmin()) {
    return (
      <div className="card p-10 text-center anim-fade-up">
        <h2 className="font-disp font-semibold text-[18px] mb-2">Admin is for designations with admin rights</h2>
        <p className="text-[13px] text-[var(--ink-dim)]">Your designation is {session?.role}. If you need a list changed, ask the Head of Company or Mortgage Head — every change lands in the activity trail.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            className="chip transition-all"
            style={
              tab === t.key
                ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" }
                : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }
            }
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab />}
      {tab === "designations" && <DesignationsTab />}
      {tab === "banks" && <BanksTab />}
      {tab === "partners" && <PartnersTab />}
      {tab === "sla" && <SlaTab />}
      {(tab === "stages" || tab === "whyPending" || tab === "waitingFor") && (
        <MasterTab kind={tab as "stages" | "whyPending" | "waitingFor"} />
      )}
    </div>
  );
}

/* ---------------- users ---------------- */

function UsersTab() {
  const { db, session, saveUser, deleteUser, toast } = useStore();
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const myDesig = db.designations.find((d) => d.name === session?.role);
  const isHoC = myDesig?.super === true || session?.role === "Head of Company";

  const blank = (): User => ({
    id: 0, name: "", email: "", password: "demo123", role: "SPO", team: "Dubai", active: true, createdAt: "",
  });

  return (
    <div className="card anim-fade-up">
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--line-soft)" }}>
        <h3 className="font-disp font-semibold text-[14px] m-0">Teammates · {db.users.length}</h3>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditing(blank()); setCreating(true); }}>
          <IPlus size={14} /> Add teammate
        </button>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
        {[...db.users].sort((a, b) => {
          const idx = (r: string) => { const i = db.designations.findIndex((d) => d.name === r); return i === -1 ? 99 : i; };
          return idx(a.role) - idx(b.role);
        }).map((u) => (
          <div key={u.id} className="px-4 py-3 flex flex-wrap items-center gap-3" style={{ borderColor: "var(--line-soft)", opacity: u.active ? 1 : 0.55 }}>
            <Avatar name={u.name} size={30} />
            <div className="min-w-[180px]">
              <div className="text-[13px] font-medium flex items-center gap-2">
                {u.name}
                {u.id === session?.id && <Chip tone="mint">you</Chip>}
                {!u.active && <Chip tone="coral">inactive</Chip>}
              </div>
              <div className="text-[11.5px] text-[var(--ink-faint)]">{u.email}</div>
            </div>
            <Chip tone={u.role === "Head of Company" ? "amber" : u.role === "PA to HoC" ? "sky" : u.role === "Mortgage Head" ? "amber" : u.role.startsWith("Team Leader") ? "sky" : "slate"}>{u.role}</Chip>
            <span className="text-[11.5px] text-[var(--ink-faint)]">team {u.team}</span>
            <div className="ml-auto flex gap-1.5">
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing({ ...u }); setCreating(false); }}><IPencil size={13} /> Edit</button>
              {isHoC && u.id !== session?.id && u.role !== "Head of Company" && (
                <button className="btn btn-danger btn-sm" onClick={() => setDeleting(u)}><ITrash size={13} /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal title={creating ? "Add teammate" : `Edit · ${editing.name}`} onClose={() => setEditing(null)} width={460}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Full name</label>
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input mono" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="select" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                {db.designations.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Team</label>
              <select className="select" value={editing.team} onChange={(e) => setEditing({ ...editing, team: e.target.value })}>
                {TEAMS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="active" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              <label htmlFor="active" className="text-[12.5px] text-[var(--ink-dim)]">Active — can sign in and own cases</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!editing.name.trim() || !editing.email.trim()) return toast("error", "Name and email are required.");
                if (db.users.some((x) => x.id !== editing.id && x.email.toLowerCase() === editing.email.toLowerCase()))
                  return toast("error", "That email is already taken.");
                saveUser(editing);
                toast("success", creating ? `${editing.name} added to the team.` : "Teammate updated.");
                setEditing(null);
              }}
            >
              Save
            </button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Remove ${deleting?.name}?`}
        body="They'll be removed from the team. This is blocked if they still own cases or open tasks."
        confirmLabel="Remove"
        onConfirm={() => {
          if (!deleting) return;
          const err = deleteUser(deleting.id);
          if (err) toast("error", err);
          else toast("success", `${deleting.name} removed.`);
        }}
      />
    </div>
  );
}

/* ---------------- banks & rates ---------------- */

function BanksTab() {
  const { db, addBank, updateBankRate, toggleBank, deleteBank, toast } = useStore();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("0.8");

  return (
    <div className="card anim-fade-up">
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--line-soft)" }}>
        <h3 className="font-disp font-semibold text-[14px] m-0">Banks & commission rates</h3>
        <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-0">Our commission as % of loan amount. Every change re-computes earnings reports instantly.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-4">
        {[...db.banks].sort((a, b) => b.ratePct - a.ratePct).map((b) => (
          <div key={b.id} className="rounded-lg p-3 flex items-center gap-2.5" style={{ background: "rgba(232,241,239,0.02)", border: "1px solid var(--line-soft)", opacity: b.active ? 1 : 0.5 }}>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium truncate">{b.name}</div>
              <div className="mono text-[11px]" style={{ color: b.ratePct >= 0.9 ? "var(--mint)" : "var(--ink-faint)" }}>{fmtRate(b.ratePct)} of loan amount</div>
            </div>
            <input
              className="input mono !w-[74px] !py-1 text-[12px] text-center"
              type="number"
              step={0.025}
              min={0}
              max={10}
              value={b.ratePct}
              onChange={(e) => updateBankRate(b.id, Number(e.target.value) || 0)}
            />
            <button className="btn btn-ghost btn-sm !px-2" title={b.active ? "Deactivate" : "Activate"} onClick={() => { toggleBank(b.id); toast("info", `${b.name} ${b.active ? "deactivated" : "activated"}.`); }}>
              <span className="w-2 h-2 rounded-full" style={{ background: b.active ? "var(--mint)" : "var(--ink-faint)" }} />
            </button>
            <button className="btn btn-ghost btn-sm !px-2 text-[var(--ink-faint)] hover:text-[var(--coral)]" onClick={() => {
              const err = deleteBank(b.id);
              if (err) toast("error", err);
              else toast("success", `${b.name} removed.`);
            }}>
              <ITrash size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--line-soft)" }}>
        <div>
          <label className="label">New bank</label>
          <input className="input" style={{ width: 170 }} placeholder="e.g. RAKBANK" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Rate %</label>
          <input className="input mono" style={{ width: 90 }} type="number" step={0.025} value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => {
          const err = addBank(name, Number(rate));
          if (err) toast("error", err);
          else { toast("success", `${name.trim()} added at ${rate}%.`); setName(""); }
        }}>
          <IPlus size={13} /> Add bank
        </button>
      </div>
    </div>
  );
}

/* ---------------- partners ---------------- */

function PartnersTab() {
  const { db, addPartner, updatePartnerShare, togglePartner, deletePartner, toast } = useStore();
  const [kind, setKind] = useState<PartnerKind>("Agent");
  const [name, setName] = useState("");
  const [share, setShare] = useState("20");
  const [filter, setFilter] = useState<"All" | PartnerKind>("All");

  const list = db.partners.filter((p) => filter === "All" || p.kind === filter);

  return (
    <div className="card anim-fade-up">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--line-soft)" }}>
        <div>
          <h3 className="font-disp font-semibold text-[14px] m-0">Agents, brokers & referrers</h3>
          <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-0">Names offered when a case is sourced through them. Their payout = share × our bank commission.</p>
        </div>
        <div className="ml-auto flex gap-1.5">
          {(["All", "Agent", "Broker", "Referral"] as const).map((k) => (
            <button key={k} className="chip transition-all" onClick={() => setFilter(k)} style={filter === k ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" } : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}>
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
        {list.map((p) => {
          const casesWith = db.cases.filter((c) => c.partner?.name === p.name).length;
          return (
            <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-3" style={{ borderColor: "var(--line-soft)", opacity: p.active ? 1 : 0.5 }}>
              <Avatar name={p.name} size={28} />
              <div className="min-w-[170px]">
                <div className="text-[13px] font-medium">{p.name}</div>
                <div className="text-[11px] text-[var(--ink-faint)]">{casesWith} case{casesWith === 1 ? "" : "s"} sourced</div>
              </div>
              <Chip tone={p.kind === "Agent" ? "amber" : p.kind === "Broker" ? "sky" : "coral"}>{p.kind}</Chip>
              <span className="text-[11.5px] text-[var(--ink-faint)]">default share</span>
              <input
                className="input mono !w-[70px] !py-1 text-[12px] text-center"
                type="number"
                min={1}
                max={100}
                value={p.defaultSharePct}
                onChange={(e) => updatePartnerShare(p.id, Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              />
              <span className="mono text-[11.5px] text-[var(--ink-faint)]">%</span>
              <div className="ml-auto flex gap-1.5">
                <button className="btn btn-ghost btn-sm !px-2" title={p.active ? "Deactivate" : "Activate"} onClick={() => togglePartner(p.id)}>
                  <span className="w-2 h-2 rounded-full" style={{ background: p.active ? "var(--mint)" : "var(--ink-faint)" }} />
                </button>
                <button className="btn btn-ghost btn-sm !px-2 text-[var(--ink-faint)] hover:text-[var(--coral)]" onClick={() => {
                  const err = deletePartner(p.id);
                  if (err) toast("error", err);
                  else toast("success", `${p.name} removed.`);
                }}>
                  <ITrash size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <p className="text-[12.5px] text-[var(--ink-faint)] p-4 m-0">No {filter === "All" ? "partners" : filter.toLowerCase() + "s"} yet.</p>}
      </div>

      <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--line-soft)" }}>
        <div>
          <label className="label">Kind</label>
          <select className="select" style={{ width: 110 }} value={kind} onChange={(e) => setKind(e.target.value as PartnerKind)}>
            <option>Agent</option>
            <option>Broker</option>
            <option>Referral</option>
          </select>
        </div>
        <div>
          <label className="label">Name</label>
          <input className="input" style={{ width: 190 }} placeholder={kind === "Referral" ? "e.g. Nasser Al Mansoori" : `e.g. ${kind} name`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Default share %</label>
          <input className="input mono" style={{ width: 90 }} type="number" min={1} max={100} value={share} onChange={(e) => setShare(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => {
          const err = addPartner(kind, name, Number(share));
          if (err) toast("error", err);
          else { toast("success", `${name.trim()} added as ${kind.toLowerCase()} @ ${share}%.`); setName(""); }
        }}>
          <IPlus size={13} /> Add {kind.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

/* ---------------- generic master list ---------------- */

function MasterTab({ kind }: { kind: "stages" | "whyPending" | "waitingFor" }) {
  const { db, addMaster, toggleMaster, deleteMaster, moveStage, toast } = useStore();
  const [label, setLabel] = useState("");
  const title = kind === "stages" ? "Workflow stages" : kind === "whyPending" ? "Why pending reasons" : "Waiting-for types";
  const items = kind === "stages" ? [...db.stages].sort((a, b) => a.sortOrder - b.sortOrder) : db[kind];

  return (
    <div className="card anim-fade-up">
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--line-soft)" }}>
        <h3 className="font-disp font-semibold text-[14px] m-0">{title}</h3>
        <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-0">
          {kind === "stages" ? "Ordered left-to-right on every Case 360. Deactivated stages disappear from pickers." : "Used across the task engine and reports. Deactivated items stop appearing in dropdowns."}
        </p>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
        {items.map((m) => (
          <div key={m.id} className="px-4 py-2.5 flex items-center gap-3" style={{ borderColor: "var(--line-soft)", opacity: m.active ? 1 : 0.5 }}>
            {kind === "stages" && (
              <>
                <span className="mono text-[11px] text-[var(--ink-faint)] w-6">{kind === "stages" ? (m as unknown as { sortOrder: number }).sortOrder : ""}</span>
                <button className="btn btn-ghost btn-sm !px-1.5 !py-1" onClick={() => moveStage(m.id, -1)}><IChevronL size={13} /></button>
                <button className="btn btn-ghost btn-sm !px-1.5 !py-1" onClick={() => moveStage(m.id, 1)}><IChevronR size={13} /></button>
              </>
            )}
            <span className="text-[13px] flex-1">{m.label}</span>
            <button className="btn btn-ghost btn-sm !px-2" title={m.active ? "Deactivate" : "Activate"} onClick={() => toggleMaster(kind, m.id)}>
              <span className="w-2 h-2 rounded-full" style={{ background: m.active ? "var(--mint)" : "var(--ink-faint)" }} />
            </button>
            <button className="btn btn-ghost btn-sm !px-2 text-[var(--ink-faint)] hover:text-[var(--coral)]" onClick={() => {
              const err = deleteMaster(kind, m.id);
              if (err) toast("error", err);
              else toast("success", `"${m.label}" deleted.`);
            }}>
              <IX size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--line-soft)" }}>
        <div className="flex-1">
          <label className="label">New label</label>
          <input className="input" placeholder="e.g. Awaiting NOC from developer" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => {
            if (e.key === "Enter") {
              const err = addMaster(kind, label);
              if (err) toast("error", err);
              else { toast("success", `"${label.trim()}" added.`); setLabel(""); }
            }
          }} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => {
          const err = addMaster(kind, label);
          if (err) toast("error", err);
          else { toast("success", `"${label.trim()}" added.`); setLabel(""); }
        }}>
          <IPlus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

/* ---------------- SLA rules ---------------- */

function SlaTab() {
  const { db, saveSla, toggleSla, deleteSla, toast } = useStore();
  const stages = [...db.stages].filter((s) => s.label !== "Closed").sort((a, b) => a.sortOrder - b.sortOrder);
  const [stage, setStage] = useState(stages[0]?.label ?? "");
  const [bank, setBank] = useState("All");
  const [days, setDays] = useState("5");

  return (
    <div className="card anim-fade-up">
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--line-soft)" }}>
        <h3 className="font-disp font-semibold text-[14px] m-0">SLA rules</h3>
        <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-0">Max days a case may sit in a stage before it escalates. Bank-specific rules override the default.</p>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
        {[...db.slaRules].sort((a, b) => a.stage.localeCompare(b.stage)).map((r) => (
          <div key={r.id} className="px-4 py-2.5 flex items-center gap-3" style={{ borderColor: "var(--line-soft)", opacity: r.active ? 1 : 0.5 }}>
            <Chip tone="slate">{r.stage}</Chip>
            {r.bank ? <Chip tone="sky">{r.bank}</Chip> : <span className="text-[11.5px] text-[var(--ink-faint)]">all banks</span>}
            <span className="ml-auto text-[12.5px] text-[var(--ink-dim)]">max</span>
            <input
              className="input mono !w-[64px] !py-1 text-[12px] text-center"
              type="number"
              min={1}
              value={r.maxDays}
              onChange={(e) => saveSla({ ...r, maxDays: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span className="text-[12px] text-[var(--ink-faint)]">days</span>
            <button className="btn btn-ghost btn-sm !px-2" title={r.active ? "Deactivate" : "Activate"} onClick={() => toggleSla(r.id)}>
              <span className="w-2 h-2 rounded-full" style={{ background: r.active ? "var(--mint)" : "var(--ink-faint)" }} />
            </button>
            <button className="btn btn-ghost btn-sm !px-2 text-[var(--ink-faint)] hover:text-[var(--coral)]" onClick={() => { deleteSla(r.id); toast("info", "SLA rule removed."); }}>
              <IX size={13} />
            </button>
          </div>
        ))}
        {db.slaRules.length === 0 && <p className="text-[12.5px] text-[var(--ink-faint)] p-4 m-0">No SLA rules — nothing will escalate.</p>}
      </div>
      <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--line-soft)" }}>
        <div>
          <label className="label">Stage</label>
          <select className="select" style={{ width: 170 }} value={stage} onChange={(e) => setStage(e.target.value)}>
            {stages.map((s) => <option key={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Bank override</label>
          <select className="select" style={{ width: 140 }} value={bank} onChange={(e) => setBank(e.target.value)}>
            <option>All</option>
            {db.banks.map((b) => <option key={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Max days</label>
          <input className="input mono" style={{ width: 80 }} type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => {
          const d = Number(days);
          if (!d || d < 1) return toast("error", "Enter a valid number of days.");
          saveSla({ stage, bank: bank === "All" ? null : bank, maxDays: d, active: true });
          toast("success", `SLA saved: ${stage} · ${bank === "All" ? "all banks" : bank} · ${d}d.`);
        }}>
          <IPlus size={13} /> Add rule
        </button>
      </div>
    </div>
  );
}

/* ---------------- designations ---------------- */

function DesignationsTab() {
  const { db, addDesignation, updateDesignation, deleteDesignation, toast } = useStore();
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Designation | null>(null);

  const FlagToggle = ({ on, label, onClick, locked }: { on: boolean; label: string; onClick: () => void; locked?: boolean }) => (
    <button
      type="button"
      className="chip transition-all"
      title={locked ? "Locked for this designation" : undefined}
      style={
        on
          ? { background: "rgba(67,214,155,0.12)", borderColor: "rgba(67,214,155,0.5)", color: "var(--mint)" }
          : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }
      }
      onClick={() => !locked && onClick()}
    >
      {label}
    </button>
  );

  return (
    <div className="card anim-fade-up">
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--line-soft)" }}>
        <h3 className="font-disp font-semibold text-[14px] m-0">Designations & permissions</h3>
        <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-0">
          Create your own designations beyond SPO / VRM. Scope decides what each holder sees: all cases, their team's, or only their own book.
        </p>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
        {db.designations.map((d) => {
          const holders = db.users.filter((u) => u.role === d.name).length;
          return (
            <div key={d.id} className="px-4 py-3 flex flex-wrap items-center gap-2.5" style={{ borderColor: "var(--line-soft)" }}>
              {d.builtIn ? (
                <span className="text-[13px] font-medium min-w-[150px]">{d.name}</span>
              ) : (
                <input
                  className="input"
                  style={{ width: 170, padding: "5px 9px" }}
                  value={d.name}
                  onChange={(e) => updateDesignation(d.id, { name: e.target.value })}
                />
              )}
              {d.super && <Chip tone="amber">supreme</Chip>}
              {d.builtIn && <Chip tone="slate">built-in</Chip>}
              <select
                className="select"
                style={{ width: 130 }}
                value={d.scope}
                disabled={d.super}
                onChange={(e) => updateDesignation(d.id, { scope: e.target.value as Designation["scope"] })}
              >
                <option value="all">sees all</option>
                <option value="team">sees team</option>
                <option value="own">own book</option>
              </select>
              <FlagToggle on={d.issueTasks} label="can issue tasks" locked={d.super} onClick={() => updateDesignation(d.id, { issueTasks: !d.issueTasks })} />
              <FlagToggle on={d.admin} label="admin console" locked={d.super} onClick={() => updateDesignation(d.id, { admin: !d.admin })} />
              <span className="text-[11.5px] text-[var(--ink-faint)]">{holders} holder{holders === 1 ? "" : "s"}</span>
              {!d.builtIn && (
                <button className="btn btn-danger btn-sm ml-auto" onClick={() => setDeleting(d)}>
                  <ITrash size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--line-soft)" }}>
        <div>
          <label className="label">New designation</label>
          <input className="input" style={{ width: 220 }} placeholder="e.g. Documents Officer" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            const err = addDesignation(name);
            if (err) return toast("error", err);
            toast("success", `Designation "${name.trim()}" created — set its scope and permissions above.`);
            setName("");
          }}
        >
          <IPlus size={13} /> Add designation
        </button>
      </div>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        body="Only designations with no holders can be deleted."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleting) return;
          const err = deleteDesignation(deleting.id);
          if (err) toast("error", err);
          else toast("info", `Designation "${deleting.name}" deleted.`);
        }}
      />
    </div>
  );
}
