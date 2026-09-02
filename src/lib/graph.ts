/* Microsoft Graph integration — pulls bank-query emails out of the group mailboxes.

   Convention (today, before case numbers exist in subjects):
   - every query email is CC'd to SalesProgressionDL@hfmcgroupuae.com and VIRTUALRM1@hfmcgroupuae.com
   - the subject MUST contain the customer name and the bank name
   - banks reply to the same group addresses

   So the reliable pipeline is: fetch recent messages → keep the ones that touch the
   two DLs → parse "Customer – Bank" out of the subject → match the customer against
   the pipeline → log it on the case. Case numbers in subjects can be layered on
   later without changing any of this. */

import { PublicClientApplication } from "@azure/msal-browser";
import type { DB, EmailLog, LoanCase } from "./types";

export const CLIENT_ID = "64e8f3d9-444f-4f65-9f8e-eee80acf0b56";
export const DL_SALES = "SalesProgressionDL@hfmcgroupuae.com";
export const DL_VRM = "VIRTUALRM1@hfmcgroupuae.com";
export const GROUP_DLS = [DL_SALES.toLowerCase(), DL_VRM.toLowerCase()];

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["User.Read", "Mail.Read"];

let pca: PublicClientApplication | null = null;

function getPca(): PublicClientApplication {
  if (!pca) {
    pca = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: "https://login.microsoftonline.com/common",
        /* must be added under Entra → App registrations → Authentication → SPA redirect URIs */
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: "localStorage" },
    });
  }
  return pca;
}

export interface GraphSession {
  name: string;
  email: string;
}

export async function graphSignIn(): Promise<GraphSession> {
  const app = getPca();
  await app.initialize();
  const res = await app.loginPopup({ scopes: SCOPES });
  return { name: res.account?.name ?? "Signed in", email: res.account?.username ?? "" };
}

export async function graphSignOut(): Promise<void> {
  const app = getPca();
  await app.initialize();
  const account = app.getActiveAccount() ?? app.getAllAccounts()[0];
  if (account) await app.logoutPopup({ account });
}

interface GraphMessage {
  id: string;
  subject: string | null;
  receivedDateTime: string;
  bodyPreview?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  ccRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
}

/* fetch the most recent messages in the signed-in mailbox that touch either DL */
export async function fetchGroupEmails(): Promise<GraphMessage[]> {
  const app = getPca();
  await app.initialize();
  const account = app.getActiveAccount() ?? app.getAllAccounts()[0];
  if (!account) throw new Error("not-signed-in");
  const token = await app.acquireTokenSilent({ scopes: SCOPES, account }).catch(() =>
    app.acquireTokenPopup({ scopes: SCOPES })
  );
  const url =
    `${GRAPH}/me/messages?$top=150&$orderby=receivedDateTime desc` +
    `&$select=id,subject,receivedDateTime,bodyPreview,from,ccRecipients,toRecipients`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token.accessToken}` } });
  if (resp.status === 403) throw new Error("no-permission");
  if (!resp.ok) throw new Error(`graph-${resp.status}`);
  const json = (await resp.json()) as { value?: GraphMessage[] };
  const msgs = json.value ?? [];
  return msgs.filter((m) => {
    const touched = [...(m.ccRecipients ?? []), ...(m.toRecipients ?? [])]
      .map((r) => r.emailAddress?.address?.toLowerCase() ?? "")
      .some((a) => GROUP_DLS.some((dl) => a.includes(dl)));
    return touched && !!m.subject;
  });
}

/* ---------------- subject parsing & case matching ---------------- */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z\u0600-\u06ff\s]/g, " ").replace(/\s+/g, " ").trim();

const SIGNIFICANT = new Set(["al", "bin", "bint", "el", "de", "van"]);

export function parseSubject(subject: string, banks: { name: string }[]): { customer: string | null; bank: string | null; rest: string } {
  const bank = banks.find((b) => subject.toLowerCase().includes(b.name.toLowerCase()))?.name ?? null;
  // split on the usual separators used between customer, bank and topic
  const parts = subject
    .split(/\s*[–—-]\s*|\s*\|\s*|\s*\/\s*|:\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  // the customer is the first part that is NOT a known bank and NOT an obvious topic word
  const topicWords = ["re", "query", "update", "follow", "up", "reminder", "urgent", "documents", "pending", "clarification"];
  let customer: string | null = null;
  for (const p of parts) {
    const lp = p.toLowerCase();
    if (bank && lp === bank.toLowerCase()) continue;
    if (banks.some((b) => lp.includes(b.name.toLowerCase()))) continue;
    if (topicWords.includes(lp)) continue;
    if (lp.length < 3) continue;
    customer = p;
    break;
  }
  const rest = parts.filter((p) => p !== customer && (!bank || p.toLowerCase() !== bank.toLowerCase())).join(" – ");
  return { customer, bank, rest };
}

export function matchCase(db: DB, email: { customer: string | null; bank: string | null }): LoanCase | null {
  if (!email.customer) return null;
  const ec = norm(email.customer);
  const eTokens = ec.split(" ").filter((t) => t.length > 2 && !SIGNIFICANT.has(t));
  let best: { c: LoanCase; score: number } | null = null;
  for (const c of db.cases) {
    if (c.caseStatus !== "Active") continue;
    const cc = norm(c.customer);
    let score = 0;
    if (cc === ec) score = 100;
    else if (cc.includes(ec) || ec.includes(cc)) score = 80;
    else {
      const cTokens = cc.split(" ").filter((t) => t.length > 2 && !SIGNIFICANT.has(t));
      const overlap = eTokens.filter((t) => cTokens.includes(t)).length;
      if (overlap >= 2 || (overlap === 1 && eTokens.length === 1 && cTokens.length <= 2)) score = 30 + overlap * 15;
    }
    if (score > 0 && email.bank && c.banks.includes(email.bank)) score += 15;
    if (score > 0 && email.bank && !c.banks.includes(email.bank) && c.banks.length > 0) score -= 10;
    if (score > (best?.score ?? 0)) best = { c, score };
  }
  return best && best.score >= 40 ? best.c : null;
}

export function toEmailLog(m: GraphMessage, db: DB): EmailLog {
  const { customer, bank, rest } = parseSubject(m.subject ?? "", db.banks);
  const fromAddress = m.from?.emailAddress?.address ?? "";
  const fromName = m.from?.emailAddress?.name ?? fromAddress;
  const fromBank = db.banks.find((b) => fromAddress.toLowerCase().includes(b.name.toLowerCase().split(" ")[0]));
  const isOut = fromAddress.toLowerCase().includes("hfmc") || fromAddress.toLowerCase().includes("meridian");
  const matched = matchCase(db, { customer, bank });
  return {
    id: m.id,
    subject: m.subject ?? "(no subject)",
    fromName: fromBank ? `${fromBank.name} · ${fromName}` : fromName,
    fromAddress,
    direction: isOut ? "out" : "in",
    customer,
    bank,
    caseId: matched?.id ?? null,
    receivedAt: m.receivedDateTime,
    snippet: (m.bodyPreview ?? "").slice(0, 180).replace(/\s+/g, " ").trim() || (rest ? `Topic: ${rest}` : ""),
    linkedAt: matched ? new Date().toISOString() : null,
    linkedBy: matched ? null : null,
  };
}

/* ---------------- demo inbox (works before Entra is configured) ---------------- */

export function simulateInbox(db: DB): EmailLog[] {
  const active = db.cases.filter((c) => c.caseStatus === "Active" && c.banks.length > 0);
  const topics = [
    "salary certificate clarification",
    "valuation report pending",
    "bank query — source of funds",
    "Ejari copy requested",
    "security cheque confirmation",
  ];
  const now = Date.now();
  const out: EmailLog[] = [];
  active.slice(0, 6).forEach((c, i) => {
    const bank = c.banks[0];
    const topic = topics[i % topics.length];
    const sent = new Date(now - (i * 26 + 9) * 3600000).toISOString();
    out.push({
      id: `sim-q-${c.id}`,
      subject: `${c.customer} – ${bank} – ${topic}`,
      fromName: "HFMC Mortgages",
      fromAddress: "operations@hfmcgroupuae.com",
      direction: "out",
      customer: c.customer,
      bank,
      caseId: c.id,
      receivedAt: sent,
      snippet: `Sent to ${bank} credit team · CC ${DL_SALES}, ${DL_VRM}`,
      linkedAt: sent,
      linkedBy: null,
    });
    // bank replies to ~half of them
    if (i % 2 === 0) {
      out.push({
        id: `sim-r-${c.id}`,
        subject: `RE: ${c.customer} – ${bank} – ${topic}`,
        fromName: `${bank} · Relationship Manager`,
        fromAddress: `credit.${bank.toLowerCase().replace(/[^a-z]/g, "")}@${bank.toLowerCase().replace(/[^a-z]/g, "")}.ae`,
        direction: "in",
        customer: c.customer,
        bank,
        caseId: c.id,
        receivedAt: new Date(now - (i * 26 + 2) * 3600000).toISOString(),
        snippet: `Thank you for your query regarding ${c.customer}. Please provide the ${topic.split("—")[0].trim()} at the earliest.`,
        linkedAt: new Date(now - (i * 26 + 1) * 3600000).toISOString(),
        linkedBy: null,
      });
    }
  });
  // two emails that match nobody — the unmatched queue
  out.push({
    id: "sim-x-1",
    subject: "Omar Al Farsi – Mashreq – pre-approval status",
    fromName: "HFMC Mortgages",
    fromAddress: "operations@hfmcgroupuae.com",
    direction: "out",
    customer: "Omar Al Farsi",
    bank: "Mashreq",
    caseId: null,
    receivedAt: new Date(now - 30 * 3600000).toISOString(),
    snippet: "Sent to Mashreq · customer not yet in the pipeline — create a case or link manually.",
    linkedAt: null,
    linkedBy: null,
  });
  out.push({
    id: "sim-x-2",
    subject: "Huda Ibrahim – CBD – documents received",
    fromName: "CBD · Credit Processing",
    fromAddress: "creditprocessing@cbd.ae",
    direction: "in",
    customer: "Huda Ibrahim",
    bank: "CBD",
    caseId: null,
    receivedAt: new Date(now - 6 * 3600000).toISOString(),
    snippet: "We confirm receipt of the documents for the above customer. No match found in the pipeline.",
    linkedAt: null,
    linkedBy: null,
  });
  return out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/* ---------------- compose a query email in Outlook (mailto) ---------------- */

export function composeQueryUrl(customer: string, bank: string, topic: string, signerName: string): string {
  const subject = `${customer} – ${bank} – ${topic || "query"}`;
  const body = [
    `Dear Sir/Madam,`,
    ``,
    `Re: ${subject}`,
    ``,
    `Please find our query regarding the above customer and file.`,
    ``,
    `Query: `,
    ``,
    `We would appreciate your earliest response so the file can progress.`,
    ``,
    `Best regards,`,
    `${signerName}`,
    `HFMC Mortgages · UAE`,
    ``,
    `— sent with case tracking · CC: ${DL_SALES}; ${DL_VRM}`,
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&cc=${encodeURIComponent(DL_SALES)},${encodeURIComponent(DL_VRM)}&body=${encodeURIComponent(body)}`;
}
