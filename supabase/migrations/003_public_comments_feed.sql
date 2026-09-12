-- THE WALL — Public comments feed support
-- Adds comment count + first 3 public comments to the public feed RPC.
-- Does not change the comments table or its RLS policies.

drop function if exists public.get_brick_feed(
  text,
  text,
  integer,
  integer
);

create function public.get_brick_feed(
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
  interesting_count bigint,
  comment_count bigint,
  comment_preview jsonb
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
    ) as interesting_count,

    (
      select count(*)
      from public.comments c
      where c.brick_id = b.id
        and c.status = 'active'
        and c.wall_display_marker is null
    ) as comment_count,

    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'content', c.content,
            'created_at', c.created_at
          )
          order by c.created_at asc, c.id asc
        )
        from (
          select
            c.id,
            c.content,
            c.created_at
          from public.comments c
          where c.brick_id = b.id
            and c.status = 'active'
            and c.wall_display_marker is null
          order by c.created_at asc, c.id asc
          limit 3
        ) c
      ),
      '[]'::jsonb
    ) as comment_preview

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
