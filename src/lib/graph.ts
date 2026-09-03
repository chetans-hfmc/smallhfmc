/* Microsoft Graph email sync — optional, progressive enhancement.
   Manual logging + "Send query" work with zero setup; connecting Outlook
   adds automatic inbox matching. No backend needed: public-client OAuth PKCE. */
import type { EmailLog } from "./types";

const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_URL = "https://graph.microsoft.com/v1.0";
const SCOPES = "openid email Mail.Read offline_access";

const CLIENT_KEY = "hfmc.graph.clientId";
const VERIFIER_KEY = "hfmc.graph.verifier";
const TOKEN_KEY = "hfmc.graph.token";

export function getClientId(): string {
  try {
    return localStorage.getItem(CLIENT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setClientId(id: string): void {
  try {
    if (id.trim()) localStorage.setItem(CLIENT_KEY, id.trim());
    else localStorage.removeItem(CLIENT_KEY);
  } catch {
    /* ignore */
  }
}

export function disconnect(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

export function getToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (!t.accessToken || t.expiresAt < Date.now() + 30000) return null;
    return t;
  } catch {
    return null;
  }
}

export function isConnected(): boolean {
  return getToken() != null;
}

/* ---------------- PKCE helpers ---------------- */

function base64url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

export function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Step 1: send the user to Microsoft to consent. Same-tab redirect. */
export async function beginAuth(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error("Enter your Azure App Registration (client) ID first.");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64url(bytes.buffer as ArrayBuffer);
  const challenge = base64url(await sha256(verifier));
  try {
    localStorage.setItem(VERIFIER_KEY, verifier);
  } catch {
    /* ignore */
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    response_mode: "query",
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "consent",
  });
  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

/** Step 2: on return with ?code=, exchange for a token. Returns count-safe boolean. */
export async function completeAuth(): Promise<boolean> {
  const qs = new URLSearchParams(window.location.search);
  const code = qs.get("code");
  if (!code) return false;
  const clientId = getClientId();
  let verifier = "";
  try {
    verifier = localStorage.getItem(VERIFIER_KEY) ?? "";
    localStorage.removeItem(VERIFIER_KEY);
  } catch {
    /* ignore */
  }
  if (!clientId || !verifier) {
    cleanUrl();
    return false;
  }
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        code_verifier: verifier,
      }),
    });
    const json = await res.json();
    if (json?.access_token) {
      const stored: StoredToken = {
        accessToken: json.access_token,
        expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
      };
      try {
        localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
      } catch {
        /* ignore */
      }
      cleanUrl();
      return true;
    }
  } catch {
    /* network / consent failure — fall through */
  }
  cleanUrl();
  return false;
}

function cleanUrl(): void {
  window.history.replaceState({}, "", redirectUri() + window.location.hash);
}

/* ---------------- Graph fetch ---------------- */

export interface GraphMessage {
  id: string;
  subject: string;
  receivedDateTime: string;
  bodyPreview: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  webLink: string; // the link back to the exact message in Outlook
}

/** Inbox messages, newest first. `webLink` is selected so every row can deep-link to Outlook. */
export async function fetchInboxEmails(top = 60): Promise<GraphMessage[]> {
  const token = getToken();
  if (!token) throw new Error("Outlook is not connected.");
  const select = "id,subject,receivedDateTime,bodyPreview,from,toRecipients,webLink";
  const res = await fetch(
    `${GRAPH_URL}/me/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${select}`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );
  if (!res.ok) throw new Error(`Graph error ${res.status}`);
  const json = await res.json();
  return (json.value ?? []) as GraphMessage[];
}

/* ---------------- case matching & mapping ---------------- */

/** Extract "CASE-000117" from a subject line. */
export function matchCaseNumber(subject: string): string | null {
  const m = /\[?(CASE-\d{4,})\]?/i.exec(subject ?? "");
  return m ? m[1].toUpperCase() : null;
}

export function toEmailLog(m: GraphMessage, caseId: number | null): Omit<EmailLog, "id"> {
  const from = m.from?.emailAddress;
  const to = (m.toRecipients ?? []).map((r) => r.emailAddress?.name || r.emailAddress?.address || "").filter(Boolean).join(", ");
  return {
    caseId,
    direction: "received",
    subject: m.subject || "(no subject)",
    preview: (m.bodyPreview || "").slice(0, 180),
    from: from ? `${from.name ?? ""} <${from.address ?? ""}>`.trim() : "—",
    to: to || "—",
    at: m.receivedDateTime,
    webLink: m.webLink,
    graphId: m.id,
  };
}
