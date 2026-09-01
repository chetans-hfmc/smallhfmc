/* Supabase sync layer — dormant until credentials are provided.
   The app keeps working fully offline/local until then. */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DB } from "./types";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseOn = Boolean(URL && ANON);

let client: SupabaseClient | null = null;
function get(): SupabaseClient | null {
  if (!isSupabaseOn) return null;
  if (!client) client = createClient(URL as string, ANON as string);
  return client;
}

/* v1 shared-state model: the whole workspace is one JSON document in the
   `app_state` table (single row). Perfect for a small team; migrating to a
   per-table schema later is an upgrade, not a rebuild. */

export async function fetchAppState(): Promise<DB | null> {
  const c = get();
  if (!c) return null;
  const { data, error } = await c.from("app_state").select("state").eq("id", 1).maybeSingle();
  if (error || !data?.state) return null;
  return data.state as DB;
}

export async function saveAppState(db: DB): Promise<void> {
  const c = get();
  if (!c) return;
  await c.from("app_state").upsert({ id: 1, state: db, updated_at: new Date().toISOString() });
}
