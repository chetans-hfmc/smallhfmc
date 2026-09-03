import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import type { EmailLog } from "../lib/types";
import { downloadCSV, fmtDate, relTime } from "../lib/format";
import { beginAuth, disconnect, getClientId, isConnected, setClientId } from "../lib/graph";
import { Avatar, Chip, EmptyState, Modal, Seg } from "../components/ui";
import { ConfirmModal } from "../components/bits";
import { IArrowR, IDownload, IMail, ISearch, ISend } from "../components/icons";

type Tab = "all" | "sent" | "received" | "awaiting";

export default function Emails() {
  const { db, session, nav, userById, logEmail, syncGraphEmails, toast } = useStore();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const connected = isConnected();

  const visible = useMemo(() => {
    let list = db.emails;
    if (tab === "sent") list = list.filter((e) => e.direction === "sent");
    if (tab === "received") list = list.filter((e) => e.direction === "received");
    if (tab === "awaiting") list = list.filter((e) => e.direction === "sent" && e.awaitingReply);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        const c = e.caseId ? db.cases.find((x) => x.id === e.caseId) : null;
        return `${e.subject} ${e.preview} ${e.from} ${e.to} ${c?.caseNumber ?? ""} ${c?.customer ?? ""}`.toLowerCase().includes(q);
      });
    }
    return [...list].sort((a, b) => b.at.localeCompare(a.at));
  }, [db.emails, db.cases, tab, query]);

  const awaitingCount = db.emails.filter((e) => e.direction === "sent" && e.awaitingReply).length;

  const doSync = async () => {
    setSyncing(true);
    try {
      const n = await syncGraphEmails();
      toast(n > 0 ? "success" : "info", n > 0 ? `Synced ${n} new email${n === 1 ? "" : "s"} from Outlook.` : "Outlook is up to date — no new emails.");
    } catch {
      toast("error", "Sync failed. Check your Outlook connection and try again.");
    } finally {
      setSyncing(false);
    }
  };

  const exportCsv = () => {
    downloadCSV(
      "email-trail.csv",
      ["Date", "Direction", "Subject", "From", "To", "Case", "Awaiting reply", "Link"],
      visible.map((e) => [
        e.at,
        e.direction,
        e.subject,
        e.from,
        e.to,
        e.caseId ? db.cases.find((c) => c.id === e.caseId)?.caseNumber ?? "" : "",
        e.awaitingReply ? "yes" : "",
        e.webLink ?? "",
      ])
    );
    toast("success", "Email trail exported to CSV.");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-disp font-bold text-[24px] tracking-tight m-0 flex items-center gap-2.5">
            <IMail size={22} className="text-[var(--sky)]" /> Emails
          </h1>
          <p className="text-[13px] text-[var(--ink-dim)] mt-0.5 mb-0">
            Every query sent and received, matched to its case. The 180-char snippet is the scan — the real message is one click away.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connected ? (
            <>
              <Chip tone="mint" dot>Outlook connected</Chip>
              <button className="btn btn-primary btn-sm" onClick={doSync} disabled={syncing}>
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDisconnect(true)}>Disconnect</button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setShowConnect(true)}>
              Connect Outlook
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowLog(true)}>
            <ISend size={13} /> Log an email
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}>
            <IDownload size={13} /> CSV
          </button>
        </div>
      </div>

      <div className="card p-4 anim-fade-up">
        <div className="flex flex-wrap items-center gap-3">
          <Seg<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All", count: db.emails.length },
              { value: "sent", label: "Sent" },
              { value: "received", label: "Received" },
              { value: "awaiting", label: "Awaiting reply", count: awaitingCount },
            ]}
          />
          <div className="relative ml-auto">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"><ISearch size={14} /></span>
            <input className="input !pl-8 !py-[6.5px] !w-[160px] sm:!w-[220px]" placeholder="Search emails…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {visible.length === 0 ? (
          <div className="card p-8">
            <EmptyState
              icon={<IMail size={26} />}
              title="No emails here yet"
              body={connected ? "Sync Outlook to pull matching inbox mail, or log one manually." : "Connect Outlook to auto-match inbox mail by case number, or log one manually."}
            />
          </div>
        ) : (
          visible.map((e) => (
            <EmailRow key={e.id} e={e} />
          ))
        )}
      </div>

      <ConnectModal open={showConnect} onClose={() => setShowConnect(false)} />
      <LogEmailModal open={showLog} onClose={() => setShowLog(false)} />
      <ConfirmModal
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Outlook?"
        body="Logged emails stay in the trail. You can reconnect any time — syncing just stops."
        confirmLabel="Disconnect"
        onConfirm={() => {
          disconnect();
          toast("info", "Outlook disconnected.");
        }}
      />
    </div>
  );
}

function EmailRow({ e }: { e: EmailLog }) {
  const { db, nav, userById } = useStore();
  const c = e.caseId ? db.cases.find((x) => x.id === e.caseId) : null;
  return (
    <div className="card card-hover p-4 anim-fade-up">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: e.direction === "sent" ? "color-mix(in srgb, var(--sky) 12%, transparent)" : "color-mix(in srgb, var(--mint) 12%, transparent)",
            color: e.direction === "sent" ? "var(--sky)" : "var(--mint)",
          }}
        >
          <IMail size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Chip tone={e.direction === "sent" ? "sky" : "mint"}>{e.direction === "sent" ? "sent" : "received"}</Chip>
            {e.awaitingReply && e.direction === "sent" && <Chip tone="amber">awaiting reply</Chip>}
            {c && (
              <button className="chip transition-colors hover:opacity-80" style={{ background: "var(--tint)", borderColor: "var(--line)", color: "var(--ink-dim)", cursor: "pointer" }} onClick={() => nav({ name: "case", id: c.id })}>
                <span className="mono" style={{ color: "var(--amber)" }}>{c.caseNumber}</span> {c.customer}
              </button>
            )}
            <span className="mono text-[10.5px] text-[var(--ink-faint)] ml-auto shrink-0" title={fmtDate(e.at)}>{relTime(e.at)}</span>
          </div>
          <p className="text-[14px] font-medium m-0 leading-snug">{e.subject}</p>
          <p className="text-[12.5px] text-[var(--ink-dim)] m-0 mt-1 leading-snug">{e.preview}</p>
          <div className="flex items-center gap-3 mt-1.5 text-[11.5px] text-[var(--ink-faint)]">
            <span className="truncate">{e.direction === "sent" ? `to ${e.to}` : `from ${e.from}`}</span>
            {e.webLink && (
              <a
                className="mono text-[11px] shrink-0 inline-flex items-center gap-1 transition-colors hover:opacity-80"
                style={{ color: "var(--sky)" }}
                href={e.webLink}
                target="_blank"
                rel="noreferrer"
              >
                Open in Outlook <IArrowR size={11} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useStore();
  const [clientId, setClient] = useState(getClientId());
  if (!open) return null;

  const connect = async () => {
    setClientId(clientId);
    try {
      await beginAuth();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not start the Outlook sign-in.");
    }
  };

  return (
    <Modal onClose={onClose} title="Connect Outlook" width={480}>
      <p className="text-[12.5px] text-[var(--ink-dim)] mt-0 mb-3 leading-relaxed">
        HFMC reads your inbox through Microsoft Graph and matches any email whose subject contains a case number (e.g. <span className="mono">[CASE-000114]</span>). It never sends mail on your behalf.
      </p>
      <div className="space-y-3">
        <div>
          <label className="label">Azure App Registration (client) ID</label>
          <input className="input mono" value={clientId} onChange={(e) => setClient(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          <p className="text-[11px] text-[var(--ink-faint)] mt-1.5 mb-0">
            Create a public-client app registration in Azure with redirect URI <span className="mono">{window.location.origin + window.location.pathname}</span> and <span className="mono">Mail.Read</span> permission. Your IT team can do this in minutes.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={connect} disabled={!clientId.trim()}>
          <IMail size={14} /> Sign in with Microsoft
        </button>
      </div>
    </Modal>
  );
}

function LogEmailModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, session, logEmail, toast } = useStore();
  const [direction, setDirection] = useState<"sent" | "received">("received");
  const [caseId, setCaseId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [counterpart, setCounterpart] = useState("");
  const [preview, setPreview] = useState("");
  const [webLink, setWebLink] = useState("");
  if (!open) return null;

  const save = () => {
    if (!subject.trim()) return toast("error", "Add a subject.");
    logEmail({
      caseId: caseId ? parseInt(caseId, 10) : null,
      direction,
      subject: subject.trim(),
      preview: preview.trim() || "(no snippet)",
      from: direction === "received" ? counterpart.trim() || "—" : `${session?.name ?? "HFMC"} <${session?.email ?? ""}>`,
      to: direction === "sent" ? counterpart.trim() || "—" : session?.email ?? "—",
      at: new Date().toISOString(),
      webLink: webLink.trim() || undefined,
      awaitingReply: direction === "sent",
    });
    toast("success", "Email logged to the trail.");
    setSubject(""); setCounterpart(""); setPreview(""); setWebLink(""); setCaseId("");
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Log an email manually" width={520}>
      <p className="text-[12px] text-[var(--ink-faint)] mt-0 mb-3">For mail that didn't come through the Outlook sync.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Direction</label>
          <select className="select" value={direction} onChange={(e) => setDirection(e.target.value as "sent" | "received")}>
            <option value="received">Received</option>
            <option value="sent">Sent</option>
          </select>
        </div>
        <div>
          <label className="label">Link to case</label>
          <select className="select" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">No case</option>
            {db.cases.map((c) => (
              <option key={c.id} value={c.id}>{c.caseNumber} · {c.customer}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Subject</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="[CASE-000114] …" />
        </div>
        <div className="col-span-2">
          <label className="label">{direction === "received" ? "From" : "To"}</label>
          <input className="input" value={counterpart} onChange={(e) => setCounterpart(e.target.value)} placeholder="name@bank.com" />
        </div>
        <div className="col-span-2">
          <label className="label">Snippet (optional)</label>
          <textarea className="textarea" rows={2} value={preview} onChange={(e) => setPreview(e.target.value)} placeholder="First line or two of the message…" />
        </div>
        <div className="col-span-2">
          <label className="label">Outlook link (optional)</label>
          <input className="input mono" value={webLink} onChange={(e) => setWebLink(e.target.value)} placeholder="https://outlook.office.com/mail/id/…" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}><ISend size={14} /> Log email</button>
      </div>
    </Modal>
  );
}
