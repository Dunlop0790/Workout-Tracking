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
  joined    text not null
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
  meal      text not null,
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

*/
