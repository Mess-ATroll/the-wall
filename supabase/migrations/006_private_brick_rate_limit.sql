-- ------------------------------------------------------------
-- Private Brick Rate Limit
--
-- One 15-second cooldown per anonymous user globally,
-- regardless of which Wall they post to.
-- ------------------------------------------------------------

create index if not exists bricks_anonymous_id_created_at_idx
  on public.bricks (anonymous_id, created_at desc);

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
  v_last_created_at timestamptz;
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

  /*
    Serialize private-brick creation per anonymous identity.

    This prevents simultaneous requests from the same identity
    from both passing the cooldown check.
  */
  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text, 0)
  );

    select b.created_at
  into v_last_created_at
  from public.bricks b
  where b.anonymous_id = auth.uid()
    and b.wall_id is not null
  order by b.created_at desc
  limit 1;

  if v_last_created_at is not null
     and v_last_created_at > now() - interval '5 seconds' then
    raise exception 'private_brick_rate_limited';
  end if;

    select *
  into v_wall
  from public.walls w
  where w.id = p_wall_id
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