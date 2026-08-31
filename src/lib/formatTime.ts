/**
 * Deterministic "time ago" formatting from a minutes-elapsed number.
 */
export function formatMinutesAgo(minutesAgo: number): string {
  if (minutesAgo < 1) return "Just now";
  if (minutesAgo < 60) return `${Math.round(minutesAgo)}m ago`;

  const hours = minutesAgo / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;

  const days = hours / 24;
  if (days < 7) return `${Math.round(days)}d ago`;

  const weeks = days / 7;
  return `${Math.round(weeks)}w ago`;
}

/**
 * "Time ago" formatting from a real ISO timestamp (bricks.created_at).
 * Only ever called client-side, after mount — the feed itself only
 * exists once fetched from Supabase, so there's no server-render to
 * mismatch against.
 */
export function formatTimeAgo(createdAt: string): string {
  const minutesAgo = (Date.now() - new Date(createdAt).getTime()) / 60000;
  return formatMinutesAgo(Math.max(0, minutesAgo));
}
