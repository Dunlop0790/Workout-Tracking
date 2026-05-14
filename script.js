'use strict';

// ─────────────────────────────────────────────
// Guard
// ─────────────────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  document.getElementById('setup-screen').style.display = 'block';
  document.querySelector('header').style.display = 'none';
  document.getElementById('panel-tracker').style.display = 'none';
  document.getElementById('panel-leaderboard').style.display = 'none';
  throw new Error('Supabase not configured.');
}

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const DEFAULT_LIFTS = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press'];

const WORKOUT_TYPES = [
  { key: 'lift',  label: '💪 Lift',          color: '#7c3aed', emoji: '💪' },
  { key: 'run',   label: '🏃 Run',           color: '#2563eb', emoji: '🏃' },
  { key: 'cardio',label: '🚴 Cardio',        color: '#e11d48', emoji: '🚴' },
  { key: 'sport', label: '⚽ Sport',         color: '#16a34a', emoji: '⚽' },
  { key: 'cross', label: '🤸 Crosstraining', color: '#ea580c', emoji: '🤸' },
  { key: 'other', label: '✨ Other',         color: '#64748b', emoji: '✨' },
];

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

function getMonday(d = new Date()) {
  const c = new Date(d);
  const day = c.getDay();
  c.setDate(c.getDate() - (day === 0 ? 6 : day - 1));
  c.setHours(0, 0, 0, 0);
  return c.toISOString().split('T')[0];
}

function weekLabel(ws) {
  const d = new Date(ws + 'T12:00:00');
  const e = new Date(d);
  e.setDate(e.getDate() + 6);
  const o = { month: 'short', day: 'numeric' };
  return `Week of ${d.toLocaleDateString('en-US', o)} – ${e.toLocaleDateString('en-US', o)}`;
}

function rangeStart(period) {
  const n = new Date();
  if (period === 'week')  return getMonday();
  if (period === 'month') return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().split('T')[0];
  if (period === '6mo')   { const d = new Date(n); d.setMonth(d.getMonth() - 6);      return d.toISOString().split('T')[0]; }
  if (period === '12mo')  { const d = new Date(n); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0]; }
}

// ─────────────────────────────────────────────
// Stats helpers
// ─────────────────────────────────────────────

function calcStreak(memberId, workoutData) {
  const cw = getMonday();
  const weekCounts = {};
  workoutData.forEach(w => {
    if (w.member_id !== memberId) return;
    weekCounts[w.week_start] = (weekCounts[w.week_start] || 0) + 1;
  });
  let streak = 0;
  let cursor = new Date(cw + 'T12:00:00');
  while (true) {
    const key   = getMonday(cursor);
    const count = weekCounts[key] || 0;
    if (count >= 3)      { streak++; }
    else if (key === cw) { /* in-progress week */ }
    else                 { break; }
    cursor.setDate(cursor.getDate() - 7);
    if (streak > 260) break;
  }
  return streak;
}

function calcSessionsInPeriod(memberId, workoutData, period) {
  const rs = rangeStart(period);
  return workoutData.filter(w => w.member_id === memberId && w.week_start >= rs).length;
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────
// Strength helpers
// ─────────────────────────────────────────────

function epley1RM(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

function roundTo5(n) { return Math.round(n / 5) * 5; }

function entriesForMemberLift(memberId, liftName) {
  return liftEntries
    .filter(e => e.member_id === memberId && e.lift_name === liftName)
    .sort((a, b) => b.ts - a.ts);
}

function liftsForMember(memberId) {
  const customNames = lifts
    .filter(l => l.owner_member_id === memberId && !DEFAULT_LIFTS.includes(l.name))
    .map(l => l.name);
  return [...DEFAULT_LIFTS, ...customNames];
}

function formatDate(ts) {
  return new Date(Number(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────

function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function timeAgo(ts) {
  const diff = Date.now() - Number(ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

let members               = [];
let workouts              = [];
let lifts                 = [];
let liftEntries           = [];
let comments              = [];
let currentPeriod         = 'week';
let currentStrengthMember = null;
let confirmingId          = null;
let doubleConfirmingId    = null;
let showingAddForm        = false;
let showingLiftForm       = false;
let loggingLiftId         = null;
let expandedLiftId        = null;
let prFlashLiftName       = null;
let pendingTypeInfo       = null;
let recapExpanded         = false;
let htMember1             = null;
let htMember2             = null;
let trashTalkPoster       = null;

// ─────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────

async function loadData() {
  const [{ data: m }, { data: w }, { data: l }, { data: le }, { data: c }] = await Promise.all([
    db.from('members').select('*').order('name'),
    db.from('workouts').select('*'),
    db.from('lifts').select('*'),
    db.from('lift_entries').select('*'),
    db.from('comments').select('*').order('ts', { ascending: false }),
  ]);
  members     = m  || [];
  workouts    = w  || [];
  lifts       = l  || [];
  liftEntries = le || [];
  comments    = c  || [];

  if (!currentStrengthMember && members.length > 0) currentStrengthMember = members[0].id;
  if (currentStrengthMember && !members.find(x => x.id === currentStrengthMember)) currentStrengthMember = members[0]?.id || null;

  if (!htMember1 && members.length >= 1) htMember1 = members[0].id;
  if (!htMember2 && members.length >= 2) htMember2 = members[1].id;
  if (htMember1 && !members.find(x => x.id === htMember1)) htMember1 = members[0]?.id || null;
  if (htMember2 && !members.find(x => x.id === htMember2)) htMember2 = members[1]?.id || members[0]?.id || null;

  if (!trashTalkPoster && members.length > 0) trashTalkPoster = members[0].id;
  if (trashTalkPoster && !members.find(x => x.id === trashTalkPoster)) trashTalkPoster = members[0]?.id || null;

  render();
}

db.channel('db-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'members' },      () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' },     () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lifts' },        () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lift_entries' }, () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' },     () => loadData())
  .subscribe();

// ─────────────────────────────────────────────
// Render — main
// ─────────────────────────────────────────────

function render() {
  renderHeader();
  renderTracker();
  renderLeaderboard();
  renderHallOfFame();
  renderHeadToHead();
  renderStrength();
  renderTrashTalk();
}

// ─────────────────────────────────────────────
// Render — Header
// ─────────────────────────────────────────────

function renderHeader() {
  document.getElementById('weekLabel').textContent = weekLabel(getMonday());
  const cw      = getMonday();
  const total   = members.length;
  const hitGoal = members.filter(m =>
    workouts.filter(w => w.member_id === m.id && w.week_start === cw).length >= 3
  ).length;
  const stat = document.getElementById('teamStat');
  if (total === 0) { stat.innerHTML = ''; return; }
  stat.className = 'team-stat' + (hitGoal === total ? ' all-done' : '');
  stat.innerHTML = `<div class="stat-num">${hitGoal}/${total}</div><div class="stat-label">hit goal this week</div>`;
}

// ─────────────────────────────────────────────
// Render — Tracker
// ─────────────────────────────────────────────

function renderTracker() {
  const cw = getMonday();
  renderWeeklyMVP(cw);
  renderWeeklyRecap();
  renderNudgeBanner(cw);
  document.getElementById('member-list').innerHTML = members.length === 0
    ? `<p class="empty-msg">No members yet.<br/>Add someone to get started.</p>`
    : members.map(m => memberRowHTML(m, cw)).join('');
  renderAddArea();
}

function renderWeeklyMVP(cw) {
  const el = document.getElementById('mvp-banner');
  if (!el) return;
  if (members.length === 0) { el.innerHTML = ''; return; }

  const counts = members
    .map(m => ({ ...m, count: workouts.filter(w => w.member_id === m.id && w.week_start === cw).length }))
    .filter(m => m.count > 0);
  if (counts.length === 0) { el.innerHTML = ''; return; }

  const max     = Math.max(...counts.map(m => m.count));
  const leaders = counts.filter(m => m.count === max);
  const names   = leaders.map(m => `<strong>${esc(m.name)}</strong>`).join(', ');
  const plural  = leaders.length > 1;

  el.innerHTML = `
    <div class="mvp-banner">
      <span class="mvp-crown">👑</span>
      <span class="mvp-text">${names} lead${plural ? '' : 's'} this week — ${max} session${max !== 1 ? 's' : ''}</span>
    </div>`;
}

function renderWeeklyRecap() {
  const el = document.getElementById('recap-section');
  if (!el) return;

  const lastMonday = new Date(getMonday() + 'T12:00:00');
  lastMonday.setDate(lastMonday.getDate() - 7);
  const lw = lastMonday.toISOString().split('T')[0];

  if (members.length === 0 || !workouts.some(w => w.week_start === lw)) { el.innerHTML = ''; return; }

  const memberStats = members.map(m => ({
    ...m, count: workouts.filter(w => w.member_id === m.id && w.week_start === lw).length
  }));
  const hitGoal    = memberStats.filter(m => m.count >= 3);
  const maxCount   = Math.max(...memberStats.map(m => m.count));
  const mvps       = maxCount > 0 ? memberStats.filter(m => m.count === maxCount) : [];
  const hitGoalIds = new Set(hitGoal.map(m => m.id));
  const missed     = members.filter(m => !hitGoalIds.has(m.id));
  const mvpText    = mvps.length > 0 ? `${mvps.map(m => esc(m.name)).join(', ')} (${maxCount} sessions)` : 'No sessions';

  el.innerHTML = `
    <div class="recap-card">
      <button class="recap-toggle" data-action="toggle-recap">
        📊 Last week — ${hitGoal.length}/${members.length} hit goal ${recapExpanded ? '▴' : '▾'}
      </button>
      ${recapExpanded ? `
        <div class="recap-body">
          <div class="recap-stat">👑 Leader: ${mvpText}</div>
          <div class="recap-stat">✅ Hit goal: ${hitGoal.length > 0 ? hitGoal.map(m => esc(m.name)).join(', ') : 'Nobody'}</div>
          ${missed.length > 0 ? `<div class="recap-stat">❌ Missed: ${missed.map(m => esc(m.name)).join(', ')}</div>` : ''}
        </div>` : ''}
    </div>`;
}

function renderNudgeBanner(cw) {
  const banner = document.getElementById('nudge-banner');
  if (!banner) return;
  const dayOfWeek = new Date().getDay();
  const showDay   = dayOfWeek === 0 || dayOfWeek >= 3;
  if (!showDay || members.length === 0) { banner.innerHTML = ''; return; }

  const behind = members.filter(m =>
    workouts.filter(w => w.member_id === m.id && w.week_start === cw).length < 3
  );
  if (behind.length === 0) { banner.innerHTML = ''; return; }

  let prefix;
  if (dayOfWeek === 0)     prefix = 'Last day to hit goal';
  else if (dayOfWeek >= 5) prefix = 'Running out of week';
  else                     prefix = 'Behind on the goal';

  banner.innerHTML = `
    <div class="nudge">
      <span class="nudge-label">${prefix}:</span>
      <span class="nudge-names">${behind.map(m => esc(m.name)).join(', ')}</span>
    </div>`;
}

function memberRowHTML(m, cw) {
  const myWorkouts = workouts.filter(w => w.member_id === m.id && w.week_start === cw);
  const count      = myWorkouts.length;
  const done       = count >= 3;
  const streak     = calcStreak(m.id, workouts);
  const removing   = confirmingId === m.id;
  const maxSlot    = Math.max(3, count + 1);

  const checksHtml = Array.from({ length: maxSlot }, (_, i) => {
    const slot            = i + 1;
    const existingWorkout = myWorkouts.find(w => w.slot === slot);
    const checked         = !!existingWorkout;
    const workoutType     = existingWorkout?.workout_type || null;
    const isExtra         = slot > 3;
    const typeAttr        = workoutType ? ` data-workout-type="${workoutType}"` : '';
    const typeEmoji = workoutType ? (WORKOUT_TYPES.find(t => t.key === workoutType)?.emoji || '') : '';
    return `<button class="check-btn ${checked ? 'checked' : ''} ${isExtra ? 'extra' : ''}"
              data-action="toggle" data-id="${m.id}" data-slot="${slot}"
              aria-label="Workout ${slot}"${typeAttr}>${typeEmoji}</button>`;
  }).join('');

  const extraLabel = count > 3 ? ` · +${count - 3} extra` : '';
  const coolHtml   = count > 3 ? `<span class="cool-badge">&#8599; This guy is cool</span>` : '';
  const streakHtml = streak >= 2 ? `<span class="streak-badge">${streak}w streak</span>` : '';

  const removeHtml = doubleConfirmingId === m.id
    ? `<div class="confirm-wrap">
         <span>You seriously wanna delete your name and ALL that history?</span>
         <button class="confirm-yes" data-action="confirm-remove" data-id="${m.id}">Yes (wrong answer, but ok)</button>
         <button class="confirm-no" data-action="cancel-remove">No</button>
       </div>`
    : removing
    ? `<div class="confirm-wrap"><span>Remove?</span>
         <button class="confirm-yes" data-action="double-confirm-remove" data-id="${m.id}">Yes</button>
         <button class="confirm-no" data-action="cancel-remove">No</button>
       </div>`
    : `<button class="remove-btn" data-action="start-remove" data-id="${m.id}">&#215;</button>`;

  const showTypePicker = pendingTypeInfo && pendingTypeInfo.memberId === m.id;
  const typePickerHtml = showTypePicker ? `
    <div class="type-picker-row">
      <span class="type-picker-label">Tag it:</span>
      ${WORKOUT_TYPES.map(t => `
        <button class="type-pill"
          data-action="pick-workout-type"
          data-member-id="${m.id}"
          data-slot="${pendingTypeInfo.slot}"
          data-type="${t.key}"
          style="--type-color:${t.color}">${t.label}</button>`).join('')}
      <button class="type-skip" data-action="skip-workout-type">Skip</button>
    </div>` : '';

  return `
    <div class="member-row ${done ? 'done' : ''}" data-member-id="${m.id}">
      <div class="member-info">
        <div class="member-name">${done ? '&#10003; ' : ''}${esc(m.name)}</div>
        <div class="member-meta"><span class="member-sub">${count}/3 this week${done ? ' · goal met' : ''}${extraLabel}</span>${streakHtml}${coolHtml}</div>
      </div>
      <div class="checks">${checksHtml}</div>
      ${removeHtml}
      ${typePickerHtml}
    </div>`;
}

function renderAddArea() {
  const area = document.getElementById('add-area');
  if (showingAddForm) {
    area.innerHTML = `
      <div class="add-row">
        <input class="add-input" id="addInput" placeholder="Enter name…"/>
        <button class="add-submit" data-action="submit-add">Add</button>
        <button class="add-cancel" data-action="cancel-add">&#215;</button>
      </div>`;
    const input = document.getElementById('addInput');
    input.focus();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  doAddMember();
      if (e.key === 'Escape') { showingAddForm = false; renderAddArea(); }
    });
  } else {
    area.innerHTML = `<button class="add-trigger" data-action="show-add">+ Add member</button>`;
  }
}

// ─────────────────────────────────────────────
// Render — Leaderboard
// ─────────────────────────────────────────────

function renderLeaderboard() {
  const rows = [...members]
    .map(m => ({ ...m, count: calcSessionsInPeriod(m.id, workouts, currentPeriod), streak: calcStreak(m.id, workouts) }))
    .sort((a, b) => b.count - a.count || b.streak - a.streak);

  const el = document.getElementById('leaderboard-list');
  if (rows.length === 0) { el.innerHTML = `<p class="empty-msg">No members yet.</p>`; return; }

  const maxCount  = rows[0].count || 1;
  const rankClass = ['gold', 'silver', 'bronze'];

  el.innerHTML = rows.map((m, i) => `
    <div class="lb-row">
      <div class="lb-top">
        <span class="lb-rank ${rankClass[i] || ''}">#${i + 1}</span>
        <span class="lb-name">${esc(m.name)}</span>
        <div class="lb-right">
          <span class="lb-count">${m.count} <span class="lb-count-label">session${m.count !== 1 ? 's' : ''}</span></span>
          ${m.streak >= 2 ? `<div class="lb-streak">${m.streak}w streak</div>` : ''}
        </div>
      </div>
      <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${Math.round((m.count / maxCount) * 100)}%"></div></div>
    </div>`).join('');
}

// ─────────────────────────────────────────────
// Render — Hall of Fame
// ─────────────────────────────────────────────

function renderHallOfFame() {
  const el = document.getElementById('hall-of-fame');
  if (!el) return;
  if (members.length === 0) { el.innerHTML = ''; return; }

  const allTime = [...members]
    .map(m => ({ ...m, count: workouts.filter(w => w.member_id === m.id).length }))
    .sort((a, b) => b.count - a.count);

  const streaks = [...members]
    .map(m => ({ ...m, streak: calcStreak(m.id, workouts) }))
    .sort((a, b) => b.streak - a.streak);

  const weekMap = {};
  workouts.forEach(w => {
    const key = `${w.member_id}:::${w.week_start}`;
    weekMap[key] = (weekMap[key] || 0) + 1;
  });
  let bestWeekMember = null, bestWeekCount = 0;
  Object.entries(weekMap).forEach(([key, count]) => {
    if (count > bestWeekCount) {
      bestWeekCount = count;
      const mid = key.split(':::')[0];
      bestWeekMember = members.find(m => m.id === mid);
    }
  });

  const monthStart = rangeStart('month');
  const monthly = [...members]
    .map(m => ({ ...m, count: workouts.filter(w => w.member_id === m.id && w.week_start >= monthStart).length }))
    .sort((a, b) => b.count - a.count);

  el.innerHTML = `
    <div class="hof-grid">
      ${hofCard('👑', 'Most Sessions All-Time', allTime[0]?.count > 0 ? allTime[0].name : null, allTime[0]?.count > 0 ? `${allTime[0].count} sessions` : null)}
      ${hofCard('🔥', 'Longest Active Streak', streaks[0]?.streak > 0 ? streaks[0].name : null, streaks[0]?.streak > 0 ? `${streaks[0].streak}w` : null)}
      ${hofCard('📅', 'Leader This Month', monthly[0]?.count > 0 ? monthly[0].name : null, monthly[0]?.count > 0 ? `${monthly[0].count} sessions` : null)}
      ${hofCard('⚡', 'Best Single Week', bestWeekMember ? bestWeekMember.name : null, bestWeekMember ? `${bestWeekCount} sessions` : null)}
    </div>`;
}

function hofCard(emoji, label, name, value) {
  return `
    <div class="hof-card">
      <div class="hof-emoji">${emoji}</div>
      <div class="hof-label">${label}</div>
      <div class="hof-name">${name ? esc(name) : '—'}</div>
      ${value ? `<div class="hof-value">${esc(value)}</div>` : ''}
    </div>`;
}

// ─────────────────────────────────────────────
// Render — Head to Head
// ─────────────────────────────────────────────

function renderHeadToHead() {
  const el = document.getElementById('head-to-head');
  if (!el) return;
  if (members.length < 2) {
    el.innerHTML = `<p class="empty-msg" style="padding:1rem 0">Need at least 2 members.</p>`;
    return;
  }

  const pickerHtml = `
    <div class="ht-pickers">
      <select class="ht-select" id="htPicker1">
        ${members.map(m => `<option value="${m.id}" ${m.id === htMember1 ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>
      <span class="ht-vs">vs</span>
      <select class="ht-select" id="htPicker2">
        ${members.map(m => `<option value="${m.id}" ${m.id === htMember2 ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>
    </div>`;

  const m1 = members.find(m => m.id === htMember1);
  const m2 = members.find(m => m.id === htMember2);
  if (!m1 || !m2) { el.innerHTML = pickerHtml; return; }

  const cw         = getMonday();
  const monthStart = rangeStart('month');
  const s1         = getMemberStats(htMember1, cw, monthStart);
  const s2         = getMemberStats(htMember2, cw, monthStart);

  const rows = [
    { label: 'This week',         v1: s1.thisWeek,  v2: s2.thisWeek  },
    { label: 'This month',        v1: s1.thisMonth, v2: s2.thisMonth },
    { label: 'All-time sessions', v1: s1.allTime,   v2: s2.allTime   },
    { label: 'Active streak',     v1: s1.streak,    v2: s2.streak, suffix: 'w' },
  ].map(({ label, v1, v2, suffix = '' }) => `
    <div class="ht-row">
      <div class="ht-val ${v1 > v2 ? 'ht-win' : ''}">${v1}${suffix}</div>
      <div class="ht-label">${label}</div>
      <div class="ht-val ${v2 > v1 ? 'ht-win' : ''}">${v2}${suffix}</div>
    </div>`).join('');

  el.innerHTML = `
    ${pickerHtml}
    <div class="ht-names">
      <div class="ht-name">${esc(m1.name)}</div>
      <div></div>
      <div class="ht-name">${esc(m2.name)}</div>
    </div>
    <div class="ht-table">${rows}</div>`;
}

function getMemberStats(memberId, cw, monthStart) {
  return {
    thisWeek:  workouts.filter(w => w.member_id === memberId && w.week_start === cw).length,
    thisMonth: workouts.filter(w => w.member_id === memberId && w.week_start >= monthStart).length,
    allTime:   workouts.filter(w => w.member_id === memberId).length,
    streak:    calcStreak(memberId, workouts),
  };
}

// ─────────────────────────────────────────────
// Render — Trash Talk
// ─────────────────────────────────────────────

function renderTrashTalk() {
  renderTrashCompose();
  renderTrashFeed();
}

function renderTrashCompose() {
  const el = document.getElementById('trash-compose');
  if (!el) return;
  if (members.length === 0) { el.innerHTML = `<p class="empty-msg">Add members first.</p>`; return; }

  // Only update dropdown if textarea already exists (don't destroy what the user is typing)
  const existing = el.querySelector('#trashInput');
  if (existing) {
    const sel = el.querySelector('#trashPoster');
    if (sel) sel.innerHTML = members.map(m => `<option value="${m.id}" ${m.id === trashTalkPoster ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
    return;
  }

  el.innerHTML = `
    <div class="trash-compose-card">
      <div class="trash-as-row">
        <span class="trash-as-label">Posting as</span>
        <select id="trashPoster" class="strength-picker">
          ${members.map(m => `<option value="${m.id}" ${m.id === trashTalkPoster ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
      </div>
      <textarea id="trashInput" class="trash-input" placeholder="Talk your trash… (Ctrl+Enter to post)" rows="2"></textarea>
      <button class="trash-post-btn" data-action="post-comment">Post</button>
    </div>`;
}

function renderTrashFeed() {
  const el = document.getElementById('trash-feed');
  if (!el) return;
  if (comments.length === 0) {
    el.innerHTML = `<p class="empty-msg">No trash talk yet.<br/>Be the first to chirp.</p>`;
    return;
  }
  el.innerHTML = comments.map(c => {
    const member = members.find(m => m.id === c.member_id);
    const name   = member ? member.name : 'Unknown';
    return `
      <div class="comment-card">
        <div class="comment-avatar">${initials(name)}</div>
        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-name">${esc(name)}</span>
            <span class="comment-time">${timeAgo(c.ts)}</span>
          </div>
          <div class="comment-text">${esc(c.content)}</div>
        </div>
        <button class="comment-del" data-action="delete-comment" data-comment-id="${c.id}" aria-label="Delete">&#215;</button>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// Render — Strength
// ─────────────────────────────────────────────

function renderStrength() {
  renderStrengthPicker();
  renderStrengthList();
  renderStrengthAddArea();
}

function renderStrengthPicker() {
  const sel = document.getElementById('strengthPicker');
  if (!sel) return;
  if (members.length === 0) { sel.innerHTML = `<option>No members yet</option>`; sel.disabled = true; return; }
  sel.disabled = false;
  sel.innerHTML = members.map(m =>
    `<option value="${m.id}" ${m.id === currentStrengthMember ? 'selected' : ''}>${esc(m.name)}</option>`
  ).join('');
}

function renderStrengthList() {
  const list = document.getElementById('strength-list');
  if (!currentStrengthMember || members.length === 0) {
    list.innerHTML = `<p class="empty-msg">No members yet.</p>`;
    return;
  }
  list.innerHTML = liftsForMember(currentStrengthMember).map(name => liftCardHTML(name, currentStrengthMember)).join('');
}

function liftCardHTML(liftName, memberId) {
  const entries  = entriesForMemberLift(memberId, liftName);
  const isCustom = !DEFAULT_LIFTS.includes(liftName);
  const expanded = expandedLiftId === liftName;
  const logging  = loggingLiftId  === liftName;
  const isNewPR  = prFlashLiftName === liftName;

  const latest     = entries[0];
  const current1RM = latest ? epley1RM(latest.weight, latest.reps) : 0;

  let prEntry = null, pr1RM = 0;
  entries.forEach(e => {
    const oneRM = epley1RM(e.weight, e.reps);
    if (oneRM > pr1RM) { pr1RM = oneRM; prEntry = e; }
  });

  const pcts = [60, 65, 70, 75, 80, 85, 90, 95];
  const percentHTML = current1RM > 0 ? `
    <div class="pct-grid">
      ${pcts.map(p => `
        <div class="pct-cell">
          <div class="pct-label">${p}%</div>
          <div class="pct-val">${roundTo5(current1RM * (p / 100))}</div>
        </div>`).join('')}
    </div>` : '';

  const currentBlock = current1RM > 0
    ? `<div class="lift-stat">
         <div class="lift-stat-label">Current 1RM</div>
         <div class="lift-stat-val">${Math.round(current1RM)}<span class="lift-unit">lb</span></div>
         <div class="lift-stat-sub">${latest.weight}×${latest.reps} · ${formatDate(latest.ts)}</div>
       </div>`
    : `<div class="lift-stat lift-stat-empty">No entries yet</div>`;

  const prBlock = pr1RM > 0
    ? `<div class="lift-stat">
         <div class="lift-stat-label">All-time PR</div>
         <div class="lift-stat-val pr">${Math.round(pr1RM)}<span class="lift-unit">lb</span></div>
         <div class="lift-stat-sub">${prEntry.weight}×${prEntry.reps} · ${formatDate(prEntry.ts)}</div>
       </div>`
    : '';

  const formHTML = logging
    ? `<div class="lift-log-form">
         <input type="number" inputmode="decimal" id="logWeight-${esc(liftName)}" class="lift-input" placeholder="Weight (lb)"/>
         <span class="lift-x">×</span>
         <input type="number" inputmode="numeric" id="logReps-${esc(liftName)}" class="lift-input lift-input-sm" placeholder="Reps"/>
         <button class="lift-save" data-action="save-lift" data-lift="${esc(liftName)}">Save</button>
         <button class="lift-cancel" data-action="cancel-lift">&#215;</button>
       </div>`
    : `<button class="lift-log-btn" data-action="start-log-lift" data-lift="${esc(liftName)}">+ Log a set</button>`;

  const historyHTML = (expanded && entries.length > 0) ? `
    <div class="lift-history">
      ${entries.slice(0, 8).map(e => `
        <div class="lift-history-row">
          <span class="lift-history-set">${e.weight}×${e.reps}</span>
          <span class="lift-history-1rm">${Math.round(epley1RM(e.weight, e.reps))} 1RM</span>
          <span class="lift-history-date">${formatDate(e.ts)}</span>
          <button class="lift-history-del" data-action="delete-lift-entry" data-entry-id="${e.id}" aria-label="Delete">&#215;</button>
        </div>`).join('')}
    </div>` : '';

  const historyToggle = entries.length > 0
    ? `<button class="lift-history-toggle" data-action="toggle-lift-history" data-lift="${esc(liftName)}">
         ${expanded ? '▴ Hide history' : `▾ History (${entries.length})`}
       </button>`
    : '';

  const removeCustom = isCustom
    ? `<button class="lift-remove" data-action="remove-custom-lift" data-lift="${esc(liftName)}" aria-label="Remove">&#215;</button>`
    : '';

  return `
    <div class="lift-card${isNewPR ? ' lift-card--pr' : ''}">
      <div class="lift-header">
        <div class="lift-name">
          ${esc(liftName)}
          ${isCustom ? '<span class="lift-custom-tag">custom</span>' : ''}
          ${isNewPR ? '<span class="pr-badge">🎉 New PR!</span>' : ''}
        </div>
        ${removeCustom}
      </div>
      <div class="lift-stats">${currentBlock}${prBlock}</div>
      ${percentHTML}
      ${formHTML}
      ${historyToggle}
      ${historyHTML}
    </div>`;
}

function renderStrengthAddArea() {
  const area = document.getElementById('strength-add-area');
  if (!area || !currentStrengthMember) { if (area) area.innerHTML = ''; return; }

  if (showingLiftForm) {
    area.innerHTML = `
      <div class="add-row">
        <input class="add-input" id="newLiftInput" placeholder="Custom lift name (e.g. Front Squat)"/>
        <button class="add-submit" data-action="submit-custom-lift">Add</button>
        <button class="add-cancel" data-action="cancel-custom-lift">&#215;</button>
      </div>`;
    const input = document.getElementById('newLiftInput');
    input.focus();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  doAddCustomLift();
      if (e.key === 'Escape') { showingLiftForm = false; renderStrengthAddArea(); }
    });
  } else {
    area.innerHTML = `<button class="add-trigger" data-action="show-custom-lift">+ Add custom lift</button>`;
  }
}

// ─────────────────────────────────────────────
// Actions — Workouts
// ─────────────────────────────────────────────

async function toggleSlot(memberId, slot) {
  const cw       = getMonday();
  const existing = workouts.find(w => w.member_id === memberId && w.week_start === cw && w.slot === slot);
  if (existing) {
    if (pendingTypeInfo?.memberId === memberId && pendingTypeInfo?.slot === slot) pendingTypeInfo = null;
    await db.from('workouts').delete().eq('id', existing.id);
  } else {
    pendingTypeInfo = { memberId, slot };
    await db.from('workouts').insert({ member_id: memberId, week_start: cw, slot, ts: Date.now() });
  }
}

async function setWorkoutType(memberId, slot, type) {
  const cw = getMonday();
  pendingTypeInfo = null;
  renderTracker();
  await db.from('workouts')
    .update({ workout_type: type })
    .eq('member_id', memberId)
    .eq('week_start', cw)
    .eq('slot', slot);
}

async function doAddMember() {
  const input = document.getElementById('addInput');
  const name  = input?.value.trim();
  if (!name) return;
  showingAddForm = false;
  renderAddArea();
  await db.from('members').insert({ id: 'm' + Date.now(), name, joined: new Date().toISOString().split('T')[0] });
}

async function removeMember(id) {
  confirmingId = null;
  doubleConfirmingId = null;
  await db.from('members').delete().eq('id', id);
}

// ─────────────────────────────────────────────
// Actions — Strength
// ─────────────────────────────────────────────

async function saveLiftEntry(liftName) {
  const wEl    = document.getElementById(`logWeight-${liftName}`);
  const rEl    = document.getElementById(`logReps-${liftName}`);
  const weight = parseFloat(wEl?.value);
  const reps   = parseInt(rEl?.value, 10);
  if (!weight || !reps || weight <= 0 || reps <= 0) return;

  const existing  = entriesForMemberLift(currentStrengthMember, liftName);
  const new1RM    = epley1RM(weight, reps);
  const currentPR = existing.length > 0 ? Math.max(...existing.map(e => epley1RM(e.weight, e.reps))) : 0;
  const isNewPR   = new1RM > currentPR;

  loggingLiftId = null;
  renderStrengthList();

  if (isNewPR) {
    prFlashLiftName = liftName;
    setTimeout(() => { prFlashLiftName = null; renderStrengthList(); }, 4000);
  }

  await db.from('lift_entries').insert({
    member_id: currentStrengthMember,
    lift_name: liftName,
    weight,
    reps,
    ts: Date.now()
  });
}

async function deleteLiftEntry(entryId) {
  await db.from('lift_entries').delete().eq('id', Number(entryId));
}

async function doAddCustomLift() {
  const input = document.getElementById('newLiftInput');
  const name  = input?.value.trim();
  if (!name) return;
  const existing = liftsForMember(currentStrengthMember);
  if (existing.some(n => n.toLowerCase() === name.toLowerCase())) {
    showingLiftForm = false; renderStrengthAddArea(); return;
  }
  showingLiftForm = false;
  renderStrengthAddArea();
  await db.from('lifts').insert({ id: 'l' + Date.now(), owner_member_id: currentStrengthMember, name, is_default: false });
}

async function removeCustomLift(liftName) {
  const lift = lifts.find(l => l.owner_member_id === currentStrengthMember && l.name === liftName);
  if (!lift) return;
  await db.from('lift_entries').delete().eq('member_id', currentStrengthMember).eq('lift_name', liftName);
  await db.from('lifts').delete().eq('id', lift.id);
}

// ─────────────────────────────────────────────
// Actions — Trash Talk
// ─────────────────────────────────────────────

async function postComment() {
  const textarea = document.getElementById('trashInput');
  const content  = textarea?.value.trim();
  if (!content || !trashTalkPoster) return;
  if (textarea) textarea.value = '';
  await db.from('comments').insert({ member_id: trashTalkPoster, content, ts: Date.now() });
}

async function deleteComment(commentId) {
  await db.from('comments').delete().eq('id', Number(commentId));
}

// ─────────────────────────────────────────────
// Jumpscare
// ─────────────────────────────────────────────

function triggerJumpscare(callback) {
  const overlay = document.createElement('div');
  overlay.id = 'jumpscare-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: #000;
    display: flex; align-items: center; justify-content: center;
  `;
  const img = document.createElement('img');
  img.src = 'jumpscare.jpg';
  img.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block;';
  overlay.appendChild(img);
  document.body.appendChild(overlay);
  const audio   = new Audio('jumpscare.mp3');
  const dismiss = () => {
    if (!document.getElementById('jumpscare-overlay')) return;
    overlay.remove();
    if (callback) callback();
  };
  audio.addEventListener('ended', dismiss);
  const fallback = setTimeout(dismiss, 10000);
  audio.addEventListener('ended', () => clearTimeout(fallback));
  audio.play().catch(dismiss);
}

// ─────────────────────────────────────────────
// Event delegation
// ─────────────────────────────────────────────

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, slot, lift, entryId, commentId, memberId, type } = btn.dataset;

  if (action === 'toggle')              toggleSlot(id, Number(slot));
  if (action === 'start-remove')        { triggerJumpscare(() => { confirmingId = id; renderTracker(); }); }
  if (action === 'cancel-remove')       { confirmingId = null; doubleConfirmingId = null; renderTracker(); }
  if (action === 'double-confirm-remove') { confirmingId = null; doubleConfirmingId = id; renderTracker(); }
  if (action === 'confirm-remove')      removeMember(id);
  if (action === 'show-add')            { showingAddForm = true; renderAddArea(); }
  if (action === 'cancel-add')          { showingAddForm = false; renderAddArea(); }
  if (action === 'submit-add')          doAddMember();
  if (action === 'pick-workout-type')   setWorkoutType(memberId, Number(slot), type);
  if (action === 'skip-workout-type')   { pendingTypeInfo = null; renderTracker(); }
  if (action === 'toggle-recap')        { recapExpanded = !recapExpanded; renderWeeklyRecap(); }

  if (action === 'start-log-lift')      { loggingLiftId = lift; renderStrengthList(); }
  if (action === 'cancel-lift')         { loggingLiftId = null; renderStrengthList(); }
  if (action === 'save-lift')           saveLiftEntry(lift);
  if (action === 'toggle-lift-history') { expandedLiftId = expandedLiftId === lift ? null : lift; renderStrengthList(); }
  if (action === 'delete-lift-entry')   deleteLiftEntry(entryId);
  if (action === 'show-custom-lift')    { showingLiftForm = true; renderStrengthAddArea(); }
  if (action === 'cancel-custom-lift')  { showingLiftForm = false; renderStrengthAddArea(); }
  if (action === 'submit-custom-lift')  doAddCustomLift();
  if (action === 'remove-custom-lift')  removeCustomLift(lift);

  if (action === 'post-comment')        postComment();
  if (action === 'delete-comment')      deleteComment(commentId);
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

document.getElementById('periodTabs').addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentPeriod = btn.dataset.period;
  renderLeaderboard();
});

document.getElementById('strengthPicker').addEventListener('change', e => {
  currentStrengthMember = e.target.value;
  loggingLiftId = null; expandedLiftId = null; showingLiftForm = false;
  renderStrengthList(); renderStrengthAddArea();
});

document.getElementById('panel-leaderboard').addEventListener('change', e => {
  if (e.target.id === 'htPicker1') { htMember1 = e.target.value; renderHeadToHead(); }
  if (e.target.id === 'htPicker2') { htMember2 = e.target.value; renderHeadToHead(); }
});

document.getElementById('panel-trash').addEventListener('change', e => {
  if (e.target.id === 'trashPoster') trashTalkPoster = e.target.value;
});
document.getElementById('panel-trash').addEventListener('keydown', e => {
  if (e.target.id === 'trashInput' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') postComment();
});

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

loadData();
