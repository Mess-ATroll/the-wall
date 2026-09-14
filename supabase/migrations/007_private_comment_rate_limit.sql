-- ------------------------------------------------------------
-- Private Comment Rate Limit
--
-- One 5-second cooldown per anonymous user globally across
-- private Walls.
-- ------------------------------------------------------------

create index if not exists comments_anonymous_id_created_at_idx
  on public.comments (anonymous_id, created_at desc);

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
  v_last_created_at timestamptz;
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
    Serialize private-comment creation per anonymous identity.

    This prevents simultaneous requests from the same identity
    from both passing the cooldown check.
  */
  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text, 0)
  );

  select c.created_at
  into v_last_created_at
  from public.comments c
  where c.anonymous_id = auth.uid()
    and c.brick_id in (
      select b.id
      from public.bricks b
      where b.wall_id is not null
    )
  order by c.created_at desc
  limit 1;

  if v_last_created_at is not null
     and v_last_created_at > now() - interval '5 seconds' then
    raise exception 'private_comment_rate_limited';
  end if;

  /*
    Lock the parent Brick first.

    This serializes concurrent comments on the same Brick and
    protects the 100-comment limit.
  */
  select *
  into v_brick
  from public.bricks b
  where b.id = p_brick_id
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
    regenerate_wall_invite() all operate at Wall level.
  */
  select *
  into v_wall
  from public.walls w
  where w.id = v_brick.wall_id
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