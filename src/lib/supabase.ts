import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/**
 * Lazily constructs the Supabase client on first use. Deliberately not
 * built at module scope: this file is imported into a "use client"
 * component tree, and throwing at import time (e.g. during the build's
 * static shell generation) would break `npm run build` in any
 * environment where the env vars aren't set yet, rather than failing
 * gracefully at runtime the way a missing-config app should.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.local (see .env.local.example)."
    );
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

/**
 * Silently establishes an anonymous session if one doesn't already
 * exist. No UI, no redirect — the visitor never sees this happen.
 * Once a session exists, the Supabase client persists and refreshes it
 * automatically (that's what gives "persists across browser sessions"
 * for free, with no local UUID of our own to manage).
 *
 * Returns false on any failure (missing config, network error, etc.)
 * so callers can show a quiet "reconnecting" state instead of crashing.
 */
export async function ensureAnonymousSession(): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;

    const { error } = await supabase.auth.signInAnonymously();
    return !error;
  } catch {
    return false;
  }
}
