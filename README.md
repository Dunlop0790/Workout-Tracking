# Workout Club

A shared accountability tracker for a workplace workout club. Members aim for three sessions a week; the site tracks workouts, streaks, strength numbers, and nutrition, with live sync so everyone sees the same state without refreshing.

Live site: https://dunlop0790.github.io/Workout-Tracking/

## Features

### Tracker
- Three weekly checkboxes per member, resetting each Monday, with extra-credit slots past the goal
- Workout type tagging (lift, run, cardio, sport, cross training, other)
- Streak counting for consecutive goal weeks, weekly team stat, and a midweek behind-on-goal card
- Club votes: admin-opened polls with live results, member identity, and change-your-vote support

### Leaderboard
- Rankings by week, month, 6 months, or 12 months
- Head to head member comparison and a Hall of Fame

### Strength
- Per-member lift logging with estimated 1RM (Epley), PR detection, and a percentage-of-1RM grid
- 1RM trend sparklines on each lift card
- Opt-in Club Records: big-four records, the 1000 lb Club, and best marks for custom lifts

### Nutrition
- Food database with per-serving entry (values stored per 100 g internally), named servings, brands, and category icons
- Daily diary with per-member day-start offsets for night shift schedules
- Macro goals with a TDEE calculator, plus optional sodium, fiber, and sugar tracking with incomplete-data markers
- 7-day calorie and protein trend charts
- Quick logging: recent foods strip and copy-yesterday
- Folder-style food browser grouped by brand or category, and tab-separated bulk import

### Trash Talk
- Post feed with image attachments (5 MB limit) and automatic 2-week expiry

### Themes and extras
- Six themes with per-theme fonts: Paper, Midnight, Wii, Game Boy, and two hidden unlockables
- BLOCKS, a falling-block game in the Game Boy theme on wide screens, with shared hi-scores
- News ticker, idle screensaver, and assorted easter eggs

## Tech

- Vanilla JavaScript, HTML, and CSS with no build step; one script file by design
- Supabase for Postgres, realtime sync, and file storage
- Hosted on GitHub Pages

## Setup

supabase-config.js holds the Supabase URL and anon key, plus the full schema, row-level security policies, and storage bucket setup as commented SQL. Run those blocks in the Supabase SQL Editor when standing up a new instance. Pixel icon assets live in icons/.

## Admin operations

News posts, comment expiry scheduling, and vote open/close are performed through the Supabase SQL Editor. Ready-to-run examples are documented in supabase-config.js.

## Credits

Made by Corey Hausterman. Fonts served from Google Fonts: Lexend, Press Start 2P, M PLUS Rounded 1c, Silkscreen, VT323, DotGothic16, and Hachi Maru Pop.
