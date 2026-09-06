-- ============================================================
-- THE WALL — Borrow a Brick + Comments
-- Migration 002: Schema + RLS foundation
--
-- IMPORTANT:
--   - Additive / non-destructive
--   - Does not create private-content RPCs yet
--   - Does not delete existing data
--   - Existing public Wall behavior is preserved
-- ============================================================

create extension if not exists pgcrypto;


-- ============================================================
-- WALLS
-- ============================================================

create table if not exists public.walls (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (char_length(name) between 1 and 80),
  description text
    check (description is null or char_length(description) <= 280),
  type text not null default 'private'
    check (type in ('public', 'private')),
  creator_anonymous_id uuid,
  access_mode text not null default 'link'
    check (access_mode in ('link', 'code')),
  status text not null default 'active'
    check (status in ('active', 'closed', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists walls_status_idx
  on public.walls (status);

create index if not exists walls_expires_at_idx
  on public.walls (expires_at);

alter table public.walls enable row level security;


-- ============================================================
-- WALL MEMBERS
-- ============================================================

create table if not exists public.wall_members (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid not null
    references public.walls(id)
    on delete cascade,
  anonymous_id uuid not null default auth.uid(),
  display_marker text not null
    check (char_length(display_marker) between 1 and 40),
  joined_at timestamptz not null default now(),

  unique (wall_id, anonymous_id),
  unique (wall_id, display_marker)
);

create index if not exists wall_members_wall_id_idx
  on public.wall_members (wall_id);

create index if not exists wall_members_anonymous_id_idx
  on public.wall_members (anonymous_id);

alter table public.wall_members enable row level security;


-- ============================================================
-- WALL INVITES
-- ============================================================

create table if not exists public.wall_invites (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid not null
    references public.walls(id)
    on delete cascade,
  token_hash text not null unique,
  access_code_hash text,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists wall_invites_wall_id_idx
  on public.wall_invites (wall_id);

create index if not exists wall_invites_status_idx
  on public.wall_invites (status);

alter table public.wall_invites enable row level security;


-- ============================================================
-- BRICKS — EXTEND EXISTING TABLE
-- ============================================================

alter table public.bricks
  add column if not exists wall_id uuid
    references public.walls(id)
    on delete cascade;

alter table public.bricks
  add column if not exists wall_display_marker text;

create index if not exists bricks_wall_id_idx
  on public.bricks (wall_id);


-- ============================================================
-- COMMENTS
-- ============================================================

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  brick_id uuid not null
    references public.bricks(id)
    on delete cascade,
  anonymous_id uuid not null default auth.uid(),
  content text not null
    check (char_length(content) > 0 and char_length(content) <= 280),
  status text not null default 'active'
    check (status in ('active', 'hidden')),
  wall_display_marker text,
  created_at timestamptz not null default now(),

  check (
    wall_display_marker is null
    or char_length(wall_display_marker) between 1 and 40
  )
);

create index if not exists comments_brick_id_created_at_idx
  on public.comments (brick_id, created_at asc);

alter table public.comments enable row level security;


-- ============================================================
-- REPORTS — EXTEND EXISTING TABLE
-- ============================================================

alter table public.reports
  alter column brick_id drop not null;

alter table public.reports
  add column if not exists comment_id uuid
    references public.comments(id)
    on delete cascade;

alter table public.reports
  add constraint reports_target_xor
  check (
    (brick_id is not null and comment_id is null)
    or
    (brick_id is null and comment_id is not null)
  );

create index if not exists reports_comment_id_idx
  on public.reports (comment_id);


-- ============================================================
-- HELPER: ACTIVE WALL MEMBERSHIP
--
-- SECURITY DEFINER is intentional.
-- It reads private membership data without exposing that data
-- through direct client SELECT access.
-- ============================================================

create or replace function public.is_wall_member_and_active(
  p_wall_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.wall_members wm
    join public.walls w
      on w.id = wm.wall_id
    where wm.wall_id = p_wall_id
      and wm.anonymous_id = auth.uid()
      and w.status = 'active'
      and (
        w.expires_at is null
        or w.expires_at > now()
      )
  );
$$;

revoke all
  on function public.is_wall_member_and_active(uuid)
  from public;

revoke all
  on function public.is_wall_member_and_active(uuid)
  from anon;

grant execute
  on function public.is_wall_member_and_active(uuid)
  to authenticated;


-- ============================================================
-- BRICKS RLS
--
-- Replace the original public-only SELECT/INSERT policies with
-- explicitly separated public/private rules.
-- ============================================================

drop policy if exists "bricks_select_active"
  on public.bricks;

drop policy if exists "bricks_insert_own"
  on public.bricks;

create policy "bricks_select_public_active"
  on public.bricks
  for select
  to authenticated
  using (
    status = 'active'
    and wall_id is null
    and wall_display_marker is null
  );

create policy "bricks_select_private_member"
  on public.bricks
  for select
  to authenticated
  using (
    status = 'active'
    and wall_id is not null
    and is_wall_member_and_active(wall_id)
  );

create policy "bricks_insert_public_own"
  on public.bricks
  for insert
  to authenticated
  with check (
    anonymous_id = auth.uid()
    and status = 'active'
    and wall_id is null
    and wall_display_marker is null
  );

-- There is deliberately NO direct authenticated INSERT policy for
-- private Bricks. Private creation will go through an RPC that
-- derives the member marker server-side.


-- ============================================================
-- COMMENTS RLS
--
-- Public comments:
--   - only active public Bricks
--   - marker must be NULL
--
-- Private comments:
--   - no direct INSERT policy
--   - created through a SECURITY DEFINER RPC later
-- ============================================================

create policy "comments_select_visible"
  on public.comments
  for select
  to authenticated
  using (
    status = 'active'
    and exists (
      select 1
      from public.bricks b
      where b.id = comments.brick_id
        and b.status = 'active'
        and (
          (
            b.wall_id is null
            and comments.wall_display_marker is null
          )
          or
          (
            b.wall_id is not null
            and comments.wall_display_marker is not null
            and is_wall_member_and_active(b.wall_id)
          )
        )
    )
  );

create policy "comments_insert_public_own"
  on public.comments
  for insert
  to authenticated
  with check (
    anonymous_id = auth.uid()
    and status = 'active'
    and wall_display_marker is null
    and exists (
      select 1
      from public.bricks b
      where b.id = comments.brick_id
        and b.status = 'active'
        and b.wall_id is null
      )
  );

-- No direct private-comment INSERT policy.


-- ============================================================
-- REACTIONS RLS
--
-- Existing public behavior is retained, but reaction mutations
-- are now explicitly restricted to Bricks the caller is allowed
-- to access.
-- ============================================================

drop policy if exists "reactions_insert_own"
  on public.reactions;

drop policy if exists "reactions_update_own"
  on public.reactions;

drop policy if exists "reactions_delete_own"
  on public.reactions;

create policy "reactions_insert_visible_own"
  on public.reactions
  for insert
  to authenticated
  with check (
    anonymous_id = auth.uid()
    and exists (
      select 1
      from public.bricks b
      where b.id = reactions.brick_id
        and b.status = 'active'
        and (
          b.wall_id is null
          or is_wall_member_and_active(b.wall_id)
        )
    )
  );

create policy "reactions_update_visible_own"
  on public.reactions
  for update
  to authenticated
  using (
    anonymous_id = auth.uid()
    and exists (
      select 1
      from public.bricks b
      where b.id = reactions.brick_id
        and b.status = 'active'
        and (
          b.wall_id is null
          or is_wall_member_and_active(b.wall_id)
        )
    )
  )
  with check (
    anonymous_id = auth.uid()
    and exists (
      select 1
      from public.bricks b
      where b.id = reactions.brick_id
        and b.status = 'active'
        and (
          b.wall_id is null
          or is_wall_member_and_active(b.wall_id)
        )
    )
  );

create policy "reactions_delete_visible_own"
  on public.reactions
  for delete
  to authenticated
  using (
    anonymous_id = auth.uid()
    and exists (
      select 1
      from public.bricks b
      where b.id = reactions.brick_id
        and b.status = 'active'
        and (
          b.wall_id is null
          or is_wall_member_and_active(b.wall_id)
        )
    )
  );


-- ============================================================
-- REPORTS RLS
--
-- Reports remain write-only for normal clients.
-- SELECT/UPDATE/DELETE are intentionally absent.
-- ============================================================

drop policy if exists "reports_insert_own"
  on public.reports;

create policy "reports_insert_visible_own"
  on public.reports
  for insert
  to authenticated
  with check (
    anonymous_id = auth.uid()
    and status = 'open'
    and (
      (
        brick_id is not null
        and comment_id is null
        and exists (
          select 1
          from public.bricks b
          where b.id = reports.brick_id
            and b.status = 'active'
            and (
              b.wall_id is null
              or is_wall_member_and_active(b.wall_id)
            )
        )
      )
      or
      (
        brick_id is null
        and comment_id is not null
        and exists (
          select 1
          from public.comments c
          join public.bricks b
            on b.id = c.brick_id
          where c.id = reports.comment_id
            and c.status = 'active'
            and b.status = 'active'
            and (
              b.wall_id is null
              or is_wall_member_and_active(b.wall_id)
            )
        )
      )
    )
  );


-- ============================================================
-- IMPORTANT:
--
-- We deliberately DO NOT create the duplicate-report partial
-- unique indexes yet.
--
-- Existing production data must be preflighted first. If duplicate
-- open reports already exist, creating those indexes would fail.
--
-- They will be added only after that preflight passes.
-- ============================================================
-- ============================================================
-- RPC / SECURITY DEFINER LAYER
-- ============================================================

-- ------------------------------------------------------------
-- Internal Wall marker generator
--
-- Markers are random, Wall-specific, and contain no identity.
-- The UNIQUE constraint on (wall_id, display_marker) provides
-- the final collision guarantee.
-- ------------------------------------------------------------

create or replace function public._next_wall_marker(
  p_wall_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marker text;
begin
  loop
    v_marker :=
      'Anonymous ' ||
      upper(encode(gen_random_bytes(8), 'hex'));

    if not exists (
      select 1
      from public.wall_members
      where wall_id = p_wall_id
        and display_marker = v_marker
    ) then
      return v_marker;
    end if;
  end loop;
end;
$$;

revoke all
  on function public._next_wall_marker(uuid)
  from public;

revoke all
  on function public._next_wall_marker(uuid)
  from anon;


-- ------------------------------------------------------------
-- Create Wall
--
-- Generates:
--   - 256-bit invite token
--   - bcrypt-protected access code when required
--   - creator membership
--   - creator's Wall-specific anonymous marker
-- ------------------------------------------------------------

create or replace function public.create_wall(
  p_name text,
  p_description text default null,
  p_access_mode text default 'link',
  p_expires_at timestamptz default null
)
returns table (
  wall_id uuid,
  invite_token text,
  access_code text,
  expires_at timestamptz,
  display_marker text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_wall_id uuid;
  v_token text;
  v_token_hash text;
  v_access_code text;
  v_access_code_hash text;
  v_marker text;
  v_bytes bytea;
  v_alphabet constant text :=
    'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_name is null
     or char_length(trim(p_name)) < 1
     or char_length(p_name) > 80 then
    raise exception 'Wall name must be between 1 and 80 characters';
  end if;

  if p_description is not null
     and char_length(p_description) > 280 then
    raise exception 'Wall description must be 280 characters or fewer';
  end if;

  if p_access_mode not in ('link', 'code') then
    raise exception 'Invalid access mode';
  end if;

  if p_expires_at is not null
     and p_expires_at <= now() then
    raise exception 'Expiry must be in the future';
  end if;

  -- 32 random bytes = 256 bits of entropy.
  v_token := encode(gen_random_bytes(32), 'hex');

  v_token_hash := encode(
    digest(v_token, 'sha256'),
    'hex'
  );

  -- Generate an 8-character access code using cryptographic
  -- random bytes rather than PostgreSQL random().
  if p_access_mode = 'code' then
    v_access_code := '';
    v_bytes := gen_random_bytes(8);

    for i in 0..7 loop
      v_access_code := v_access_code ||
        substring(
          v_alphabet
          from (
            (get_byte(v_bytes, i) % length(v_alphabet)) + 1
          )
          for 1
        );
    end loop;

    v_access_code_hash := crypt(
      v_access_code,
      gen_salt('bf')
    );
  end if;

  insert into public.walls (
    name,
    description,
    type,
    creator_anonymous_id,
    access_mode,
    status,
    expires_at
  )
  values (
    trim(p_name),
    nullif(trim(p_description), ''),
    'private',
    auth.uid(),
    p_access_mode,
    'active',
    p_expires_at
  )
  returning id into v_wall_id;

  v_marker := public._next_wall_marker(v_wall_id);

  insert into public.wall_members (
    wall_id,
    anonymous_id,
    display_marker
  )
  values (
    v_wall_id,
    auth.uid(),
    v_marker
  );

  insert into public.wall_invites (
    wall_id,
    token_hash,
    access_code_hash,
    status,
    expires_at
  )
  values (
    v_wall_id,
    v_token_hash,
    v_access_code_hash,
    'active',
    p_expires_at
  );

  return query
  select
    v_wall_id,
    v_token,
    v_access_code,
    p_expires_at,
    v_marker;
end;
$$;

revoke all
  on function public.create_wall(text, text, text, timestamptz)
  from public;

revoke all
  on function public.create_wall(text, text, text, timestamptz)
  from anon;

grant execute
  on function public.create_wall(text, text, text, timestamptz)
  to authenticated;


-- ------------------------------------------------------------
-- Join Wall
--
-- The Wall row is locked before checking/inserting membership.
-- This makes the 100-member limit race-safe.
-- ------------------------------------------------------------

create or replace function public.join_wall(
  p_invite_token text,
  p_access_code text default null
)
returns table (
  wall_id uuid,
  name text,
  description text,
  display_marker text,
  participant_count integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_wall public.walls%rowtype;
  v_invite public.wall_invites%rowtype;
  v_marker text;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_invite_token is null
     or char_length(p_invite_token) <> 64 then
    raise exception 'Invalid invite';
  end if;

  /*
    Lock the Wall first.

    This makes joining serialize with:
      - closing the Wall
      - regenerating the invite
      - changing Wall settings
  */
  select *
  into v_wall
  from public.walls
  where id = (
    select wi.wall_id
    from public.wall_invites wi
    where wi.token_hash = encode(
      digest(p_invite_token, 'sha256'),
      'hex'
    )
      and wi.status = 'active'
    limit 1
  )
  for update;

  if not found then
    raise exception 'Invalid or revoked invite';
  end if;

  /*
    Re-read the invite AFTER obtaining the Wall lock.

    This is important because another transaction may have
    regenerated/revoked the invite while this transaction was
    waiting for the Wall lock.
  */
  select *
  into v_invite
  from public.wall_invites
  where wall_id = v_wall.id
    and token_hash = encode(
      digest(p_invite_token, 'sha256'),
      'hex'
    )
    and status = 'active'
  limit 1;

  if not found then
    raise exception 'Invalid or revoked invite';
  end if;

  if v_wall.status <> 'active'
     or (
       v_wall.expires_at is not null
       and v_wall.expires_at <= now()
     ) then
    raise exception 'Wall is no longer available';
  end if;

  if v_invite.expires_at is not null
     and v_invite.expires_at <= now() then
    raise exception 'Invite has expired';
  end if;

  if v_wall.access_mode = 'code' then
    if p_access_code is null
       or char_length(p_access_code) <> 8 then
      raise exception 'Access code required';
    end if;

    if v_invite.access_code_hash is null
       or crypt(
         upper(p_access_code),
         v_invite.access_code_hash
       ) <> v_invite.access_code_hash then
      raise exception 'Invalid access code';
    end if;
  end if;

  /*
    If already a member, simply return their existing marker.
  */
  select wm.display_marker
  into v_marker
  from public.wall_members wm
  where wm.wall_id = v_wall.id
    and wm.anonymous_id = auth.uid();

  if found then
    select count(*)::integer
    into v_count
    from public.wall_members
    where wall_id = v_wall.id;

    return query
    select
      v_wall.id,
      v_wall.name,
      v_wall.description,
      v_marker,
      v_count;

    return;
  end if;

  /*
    Capacity check happens while the Wall row is locked,
    preventing concurrent joins from exceeding 100 members.
  */
  select count(*)::integer
  into v_count
  from public.wall_members
  where wall_id = v_wall.id;

  if v_count >= 100 then
    raise exception 'Wall is full';
  end if;

  v_marker := public._next_wall_marker(v_wall.id);

  insert into public.wall_members (
    wall_id,
    anonymous_id,
    display_marker
  )
  values (
    v_wall.id,
    auth.uid(),
    v_marker
  );

  v_count := v_count + 1;

  return query
  select
    v_wall.id,
    v_wall.name,
    v_wall.description,
    v_marker,
    v_count;
end;
$$;

revoke all
  on function public.join_wall(text, text)
  from public;

revoke all
  on function public.join_wall(text, text)
  from anon;

grant execute
  on function public.join_wall(text, text)
  to authenticated;

-- ------------------------------------------------------------
-- Get Wall
--
-- Only active members can retrieve Wall details.
-- No creator ID, member IDs, invite hashes, or raw tokens.
-- ------------------------------------------------------------
create or replace function public.get_wall(
  p_wall_id uuid
)
returns table (
  wall_id uuid,
  name text,
  description text,
  access_mode text,
  status text,
  expires_at timestamptz,
  participant_count integer,
  my_display_marker text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wall public.walls%rowtype;
  v_marker text;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  /*
    Lock the Wall before checking membership/status.

    This serializes this operation with Wall closure and other
    Wall-level mutations, ensuring a closed/expired Wall cannot
    be read after the availability check.
  */
  select *
  into v_wall
  from public.walls
  where id = p_wall_id
  for update;

  if not found then
    raise exception 'Wall not found';
  end if;

  if v_wall.status <> 'active'
     or (
       v_wall.expires_at is not null
       and v_wall.expires_at <= now()
     ) then
    raise exception 'Wall is not available';
  end if;

  if not public.is_wall_member_and_active(p_wall_id) then
    raise exception 'Wall is not available';
  end if;

  select display_marker
  into v_marker
  from public.wall_members
  where wall_id = p_wall_id
    and anonymous_id = auth.uid();

  if v_marker is null then
    raise exception 'Membership not found';
  end if;

  select count(*)::integer
  into v_count
  from public.wall_members
  where wall_id = p_wall_id;

  return query
  select
    v_wall.id,
    v_wall.name,
    v_wall.description,
    v_wall.access_mode,
    v_wall.status,
    v_wall.expires_at,
    v_count,
    v_marker;
end;
$$;

revoke all
  on function public.get_wall(uuid)
  from public;

revoke all
  on function public.get_wall(uuid)
  from anon;

grant execute
  on function public.get_wall(uuid)
  to authenticated;


-- ------------------------------------------------------------
-- Create private Brick
--
-- Locks the Wall before checking the 500-Brick limit.
-- Marker is always derived server-side.
-- ------------------------------------------------------------

create or replace function public.create_private_brick(
  p_wall_id uuid,
  p_content text,
  p_category text
)
returns table (
  id uuid,
  content text,
  category text,
  created_at timestamptz,
  wall_display_marker text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wall public.walls%rowtype;
  v_marker text;
  v_count integer;
  v_id uuid;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_content is null
     or char_length(trim(p_content)) < 1
     or char_length(p_content) > 280 then
    raise exception 'Brick must be between 1 and 280 characters';
  end if;

  if p_category not in (
    'random',
    'funny',
    'thoughts',
    'confessions',
    'dark',
    'wholesome',
    'rants'
  ) then
    raise exception 'Invalid category';
  end if;

  select *
  into v_wall
  from public.walls
  where id = p_wall_id
  for update;

  if not found then
    raise exception 'Wall not found';
  end if;

  if not public.is_wall_member_and_active(p_wall_id) then
    raise exception 'You are not an active member of this Wall';
  end if;

  select display_marker
  into v_marker
  from public.wall_members
  where wall_id = p_wall_id
    and anonymous_id = auth.uid();

  if v_marker is null then
    raise exception 'Membership not found';
  end if;

  select count(*)::integer
  into v_count
  from public.bricks
  where wall_id = p_wall_id;

  if v_count >= 500 then
    raise exception 'Wall has reached its Brick limit';
  end if;

  insert into public.bricks (
    content,
    category,
    anonymous_id,
    status,
    wall_id,
    wall_display_marker
  )
  values (
    trim(p_content),
    p_category,
    auth.uid(),
    'active',
    p_wall_id,
    v_marker
  )
  returning
    bricks.id,
    bricks.created_at
  into
    v_id,
    v_created_at;

  return query
  select
    v_id,
    trim(p_content),
    p_category,
    v_created_at,
    v_marker;
end;
$$;

revoke all
  on function public.create_private_brick(uuid, text, text)
  from public;

revoke all
  on function public.create_private_brick(uuid, text, text)
  from anon;

grant execute
  on function public.create_private_brick(uuid, text, text)
  to authenticated;


-- ------------------------------------------------------------
-- Create private Comment
--
-- Locks the parent Brick before checking the 100-comment limit.
-- ------------------------------------------------------------

create or replace function public.create_private_comment(
  p_brick_id uuid,
  p_content text
)
returns table (
  id uuid,
  brick_id uuid,
  content text,
  created_at timestamptz,
  wall_display_marker text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brick public.bricks%rowtype;
  v_wall public.walls%rowtype;
  v_marker text;
  v_count integer;
  v_id uuid;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_content is null
     or char_length(trim(p_content)) < 1
     or char_length(p_content) > 280 then
    raise exception 'Comment must be between 1 and 280 characters';
  end if;

  /*
    Lock the parent Brick first.

    This serializes concurrent comments on the same Brick and
    protects the 100-comment limit.
  */
  select *
  into v_brick
  from public.bricks
  where id = p_brick_id
  for update;

  if not found then
    raise exception 'Brick not found';
  end if;

  if v_brick.status <> 'active'
     or v_brick.wall_id is null then
    raise exception 'Private Brick not found';
  end if;

  /*
    Lock the associated Wall before checking membership.

    close_wall(), join_wall(), update_wall_settings(), and
    regenerate_wall_invite() all operate at Wall level, so this
    ensures a comment cannot be inserted into a Wall that has
    been closed while this transaction is running.
  */
  select *
  into v_wall
  from public.walls
  where id = v_brick.wall_id
  for update;

  if not found then
    raise exception 'Wall not found';
  end if;

  if v_wall.status <> 'active'
     or (
       v_wall.expires_at is not null
       and v_wall.expires_at <= now()
     ) then
    raise exception 'Wall is no longer available';
  end if;

  if not public.is_wall_member_and_active(v_brick.wall_id) then
    raise exception 'You are not an active member of this Wall';
  end if;

  select display_marker
  into v_marker
  from public.wall_members
  where wall_id = v_brick.wall_id
    and anonymous_id = auth.uid();

  if v_marker is null then
    raise exception 'Membership not found';
  end if;

  select count(*)::integer
  into v_count
  from public.comments
  where brick_id = p_brick_id;

  if v_count >= 100 then
    raise exception 'Brick has reached its comment limit';
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
    auth.uid(),
    trim(p_content),
    'active',
    v_marker
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
    trim(p_content),
    v_created_at,
    v_marker;
end;
$$;

revoke all
  on function public.create_private_comment(uuid, text)
  from public;

revoke all
  on function public.create_private_comment(uuid, text)
  from anon;

grant execute
  on function public.create_private_comment(uuid, text)
  to authenticated;


-- ------------------------------------------------------------
-- Update Wall settings
-- Creator only.
-- ------------------------------------------------------------

create or replace function public.update_wall_settings(
  p_wall_id uuid,
  p_name text,
  p_description text default null,
  p_access_mode text default null,
  p_expires_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wall public.walls%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_wall
  from public.walls
  where id = p_wall_id
  for update;

  if not found then
    raise exception 'Wall not found';
  end if;

  if v_wall.creator_anonymous_id <> auth.uid() then
    raise exception 'Only the Wall creator can change settings';
  end if;

  if v_wall.status <> 'active' then
    raise exception 'Wall is no longer active';
  end if;

  if p_name is null
     or char_length(trim(p_name)) < 1
     or char_length(p_name) > 80 then
    raise exception 'Wall name must be between 1 and 80 characters';
  end if;

  if p_description is not null
     and char_length(p_description) > 280 then
    raise exception 'Wall description must be 280 characters or fewer';
  end if;

  if p_access_mode is not null
     and p_access_mode not in ('link', 'code') then
    raise exception 'Invalid access mode';
  end if;

  if p_access_mode is not null
     and p_access_mode <> v_wall.access_mode then
    raise exception 'Access mode cannot be changed with update_wall_settings';
  end if;

  if p_expires_at is not null
     and p_expires_at <= now() then
    raise exception 'Expiry must be in the future';
  end if;

  update public.walls
  set
    name = trim(p_name),
    description = nullif(trim(p_description), ''),
    expires_at = p_expires_at
  where id = p_wall_id;

  update public.wall_invites
  set expires_at = p_expires_at
  where wall_id = p_wall_id
    and status = 'active';

  return true;
end;
$$;

revoke all
  on function public.update_wall_settings(
    uuid,
    text,
    text,
    text,
    timestamptz
  )
  from public;

revoke all
  on function public.update_wall_settings(
    uuid,
    text,
    text,
    text,
    timestamptz
  )
  from anon;

grant execute
  on function public.update_wall_settings(
    uuid,
    text,
    text,
    text,
    timestamptz
  )
  to authenticated;


-- ------------------------------------------------------------
-- Close Wall
--
-- Closed Walls become inaccessible to EVERYONE, including
-- existing members and the creator.
-- ------------------------------------------------------------

create or replace function public.close_wall(
  p_wall_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wall public.walls%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_wall
  from public.walls
  where id = p_wall_id
  for update;

  if not found then
    raise exception 'Wall not found';
  end if;

  if v_wall.creator_anonymous_id <> auth.uid() then
    raise exception 'Only the Wall creator can close this Wall';
  end if;

  if v_wall.status <> 'active' then
    raise exception 'Wall is no longer active';
  end if;

  update public.walls
  set status = 'closed'
  where id = p_wall_id;

  update public.wall_invites
  set
    status = 'revoked',
    revoked_at = now()
  where wall_id = p_wall_id
    and status = 'active';

  return true;
end;
$$;

revoke all
  on function public.close_wall(uuid)
  from public;

revoke all
  on function public.close_wall(uuid)
  from anon;

grant execute
  on function public.close_wall(uuid)
  to authenticated;


-- ------------------------------------------------------------
-- Regenerate invite
--
-- Existing members remain members.
-- Old invite is immediately revoked.
-- Existing access-code hash is preserved.
-- ------------------------------------------------------------

create or replace function public.regenerate_wall_invite(
  p_wall_id uuid
)
returns table (
  invite_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_wall public.walls%rowtype;
  v_old_code_hash text;
  v_token text;
  v_token_hash text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_wall
  from public.walls
  where id = p_wall_id
  for update;

  if not found then
    raise exception 'Wall not found';
  end if;

  if v_wall.creator_anonymous_id <> auth.uid() then
    raise exception 'Only the Wall creator can regenerate the invite';
  end if;

  if v_wall.status <> 'active'
     or (
       v_wall.expires_at is not null
       and v_wall.expires_at <= now()
     ) then
    raise exception 'Wall is no longer active';
  end if;

  select access_code_hash
  into v_old_code_hash
  from public.wall_invites
  where wall_id = p_wall_id
    and status = 'active'
  order by created_at desc
  limit 1;

  update public.wall_invites
  set
    status = 'revoked',
    revoked_at = now()
  where wall_id = p_wall_id
    and status = 'active';

  v_token := encode(gen_random_bytes(32), 'hex');

  v_token_hash := encode(
    digest(v_token, 'sha256'),
    'hex'
  );

  insert into public.wall_invites (
    wall_id,
    token_hash,
    access_code_hash,
    status,
    expires_at
  )
  values (
    p_wall_id,
    v_token_hash,
    v_old_code_hash,
    'active',
    v_wall.expires_at
  );

  return query
  select
    v_token,
    v_wall.expires_at;
end;
$$;

revoke all
  on function public.regenerate_wall_invite(uuid)
  from public;

revoke all
  on function public.regenerate_wall_invite(uuid)
  from anon;

grant execute
  on function public.regenerate_wall_invite(uuid)
  to authenticated;


-- ============================================================
-- PUBLIC FEED SECURITY FIX
--
-- Private Bricks MUST NEVER enter the public feed.
-- ============================================================

create or replace function public.get_brick_feed(
  p_category text default null,
  p_sort text default 'fresh',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  content text,
  category text,
  created_at timestamptz,
  felt_count bigint,
  funny_count bigint,
  same_count bigint,
  interesting_count bigint
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
    count(r.id) filter (
      where r.reaction_type = 'felt'
    ) as felt_count,
    count(r.id) filter (
      where r.reaction_type = 'funny'
    ) as funny_count,
    count(r.id) filter (
      where r.reaction_type = 'same'
    ) as same_count,
    count(r.id) filter (
      where r.reaction_type = 'interesting'
    ) as interesting_count
  from public.bricks b
  left join public.reactions r
    on r.brick_id = b.id
  where b.status = 'active'
    and b.wall_id is null
    and (p_category is null or b.category = p_category)
  group by
    b.id,
    b.content,
    b.category,
    b.created_at
  order by
    case
      when p_sort = 'trending'
      then count(r.id)
    end desc nulls last,
    case
      when p_sort <> 'trending'
      then b.created_at
    end desc nulls last,
    b.id desc
  limit least(
    greatest(coalesce(p_limit, 30), 1),
    50
  )
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all
  on function public.get_brick_feed(
    text,
    text,
    integer,
    integer
  )
  from public;

revoke all
  on function public.get_brick_feed(
    text,
    text,
    integer,
    integer
  )
  from anon;

grant execute
  on function public.get_brick_feed(
    text,
    text,
    integer,
    integer
  )
  to authenticated;
-- ------------------------------------------------------------
-- Read private Bricks
--
-- SECURITY DEFINER means this function must explicitly enforce
-- Wall membership and active Wall status.
-- ------------------------------------------------------------

create or replace function public.get_private_bricks(
  p_wall_id uuid,
  p_limit integer default 30
)
returns table (
  id uuid,
  content text,
  category text,
  created_at timestamptz,
  wall_display_marker text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_limit is null
     or p_limit < 1
     or p_limit > 30 then
    raise exception 'Limit must be between 1 and 30';
  end if;

  if not public.is_wall_member_and_active(p_wall_id) then
    raise exception 'You are not an active member of this Wall';
  end if;

  return query
  select
    b.id,
    b.content,
    b.category,
    b.created_at,
    b.wall_display_marker
  from public.bricks b
  where b.wall_id = p_wall_id
    and b.status = 'active'
  order by b.created_at desc, b.id desc
  limit p_limit;
end;
$$;

revoke all
  on function public.get_private_bricks(uuid, integer)
  from public;

revoke all
  on function public.get_private_bricks(uuid, integer)
  from anon;

grant execute
  on function public.get_private_bricks(uuid, integer)
  to authenticated;