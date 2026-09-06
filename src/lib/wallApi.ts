import { getSupabase, ensureAnonymousSession } from "./supabase";
import { getStoredReaction, getStoredReactionsFor, setStoredReaction } from "./reactionStorage";
import type { Brick, Category, CategoryFilter, ReactionKey, SortMode } from "./types";

export interface Wall {
  id: string;
  name: string;
  description: string | null;
  accessMode: "link" | "code";
  status: "active" | "closed" | "expired";
  expiresAt: string | null;
  participantCount: number;
  myDisplayMarker: string;
}

export interface CreatedWall {
  wallId: string;
  inviteToken: string;
  accessCode: string | null;
  expiresAt: string | null;
  displayMarker: string;
}

export interface JoinedWall {
  wallId: string;
  name: string;
  description: string | null;
  displayMarker: string;
  participantCount: number;
}

export interface PrivateBrick {
  id: string;
  content: string;
  category: Category;
  createdAt: string;
  wallDisplayMarker: string;
}

export interface PrivateComment {
  id: string;
  brickId: string;
  content: string;
  createdAt: string;
  wallDisplayMarker: string;
}

export interface RegenerateWallInviteResult {
  inviteToken: string;
  expiresAt: string | null;
}

const PAGE_SIZE = 30;

interface FeedRow {
  id: string;
  content: string;
  category: Category;
  created_at: string;
  felt_count: number;
  funny_count: number;
  same_count: number;
  interesting_count: number;
}

function rowToBrick(row: FeedRow): Brick {
  return {
    id: row.id,
    category: row.category,
    text: row.content,
    createdAt: row.created_at,
    reactions: {
      felt: row.felt_count,
      funny: row.funny_count,
      same: row.same_count,
      interesting: row.interesting_count,
    },
    userReaction: getStoredReaction(row.id),
  };
}

export interface FetchFeedParams {
  category: CategoryFilter;
  sort: SortMode;
  offset?: number;
}

export async function fetchBrickFeed({
  category,
  sort,
  offset = 0,
}: FetchFeedParams): Promise<Brick[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_brick_feed", {
    p_category: category === "All" ? null : category,
    p_sort: sort,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });

  if (error) throw error;

  const rows = (data ?? []) as FeedRow[];
  // Backfill this browser's own reaction state for the whole page in one
  // localStorage read rather than one lookup per row.
  const stored = getStoredReactionsFor(rows.map((r) => r.id));
  return rows.map((row) => ({ ...rowToBrick(row), userReaction: stored[row.id] ?? null }));
}

/**
 * Fetches a single active brick by id, for deep-link support
 * (/brick/:id). Deliberately a direct table SELECT rather than the
 * feed RPC: get_brick_feed caps at 50 rows and only looks at recent
 * activity, so it can't find an older shared brick. A direct SELECT
 * against `bricks` is allowed by the existing bricks_select_active
 * RLS policy (no schema/RLS change needed) and works for any brick
 * regardless of age.
 *
 * Trade-off worth knowing: this can't include reaction counts, since
 * those only exist via the aggregate RPC (raw reaction rows have no
 * public SELECT policy, by design). A deep-linked brick's reaction
 * bar starts at 0 rather than its true count until the same brick is
 * also seen via the normal feed. The underlying DB counts themselves
 * are unaffected — this is a display-only gap in the newly-added
 * deep-link view specifically.
 */
export async function getBrickById(brickId: string): Promise<Brick | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bricks")
    .select("id, content, category, created_at")
    .eq("id", brickId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    category: data.category,
    text: data.content,
    createdAt: data.created_at,
    reactions: { felt: 0, funny: 0, same: 0, interesting: 0 },
    userReaction: getStoredReaction(data.id),
  };
}

export async function createBrick(content: string, category: Category): Promise<Brick> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();
  // Safe to .select() here: bricks_select_active permits reading rows
  // with status = 'active', and every insert is forced to that status,
  // so the just-inserted row always satisfies the SELECT policy needed
  // for RETURNING to work.
  const { data, error } = await supabase
    .from("bricks")
    .insert({ content, category })
    .select("id, content, category, created_at")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    category: data.category,
    text: data.content,
    createdAt: data.created_at,
    reactions: { felt: 0, funny: 0, same: 0, interesting: 0 },
    userReaction: null,
  };
}

/**
 * Sets/switches/clears this browser's reaction on a brick.
 *
 * Deliberately never chains .select() after these writes: `reactions`
 * has no public SELECT policy at all (by design — raw reaction rows
 * are never publicly readable), and on Postgres/Supabase, RETURNING on
 * a row the caller can't SELECT back fails the whole write, not just
 * the returned data. Success is judged purely by the absence of an
 * error.
 *
 * The caller is expected to already know the current reaction (it has
 * the Brick in hand) and apply the visual change optimistically before
 * calling this — this function just persists it and updates local
 * storage to match. Throws on failure so the caller can roll back.
 */
export async function setReaction(brickId: string, nextReaction: ReactionKey): Promise<void> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();
  const current = getStoredReaction(brickId);

  if (current === nextReaction) {
    const { error } = await supabase
      .from("reactions")
      .delete()
      .eq("brick_id", brickId)
      .eq("reaction_type", nextReaction);
    if (error) throw error;
    setStoredReaction(brickId, null);
    return;
  }

  if (current) {
    const { error } = await supabase
      .from("reactions")
      .update({ reaction_type: nextReaction })
      .eq("brick_id", brickId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("reactions")
      .insert({ brick_id: brickId, reaction_type: nextReaction });
    if (error) throw error;
  }

  setStoredReaction(brickId, nextReaction);
}

export async function createReport(brickId: string, reasonDbValue: string): Promise<void> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();
  // No .select() — reports has no SELECT policy at all, even for the
  // reporter themselves, so RETURNING would fail the insert. Success
  // is judged purely by the absence of an error.
  const { error } = await supabase
    .from("reports")
    .insert({ brick_id: brickId, reason: reasonDbValue });
  if (error) throw error;
}

export async function createWall(
  name: string,
  description: string | null,
  accessMode: "link" | "code",
  expiresAt: string | null,
): Promise<CreatedWall> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("create_wall", {
    p_name: name,
    p_description: description,
    p_access_mode: accessMode,
    p_expires_at: expiresAt,
  });

  if (error) throw error;

  const row = data?.[0];

if (!row) {
  throw new Error("Wall creation returned no data");
}

return {
  wallId: row.wall_id,
  inviteToken: row.invite_token,
  accessCode: row.access_code,
  expiresAt: row.expires_at,
  displayMarker: row.display_marker,
};

}

export async function joinWall(
  inviteToken: string,
  accessCode: string | null = null,
): Promise<JoinedWall> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("join_wall", {
    p_invite_token: inviteToken,
    p_access_code: accessCode,
  });

  if (error) throw error;

  const row = data?.[0];

if (!row) {
  throw new Error("Joining Wall returned no data");
}

return {
  wallId: row.wall_id,
  name: row.name,
  description: row.description,
  displayMarker: row.display_marker,
  participantCount: row.participant_count,
};

}

export async function getWall(wallId: string): Promise<Wall> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("get_wall", {
    p_wall_id: wallId,
  });

  if (error) throw error;

  const row = data?.[0];

if (!row) {
  throw new Error("Wall not found");
}

return {
  id: row.wall_id,
  name: row.name,
  description: row.description,
  accessMode: row.access_mode,
  status: row.status,
  expiresAt: row.expires_at,
  participantCount: row.participant_count,
  myDisplayMarker: row.my_display_marker,
};

}

export async function createPrivateBrick(
  wallId: string,
  content: string,
  category: Category,
): Promise<PrivateBrick> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("create_private_brick", {
    p_wall_id: wallId,
    p_content: content,
    p_category: category,
  });

  if (error) throw error;

  const row = data?.[0];

if (!row) {
  throw new Error("Private Brick creation returned no data");
}

return {
  id: row.id,
  content: row.content,
  category: row.category,
  createdAt: row.created_at,
  wallDisplayMarker: row.wall_display_marker,
};

}

export async function createPrivateComment(
  brickId: string,
  content: string,
): Promise<unknown> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("create_private_comment", {
    p_brick_id: brickId,
    p_content: content,
  });

  if (error) throw error;

  const row = data?.[0];

if (!row) {
  throw new Error("Private Comment creation returned no data");
}

return {
  id: row.id,
  brickId: row.brick_id,
  content: row.content,
  createdAt: row.created_at,
  wallDisplayMarker: row.wall_display_marker,
};

}

export async function updateWallSettings(
  wallId: string,
  name: string,
  description: string | null,
  accessMode: "link" | "code",
  expiresAt: string | null,
): Promise<boolean> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("update_wall_settings", {
    p_wall_id: wallId,
    p_name: name,
    p_description: description,
    p_access_mode: accessMode,
    p_expires_at: expiresAt,
  });

  if (error) throw error;

  return data as boolean;
}

export async function closeWall(wallId: string): Promise<boolean> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("close_wall", {
    p_wall_id: wallId,
  });

  if (error) throw error;

  return data as boolean;
}

export async function regenerateWallInvite(
  wallId: string,
): Promise<RegenerateWallInviteResult> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("regenerate_wall_invite", {
    p_wall_id: wallId,
  });

  if (error) throw error;

  const row = data?.[0];

if (!row) {
  throw new Error("Invite regeneration returned no data");
}

return {
  inviteToken: row.invite_token,
  expiresAt: row.expires_at,
};
}

export async function fetchPrivateBricks(
  wallId: string,
  limit = 30,
): Promise<PrivateBrick[]> {
  const sessionOk = await ensureAnonymousSession();
  if (!sessionOk) throw new Error("No active session");

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("get_private_bricks", {
    p_wall_id: wallId,
    p_limit: limit,
  });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    content: row.content,
    category: row.category,
    createdAt: row.created_at,
    wallDisplayMarker: row.wall_display_marker,
  }));
}