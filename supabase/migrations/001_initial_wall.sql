-- ============================================================
-- The Wall — initial schema
--
-- Identity model: Supabase Anonymous Auth. Every visitor gets a
-- silent anonymous session (no login/signup UI, ever). auth.uid()
-- is the trusted identity for all RLS checks below — it comes
-- from a signed session JWT, so (unlike a client-supplied UUID)
-- it cannot be forged by the caller.
--
-- Requires: Authentication → Sign In / Providers → "Allow
-- anonymous sign-ins" enabled in the Supabase dashboard before
-- any INSERT/UPDATE/DELETE against these tables will succeed.
-- ============================================================


-- ============================================================
-- BRICKS
-- ============================================================
create table if not exists public.bricks (
  id            uuid primary key default gen_random_uuid(),
  content       text not null check (char_length(content) > 0 and char_length(content) <= 280),
  category      text not null check (category in (
                  'random', 'funny', 'thoughts', 'confessions', 'dark', 'wholesome', 'rants'
                )),
  anonymous_id  uuid not null default auth.uid(),
  status        text not null default 'active' check (status in ('active', 'hidden')),
  created_at    timestamptz not null default now()
);

create index if not exists bricks_status_created_at_idx
  on public.bricks (status, created_at desc);
create index if not exists bricks_category_idx
  on public.bricks (category);

alter table public.bricks enable row level security;

create policy "bricks_select_active" on public.bricks
  for select to authenticated
  using (status = 'active');

create policy "bricks_insert_own" on public.bricks
  for insert to authenticated
  with check (anonymous_id = auth.uid() and status = 'active');

-- No update/delete policy: both denied by default for all
-- roles, including the row's own creator.


-- ============================================================
-- REACTIONS
-- One row per (brick, anonymous user). Switching reaction type
-- updates the row; removing a reaction deletes it.
-- ============================================================
create table if not exists public.reactions (
  id             uuid primary key default gen_random_uuid(),
  brick_id       uuid not null references public.bricks (id) on delete cascade,
  anonymous_id   uuid not null default auth.uid(),
  reaction_type  text not null check (reaction_type in ('felt', 'funny', 'same', 'interesting')),
  created_at     timestamptz not null default now(),
  unique (brick_id, anonymous_id)
);

create index if not exists reactions_brick_id_idx
  on public.reactions (brick_id);

alter table public.reactions enable row level security;

create policy "reactions_insert_own" on public.reactions
  for insert to authenticated
  with check (anonymous_id = auth.uid());

create policy "reactions_update_own" on public.reactions
  for update to authenticated
  using (anonymous_id = auth.uid())
  with check (anonymous_id = auth.uid());

create policy "reactions_delete_own" on public.reactions
  for delete to authenticated
  using (anonymous_id = auth.uid());


-- ============================================================
-- REPORTS
-- Insert-only from the public's perspective: no select/update/
-- delete policy is defined, so all three are denied by default,
-- including to the reporting user themselves.
-- ============================================================
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  brick_id      uuid not null references public.bricks (id) on delete cascade,
  anonymous_id  uuid not null default auth.uid(),
  reason        text not null check (reason in ('spam', 'harassment', 'hate', 'inappropriate', 'other')),
  status        text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at    timestamptz not null default now()
);

create index if not exists reports_brick_id_idx
  on public.reports (brick_id);
create index if not exists reports_status_idx
  on public.reports (status);

alter table public.reports enable row level security;

create policy "reports_insert_own" on public.reports
  for insert to authenticated
  with check (anonymous_id = auth.uid() and status = 'open');


-- ============================================================
-- PUBLIC FEED — SECURITY DEFINER function, not a view.
--
-- A plain view's RLS-bypass behavior depends on Postgres version
-- and the view's security_invoker setting, which makes it an
-- unreliable place to guarantee anonymous_id / raw reaction rows
-- / report data never leak. A SECURITY DEFINER function is
-- explicit: it returns exactly the columns listed below and
-- nothing else, regardless of the caller's own row-level access.
-- ============================================================
create or replace function public.get_brick_feed(
  p_category text default null,
  p_sort     text default 'fresh',
  p_limit    integer default 30,
  p_offset   integer default 0
)
returns table (
  id                 uuid,
  content            text,
  category           text,
  created_at         timestamptz,
  felt_count         bigint,
  funny_count        bigint,
  same_count         bigint,
  interesting_count  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.content,
    b.category,
    b.created_at,
    count(r.id) filter (where r.reaction_type = 'felt')        as felt_count,
    count(r.id) filter (where r.reaction_type = 'funny')       as funny_count,
    count(r.id) filter (where r.reaction_type = 'same')        as same_count,
    count(r.id) filter (where r.reaction_type = 'interesting') as interesting_count
  from public.bricks b
  left join public.reactions r on r.brick_id = b.id
  where b.status = 'active'
    and (p_category is null or b.category = p_category)
  group by b.id
  order by
    -- p_sort is never interpolated into SQL text — it only selects
    -- between two static, hardcoded orderings via CASE. Any value
    -- other than 'trending' (including garbage input) falls back
    -- to fresh/recency ordering below.
    case when p_sort = 'trending'
      then count(r.id)
    end desc nulls last,
    b.created_at desc
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0)
$$;

-- Revoking from PUBLIC alone is not enough: Supabase's default project
-- privileges grant EXECUTE to `anon` directly (not via the PUBLIC
-- pseudo-role), so it must be revoked explicitly here too, or an
-- anon-key-only request (no anonymous session at all) could still
-- call this function.
revoke all on function public.get_brick_feed(text, text, integer, integer) from public;
revoke all on function public.get_brick_feed(text, text, integer, integer) from anon;
grant execute on function public.get_brick_feed(text, text, integer, integer) to authenticated;
