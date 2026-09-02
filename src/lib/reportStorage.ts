const STORAGE_KEY = "wall_reported_bricks_v1";

function readStore(): Record<string, true> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, true>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage unavailable — degrade silently, same as reactionStorage
  }
}

/**
 * Client-side only. This intentionally does NOT guarantee a user can't
 * file a second report via direct API access — it prevents accidental/
 * casual re-reporting through the UI, matching the "lightweight
 * convenience protection" pattern already used for post rate-limiting.
 * Real enforcement would need a DB-level UNIQUE(brick_id, anonymous_id)
 * constraint, which has NOT been applied — see recommendation in the
 * accompanying report.
 */
export function hasReportedBrick(brickId: string): boolean {
  return readStore()[brickId] === true;
}

export function markBrickReported(brickId: string) {
  const store = readStore();
  store[brickId] = true;
  writeStore(store);
}
