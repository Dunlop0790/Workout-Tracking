// ============================================================
// Supabase config — paste your values from:
//   app.supabase.com → your project → Settings → API
// ============================================================
const SUPABASE_URL      = 'https://xyaxmifejuhpbprshlpk.supabase.co';   // e.g. https://xyzxyz.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_12oD7DfkMRTOmmk9GZF_6A_ncX2CwhU';   // your project's anon/public key
// ============================================================


// ============================================================
// ONE-TIME DATABASE SETUP
// Run this SQL once in your Supabase project:
//   app.supabase.com → SQL Editor → New query → paste + run
// ============================================================
/*

create table members (
  id        text primary key,
  name      text not null,
  joined    text not null,
  day_start text not null default '00:00'
);

create table workouts (
  id          bigserial primary key,
  member_id   text not null references members(id) on delete cascade,
  week_start  text not null,
  slot        integer not null,
  ts          bigint,
  constraint workouts_unique unique (member_id, week_start, slot)
);

create table lifts (
  id               text primary key,
  owner_member_id  text not null references members(id) on delete cascade,
  name             text not null,
  is_default       boolean not null default false
);

create table lift_entries (
  id          bigserial primary key,
  member_id   text not null references members(id) on delete cascade,
  lift_name   text not null,
  weight      numeric not null,
  reps        integer not null,
  ts          bigint not null
);

alter table members      enable row level security;
alter table workouts     enable row level security;
alter table lifts        enable row level security;
alter table lift_entries enable row level security;

create policy "Allow all" on members      for all using (true) with check (true);
create policy "Allow all" on workouts     for all using (true) with check (true);
create policy "Allow all" on lifts        for all using (true) with check (true);
create policy "Allow all" on lift_entries for all using (true) with check (true);

alter publication supabase_realtime add table members;
alter publication supabase_realtime add table workouts;
alter publication supabase_realtime add table lifts;
alter publication supabase_realtime add table lift_entries;

-- ─────────────────────────────────────────────
-- NEW: Run these if upgrading an existing install
-- ─────────────────────────────────────────────

-- Workout type tagging (Lift / Run / Cardio / Sport / Crosstraining / Other)
alter table workouts add column if not exists workout_type text;

-- Trash Talk comment feed
create table if not exists comments (
  id        bigserial primary key,
  member_id text not null references members(id) on delete cascade,
  content   text not null,
  ts        bigint not null
);
alter table comments enable row level security;
create policy "Allow all" on comments for all using (true) with check (true);
alter publication supabase_realtime add table comments;

-- Nutrition tracking (foods store macros per 100g)
create table if not exists foods (
  id       text primary key,
  name     text not null,
  brand    text,
  calories numeric not null,
  protein  numeric not null,
  carbs    numeric not null,
  fat      numeric not null
);

create table if not exists food_servings (
  id      text primary key,
  food_id text not null references foods(id) on delete cascade,
  label   text not null,
  grams   numeric not null
);

create table if not exists food_log (
  id        bigserial primary key,
  member_id text not null references members(id) on delete cascade,
  log_date  text not null,
  log_time  text not null,
  food_id   text not null references foods(id) on delete restrict,
  grams     numeric not null
);

create table if not exists macro_goals (
  member_id text primary key references members(id) on delete cascade,
  calories  numeric not null,
  protein   numeric not null,
  carbs     numeric not null,
  fat       numeric not null
);

alter table foods         enable row level security;
alter table food_servings enable row level security;
alter table food_log      enable row level security;
alter table macro_goals   enable row level security;

create policy "Allow all" on foods         for all using (true) with check (true);
create policy "Allow all" on food_servings for all using (true) with check (true);
create policy "Allow all" on food_log      for all using (true) with check (true);
create policy "Allow all" on macro_goals   for all using (true) with check (true);

alter publication supabase_realtime add table foods;
alter publication supabase_realtime add table food_servings;
alter publication supabase_realtime add table food_log;
alter publication supabase_realtime add table macro_goals;

-- Food icons (category icon key shown next to food names)
alter table foods add column if not exists icon text;

-- Migrate meal slots to times (chronological log)
alter table food_log add column if not exists log_time text;
update food_log set log_time = case meal
  when 'breakfast' then '08:00'
  when 'lunch'     then '12:00'
  when 'dinner'    then '18:00'
  else '15:00'
end where log_time is null;
alter table food_log alter column log_time set not null;
alter table food_log drop column if exists meal;

-- Per-member diary day start (night shift support)
alter table members add column if not exists day_start text not null default '00:00';

-- News ticker. Select-only RLS: the site can read, nobody can write
-- through the app. Post and delete through this SQL Editor only.
create table if not exists news (
  id      bigserial primary key,
  content text not null,
  ts      bigint not null
);
alter table news enable row level security;
create policy "Read only" on news for select using (true);
alter publication supabase_realtime add table news;

-- Optional nutrients on foods (blank means unknown, not zero)
alter table foods add column if not exists sodium numeric;
alter table foods add column if not exists fiber  numeric;
alter table foods add column if not exists sugar  numeric;

-- Club Records opt-in (per member)
alter table members add column if not exists records_opt_in boolean not null default false;

-- Comment attachments (image path in the attachments bucket)
alter table comments add column if not exists attachment text;

-- Attachments bucket: public read, 5 MB cap, images only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', true, 5242880,
        array['image/png','image/jpeg','image/gif','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/png','image/jpeg','image/gif','image/webp'];

create policy "attachments read"   on storage.objects for select using (bucket_id = 'attachments');
create policy "attachments insert" on storage.objects for insert with check (bucket_id = 'attachments');
create policy "attachments delete" on storage.objects for delete using (bucket_id = 'attachments');

-- Comment expiry: enable the Cron module (Dashboard > Integrations > Cron)
-- or run: create extension if not exists pg_cron;
-- Then schedule the daily purge of expired TEXT-ONLY comments.
-- Comments with attachments are swept by the app through the Storage API,
-- because deleting storage rows via SQL orphans the files permanently.
select cron.schedule(
  'purge-old-comments', '0 6 * * *',
  $$delete from comments where attachment is null
      and ts < (extract(epoch from now()) - 14*24*3600) * 1000$$
);

-- BLOCKS hi-scores (Game Boy theme side game)
create table if not exists dmg_scores (
  id       bigserial primary key,
  initials text not null,
  score    int not null,
  lines    int not null,
  ts       bigint not null
);
alter table dmg_scores enable row level security;
create policy "Allow all" on dmg_scores for all using (true) with check (true);

-- To post news:
--   insert into news (content, ts)
--   values ('New: Nutrition tab is live', (extract(epoch from now()) * 1000)::bigint);
-- To list and remove old posts:
--   select id, content from news order by ts desc;
--   delete from news where id = 1;

*/
