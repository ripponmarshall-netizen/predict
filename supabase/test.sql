-- Checks for schema.sql, run by test.sh after bootstrap.sql. Each step signs
-- in as a player (set role + the JWT's user id) and tries what the app
-- would, including what it must not be allowed to do. The scores match
-- predikt.test.js, so the app and the database score the same way.
\set ON_ERROR_STOP 1
\set admin '00000000-0000-0000-0000-00000000000a'
\set kat '00000000-0000-0000-0000-00000000000b'
\set dee '00000000-0000-0000-0000-00000000000c'

create schema test;
create function test.expect_error(sql text, pattern text) returns void language plpgsql as $$
declare
  msg text;
begin
  begin
    execute sql;
  exception when others then
    msg := sqlerrm;
  end;
  if msg is null then
    raise exception 'Expected an error (%) from: %', pattern, sql;
  end if;
  if msg !~* pattern then
    raise exception 'Wrong error from %: % (expected %)', sql, msg, pattern;
  end if;
end $$;
create function test.eq(actual anycompatible, expected anycompatible, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception '%: got %, expected %', label, actual, expected;
  end if;
end $$;
grant usage on schema test to anon, authenticated;
grant execute on all functions in schema test to anon, authenticated;

insert into auth.users (id) values (:'admin'), (:'kat'), (:'dee');

-- 1. Profiles: your own only, and never your own admin flag.
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
insert into profiles (id, handle, parish) values (:'admin', 'rippon', 'Portland');
select test.expect_error($$update profiles set is_admin = true where id = auth.uid()$$, 'permission denied');
select test.expect_error($$insert into profiles (id, handle) values ('00000000-0000-0000-0000-00000000000b', 'imposter')$$, 'row-level security');
select set_config('request.jwt.claim.sub', :'kat', false);
insert into profiles (id, handle, parish) values (:'kat', 'kat', 'St Andrew');
select set_config('request.jwt.claim.sub', :'dee', false);
insert into profiles (id, handle, parish, country) values (:'dee', 'Dee', 'St Andrew', 'United Kingdom');
select test.expect_error($$update profiles set handle = 'KAT' where id = auth.uid()$$, 'duplicate key');
select test.expect_error($$update profiles set handle = 'a b' where id = auth.uid()$$, 'check constraint');

-- 2. Only admins write questions, and only as open questions.
select test.expect_error($$insert into questions (title, kind, options, category, close_at, resolution_source)
  values ('Will the BOJ hold the rate?', 'binary', '{Yes,No}', 'Economy', now() + interval '1 day', 'BOJ')$$, 'row-level security');
reset role;
-- The first admin is made by hand in the SQL editor (see README).
update profiles set is_admin = true where id = :'admin';
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
insert into questions (title, kind, options, category, close_at, resolution_source, resolution_url)
values ('Will the BOJ hold the policy rate?', 'binary', '{Yes,No}', 'Economy', now() + interval '1 day', 'BOJ press release', 'https://boj.org.jm')
returning id as q \gset
select test.expect_error($$insert into questions (title, kind, options, category, close_at, resolution_source, status)
  values ('Will this start resolved?', 'binary', '{Yes,No}', 'Economy', now() + interval '1 day', 'x', 'resolved')$$, 'permission denied');
select test.expect_error($$insert into questions (title, kind, options, category, close_at, resolution_source)
  values ('Will this be a Yes or a Maybe?', 'binary', '{Yes,Maybe}', 'Economy', now() + interval '1 day', 'x')$$, 'check constraint');
select test.expect_error(format($$update questions set status = 'void' where id = %L$$, :'q'), 'permission denied');

-- 3. Calls: your own, whole percentages adding to 100, stamped by the server.
select set_config('request.jwt.claim.sub', :'kat', false);
insert into forecasts (question_id, probs) values (:'q', '{60,40}');
insert into forecasts (question_id, probs) values (:'q', '{30,70}');
select test.expect_error(format($$insert into forecasts (question_id, probs) values (%L, '{60,41}')$$, :'q'), 'adding up to 100');
select test.expect_error(format($$insert into forecasts (question_id, probs) values (%L, '{100}')$$, :'q'), 'adding up to 100');
select test.expect_error(format($$insert into forecasts (question_id, probs) values (%L, '{120,-20}')$$, :'q'), 'adding up to 100');
select test.expect_error(format($$insert into forecasts (user_id, question_id, probs) values (%L, %L, '{50,50}')$$, :'dee', :'q'), 'permission denied');
select test.expect_error(format($$insert into forecasts (question_id, probs, created_at) values (%L, '{50,50}', now() - interval '1 year')$$, :'q'), 'permission denied');
select set_config('request.jwt.claim.sub', :'dee', false);
insert into forecasts (question_id, probs) values (:'q', '{50,50}');
select test.eq((select count(*) from forecasts)::int, 1, 'an open question hides other calls');
select test.eq((select calls from crowds() where question_id = :'q'), 2, 'the crowd counts each player once');
select test.eq((select probs from crowds() where question_id = :'q'), array[40, 60]::numeric[], 'the crowd averages latest calls');
select set_config('request.jwt.claim.sub', :'admin', false);
insert into forecasts (question_id, probs) values (:'q', '{90,10}');

-- 4. Closing and resolving: admins only, closed first, with a source link.
select set_config('request.jwt.claim.sub', :'kat', false);
select test.expect_error(format('select resolve_question(%L, 0, %L)', :'q', 'https://boj.org.jm'), 'Admins only');
select test.expect_error(format('select close_question(%L)', :'q'), 'Admins only');
select set_config('request.jwt.claim.sub', :'admin', false);
select test.expect_error(format('select resolve_question(%L, 0, %L)', :'q', 'https://boj.org.jm'), 'Close the question');
select close_question(:'q');
select test.expect_error(format('select close_question(%L)', :'q'), 'already closed');
select set_config('request.jwt.claim.sub', :'kat', false);
select test.expect_error(format($$insert into forecasts (question_id, probs) values (%L, '{99,1}')$$, :'q'), 'has closed');
select test.eq((select count(*) from forecasts)::int, 4, 'a closed question shows every call');
select set_config('request.jwt.claim.sub', :'admin', false);
select test.expect_error(format('select resolve_question(%L, 0, %L)', :'q', 'boj.org.jm'), 'link');
select test.expect_error(format('select resolve_question(%L, 2, %L)', :'q', 'https://boj.org.jm'), 'Pick the outcome');
select resolve_question(:'q', 0, 'https://boj.org.jm/press', 'Held at 6%');

-- 5. Scores: the same numbers as predikt.test.js.
select test.eq((select round(points, 6) from scores where user_id = :'admin'), 99.000000, '90% Yes, Yes');
select test.eq((select round(points, 6) from scores where user_id = :'kat'), 51.000000, 'only the latest call (30%) counts');
select test.eq((select round(points, 6) from scores where user_id = :'dee'), 75.000000, 'a coin flip scores 75');
select test.eq((select string_agg(handle || ':' || round(points), ',' order by points desc) from leaderboard), 'rippon:99,Dee:75,kat:51', 'leaderboard');
select test.eq((select action || ':' || outcome from resolution_log order by id desc limit 1), 'resolve:Yes', 'the result is logged');
select test.expect_error(format('select resolve_question(%L, 1, %L)', :'q', 'https://boj.org.jm'), 'already settled');
select test.expect_error($$delete from scores$$, 'permission denied');
select test.expect_error($$insert into resolution_log (question_id, action) select id, 'void' from questions$$, 'permission denied');
select test.expect_error(format('select score_question(%L)', :'q'), 'permission denied');

-- 6. A dispute holds the points back until it's resolved again.
select test.expect_error(format('select dispute_question(%L, %L)', :'q', ' '), 'what''s disputed');
select dispute_question(:'q', 'Wrong press release');
select test.eq((select count(*) from scores)::int, 0, 'a dispute holds points');
select test.eq((select points from leaderboard where handle = 'rippon'), 0::numeric, 'leaderboard during a dispute');
select resolve_question(:'q', 1, 'https://boj.org.jm/right');
select test.eq((select round(points, 6) from scores where user_id = :'kat'), 91.000000, '30% Yes, No');
select test.eq((select round(points, 6) from scores where user_id = :'admin'), 19.000000, '90% Yes, No: low, never below 0');

-- 7. Void: nobody scores, and it stays void.
select void_question(:'q', 'Source unclear');
select test.eq((select count(*) from scores)::int, 0, 'void scores nothing');
select test.expect_error(format('select void_question(%L, %L)', :'q', 'again'), 'already void');
select test.eq((select string_agg(action, ',' order by id) from resolution_log), 'close,resolve,dispute,resolve,void', 'every decision is logged');

-- 8. A question with options.
insert into questions (title, kind, options, category, close_at, resolution_source)
values ('Which school wins Boys Champs?', 'choice', '{KC,JC,Calabar,STETHS}', 'Sport', now() + interval '1 day', 'ISSA')
returning id as q2 \gset
select set_config('request.jwt.claim.sub', :'kat', false);
select test.expect_error(format($$insert into forecasts (question_id, probs) values (%L, '{50,50}')$$, :'q2'), 'adding up to 100');
insert into forecasts (question_id, probs) values (:'q2', '{70,10,10,10}');
select set_config('request.jwt.claim.sub', :'admin', false);
select close_question(:'q2');
select resolve_question(:'q2', 0, 'https://www.issasports.com');
select test.eq((select round(points, 6) from scores where question_id = :'q2'), 94.000000, '4 options, 70% on the winner');
select test.eq((select calls from crowds() where question_id = :'q2'), 1, 'crowds covers every question');

-- 9. Signed out: read the public tables, nothing else.
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select test.eq((select count(*) from questions)::int, 2, 'anyone can read questions');
select test.eq((select count(*) from leaderboard)::int, 3, 'anyone can read the leaderboard');
select test.expect_error($$select * from forecasts$$, 'permission denied');
select test.eq((select count(*) from crowds())::int, 2, 'anyone can read the crowd');
select test.expect_error(format('select close_question(%L)', :'q2'), 'permission denied');
select test.expect_error($$select is_admin()$$, 'permission denied');
reset role;

\echo 'All schema checks passed'
