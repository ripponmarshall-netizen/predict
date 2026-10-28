-- A stand-in for the parts of Supabase that schema.sql relies on, so it can
-- be tested on plain Postgres (supabase/test.sh). Never run this on a real
-- Supabase project: it already has all of this.

-- Roles belong to the whole server, so they may be left from a past run.
do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

create schema auth;
create table auth.users (id uuid primary key, email text);
-- Supabase's auth.uid(): the signed-in user's id from the request's JWT.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase's default grants: everything in public to anon and authenticated.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
