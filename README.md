# Workout Club

A lightweight accountability tracker for a group workout challenge. Everyone aims for **3 workouts per week** — log them, track streaks, and see who's putting in the most work on the leaderboard.

Built with vanilla JS + [Supabase](https://supabase.com) for real-time shared data.

---

## Features

- **Weekly tracker** — 3 checkboxes per person, resets each Monday
- **Extra credit** — log beyond 3 and earn the "This guy is cool" badge
- **Streak tracking** — consecutive weeks hitting the goal
- **Live leaderboard** — sortable by week, month, 6 months, or 12 months
- **Real-time sync** — everyone sees updates instantly without refreshing
- **Add / remove members** — manage the list on the fly
- **Jumpscare** — try to remove yourself and see what happens

---

## Setup

### 1. Supabase

1. Create a free project at [app.supabase.com](https://app.supabase.com)
2. Go to **SQL Editor → New query**, paste the block from `supabase-config.js`, and run it
3. Go to **Settings → API** and copy your **Project URL** and **anon/public key**
4. Paste them into `supabase-config.js`

### 2. Files

All files go in the same folder:

```
index.html
script.js
styles.css
supabase-config.js
jumpscare.jpg
jumpscare.mp3
```

### 3. Hosting

Works on GitHub Pages, SharePoint, or any static host. Just open `index.html`.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `script.js` | All app logic |
| `styles.css` | Styling |
| `supabase-config.js` | Your Supabase credentials + DB setup SQL |
| `jumpscare.jpg` | You'll find out |
| `jumpscare.mp3` | You'll find out |

---

*Made by Corey Hausterman*
