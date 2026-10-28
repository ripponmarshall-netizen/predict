-- Predikt: Supabase schema (Postgres 15+).
-- The online database. To set up a new project, paste this into Supabase →
-- SQL Editor and run it once. supabase/test.sh runs it against plain
-- Postgres with the checks in test.sql.
--
-- The same rules as helpers.jsx:
--   * a forecast is whole percentages, one per option, adding up to 100
--   * a player's latest forecast before the question closes counts
--   * Brier score; points = 100 × (1 − Brier ÷ 2): 0 to 100, never below 0
--   * only admins write, close and resolve questions; every decision is
--     logged with its source link; scoring runs here, never in the app
--   * players write only their own forecasts, only while a question is open

-- ---------- tables ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null check (handle ~ '^[A-Za-z0-9_]{3,20}$'),
  parish text,
  country text not null default 'Jamaica',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_handle_key on public.profiles (lower(handle));

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 10 and 160),
  kind text not null check (kind in ('binary', 'choice', 'range')),
  options text[] not null check (cardinality(options) between 2 and 8),
  category text not null,
  region text not null default 'JM', -- JM, INTL; a new region is new data
  close_at timestamptz not null,
  resolution_source text not null,
  resolution_url text,
  status text not null default 'open'
    check (status in ('open', 'disputed', 'resolved', 'void')),
  outcome smallint, -- index into options (0 = the first)
  resolved_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check ((status = 'resolved') = (outcome is not null)),
  check (outcome is null or (outcome >= 0 and outcome < cardinality(options))),
  check (kind <> 'binary' or options = array['Yes', 'No'])
);
create index questions_open on public.questions (close_at) where status = 'open';

create table public.forecasts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  probs smallint[] not null, -- whole percentages, one per option
  created_at timestamptz not null default now()
);
create index forecasts_latest on public.forecasts (question_id, user_id, created_at desc);

-- Written only by score_question().
create table public.scores (
  question_id uuid references public.questions (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  brier numeric not null,
  points numeric not null,
  primary key (question_id, user_id)
);
create index scores_user on public.scores (user_id);

-- Written only by the admin functions below.
create table public.resolution_log (
  id bigint generated always as identity primary key,
  question_id uuid not null references public.questions (id) on delete cascade,
  action text not null check (action in ('close', 'resolve', 'dispute', 'void')),
  outcome text,
  source_url text,
  note text,
  by_user uuid default auth.uid() references auth.users (id),
  at timestamptz not null default now()
);

-- Points are summed from scores, never stored on the profile, so they
-- can't drift from the scores behind them.
create view public.leaderboard with (security_invoker = true) as
select
  p.id, p.handle, p.parish, p.country,
  coalesce(sum(s.points), 0) as points,
  count(s.question_id) as scored,
  avg(s.brier) as avg_brier
from public.profiles p
left join public.scores s on s.user_id = p.id
group by p.id;

-- ---------- helpers ----------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Check a forecast before it's saved, and stamp it with the server's
-- clock (never the phone's), so "latest before close" can't be gamed.
create function public.forecast_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  q public.questions;
begin
  select * into q from public.questions where id = new.question_id;
  if q.id is null then
    raise exception 'Unknown question.';
  end if;
  if q.status <> 'open' or q.close_at <= now() then
    raise exception 'This question has closed.';
  end if;
  if cardinality(new.probs) <> cardinality(q.options)
    or exists (select 1 from unnest(new.probs) p where p is null or p < 0 or p > 100)
    or (select sum(p) from unnest(new.probs) p) <> 100 then
    raise exception 'A forecast needs whole percentages adding up to 100.';
  end if;
  new.created_at := now();
  return new;
end $$;
create trigger forecasts_guard before insert on public.forecasts
for each row execute function public.forecast_guard();

-- (Re)score one question from scratch: each player's latest forecast
-- before close against the outcome. Clears the scores of a question that
-- isn't resolved (disputed, void). Points run from 0 (certain and wrong)
-- to 100 (certain and right), a straight line from the Brier score, so the
-- best expected score always comes from an honest call.
create function public.score_question(q_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.questions;
begin
  select * into q from public.questions where id = q_id;
  delete from public.scores where question_id = q_id;
  if q.status <> 'resolved' then
    return;
  end if;
  insert into public.scores (question_id, user_id, brier, points)
  select q_id, f.user_id, b.brier, 100 * (1 - b.brier / 2)
  from (
    select distinct on (user_id) user_id, probs
    from public.forecasts
    where question_id = q_id and created_at < q.close_at
    order by user_id, created_at desc, id desc
  ) f
  cross join lateral (
    select sum(power(u.p / 100.0 - case when u.i - 1 = q.outcome then 1 else 0 end, 2)) as brier
    from unnest(f.probs) with ordinality as u (p, i)
  ) b;
end $$;

-- The crowd on every question: how many players have a call, and the
-- average chance on each option. Aggregate only, so nobody's call is
-- exposed while a question is open.
create function public.crowds() returns table (question_id uuid, calls int, probs numeric[])
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (f.question_id, f.user_id) f.question_id, f.probs
    from public.forecasts f
    join public.questions q on q.id = f.question_id
    where f.created_at < q.close_at
    order by f.question_id, f.user_id, f.created_at desc, f.id desc
  ),
  per_option as (
    select l.question_id, u.i, avg(u.p) as avg_p
    from latest l, unnest(l.probs) with ordinality as u (p, i)
    group by l.question_id, u.i
  )
  select
    c.question_id,
    c.calls,
    (select array_agg(o.avg_p order by o.i) from per_option o where o.question_id = c.question_id)
  from (select question_id, count(*)::int as calls from latest group by question_id) c
$$;

-- ---------- admin actions ----------

create function public.close_question(q_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;
  update public.questions set close_at = now()
  where id = q_id and status in ('open', 'disputed') and close_at > now();
  if not found then
    raise exception 'This question is already closed.';
  end if;
  insert into public.resolution_log (question_id, action) values (q_id, 'close');
end $$;

create function public.resolve_question(q_id uuid, outcome_index int, source_url text, note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.questions;
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;
  select * into q from public.questions where id = q_id for update;
  if q.id is null then
    raise exception 'Unknown question.';
  end if;
  if q.status not in ('open', 'disputed') then
    raise exception 'This question is already settled.';
  end if;
  if q.close_at > now() then
    raise exception 'Close the question before resolving it.';
  end if;
  if outcome_index is null or outcome_index < 0 or outcome_index >= cardinality(q.options) then
    raise exception 'Pick the outcome.';
  end if;
  if coalesce(source_url, '') !~ '^https?://\S+\.\S+' then
    raise exception 'Add a link to the source (http:// or https://).';
  end if;
  update public.questions
  set status = 'resolved', outcome = outcome_index, resolved_at = now()
  where id = q_id;
  insert into public.resolution_log (question_id, action, outcome, source_url, note)
  values (q_id, 'resolve', q.options[outcome_index + 1], source_url, nullif(trim(note), ''));
  perform public.score_question(q_id);
end $$;

-- SOP: resolution incident. Freeze the question; its points are held back.
create function public.dispute_question(q_id uuid, note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;
  if coalesce(trim(note), '') = '' then
    raise exception 'Say what''s disputed.';
  end if;
  update public.questions set status = 'disputed', outcome = null, resolved_at = null
  where id = q_id and status in ('open', 'resolved');
  if not found then
    raise exception 'This question can''t be disputed.';
  end if;
  insert into public.resolution_log (question_id, action, note) values (q_id, 'dispute', trim(note));
  perform public.score_question(q_id);
end $$;

-- If the source is unclear: void, and nobody scores.
create function public.void_question(q_id uuid, note text, source_url text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;
  if coalesce(trim(note), '') = '' then
    raise exception 'Say why it''s void.';
  end if;
  if coalesce(source_url, '') <> '' and source_url !~ '^https?://\S+\.\S+' then
    raise exception 'The link must start with http:// or https://.';
  end if;
  update public.questions set status = 'void', outcome = null, resolved_at = now()
  where id = q_id and status <> 'void';
  if not found then
    raise exception 'This question is already void.';
  end if;
  insert into public.resolution_log (question_id, action, source_url, note)
  values (q_id, 'void', nullif(source_url, ''), trim(note));
  perform public.score_question(q_id);
end $$;

-- ---------- access ----------

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.forecasts enable row level security;
alter table public.scores enable row level security;
alter table public.resolution_log enable row level security;

-- Supabase grants everything on new tables and functions to anon and
-- authenticated by default; take it back and grant only what's needed.
revoke all on public.profiles, public.questions, public.forecasts, public.scores, public.resolution_log
  from anon, authenticated;
revoke all on public.leaderboard from anon, authenticated;
revoke execute on function public.score_question(uuid), public.forecast_guard()
  from public, anon, authenticated;
-- Granted outright rather than left to the defaults, which newer Supabase
-- projects may tighten. Each admin action checks is_admin() itself.
grant execute on function public.is_admin(), public.crowds() to anon, authenticated;
grant execute on function
  public.close_question(uuid),
  public.resolve_question(uuid, int, text, text),
  public.dispute_question(uuid, text),
  public.void_question(uuid, text, text)
  to authenticated;

grant select on public.profiles, public.questions, public.scores, public.resolution_log, public.leaderboard
  to anon, authenticated;
grant select on public.forecasts to authenticated;
grant insert (question_id, probs) on public.forecasts to authenticated;
-- Column grants: a player can never set is_admin on their own profile.
grant insert (id, handle, parish, country) on public.profiles to authenticated;
grant update (handle, parish, country) on public.profiles to authenticated;
grant insert (title, kind, options, category, region, close_at, resolution_source, resolution_url)
  on public.questions to authenticated;

create policy "Profiles are public" on public.profiles for select using (true);
create policy "Make your own profile" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "Edit your own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Questions are public" on public.questions for select using (true);
create policy "Admins write questions" on public.questions for insert to authenticated
  with check (public.is_admin());

-- Your own calls any time; everyone's once a question has closed (no
-- copying the leader while it's open: crowds() gives the average).
create policy "See calls" on public.forecasts for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.questions q where q.id = question_id and q.close_at <= now())
);
create policy "Make your own calls" on public.forecasts for insert to authenticated
  with check (user_id = auth.uid());

create policy "Scores are public" on public.scores for select using (true);
create policy "The log is public" on public.resolution_log for select using (true);
