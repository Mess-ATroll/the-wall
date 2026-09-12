-- ============================================================
-- THE WALL — Public comment abuse protection (P0a)
--
-- Problem: public comment creation went straight through PostgREST
-- (`comments_insert_public_own`), which has no time-based limit at
-- all. The only throttle was a client-side localStorage cooldown in
-- PublicComments.tsx, which is not a security boundary and can be
-- bypassed by anyone calling the Supabase API directly.
--
-- Fix: move public comment creation into a SECURITY DEFINER RPC
-- (create_public_comment) that re-implements every invariant the old
-- INSERT policy enforced, plus a server-side minimum interval between
-- comments per anonymous_id. The old direct-INSERT policy is dropped
-- so the RPC becomes the only way to create a public comment — a
-- direct `.from("comments").insert(...)` for a public comment now has
-- no policy that would permit it.
--
-- Private comments are untouched: create_private_comment already has
-- no direct INSERT policy and its own membership/cap-based abuse
-- boundary, so nothing here changes that path.
--
-- Known, deliberately out-of-scope limitation: this limits comments
-- per Supabase Anonymous Auth identity (auth.uid()). A user who mints
-- a fresh anonymous session gets a fresh identity and a fresh
-- interval. Solving that needs session-independent signals (IP,
-- fingerprinting, etc.) which this lightweight v1 model does not
-- attempt — see the existing security audit notes on anonymous
-- identity minting.
-- ============================================================


-- ============================================================
-- Supporting index
--
-- The rate-limit check looks up this caller's most recent public
-- comment by anonymous_id. The only existing index on `comments`
-- is (brick_id, created_at), which doesn't help this lookup. This
-- index is purely additive (no behavior change) so it's included
-- up front rather than waiting for a slow-query signal.
-- ============================================================

create index if not exists comments_anonymous_id_created_at_idx
  on public.comments (anonymous_id, created_at desc);


-- ============================================================
-- Lock down the direct-INSERT path for public comments
--
-- This is a narrowing of RLS, not a weakening: today any
-- authenticated (anonymous-session) caller can INSERT a public
-- comment directly via PostgREST, gated only by ownership/status/
-- target-brick checks and no rate limit. After this, no INSERT
-- policy matches public comments at all — creation is only possible
-- through create_public_comment(), which re-implements the exact
-- same authorization checks plus the new rate limit.
-- ============================================================

drop policy if exists "comments_insert_public_own"
  on public.comments;

-- comments_select_visible and all other comments/reactions/reports/
-- bricks policies are untouched.


-- ============================================================
-- create_public_comment
--
-- Inputs:  p_brick_id uuid, p_content text
-- Returns: id, brick_id, content, created_at
--
-- Re-implements, inside the function body, every invariant that
-- comments_insert_public_own used to enforce via RLS:
--   - auth.uid() must be present (Anonymous Auth session required)
--   - content length between 1 and 280
--   - target Brick exists, is active, and is public (wall_id is null)
-- ...plus a new server-enforced rate limit:
--   - minimum 15 seconds between this identity's public comments
--
-- Concurrency: a transaction-scoped advisory lock keyed on auth.uid()
-- is taken as the first statement, so two near-simultaneous requests
-- from the SAME identity are serialized (the second waits for the
-- first's transaction to finish before reading "most recent comment
-- time"), closing the check-then-act race. Different identities hash
-- to different lock keys and never block each other.
--
-- Error signaling: the frontend must not identify failures by parsing
-- arbitrary PostgreSQL exception text. Instead each failure raises
-- with a custom 5-character SQLSTATE via PL/pgSQL's `errcode` option.
-- PostgREST/supabase-js surface this verbatim as `error.code` on the
-- thrown/returned error, so the frontend branches on `error.code`,
-- never on `error.message` wording. Codes deliberately avoid the
-- 'P0001'-'P0004' range, since those are already defined, reserved
-- PL/pgSQL condition codes (raise_exception/no_data_found/
-- too_many_rows/assert_failure) with their own meaning — reusing them
-- here for unrelated conditions would be misleading. Custom codes
-- used by this function:
--   WA001  — no authenticated (anonymous) session
--   WA002  — content failed the 1-280 character check
--   WA003  — target Brick missing / not active / not public
--   WA429  — rate limited (mnemonic: HTTP 429 Too Many Requests)
-- The rate-limit message body is additionally the fixed literal
-- 'public_comment_rate_limited', so the condition is still
-- identifiable by an exact (non-fuzzy) message match even in a
-- calling context that only surfaces `message`.
-- ============================================================

create or replace function public.create_public_comment(
  p_brick_id uuid,
  p_content text
)
returns table (
  id uuid,
  brick_id uuid,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_brick public.bricks%rowtype;
  v_last_at timestamptz;
  v_id uuid;
  v_created_at timestamptz;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = 'WA001';
  end if;

  -- Captured once and reused for every subsequent auth.uid()-keyed
  -- operation below (advisory lock, rate-limit lookup, insert), so
  -- they're all guaranteed to agree on the same identity within this
  -- call rather than each re-evaluating auth.uid() independently.
  v_user_id := auth.uid();

  v_trimmed := trim(p_content);

  if p_content is null
     or v_trimmed is null
     or char_length(v_trimmed) < 1
     or char_length(v_trimmed) > 280 then
    raise exception 'Comment must be between 1 and 280 characters'
      using errcode = 'WA002';
  end if;

  -- Serialize concurrent calls from THIS identity only. Scoped to the
  -- current transaction (auto-released on commit/rollback), so it
  -- never needs an explicit unlock and never blocks other identities.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- Lock the target Brick, matching create_private_comment's pattern,
  -- and re-implementing comments_insert_public_own's target-brick
  -- checks (active, public) inside the function body.
  select *
  into v_brick
  from public.bricks
  where id = p_brick_id
  for update;

  if not found then
    raise exception 'Brick not found'
      using errcode = 'WA003';
  end if;

  if v_brick.status <> 'active'
     or v_brick.wall_id is not null then
    raise exception 'Public Brick not found'
      using errcode = 'WA003';
  end if;

  -- Server-side rate limit: server clock only, never a client-
  -- supplied timestamp. Public comments only (wall_display_marker is
  -- null) — private-wall comments are a separate pool with their own
  -- abuse boundary and are unaffected by this check.
  select max(created_at)
  into v_last_at
  from public.comments
  where anonymous_id = v_user_id
    and wall_display_marker is null;

  if v_last_at is not null
     and now() - v_last_at < interval '15 seconds' then
    raise exception 'public_comment_rate_limited'
      using errcode = 'WA429';
  end if;

  insert into public.comments (
    brick_id,
    anonymous_id,
    content,
    status,
    wall_display_marker
  )
  values (
    p_brick_id,
    v_user_id,
    v_trimmed,
    'active',
    null
  )
  returning
    comments.id,
    comments.created_at
  into
    v_id,
    v_created_at;

  return query
  select
    v_id,
    p_brick_id,
    v_trimmed,
    v_created_at;
end;
$$;

revoke all
  on function public.create_public_comment(uuid, text)
  from public;

revoke all
  on function public.create_public_comment(uuid, text)
  from anon;

grant execute
  on function public.create_public_comment(uuid, text)
  to authenticated;
