// ============================================================
// Supabase config - paste your values from:
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

-- Club votes: the votes table is select-only (Corey posts through this
-- SQL Editor, like news); responses are open to the club.
create table if not exists votes (
  id       bigserial primary key,
  question text not null,
  options  text[] not null,
  open     boolean not null default true,
  ts       bigint not null
);
alter table votes enable row level security;
create policy "Read only" on votes for select using (true);

create table if not exists vote_responses (
  vote_id   bigint not null references votes(id) on delete cascade,
  member_id text not null references members(id) on delete cascade,
  choice    int not null,
  ts        bigint not null,
  primary key (vote_id, member_id)
);
alter table vote_responses enable row level security;
create policy "Allow all" on vote_responses for all using (true) with check (true);
alter publication supabase_realtime add table votes;
alter publication supabase_realtime add table vote_responses;

-- To open a vote:
--   insert into votes (question, options, ts)
--   values ('Pizza or wings for the 1000 lb party?', array['Pizza','Wings','Both'],
--           (extract(epoch from now()) * 1000)::bigint);
-- To close one (results disappear from the site once closed):
--   update votes set open = false where id = 1;

-- ─────────────────────────────────────────────
-- QUEST BOARD
--
-- WHEN TO RUN: once, when setting up the quest board. Paste the whole
-- block below into the Supabase SQL Editor and press Run. Running it
-- again is safe; the tables are only created if missing.
--
-- HOW IT WORKS: only you can post quests, because the challenges table
-- is read-only to the app (same pattern as news and votes). Members
-- join from the site, and the site writes completion rows by itself
-- when someone hits the target. You never mark anyone complete.
-- ─────────────────────────────────────────────

create table if not exists challenges (
  id               bigserial primary key,
  title            text not null,        -- shown on the quest card
  description      text,                 -- shown when the card is expanded
  reward           text,                 -- physical prize, or leave null for none
  badge            text,                 -- file in icons/badges/, or null for a default mark
  mode             text not null default 'individual',
  metric           text not null default 'sessions',
  metric_detail    text,
  target           numeric not null,     -- the number that has to be reached
  max_participants int,                  -- party cap, or null for unlimited
  starts_on        date not null,        -- only work inside this window counts
  ends_on          date not null,
  open             boolean not null default true,
  ts               bigint not null
);
alter table challenges enable row level security;
create policy "Read only" on challenges for select using (true);

-- Who joined which quest. One row per member per quest; the primary
-- key stops anyone joining the same quest twice.
create table if not exists challenge_optins (
  challenge_id bigint not null references challenges(id) on delete cascade,
  member_id    text not null references members(id) on delete cascade,
  ts           bigint not null,
  primary key (challenge_id, member_id)
);
alter table challenge_optins enable row level security;
create policy "Allow all" on challenge_optins for all using (true) with check (true);

-- Earned badges. The site inserts here automatically; the primary key
-- means two browsers noticing the same completion cannot double-award.
create table if not exists challenge_completions (
  challenge_id bigint not null references challenges(id) on delete cascade,
  member_id    text not null references members(id) on delete cascade,
  ts           bigint not null,
  primary key (challenge_id, member_id)
);
alter table challenge_completions enable row level security;
create policy "Allow all" on challenge_completions for all using (true) with check (true);

-- Live updates, so quests and badges appear without a refresh
alter publication supabase_realtime add table challenges;
alter publication supabase_realtime add table challenge_optins;
alter publication supabase_realtime add table challenge_completions;


-- ─────────────────────────────────────────────
-- POSTING A QUEST
--
-- WHEN TO RUN: every time you want to open a new quest. Copy one of
-- the templates below, change the values, and press Run. The quest
-- appears on everyone's Tracker tab immediately.
--
-- THE THREE FIELDS THAT DECIDE WHAT THE QUEST MEASURES:
--
--   metric = 'sessions'   count workouts logged
--     metric_detail       null      = any workout counts
--                         'cardio'  = only cardio counts
--                         (also: 'lift', 'run', 'sport', 'cross', 'other')
--     target              how many sessions
--
--   metric = 'variety'    count different workout types logged
--     metric_detail       not used, pass null
--     target              how many different types (max 6)
--
--   metric = 'lift'       reach an estimated 1RM
--     metric_detail       the lift name exactly as it appears in the
--                         app, for example 'Squat', 'Bench Press',
--                         'Deadlift', 'Overhead Press'
--     target              the weight in pounds
--
--   mode = 'individual'   everyone is tracked separately; each person
--                         who reaches the target earns the badge
--   mode = 'collective'   everyone who joined is pooled into one bar,
--                         so the party's work adds up; when the total
--                         reaches the target, everyone earns the badge
--   mode = 'each'         every member of the party must reach the
--                         target on their own, and nobody earns the
--                         badge until all of them have. Use this for
--                         'we all log a cardio' style quests, where
--                         'collective' would finish as soon as one
--                         person logged one.
--
-- Leave reward out entirely when there is no physical prize.
-- Leave max_participants out entirely for an unlimited party.
-- Always leave ts as written; it stamps the current time for you.
-- ─────────────────────────────────────────────

-- TEMPLATE 1: solo quest, capped at 10 people, with a physical reward
--   insert into challenges (title, description, reward, badge, mode,
--                           metric, metric_detail, target,
--                           max_participants, starts_on, ends_on, ts)
--   values ('Cardio Crusader',                                -- title
--           'Log 8 cardio sessions before the month is out.', -- description
--           'Protein shake on me',                            -- reward
--           'cardio-crusader.png',                            -- badge art
--           'individual',                                     -- mode
--           'sessions', 'cardio', 8,                          -- metric, detail, target
--           10,                                               -- party cap
--           '2026-08-01', '2026-08-31',                       -- window
--           (extract(epoch from now()) * 1000)::bigint);      -- leave as is

-- TEMPLATE 2: group quest, unlimited party, no physical reward
--   insert into challenges (title, description, mode, metric, target,
--                           starts_on, ends_on, ts)
--   values ('Century Run',
--           'The party logs 100 sessions together.',
--           'collective', 'sessions', 100,
--           '2026-08-01', '2026-08-31',
--           (extract(epoch from now()) * 1000)::bigint);

-- TEMPLATE 2b: group quest where everyone has to pull their own weight
--   insert into challenges (title, description, mode, metric,
--                           metric_detail, target, starts_on, ends_on, ts)
--   values ('No One Left Behind',
--           'Every member of the party logs a cardio session.',
--           'each', 'sessions', 'cardio', 1,
--           '2026-08-01', '2026-08-31',
--           (extract(epoch from now()) * 1000)::bigint);

-- TEMPLATE 3: variety quest, log five different workout types
--   insert into challenges (title, description, badge, mode, metric,
--                           metric_detail, target, starts_on, ends_on, ts)
--   values ('Jack of All Trades',
--           'Log five different workout types this month.',
--           'jack-of-all-trades.png', 'individual', 'variety',
--           null, 5, '2026-08-01', '2026-08-31',
--           (extract(epoch from now()) * 1000)::bigint);

-- TEMPLATE 4: lift quest, reach a 315 lb estimated squat 1RM
--   insert into challenges (title, description, reward, mode, metric,
--                           metric_detail, target, starts_on, ends_on, ts)
--   values ('315 Club',
--           'Hit a 315 lb estimated squat 1RM.',
--           'Bragging rights and a sticker', 'individual', 'lift',
--           'Squat', 315, '2026-08-01', '2026-09-30',
--           (extract(epoch from now()) * 1000)::bigint);


-- ─────────────────────────────────────────────
-- MANAGING QUESTS
--
-- Every command below can target a quest by its title instead of its
-- id, so you never have to look an id up. Titles are easier to
-- remember and read back later:
--
--   where title = 'No One Left Behind'   works everywhere
--   where id = 3                          also works
--
-- Titles are matched exactly, including capitals and spaces. To make
-- sure two quests can never share a title, run this once (it fails if
-- duplicates already exist, so clear old test quests first):
--   alter table challenges add constraint challenges_title_unique
--     unique (title);
-- ─────────────────────────────────────────────

-- See every quest, newest first
--   select title, mode, metric, target, open, starts_on, ends_on
--   from challenges order by ts desc;

-- See who has joined a quest and who has finished it
--   select m.name,
--          (o.member_id is not null) as joined,
--          (x.member_id is not null) as finished
--   from members m
--   left join challenge_optins o
--     on o.member_id = m.id
--    and o.challenge_id = (select id from challenges where title = 'No One Left Behind')
--   left join challenge_completions x
--     on x.member_id = m.id
--    and x.challenge_id = (select id from challenges where title = 'No One Left Behind')
--   where o.member_id is not null;

-- Change a live quest's mode, for example from a pooled total to one
-- where every member has to hit the target themselves. Progress and
-- badges recalculate as soon as anyone loads the site.
--   update challenges set mode = 'each' where id = 1;

-- End a quest. It leaves the board and moves to the completed list at
-- the bottom of the column. Badges already earned stay forever, and a
-- closed quest's badges are frozen: they no longer react to changes in
-- workout history.
--   update challenges set open = false
--   where title = 'No One Left Behind';

-- Fix a typo on a live quest
--   update challenges set title = 'New title'
--   where title = 'Old title';

-- Add or change badge art later
--   update challenges set badge = 'new-badge.png'
--   where title = 'No One Left Behind';

-- Extend a deadline
--   update challenges set ends_on = '2026-09-30'
--   where title = 'No One Left Behind';

-- Delete a quest completely. This also removes its opt-ins and the
-- badges people earned from it, so prefer closing over deleting.
--   delete from challenges where title = 'No One Left Behind';

-- Clear every test quest at once
--   delete from challenges;

-- Skittish rows, an opt-in prank. A number here makes that member's
-- tracker row dart away from the pointer, and the row surrenders once
-- it has dodged that many times, so nobody actually loses a streak over
-- it. The budget refills on every page load. Null turns it off.
--
-- No effect on phones or tablets (there is no hovering pointer) or for
-- anyone whose system asks for reduced motion.
alter table members add column if not exists prank_dodge int;

-- Make one person's row skittish for five dodges
--   update members set prank_dodge = 5 where name = 'Jorge';
-- Turn it off
--   update members set prank_dodge = null where name = 'Jorge';
-- Turn it off for everyone
--   update members set prank_dodge = null;
-- See who is currently pranked
--   select name, prank_dodge from members
--   where prank_dodge is not null;

-- One-off weekly goals. A row here changes a single member's target for
-- a single week and nothing else, so past weeks and their streaks stay
-- exactly as they were. week_start must be the Monday of that week.
--
-- Targets resolve most specific first:
--   1. a week_goals row for that member and week
--   2. that member's standing members.weekly_goal
--   3. the club default of 3
create table if not exists week_goals (
  member_id  text not null references members(id) on delete cascade,
  week_start text not null,
  goal       int not null,
  primary key (member_id, week_start)
);
alter table week_goals enable row level security;
create policy "Allow all" on week_goals for all using (true) with check (true);
alter publication supabase_realtime add table week_goals;

-- Give one person a goal of 4 for one week only
--   insert into week_goals (member_id, week_start, goal)
--   values ((select id from members where name = 'Corey'), '2026-07-20', 4)
--   on conflict (member_id, week_start) do update set goal = excluded.goal;
--
-- Set the whole club to 4 for one week
--   insert into week_goals (member_id, week_start, goal)
--   select id, '2026-07-20', 4 from members
--   on conflict (member_id, week_start) do update set goal = excluded.goal;
--
-- Undo a one-off week (they fall back to their normal goal)
--   delete from week_goals where week_start = '2026-07-20';
--
-- See which weeks have overrides
--   select m.name, g.week_start, g.goal from week_goals g
--   join members m on m.id = g.member_id
--   order by g.week_start desc, m.name;

-- Standing per-member weekly goal, applying to every week. Null means
-- the member uses the club default
-- of 3 sessions a week; set a number to give one person their own
-- target. Streaks, the goal-met state, the checkbox count, the extra
-- credit slots, and the This Week card all follow whatever is set here.
alter table members add column if not exists weekly_goal int;

-- Give one person a higher goal
--   update members set weekly_goal = 4 where name = 'Corey';
-- Put them back on the club default
--   update members set weekly_goal = null where name = 'Corey';
-- See who is running a custom goal
--   select name, coalesce(weekly_goal, 3) as goal from members
--   order by name;

-- To post news:
--   insert into news (content, ts)
--   values ('New: Nutrition tab is live', (extract(epoch from now()) * 1000)::bigint);
-- To list and remove old posts:
--   select id, content from news order by ts desc;
--   delete from news where id = 1;

*/
