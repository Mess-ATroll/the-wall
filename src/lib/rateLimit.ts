const STORAGE_KEY = "wall_last_post_at";
const COOLDOWN_MS = 30_000;

/**
 * Returns 0 if posting is currently allowed, or the number of seconds
 * remaining in the cooldown otherwise. This is convenience protection
 * against accidental double-posts and casual spam — it runs entirely
 * in the browser and offers no protection against anyone calling the
 * Supabase API directly. Real abuse defense lives at the RLS/Supabase
 * Auth layer, not here.
 */
export function getPostCooldownSecondsRemaining(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const lastPostAt = Number(raw);
    if (Number.isNaN(lastPostAt)) return 0;
    const elapsed = Date.now() - lastPostAt;
    if (elapsed >= COOLDOWN_MS) return 0;
    return Math.ceil((COOLDOWN_MS - elapsed) / 1000);
  } catch {
    return 0;
  }
}

export function recordPostSubmitted() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore — cooldown is best-effort only
  }
}
