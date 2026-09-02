import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import type { EmailLog } from "../lib/types";
import {
  CLIENT_ID, DL_SALES, DL_VRM, fetchGroupEmails, graphSignIn, graphSignOut, matchCase,
  parseSubject, simulateInbox, toEmailLog,
} from "../lib/graph";
import { fmtDate, fmtDateTime, relTime } from "../lib/format";
import { Avatar, Chip, EmptyState } from "../components/ui";
import { IArrowR, IBank, ICheck, IChevronL, IInbox, IPlus, ISearch, IZap } from "../components/icons";

type Tab = "all" | "unmatched" | "linked";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z\u0600-\u06ff\s]/g, " ").replace(/\s+/g, " ").trim();

export default function Emails() {
  const { db, session, nav, userById, ingestEmails, linkEmail, createCase, toast } = useStore();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [graphUser, setGraphUser] = useState<string | null>(null);
  const [busy, setBusy] = useState<"signin" | "pull" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emails = useMemo(() => {
    let list = db.emails;
    if (tab === "unmatched") list = list.filter((e) => e.caseId == null);
    if (tab === "linked") list = list.filter((e) => e.caseId != null);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.subject.toLowerCase().includes(q) ||
          (e.customer ?? "").toLowerCase().includes(q) ||
          (e.bank ?? "").toLowerCase().includes(q) ||
          e.fromName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [db.emails, tab, query]);

  const stats = useMemo(() => {
    const total = db.emails.length;
    const linked = db.emails.filter((e) => e.caseId != null).length;
    const week = db.emails.filter((e) => Date.now() - new Date(e.receivedAt).getTime() < 7 * 86400000).length;
    return { total, linked, unmatched: total - linked, week };
  }, [db.emails]);

  const onSignIn = async () => {
    setBusy("signin");
    setNotice(null);
    try {
      const s = await graphSignIn();
      setGraphUser(s.email || s.name);
      toast("success", `Connected to Outlook as ${s.name}.`);
    } catch (e) {
      setNotice(
        "Sign-in didn't complete. In Entra (portal.azure.com) → App registrations → “Graph TypeScript quick start”, add this app's URL under Authentication → Single-page application redirect URIs, then retry."
      );
    } finally {
      setBusy(null);
    }
  };

  const onPull = async () => {
    setBusy("pull");
    setNotice(null);
    try {
      const msgs = await fetchGroupEmails();
      const logs = msgs.map((m) => toEmailLog(m, db));
      const { added, matched } = ingestEmails(logs);
      if (added === 0) toast("info", "No new group emails — the inbox is up to date.");
      else toast("success", `Pulled ${added} new email${added === 1 ? "" : "s"} · ${matched} auto-matched to cases.`);
    } catch (e) {
      const code = String((e as Error)?.message ?? "");
      if (code === "no-permission")
        setNotice(
          "Outlook connected but mail access was denied. In Entra → App registrations → “Graph TypeScript quick start” → API permissions, add “Mail.Read” (delegated, Microsoft Graph) and grant admin consent, then pull again."
        );
      else if (code === "not-signed-in") setNotice("Connect to Outlook first, then pull.");
      else setNotice(`Couldn't reach Microsoft Graph (${code || "network"}). You can still use the simulated inbox below.`);
    } finally {
      setBusy(null);
    }
  };

  const onSimulate = () => {
    const { added, matched } = ingestEmails(simulateInbox(db));
    toast("success", `Simulated inbox loaded · ${added} new email${added === 1 ? "" : "s"} · ${matched} auto-matched.`);
  };

  const suggestMatch = (e: EmailLog) => {
    if (e.caseId != null) return null;
    return matchCase(db, { customer: e.customer, bank: e.bank });
  };

  const linkToCase = (e: EmailLog, caseId: number) => {
    linkEmail(e.id, caseId);
    const c = db.cases.find((x) => x.id === caseId);
    toast("success", `Email linked to ${c?.caseNumber ?? "case"} — it now shows on the Case 360.`);
  };

  const createCaseFrom = (e: EmailLog) => {
    if (!e.customer) return toast("error", "No customer name parsed from the subject.");
    const bank = e.bank ? [e.bank] : [];
    const c = createCase({
      customer: e.customer,
      banks: bank,
      loanAmount: 0,
      stage: "WhatsApp Group Creation",
      ownerId: session?.id ?? 1,
      source: "Direct",
      partner: null,
      whatsapp: "",
      waGroup: null,
    });
    linkEmail(e.id, c.id);
    toast("success", `${c.caseNumber} created for ${e.customer} and the email linked.`);
    nav({ name: "case", id: c.id });
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "unmatched", label: "Unmatched", count: stats.unmatched },
    { key: "linked", label: "Linked", count: stats.linked },
  ];

  return (
    <div className="space-y-4">
      {/* header + live convention */}
      <div className="card p-4 sm:p-5 anim-fade-up overflow-hidden relative">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-disp font-bold text-[24px] tracking-tight m-0 flex items-center gap-2.5">
              <IInbox size={22} className="text-[var(--amber)]" /> Email Log
            </h1>
            <p className="text-[13px] text-[var(--ink-dim)] mt-0.5 mb-0 max-w-[640px]">
              Every query email CC'd to the two group mailboxes lands here, gets matched to a pipeline case by{" "}
              <strong className="text-[var(--ink)]">customer name + bank name</strong>, and shows on the Case 360 — no case number needed in the subject yet.
            </p>
          </div>
          <div className="shrink-0">
            <span className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--ink-faint)] font-disp font-semibold">Graph app</span>
            <div className="mono text-[11px] text-[var(--ink-dim)] mt-0.5">{CLIENT_ID.slice(0, 13)}…</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div className="rounded-lg px-3.5 py-2.5 flex items-center gap-2.5" style={{ background: "var(--tint)", border: "1px solid var(--line-soft)" }}>
            <IArrowR size={15} className="text-[var(--amber)] shrink-0" />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold">CC every query to</div>
              <div className="mono text-[11px] text-[var(--ink-dim)] truncate">{DL_SALES} · {DL_VRM}</div>
            </div>
          </div>
          <div className="rounded-lg px-3.5 py-2.5 flex items-center gap-2.5" style={{ background: "var(--tint)", border: "1px solid var(--line-soft)" }}>
            <IBank size={15} className="text-[var(--sky)] shrink-0" />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold">Subject must contain</div>
              <div className="mono text-[11px] text-[var(--ink-dim)] truncate">Customer Name – Bank Name – topic</div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {graphUser ? (
            <>
              <Chip tone="mint" dot>Outlook · {graphUser}</Chip>
              <button className="btn btn-ghost btn-sm" onClick={async () => { await graphSignOut().catch(() => undefined); setGraphUser(null); toast("info", "Disconnected from Outlook."); }}>
                Disconnect
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onSignIn} disabled={busy === "signin"}>
              <IZap size={13} /> {busy === "signin" ? "Connecting…" : "Connect Outlook (Microsoft)"}
            </button>
          )}
          <button className="btn btn-mint btn-sm" onClick={onPull} disabled={busy === "pull"}>
            <ISearch size={13} /> {busy === "pull" ? "Pulling…" : "Pull group emails"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onSimulate}>
            <IPlus size={13} /> Simulate inbox (demo)
          </button>
        </div>

        {notice && (
          <div className="mt-3 rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed anim-fade-in" style={{ background: "color-mix(in srgb, var(--coral) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--coral) 35%, transparent)", color: "var(--coral)" }}>
            {notice}
          </div>
        )}
      </div>

      {/* stats + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              className="chip transition-all"
              style={
                tab === t.key
                  ? { background: "var(--amber-tint)", borderColor: "var(--amber)", color: "var(--amber)" }
                  : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }
              }
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="mono font-semibold">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="mono text-[11px] text-[var(--ink-faint)]">{stats.week} this week</span>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"><ISearch size={14} /></span>
            <input className="input !pl-8 !py-[6.5px] w-[200px]" placeholder="Search emails…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
      </div>

      {/* list */}
      <div className="card anim-fade-up">
        {emails.length === 0 ? (
          <EmptyState
            icon={<IInbox size={26} />}
            title={tab === "unmatched" ? "Nothing unmatched" : tab === "linked" ? "Nothing linked yet" : "The email log is empty"}
            body={
              tab === "unmatched"
                ? "Every email has been matched to a case. Pull again after the next batch of queries."
                : "Connect Outlook and pull group emails, or load the simulated inbox to see the flow."
            }
          />
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
            {emails.map((e) => {
              const linked = e.caseId != null;
              const linkedCase = linked ? db.cases.find((c) => c.id === e.caseId) : null;
              const suggestion = suggestMatch(e);
              return (
                <div key={e.id} className="px-4 py-3.5 flex items-start gap-3.5" style={{ borderColor: "var(--line-soft)", opacity: linked ? 1 : 0.95 }}>
                  <span
                    className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: e.direction === "out" ? "var(--amber-tint)" : "color-mix(in srgb, var(--sky) 12%, transparent)",
                      color: e.direction === "out" ? "var(--amber)" : "var(--sky)",
                    }}
                    title={e.direction === "out" ? "Our query to the bank" : "Reply received"}
                  >
                    {e.direction === "out" ? <IArrowR size={16} /> : <IChevronL size={16} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[13.5px] font-medium leading-snug">{e.subject}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                      <span className="text-[11.5px] text-[var(--ink-faint)]">{e.fromName}</span>
                      <span className="text-[10.5px] text-[var(--ink-faint)] opacity-70">·</span>
                      <span className="mono text-[10.5px] text-[var(--ink-faint)]">{relTime(e.receivedAt)} · {fmtDateTime(e.receivedAt)}</span>
                      {e.customer && <Chip tone="slate">{e.customer}</Chip>}
                      {e.bank && <Chip tone="sky">{e.bank}</Chip>}
                      {!e.customer && <Chip tone="coral">no customer parsed</Chip>}
                    </div>
                    {e.snippet && <p className="text-[12px] text-[var(--ink-dim)] m-0 mt-1.5 truncate">{e.snippet}</p>}

                    {/* actions for unmatched */}
                    {!linked && (
                      <div className="flex flex-wrap items-center gap-2 mt-2.5">
                        {suggestion ? (
                          <>
                            <button className="btn btn-mint btn-sm" onClick={() => linkToCase(e, suggestion.id)}>
                              <ICheck size={13} /> Link to {suggestion.caseNumber}
                            </button>
                            <span className="text-[11px] text-[var(--ink-faint)]">suggested match · {suggestion.customer}</span>
                          </>
                        ) : (
                          <span className="text-[11px]" style={{ color: "var(--coral)" }}>no confident match in the pipeline</span>
                        )}
                        <select
                          className="select !w-auto !py-1 text-[11.5px]"
                          value=""
                          onChange={(ev) => ev.target.value && linkToCase(e, parseInt(ev.target.value, 10))}
                        >
                          <option value="">Link manually…</option>
                          {db.cases
                            .filter((c) => c.caseStatus === "Active")
                            .map((c) => (
                              <option key={c.id} value={c.id}>{c.caseNumber} · {c.customer}</option>
                            ))}
                        </select>
                        <button className="btn btn-ghost btn-sm" onClick={() => createCaseFrom(e)}>
                          <IPlus size={13} /> Create case
                        </button>
                      </div>
                    )}
                  </div>

                  {linked && linkedCase ? (
                    <button
                      className="shrink-0 flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--hover)]"
                      onClick={() => nav({ name: "case", id: linkedCase.id })}
                      title="Open the linked case"
                    >
                      <span className="text-right">
                        <span className="mono text-[12px] block" style={{ color: "var(--amber)" }}>{linkedCase.caseNumber}</span>
                        <span className="text-[11px] text-[var(--ink-faint)] block">
                          {e.linkedBy != null ? `by ${userById(e.linkedBy)?.name.split(" ")[0] ?? "—"}` : "auto"} · {e.linkedAt ? fmtDate(e.linkedAt) : ""}
                        </span>
                      </span>
                      <Avatar name={linkedCase.customer} size={26} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11.5px] text-[var(--ink-faint)] px-1">
        Matching uses the customer name and bank parsed from the subject — it works today, and gets even more reliable once case numbers are added to subjects.
      </p>
    </div>
  );
}
