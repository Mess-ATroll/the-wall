-- ============================================================
-- Report creation: server-side rate limiting + RPC-only writes
--
-- Limits each anonymous identity to 5 reports per 10 minutes.
-- The advisory lock makes the check-and-insert atomic for
-- concurrent requests from the same identity.
-- ============================================================

create or replace function public.create_report(
  p_target_id uuid,
  p_target_type text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_recent_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = 'WR001';
  end if;

  v_user_id := auth.uid();

  if p_target_type not in ('brick', 'comment') then
    raise exception 'Invalid report target'
      using errcode = 'WR002';
  end if;

  if p_reason not in (
    'spam',
    'harassment',
    'hate',
    'inappropriate',
    'other'
  ) then
    raise exception 'Invalid report reason'
      using errcode = 'WR003';
  end if;

  /*
    Serialize report creation per anonymous identity.

    Without this lock, simultaneous requests could both count
    the same existing reports and both pass the rate-limit check.
  */
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text, 0)
  );

  /*
    Only count reports from the current rolling 10-minute window.
    The server clock is authoritative.
  */
  select count(*)::integer
  into v_recent_count
  from public.reports
  where anonymous_id = v_user_id
    and created_at > now() - interval '10 minutes';

  if v_recent_count >= 5 then
    raise exception 'report_rate_limited'
      using errcode = 'WR429';
  end if;

  /*
    Validate that the target is currently visible to this user.
  */
  if p_target_type = 'brick' then

    if not exists (
      select 1
      from public.bricks b
      where b.id = p_target_id
        and b.status = 'active'
        and (
          b.wall_id is null
          or public.is_wall_member_and_active(b.wall_id)
        )
    ) then
      raise exception 'Brick not found'
        using errcode = 'WR004';
    end if;

    insert into public.reports (
      brick_id,
      anonymous_id,
      reason,
      status
    )
    values (
      p_target_id,
      v_user_id,
      p_reason,
      'open'
    );

  else

    if not exists (
      select 1
      from public.comments c
      join public.bricks b
        on b.id = c.brick_id
      where c.id = p_target_id
        and c.status = 'active'
        and b.status = 'active'
        and (
          b.wall_id is null
          or public.is_wall_member_and_active(b.wall_id)
        )
    ) then
      raise exception 'Comment not found'
        using errcode = 'WR005';
    end if;

    insert into public.reports (
      comment_id,
      anonymous_id,
      reason,
      status
    )
    values (
      p_target_id,
      v_user_id,
      p_reason,
      'open'
    );

  end if;

exception
  when unique_violation then
    raise exception 'report_already_exists'
      using errcode = 'WR409';
end;
$$;

-- Remove direct client-side INSERT access.
drop policy if exists "reports_insert_visible_own"
  on public.reports;

-- RPC only.
revoke all
  on function public.create_report(uuid, text, text)
  from public;

revoke all
  on function public.create_report(uuid, text, text)
  from anon;

grant execute
  on function public.create_report(uuid, text, text)
  to authenticated;