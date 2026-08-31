import { getSupabase } from "./supabase";
import { getStoredReaction, getStoredReactionsFor, setStoredReaction } from "./reactionStorage";
import type { Brick, Category, CategoryFilter, ReactionKey, SortMode } from "./types";

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

export async function createBrick(content: string, category: Category): Promise<Brick> {
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
  const supabase = getSupabase();
  // No .select() — reports has no SELECT policy at all, even for the
  // reporter themselves, so RETURNING would fail the insert. Success
  // is judged purely by the absence of an error.
  const { error } = await supabase
    .from("reports")
    .insert({ brick_id: brickId, reason: reasonDbValue });
  if (error) throw error;
}
