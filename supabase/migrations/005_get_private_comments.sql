create or replace function public.get_private_comments(
  p_brick_id uuid
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
  v_wall_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select b.wall_id
  into v_wall_id
  from public.bricks b
  where b.id = p_brick_id
    and b.status = 'active'
    and b.wall_id is not null;

  if v_wall_id is null then
    raise exception 'Private Brick not found';
  end if;

  if not public.is_wall_member_and_active(v_wall_id) then
    raise exception 'You are not an active member of this Wall';
  end if;

  return query
  select
    c.id,
    c.brick_id,
    c.content,
    c.created_at,
    c.wall_display_marker
  from public.comments c
  where c.brick_id = p_brick_id
    and c.status = 'active'
  order by c.created_at asc, c.id asc;
end;
$$;

revoke all
  on function public.get_private_comments(uuid)
  from public;

revoke all
  on function public.get_private_comments(uuid)
  from anon;

grant execute
  on function public.get_private_comments(uuid)
  to authenticated;