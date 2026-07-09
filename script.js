'use strict';

// ─────────────────────────────────────────────
// Guard
// ─────────────────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  document.getElementById('setup-screen').style.display = 'block';
  document.getElementById('sidenav').style.display = 'none';
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

const MASS_UNITS = [
  { key: 'g',  label: 'grams',  grams: 1 },
  { key: 'oz', label: 'oz',     grams: 28.3495 },
  { key: 'lb', label: 'lb',     grams: 453.592 },
];

const FOOD_ICONS = [
  { key: 'drink',    label: 'Drink',     svg: '<path d="M7 8h10l-1.2 12H8.2L7 8z"/><path d="M12 8l3.5-5.5"/>' },
  { key: 'meat',     label: 'Meat',      svg: '<path d="M15.5 3.5a5 5 0 0 1 3.5 8.6c-1.6 1.6-4 1.9-5.6 1.2L10 16.7a2 2 0 1 1-2.7-2.7l3.4-3.4c-.7-1.6-.4-4 1.2-5.6a5 5 0 0 1 3.6-1.6z"/>' },
  { key: 'produce',  label: 'Produce',   svg: '<path d="M12 7c-3-2-7 0-7 5 0 4 3 8 5 8 1 0 1.5-.6 2-.6s1 .6 2 .6c2 0 5-4 5-8 0-5-4-7-7-5z"/><path d="M12 7c0-2 1-4 3-4"/>' },
  { key: 'bread',    label: 'Bread',     svg: '<path d="M6 10c0-3 2.5-5 6-5s6 2 6 5c0 1.5-1 2.5-2 3v6H8v-6c-1-.5-2-1.5-2-3z"/>' },
  { key: 'dairy',    label: 'Dairy',     svg: '<path d="M9 3h6v3l2 4v11H7V10l2-4V3z"/><path d="M9 6h6"/>' },
  { key: 'sweets',   label: 'Sweets',    svg: '<path d="M8 11h8l-4 10-4-10z"/><path d="M8 11a4 4 0 1 1 8 0"/>' },
  { key: 'fastfood', label: 'Fast food', svg: '<path d="M6 11c0-4 2.5-6 6-6s6 2 6 6"/><path d="M5 11h14"/><path d="M5 15h14"/><path d="M6 15c0 3 2 4 6 4s6-1 6-4"/>' },
  { key: 'other',    label: 'Other',     svg: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M4 12h16"/>' },
];

function iconSvg(key) {
  const icon = FOOD_ICONS.find(i => i.key === key);
  if (!icon) return '';
  return `<span class="food-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon.svg}</svg></span>`;
}

function iconPickerHTML(inputId, selected) {
  return `
    <input type="hidden" id="${inputId}" value="${selected || ''}"/>
    <div class="icon-row" data-icon-input="${inputId}">
      ${FOOD_ICONS.map(i => `
        <button type="button" class="icon-btn${selected === i.key ? ' selected' : ''}"
          data-action="pick-food-icon" data-icon-key="${i.key}" title="${i.label}"
          aria-label="${i.label}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${i.svg}</svg>
        </button>`).join('')}
    </div>`;
}

function servingListHTML(foodId) {
  const servings = foodServings.filter(s => s.food_id === foodId);
  if (servings.length === 0) return '';
  return `
    <div class="serving-list">
      ${servings.map(s => `
        <div class="serving-row">
          <span>${esc(s.label)} (${s.grams}g)</span>
          <button class="comment-del" data-action="del-serving" data-serving-id="${s.id}" aria-label="Delete serving">&#215;</button>
        </div>`).join('')}
    </div>`;
}

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
  return `Week of ${d.toLocaleDateString('en-US', o)} to ${e.toLocaleDateString('en-US', o)}`;
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

function round2(n) { return Math.round(n * 100) / 100; }

// The serving a food was defined with (oldest). Nutrition entry and
// display are per serving; storage stays per 100g.
function primaryServing(foodId) {
  const list = foodServings.filter(s => s.food_id === foodId);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => a.id.localeCompare(b.id))[0];
}

function foodCalDisplay(f) {
  const sv = primaryServing(f.id);
  if (sv) return `${Math.round(f.calories * sv.grams / 100)} cal · ${esc(sv.label)}`;
  return `${Math.round(f.calories)} cal / 100g`;
}

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
let foods                 = [];
let foodServings          = [];
let foodLog               = [];
let macroGoals            = [];
let nutMember             = null;
let nutDate               = localDateStr(new Date());
let addFoodOpen           = false;
let pendingLogFoodId      = null;
let foodFormMode          = null;
let editingFoodId         = null;
let editingGoals          = false;
let foodSearchQuery       = '';
let dbSearch              = '';
let foodGroupMode         = 'brand';
const expandedFoodGroups  = new Set();
let dbFormMode            = null;
let dbEditingId           = null;
let goalCalcOpen          = false;
let goalCalcResult        = null;
let news                  = [];

// ─────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────

async function loadData() {
  const [{ data: m }, { data: w }, { data: l }, { data: le }, { data: c },
         { data: f }, { data: fs }, { data: fl }, { data: mg }, { data: nw }] = await Promise.all([
    db.from('members').select('*').order('name'),
    db.from('workouts').select('*'),
    db.from('lifts').select('*'),
    db.from('lift_entries').select('*'),
    db.from('comments').select('*').order('ts', { ascending: false }),
    db.from('foods').select('*').order('name'),
    db.from('food_servings').select('*'),
    db.from('food_log').select('*'),
    db.from('macro_goals').select('*'),
    db.from('news').select('*').order('ts', { ascending: false }),
  ]);
  members      = m  || [];
  workouts     = w  || [];
  lifts        = l  || [];
  liftEntries  = le || [];
  comments     = c  || [];
  foods        = f  || [];
  foodServings = fs || [];
  foodLog      = fl || [];
  macroGoals   = mg || [];
  news         = nw || [];

  // Pickers start empty. Only reset a selection if that member no longer exists.
  const exists = id => members.some(x => x.id === id);
  if (currentStrengthMember && !exists(currentStrengthMember)) currentStrengthMember = null;
  if (htMember1 && !exists(htMember1)) htMember1 = null;
  if (htMember2 && !exists(htMember2)) htMember2 = null;
  if (trashTalkPoster && !exists(trashTalkPoster)) trashTalkPoster = null;
  if (nutMember && !exists(nutMember)) nutMember = null;

  render();
}

db.channel('db-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'members' },      () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' },     () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lifts' },        () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lift_entries' }, () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' },     () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'foods' },        () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'food_servings' },() => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'food_log' },     () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'macro_goals' },  () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'news' },         () => loadData())
  .subscribe();

// ─────────────────────────────────────────────
// Render: main
// ─────────────────────────────────────────────

function render() {
  renderHeader();
  renderNewsTicker();
  renderTracker();
  renderLeaderboard();
  renderHallOfFame();
  renderHeadToHead();
  renderStrength();
  renderNutrition();
  renderTrashTalk();
}

// ─────────────────────────────────────────────
// Render: Header
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
// Render: News ticker
// News is posted only through the Supabase SQL Editor. The table's row
// level security allows select only, so the site can read but not write.
// ─────────────────────────────────────────────

function renderNewsTicker() {
  const el = document.getElementById('news-ticker');
  if (!el) return;
  if (news.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const text = news.map(n => esc(n.content)).join(' +++ ');
  el.innerHTML = `<div class="news-ticker-inner">${text}</div>`;
  // Constant scroll speed regardless of message length
  el.firstElementChild.style.animationDuration = Math.max(14, text.length * 0.3) + 's';
}

// ─────────────────────────────────────────────
// Render: Tracker
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

  el.innerHTML = `
    <div class="mvp-stat">
      <span class="mvp-stat-label">Leading this week</span>
      <span class="mvp-stat-names">${names}</span>
      <span class="mvp-stat-count">${max} session${max !== 1 ? 's' : ''}</span>
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
        Last week: ${hitGoal.length}/${members.length} hit goal ${recapExpanded ? '▴' : '▾'}
      </button>
      ${recapExpanded ? `
        <div class="recap-body">
          <div class="recap-row">
            <span class="recap-row-label">Leader</span>
            <span class="recap-row-value">${mvpText}</span>
          </div>
          <div class="recap-row">
            <span class="recap-row-label">Hit goal</span>
            <span class="recap-row-value">${hitGoal.length > 0 ? hitGoal.map(m => esc(m.name)).join(', ') : 'Nobody'}</span>
          </div>
          ${missed.length > 0 ? `<div class="recap-row">
            <span class="recap-row-label">Missed</span>
            <span class="recap-row-value">${missed.map(m => esc(m.name)).join(', ')}</span>
          </div>` : ''}
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
// Render: Leaderboard
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
// Render: Hall of Fame
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
      ${hofCard('Most Sessions All-Time', allTime[0]?.count > 0 ? allTime[0].name : null, allTime[0]?.count > 0 ? `${allTime[0].count} sessions` : null)}
      ${hofCard('Longest Active Streak', streaks[0]?.streak > 0 ? streaks[0].name : null, streaks[0]?.streak > 0 ? `${streaks[0].streak}w` : null)}
      ${hofCard('Leader This Month', monthly[0]?.count > 0 ? monthly[0].name : null, monthly[0]?.count > 0 ? `${monthly[0].count} sessions` : null)}
      ${hofCard('Best Single Week', bestWeekMember ? bestWeekMember.name : null, bestWeekMember ? `${bestWeekCount} sessions` : null)}
    </div>`;
}

function hofCard(label, name, value) {
  return `
    <div class="hof-card">
      <div class="hof-label">${label}</div>
      <div class="hof-name">${name ? esc(name) : 'No data yet'}</div>
      ${value ? `<div class="hof-value">${esc(value)}</div>` : ''}
    </div>`;
}

// ─────────────────────────────────────────────
// Render: Head to Head
// ─────────────────────────────────────────────

function renderHeadToHead() {
  const el = document.getElementById('head-to-head');
  if (!el) return;
  if (members.length < 2) {
    el.innerHTML = `<p class="empty-msg" style="padding:1rem 0">Need at least 2 members.</p>`;
    return;
  }

  const htOptions = sel => `<option value="" ${!sel ? 'selected' : ''}>Select member</option>` +
    members.map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');

  const pickerHtml = `
    <div class="ht-pickers">
      <select class="ht-select" id="htPicker1">${htOptions(htMember1)}</select>
      <span class="ht-vs">vs</span>
      <select class="ht-select" id="htPicker2">${htOptions(htMember2)}</select>
    </div>`;

  const m1 = members.find(m => m.id === htMember1);
  const m2 = members.find(m => m.id === htMember2);
  if (!m1 || !m2) {
    el.innerHTML = pickerHtml + `<p class="empty-msg" style="padding:0.5rem 0 1rem">Pick two members to compare.</p>`;
    return;
  }

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
// Render: Trash Talk
// ─────────────────────────────────────────────

function renderTrashTalk() {
  renderTrashCompose();
  renderTrashFeed();
}

function renderTrashCompose() {
  const el = document.getElementById('trash-compose');
  if (!el) return;
  if (members.length === 0) { el.innerHTML = `<p class="empty-msg">Add members first.</p>`; return; }

  const posterOptions = `<option value="" ${!trashTalkPoster ? 'selected' : ''}>Select member</option>` +
    members.map(m => `<option value="${m.id}" ${m.id === trashTalkPoster ? 'selected' : ''}>${esc(m.name)}</option>`).join('');

  // Only update dropdown if textarea already exists (don't destroy what the user is typing)
  const existing = el.querySelector('#trashInput');
  if (existing) {
    const sel = el.querySelector('#trashPoster');
    if (sel) sel.innerHTML = posterOptions;
    return;
  }

  el.innerHTML = `
    <div class="trash-compose-card">
      <div class="trash-as-row">
        <span class="trash-as-label">Posting as</span>
        <select id="trashPoster" class="strength-picker">${posterOptions}</select>
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
// Render: Strength
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
  sel.innerHTML = `<option value="" ${!currentStrengthMember ? 'selected' : ''}>Select member</option>` +
    members.map(m =>
      `<option value="${m.id}" ${m.id === currentStrengthMember ? 'selected' : ''}>${esc(m.name)}</option>`
    ).join('');
}

function renderStrengthList() {
  const list = document.getElementById('strength-list');
  if (members.length === 0) {
    list.innerHTML = `<p class="empty-msg">No members yet.</p>`;
    return;
  }
  if (!currentStrengthMember) {
    list.innerHTML = `<p class="empty-msg">Pick a member to view their lifts.</p>`;
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
          ${isNewPR ? '<span class="pr-badge">New PR</span>' : ''}
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
// Actions: Workouts
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
// Actions: Strength
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
// Actions: Trash Talk
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
// Render: Nutrition
// ─────────────────────────────────────────────

function foodById(id) { return foods.find(f => f.id === id); }

function macrosFor(food, grams) {
  const k = grams / 100;
  return {
    cal:  food.calories * k,
    pro:  food.protein  * k,
    carb: food.carbs    * k,
    fat:  food.fat      * k,
  };
}

function localDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function shiftNutDate(days) {
  const d = new Date(nutDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  nutDate = localDateStr(d);
}

// The diary day for a member starts at their day_start time. Before that
// time of day, "today" is still the previous calendar date.
function effectiveDiaryToday(dayStart, now) {
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const d = new Date(now);
  if (hhmm < dayStart) d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

function nutDateLabel(todayStr) {
  if (nutDate === todayStr) return 'Today';
  return new Date(nutDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderNutrition() {
  renderNutritionPicker();
  // Realtime refreshes must not destroy an open search or form mid-typing.
  // Actions call the render functions directly, bypassing these guards.
  if (!dbFormMode) renderFoodDb();
  if (addFoodOpen || editingGoals || goalCalcOpen || goalCalcResult) return;
  renderNutritionBody();
}

// ─────────────────────────────────────────────
// Render: Food database panel
// ─────────────────────────────────────────────

function renderFoodDb() {
  const el = document.getElementById('food-db');
  if (!el) return;
  if (dbFormMode === 'import') { el.innerHTML = dbImportHTML(); return; }
  if (dbFormMode) { el.innerHTML = dbFoodFormHTML(); return; }
  // Preserve focus while typing in the search box: update the list only.
  if (document.activeElement && document.activeElement.id === 'dbSearch') {
    renderDbFoodList();
    return;
  }
  el.innerHTML = `
    <input class="add-input db-search" id="dbSearch" placeholder="Search foods" value="${esc(dbSearch)}"/>
    <div class="db-controls">${foodGroupSelectHTML('dbGroupSel')}</div>
    <div id="db-food-list">${dbFoodListHTML()}</div>
    <div class="food-panel-actions">
      <button class="add-trigger" data-action="db-new-food">+ New food</button>
      <button class="add-trigger" data-action="db-import-open">Import list</button>
    </div>`;
}

function foodGroupSelectHTML(selectId) {
  return `
    <select id="${selectId}" class="strength-picker food-group-select">
      <option value="brand"    ${foodGroupMode === 'brand'    ? 'selected' : ''}>Group by brand</option>
      <option value="category" ${foodGroupMode === 'category' ? 'selected' : ''}>Group by category</option>
      <option value="none"     ${foodGroupMode === 'none'     ? 'selected' : ''}>Flat A to Z</option>
    </select>`;
}

function foodRowsHTML(items, rowAction) {
  return items.map(f => `
    <button class="food-result" data-action="${rowAction}" data-food-id="${f.id}">
      <span class="food-result-name">${iconSvg(f.icon)}${esc(f.name)}${f.brand ? ` <span class="food-row-brand">${esc(f.brand)}</span>` : ''}</span>
      <span class="food-row-stats">${foodCalDisplay(f)}</span>
    </button>`).join('');
}

function foodBrowserHTML(query, rowAction) {
  if (foods.length === 0) return `<p class="empty-msg food-empty">No foods yet. Add the first one.</p>`;
  const q = query.trim().toLowerCase();

  // Searching: flat matches, folders get out of the way.
  if (q) {
    const matches = foods
      .filter(f => f.name.toLowerCase().includes(q) || (f.brand || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (matches.length === 0) return `<p class="empty-msg food-empty">No matches.</p>`;
    return foodRowsHTML(matches, rowAction);
  }

  if (foodGroupMode === 'none') {
    return foodRowsHTML([...foods].sort((a, b) => a.name.localeCompare(b.name)), rowAction);
  }

  // Build folders
  let groups;
  if (foodGroupMode === 'category') {
    groups = FOOD_ICONS.map(i => ({
      key: i.key, label: i.label,
      items: foods.filter(f => f.icon === i.key),
    }));
    const untagged = foods.filter(f => !f.icon);
    if (untagged.length > 0) groups.push({ key: 'uncategorized', label: 'No category', items: untagged });
  } else {
    const brands = [...new Set(foods.filter(f => f.brand).map(f => f.brand))].sort((a, b) => a.localeCompare(b));
    groups = brands.map(b => ({ key: 'b:' + b, label: b, items: foods.filter(f => f.brand === b) }));
    const generic = foods.filter(f => !f.brand);
    if (generic.length > 0) groups.push({ key: 'b:none', label: 'No brand', items: generic });
  }

  return groups
    .filter(g => g.items.length > 0)
    .map(g => {
      const stateKey = foodGroupMode + ':' + g.key;
      const open = expandedFoodGroups.has(stateKey);
      const rows = open ? foodRowsHTML([...g.items].sort((a, b) => a.name.localeCompare(b.name)), rowAction) : '';
      return `
        <button class="food-group-header" data-action="toggle-food-group" data-group-key="${esc(stateKey)}">
          <span>${open ? '▾' : '▸'} ${esc(g.label)}</span>
          <span class="food-group-count">${g.items.length}</span>
        </button>
        ${rows}`;
    }).join('');
}

function dbFoodListHTML() {
  return foodBrowserHTML(dbSearch, 'db-edit-food');
}

function renderDbFoodList() {
  const el = document.getElementById('db-food-list');
  if (el) el.innerHTML = dbFoodListHTML();
}

function dbFoodFormHTML() {
  const editing = dbFormMode === 'edit' ? foodById(dbEditingId) : null;
  const basis = editing ? primaryServing(editing.id) : null;
  const k = basis ? basis.grams / 100 : 1;
  const f = editing
    ? { name: editing.name, brand: editing.brand, icon: editing.icon,
        calories: round2(editing.calories * k), protein: round2(editing.protein * k),
        carbs: round2(editing.carbs * k), fat: round2(editing.fat * k) }
    : { name: '', brand: '', icon: '', calories: '', protein: '', carbs: '', fat: '' };

  return `
    <div class="log-food-header">
      <div class="food-result-name">${editing ? 'Edit food' : 'New food'}</div>
      <div class="food-row-stats">${editing && basis ? `Values shown per ${esc(basis.label)}` : 'Define the serving, then enter nutrition per serving'}</div>
    </div>
    <div class="goals-form-row">
      <input id="dbName"  class="add-input" placeholder="Name" value="${esc(f.name)}"/>
    </div>
    <div class="goals-form-row">
      <input id="dbBrand" class="add-input" placeholder="Brand (optional)" value="${esc(f.brand || '')}"/>
    </div>
    ${iconPickerHTML('dbIcon', f.icon)}
    ${editing ? servingListHTML(editing.id) : ''}
    <div class="serving-label">Serving size${editing ? ' (add another)' : ''}</div>
    <div class="goals-form-row">
      <input id="dbServLabel" class="add-input" placeholder="One serving is... (e.g. 1 egg)"/>
      <input type="number" inputmode="decimal" id="dbServAmt" class="lift-input" placeholder="Weight"/>
      <select id="dbServUnit" class="strength-picker serving-unit">
        ${MASS_UNITS.map(u => `<option value="${u.key}">${u.label}</option>`).join('')}
      </select>
    </div>
    <div class="serving-label">Nutrition per serving</div>
    <div class="goals-form-row">
      <input type="number" inputmode="decimal" id="dbCal" class="lift-input" placeholder="Calories" value="${f.calories}"/>
      <input type="number" inputmode="decimal" id="dbPro" class="lift-input" placeholder="Protein g" value="${f.protein}"/>
    </div>
    <div class="goals-form-row">
      <input type="number" inputmode="decimal" id="dbCarb" class="lift-input" placeholder="Carbs g" value="${f.carbs}"/>
      <input type="number" inputmode="decimal" id="dbFat"  class="lift-input" placeholder="Fat g" value="${f.fat}"/>
    </div>
    <div class="form-error" id="dbError"></div>
    <div class="goals-form-row">
      <button class="lift-save" data-action="db-save-food">${editing ? 'Save' : 'Add food'}</button>
      ${editing ? `<button class="lift-history-toggle" data-action="db-delete-food" data-food-id="${editing.id}">Delete</button>` : ''}
      <button class="lift-cancel" data-action="db-cancel-food">&#215;</button>
    </div>`;
}

function renderNutritionPicker() {
  const sel = document.getElementById('nutritionPicker');
  if (!sel) return;
  if (members.length === 0) { sel.innerHTML = `<option>No members yet</option>`; sel.disabled = true; return; }
  sel.disabled = false;
  sel.innerHTML = `<option value="" ${!nutMember ? 'selected' : ''}>Select member</option>` +
    members.map(m =>
      `<option value="${m.id}" ${m.id === nutMember ? 'selected' : ''}>${esc(m.name)}</option>`
    ).join('');
}

function renderNutritionBody() {
  const body = document.getElementById('nutrition-body');
  if (!body) return;
  if (members.length === 0) { body.innerHTML = `<p class="empty-msg">No members yet.</p>`; return; }
  if (!nutMember) { body.innerHTML = `<p class="empty-msg">Pick a member to view their food log.</p>`; return; }

  const member   = members.find(m => m.id === nutMember);
  const dayStart = member.day_start;
  const todayEff = effectiveDiaryToday(dayStart, new Date());
  const entries  = foodLog.filter(e => e.member_id === nutMember && e.log_date === nutDate);
  const goals    = macroGoals.find(g => g.member_id === nutMember);

  const totals = entries.reduce((acc, e) => {
    const food = foodById(e.food_id);
    if (!food) return acc;
    const m = macrosFor(food, e.grams);
    acc.cal += m.cal; acc.pro += m.pro; acc.carb += m.carb; acc.fat += m.fat;
    return acc;
  }, { cal: 0, pro: 0, carb: 0, fat: 0 });

  body.innerHTML = `
    <div class="nut-daynav">
      <button class="nut-daybtn" data-action="nut-prev-day">&#8249; Prev</button>
      <span class="nut-daylabel">${nutDateLabel(todayEff)}</span>
      <button class="nut-daybtn" data-action="nut-next-day">Next &#8250;</button>
    </div>
    <div class="day-start-row">
      <span>Day starts at</span>
      <input type="time" id="dayStartInput" value="${dayStart}"/>
    </div>
    ${totalsCardHTML(totals, goals)}
    ${logCardHTML(entries, dayStart)}`;
}

function totalsCardHTML(totals, goals) {
  const calLine = goals
    ? `${Math.round(totals.cal)} <span class="nut-cal-goal">/ ${Math.round(goals.calories)} cal</span>`
    : `${Math.round(totals.cal)} <span class="nut-cal-goal">cal</span>`;

  const macroRow = (label, val, goal) => {
    const pct = goal > 0 ? Math.min(100, Math.round((val / goal) * 100)) : 0;
    return `
      <div class="macro-row">
        <span class="macro-label">${label}</span>
        ${goals ? `<div class="lb-bar-track"><div class="lb-bar-fill" style="width:${pct}%"></div></div>` : '<div></div>'}
        <span class="macro-val">${Math.round(val)}${goals ? ` / ${Math.round(goal)}` : ''} g</span>
      </div>`;
  };

  let goalsArea;
  if (editingGoals) {
    const g = goals || { calories: '', protein: '', carbs: '', fat: '' };
    goalsArea = `
      <div class="goals-form">
        <div class="goals-form-row">
          <input type="number" inputmode="numeric" id="goalCal"  class="lift-input" placeholder="Calories" value="${g.calories}"/>
          <input type="number" inputmode="numeric" id="goalPro"  class="lift-input" placeholder="Protein g" value="${g.protein}"/>
        </div>
        <div class="goals-form-row">
          <input type="number" inputmode="numeric" id="goalCarb" class="lift-input" placeholder="Carbs g" value="${g.carbs}"/>
          <input type="number" inputmode="numeric" id="goalFat"  class="lift-input" placeholder="Fat g" value="${g.fat}"/>
        </div>
        <div class="form-error" id="goalError"></div>
        <div class="goals-form-row">
          <button class="lift-save" data-action="nut-save-goals">Save goals</button>
          <button class="lift-cancel" data-action="nut-cancel-goals">&#215;</button>
        </div>
      </div>`;
  } else if (goalCalcOpen) {
    goalsArea = goalCalcFormHTML();
  } else if (goalCalcResult) {
    goalsArea = goalCalcPreviewHTML();
  } else {
    goalsArea = `
      <div class="goals-actions">
        <button class="lift-history-toggle" data-action="nut-edit-goals">${goals ? 'Edit goals' : 'Set goals'}</button>
        <button class="lift-history-toggle" data-action="nut-calc-goals">Calculate goals</button>
      </div>`;
  }

  return `
    <div class="nut-totals">
      <div class="nut-cal-line">${calLine}</div>
      ${macroRow('Protein', totals.pro,  goals?.protein)}
      ${macroRow('Carbs',   totals.carb, goals?.carbs)}
      ${macroRow('Fat',     totals.fat,  goals?.fat)}
      ${goalsArea}
    </div>`;
}

function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function formatLogTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function logCardHTML(entries, dayStart) {
  // Times before day_start belong to the tail of the diary day, so they
  // sort after evening entries (e.g. 23:00 then 01:30 for a 06:00 start).
  const sortKey = e => ((e.log_time || '') < dayStart ? '1' : '0') + (e.log_time || '');
  const sorted = [...entries].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const rows = sorted.map(e => {
    const food = foodById(e.food_id);
    if (!food) return '';
    const m = macrosFor(food, e.grams);
    return `
      <div class="food-row">
        <span class="log-time">${formatLogTime(e.log_time)}</span>
        <div class="food-row-name">
          ${iconSvg(food.icon)}${esc(food.name)}${food.brand ? ` <span class="food-row-brand">${esc(food.brand)}</span>` : ''}
          <div class="food-row-detail">${Math.round(e.grams)} g</div>
        </div>
        <span class="food-row-stats">${Math.round(m.cal)} cal · P ${Math.round(m.pro)} · C ${Math.round(m.carb)} · F ${Math.round(m.fat)}</span>
        <button class="comment-del" data-action="nut-delete-log" data-log-id="${e.id}" aria-label="Delete">&#215;</button>
      </div>`;
  }).join('');

  const addArea = addFoodOpen
    ? foodAddPanelHTML()
    : `<button class="add-trigger log-add" data-action="nut-open-add">+ Add food</button>`;

  return `
    <div class="log-card">
      <div class="log-card-header">
        <span>Log</span>
        ${sorted.length > 0 ? `<span class="log-card-sub">${sorted.length} item${sorted.length !== 1 ? 's' : ''}</span>` : ''}
      </div>
      ${rows || `<p class="empty-msg log-empty">Nothing logged this day.</p>`}
      ${addArea}
    </div>`;
}

function foodAddPanelHTML() {
  if (foodFormMode) return foodFormHTML();
  if (pendingLogFoodId) return logFormHTML();
  return `
    <div class="food-add-panel">
      <input class="add-input" id="foodSearch" placeholder="Search foods" value="${esc(foodSearchQuery)}"/>
      <div class="db-controls">${foodGroupSelectHTML('logGroupSel')}</div>
      <div id="food-search-results">${foodSearchResultsHTML()}</div>
      <div class="food-panel-actions">
        <button class="lift-history-toggle" data-action="nut-new-food">+ New food</button>
        <button class="lift-history-toggle" data-action="nut-cancel-add">Close</button>
      </div>
    </div>`;
}

function foodSearchResultsHTML() {
  return foodBrowserHTML(foodSearchQuery, 'nut-pick-food');
}

function renderFoodSearchResults() {
  const el = document.getElementById('food-search-results');
  if (el) el.innerHTML = foodSearchResultsHTML();
}

function logFormHTML() {
  const food = foodById(pendingLogFoodId);
  if (!food) { pendingLogFoodId = null; return foodAddPanelHTML(); }
  const servings = foodServings.filter(s => s.food_id === food.id);

  return `
    <div class="food-add-panel">
      <div class="log-food-header">
        <div class="food-result-name">${iconSvg(food.icon)}${esc(food.name)}${food.brand ? ` <span class="food-row-brand">${esc(food.brand)}</span>` : ''}</div>
        <div class="food-row-stats">${(() => {
          const b = primaryServing(food.id);
          const m = macrosFor(food, b ? b.grams : 100);
          return `Per ${b ? esc(b.label) : '100g'}: ${Math.round(m.cal)} cal · P ${Math.round(m.pro)} · C ${Math.round(m.carb)} · F ${Math.round(m.fat)}`;
        })()}</div>
      </div>
      <div class="goals-form-row">
        <input type="number" inputmode="decimal" id="logQty" class="lift-input" placeholder="Amount" value="${servings.length > 0 ? '1' : ''}"/>
        <select id="logUnit" class="strength-picker">
          ${servings.map((sv, i) => `<option value="${sv.id}" ${i === 0 ? 'selected' : ''}>${esc(sv.label)} (${sv.grams}g)</option>`).join('')}
          ${MASS_UNITS.map(u => `<option value="${u.key}">${u.label}</option>`).join('')}
        </select>
        <input type="time" id="logTime" class="lift-input log-time-input" value="${nowHHMM()}"/>
      </div>
      <div class="form-error" id="logError"></div>
      <div class="goals-form-row">
        <button class="lift-save" data-action="nut-log-food">Add to log</button>
        <button class="lift-history-toggle" data-action="nut-edit-food" data-food-id="${food.id}">Edit food</button>
        <button class="lift-cancel" data-action="nut-back-to-search">&#215;</button>
      </div>
    </div>`;
}

function foodFormHTML() {
  const editing = foodFormMode === 'edit' ? foodById(editingFoodId) : null;
  const basis = editing ? primaryServing(editing.id) : null;
  const k = basis ? basis.grams / 100 : 1;
  const f = editing
    ? { name: editing.name, brand: editing.brand, icon: editing.icon,
        calories: round2(editing.calories * k), protein: round2(editing.protein * k),
        carbs: round2(editing.carbs * k), fat: round2(editing.fat * k) }
    : { name: '', brand: '', icon: '', calories: '', protein: '', carbs: '', fat: '' };

  return `
    <div class="food-add-panel">
      <div class="log-food-header">
        <div class="food-result-name">${editing ? 'Edit food' : 'New food'}</div>
        <div class="food-row-stats">${editing && basis ? `Values shown per ${esc(basis.label)}` : 'Define the serving, then enter nutrition per serving'}</div>
      </div>
      <div class="goals-form-row">
        <input id="nfName"  class="add-input" placeholder="Name" value="${esc(f.name)}"/>
        <input id="nfBrand" class="add-input" placeholder="Brand (optional)" value="${esc(f.brand || '')}"/>
      </div>
      ${iconPickerHTML('nfIcon', f.icon)}
      ${editing ? servingListHTML(editing.id) : ''}
      <div class="serving-label">Serving size${editing ? ' (add another)' : ''}</div>
      <div class="goals-form-row">
        <input id="nfServLabel" class="add-input" placeholder="One serving is... (e.g. 1 slice)"/>
        <input type="number" inputmode="decimal" id="nfServAmt" class="lift-input" placeholder="Weight"/>
        <select id="nfServUnit" class="strength-picker serving-unit">
          ${MASS_UNITS.map(u => `<option value="${u.key}">${u.label}</option>`).join('')}
        </select>
      </div>
      <div class="serving-label">Nutrition per serving</div>
      <div class="goals-form-row">
        <input type="number" inputmode="decimal" id="nfCal" class="lift-input" placeholder="Calories" value="${f.calories}"/>
        <input type="number" inputmode="decimal" id="nfPro" class="lift-input" placeholder="Protein g" value="${f.protein}"/>
      </div>
      <div class="goals-form-row">
        <input type="number" inputmode="decimal" id="nfCarb" class="lift-input" placeholder="Carbs g" value="${f.carbs}"/>
        <input type="number" inputmode="decimal" id="nfFat"  class="lift-input" placeholder="Fat g" value="${f.fat}"/>
      </div>
      <div class="form-error" id="nfError"></div>
      <div class="goals-form-row">
        <button class="lift-save" data-action="nut-save-food">${editing ? 'Save changes' : 'Add food'}</button>
        <button class="lift-cancel" data-action="nut-cancel-food">&#215;</button>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
// Actions: Nutrition
// ─────────────────────────────────────────────

function showFormError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

async function saveFood() {
  const name  = document.getElementById('nfName')?.value.trim();
  const brand = document.getElementById('nfBrand')?.value.trim() || null;
  const cal   = parseFloat(document.getElementById('nfCal')?.value);
  const pro   = parseFloat(document.getElementById('nfPro')?.value);
  const carb  = parseFloat(document.getElementById('nfCarb')?.value);
  const fat   = parseFloat(document.getElementById('nfFat')?.value);
  if (!name || isNaN(cal) || isNaN(pro) || isNaN(carb) || isNaN(fat)) {
    showFormError('nfError', 'Fill in the name and all four nutrition fields.');
    return;
  }
  if (cal < 0 || pro < 0 || carb < 0 || fat < 0) {
    showFormError('nfError', 'Nutrition values cannot be negative.');
    return;
  }

  const icon = document.getElementById('nfIcon')?.value || null;
  const servLabel = document.getElementById('nfServLabel')?.value.trim();
  const servAmt   = parseFloat(document.getElementById('nfServAmt')?.value);
  const servUnit  = MASS_UNITS.find(u => u.key === document.getElementById('nfServUnit')?.value);
  const servGramsNew = servAmt > 0 && servUnit ? servAmt * servUnit.grams : null;

  if (foodFormMode === 'edit') {
    const id = editingFoodId;
    const basis = primaryServing(id);
    const basisGrams = basis ? basis.grams : servGramsNew;
    if (!basisGrams) {
      showFormError('nfError', 'Define the serving size; nutrition is entered per serving.');
      return;
    }
    const k = 100 / basisGrams;
    foodFormMode = null;
    editingFoodId = null;
    renderNutritionBody();
    await db.from('foods').update({
      name, brand, icon,
      calories: round2(cal * k), protein: round2(pro * k),
      carbs: round2(carb * k), fat: round2(fat * k),
    }).eq('id', id);
    if (servLabel && servGramsNew) {
      await db.from('food_servings').insert({ id: 's' + Date.now(), food_id: id, label: servLabel, grams: servGramsNew });
    }
    return;
  }

  if (!servLabel || !servGramsNew) {
    showFormError('nfError', 'Define the serving size, e.g. 1 slice weighing 32 g.');
    return;
  }

  const k = 100 / servGramsNew;
  const id = 'f' + Date.now();
  foodFormMode = null;
  pendingLogFoodId = id;
  renderNutritionBody();
  await db.from('foods').insert({
    id, name, brand, icon,
    calories: round2(cal * k), protein: round2(pro * k),
    carbs: round2(carb * k), fat: round2(fat * k),
  });
  await db.from('food_servings').insert({ id: 's' + Date.now(), food_id: id, label: servLabel, grams: servGramsNew });
}

async function logFood() {
  const qty = parseFloat(document.getElementById('logQty')?.value);
  const unit = document.getElementById('logUnit')?.value;
  if (!qty || qty <= 0) {
    showFormError('logError', 'Enter an amount greater than zero.');
    return;
  }
  const logTime = document.getElementById('logTime')?.value;
  if (!logTime) {
    showFormError('logError', 'Enter a time.');
    return;
  }
  if (!pendingLogFoodId || !nutMember) return;

  let grams;
  const massUnit = MASS_UNITS.find(u => u.key === unit);
  if (massUnit) {
    grams = qty * massUnit.grams;
  } else {
    const serving = foodServings.find(s => s.id === unit);
    if (!serving) return;
    grams = qty * serving.grams;
  }

  const entry = {
    member_id: nutMember,
    log_date:  nutDate,
    log_time:  logTime,
    food_id:   pendingLogFoodId,
    grams,
  };

  addFoodOpen = false;
  pendingLogFoodId = null;
  foodSearchQuery = '';
  renderNutritionBody();

  await db.from('food_log').insert(entry);
}

async function deleteFoodLog(logId) {
  await db.from('food_log').delete().eq('id', Number(logId));
}

async function saveGoals() {
  const cal  = parseFloat(document.getElementById('goalCal')?.value);
  const pro  = parseFloat(document.getElementById('goalPro')?.value);
  const carb = parseFloat(document.getElementById('goalCarb')?.value);
  const fat  = parseFloat(document.getElementById('goalFat')?.value);
  if (isNaN(cal) || isNaN(pro) || isNaN(carb) || isNaN(fat)) {
    showFormError('goalError', 'Fill in all four goal fields.');
    return;
  }
  if (cal < 0 || pro < 0 || carb < 0 || fat < 0) {
    showFormError('goalError', 'Goal values cannot be negative.');
    return;
  }
  if (!nutMember) return;

  editingGoals = false;
  renderNutritionBody();
  await db.from('macro_goals').upsert({ member_id: nutMember, calories: cal, protein: pro, carbs: carb, fat });
}

// ─────────────────────────────────────────────
// Goal calculator
// Mifflin-St Jeor BMR, activity multiplier plus a training bump
// (0.1 per 3 weekly sessions), goal rate at 500 cal per lb per week.
// Protein by bodyweight (1.0 g/lb cutting, 0.8 otherwise), fat 25%
// of calories, carbs from the remainder.
// ─────────────────────────────────────────────

function goalCalcFormHTML() {
  return `
    <div class="goals-form">
      <div class="goals-form-row">
        <select id="gcSex" class="strength-picker">
          <option value="">Sex</option>
          <option value="m">Male</option>
          <option value="f">Female</option>
        </select>
        <input type="number" inputmode="numeric" id="gcAge" class="lift-input" placeholder="Age"/>
      </div>
      <div class="goals-form-row">
        <input type="number" inputmode="numeric" id="gcFt" class="lift-input" placeholder="Height ft"/>
        <input type="number" inputmode="numeric" id="gcIn" class="lift-input" placeholder="Height in"/>
        <input type="number" inputmode="decimal" id="gcWeight" class="lift-input" placeholder="Weight lb"/>
      </div>
      <div class="goals-form-row">
        <select id="gcActivity" class="strength-picker">
          <option value="">Activity outside the gym</option>
          <option value="1.2">Sedentary (desk job, little walking)</option>
          <option value="1.3">Lightly active</option>
          <option value="1.4">Moderately active</option>
          <option value="1.5">Very active</option>
          <option value="1.6">Extremely active (physical job)</option>
        </select>
      </div>
      <div class="goals-form-row">
        <input type="number" inputmode="numeric" id="gcSessions" class="lift-input" placeholder="Workouts per week"/>
      </div>
      <div class="goals-form-row">
        <select id="gcGoal" class="strength-picker">
          <option value="">Goal</option>
          <option value="lose">Lose weight</option>
          <option value="maintain">Maintain</option>
          <option value="gain">Gain weight</option>
        </select>
        <select id="gcRate" class="strength-picker">
          <option value="">Rate</option>
          <option value="0.25">0.25 lb/week</option>
          <option value="0.5">0.5 lb/week</option>
          <option value="0.75">0.75 lb/week</option>
          <option value="1">1 lb/week</option>
          <option value="1.5">1.5 lb/week</option>
          <option value="2">2 lb/week</option>
        </select>
      </div>
      <div class="form-error" id="gcError"></div>
      <div class="goals-form-row">
        <button class="lift-save" data-action="nut-run-goal-calc">Calculate</button>
        <button class="lift-cancel" data-action="nut-calc-cancel">&#215;</button>
      </div>
    </div>`;
}

function goalCalcPreviewHTML() {
  const r = goalCalcResult;
  return `
    <div class="goals-form">
      <div class="calc-result">
        <div class="calc-result-cal">${r.cal} <span class="nut-cal-goal">cal/day</span></div>
        <div class="calc-result-macros">Protein ${r.pro} g · Carbs ${r.carb} g · Fat ${r.fat} g</div>
        ${r.warn ? `<div class="calc-warn">${r.warn}</div>` : ''}
      </div>
      <div class="goals-form-row">
        <button class="lift-save" data-action="nut-apply-goal-calc">Use these goals</button>
        <button class="lift-history-toggle" data-action="nut-calc-goals">Recalculate</button>
        <button class="lift-cancel" data-action="nut-calc-cancel">&#215;</button>
      </div>
    </div>`;
}

function runGoalCalc() {
  const sex      = document.getElementById('gcSex')?.value;
  const age      = parseInt(document.getElementById('gcAge')?.value, 10);
  const ft       = parseInt(document.getElementById('gcFt')?.value, 10);
  const inches   = parseInt(document.getElementById('gcIn')?.value, 10) || 0;
  const lb       = parseFloat(document.getElementById('gcWeight')?.value);
  const activity = parseFloat(document.getElementById('gcActivity')?.value);
  const sessions = parseInt(document.getElementById('gcSessions')?.value, 10);
  const goal     = document.getElementById('gcGoal')?.value;
  const rate     = parseFloat(document.getElementById('gcRate')?.value);

  if (!sex || !age || !ft || !lb || !activity || isNaN(sessions) || !goal) {
    showFormError('gcError', 'Fill in every field.');
    return;
  }
  if (goal !== 'maintain' && !rate) {
    showFormError('gcError', 'Pick a rate for your goal.');
    return;
  }

  const kg  = lb * 0.4536;
  const cm  = (ft * 12 + inches) * 2.54;
  const bmr = sex === 'm'
    ? 10 * kg + 6.25 * cm - 5 * age + 5
    : 10 * kg + 6.25 * cm - 5 * age - 161;

  const mult  = activity + 0.1 * (sessions / 3);
  const tdee  = bmr * mult;
  const delta = goal === 'maintain' ? 0 : (goal === 'lose' ? -1 : 1) * rate * 500;
  const cal   = Math.round(tdee + delta);

  const pro  = Math.round((goal === 'lose' ? 1.0 : 0.8) * lb);
  const fat  = Math.round(cal * 0.25 / 9);
  const carb = Math.round((cal - pro * 4 - fat * 9) / 4);

  let warn = null;
  if (cal < bmr) warn = 'This target is below your estimated BMR. Consider a slower rate.';
  if (carb < 0)  warn = 'This target is too low to fit the protein and fat minimums. Pick a slower rate.';

  goalCalcOpen = false;
  goalCalcResult = { cal, pro, carb: Math.max(0, carb), fat, warn };
  renderNutritionBody();
}

async function applyGoalCalc() {
  if (!goalCalcResult || !nutMember) return;
  const r = goalCalcResult;
  goalCalcResult = null;
  renderNutritionBody();
  await db.from('macro_goals').upsert({ member_id: nutMember, calories: r.cal, protein: r.pro, carbs: r.carb, fat: r.fat });
}

// ─────────────────────────────────────────────
// Actions: Food database panel
// ─────────────────────────────────────────────

async function saveDbFood() {
  const name  = document.getElementById('dbName')?.value.trim();
  const brand = document.getElementById('dbBrand')?.value.trim() || null;
  const cal   = parseFloat(document.getElementById('dbCal')?.value);
  const pro   = parseFloat(document.getElementById('dbPro')?.value);
  const carb  = parseFloat(document.getElementById('dbCarb')?.value);
  const fat   = parseFloat(document.getElementById('dbFat')?.value);
  if (!name || isNaN(cal) || isNaN(pro) || isNaN(carb) || isNaN(fat)) {
    showFormError('dbError', 'Fill in the name and all four nutrition fields.');
    return;
  }
  if (cal < 0 || pro < 0 || carb < 0 || fat < 0) {
    showFormError('dbError', 'Nutrition values cannot be negative.');
    return;
  }

  const icon = document.getElementById('dbIcon')?.value || null;
  const servLabel = document.getElementById('dbServLabel')?.value.trim();
  const servAmt   = parseFloat(document.getElementById('dbServAmt')?.value);
  const servUnit  = MASS_UNITS.find(u => u.key === document.getElementById('dbServUnit')?.value);
  const servGramsNew = servAmt > 0 && servUnit ? servAmt * servUnit.grams : null;

  if (dbFormMode === 'edit') {
    const id = dbEditingId;
    const basis = primaryServing(id);
    const basisGrams = basis ? basis.grams : servGramsNew;
    if (!basisGrams) {
      showFormError('dbError', 'Define the serving size; nutrition is entered per serving.');
      return;
    }
    const k = 100 / basisGrams;
    dbFormMode = null;
    dbEditingId = null;
    renderFoodDb();
    await db.from('foods').update({
      name, brand, icon,
      calories: round2(cal * k), protein: round2(pro * k),
      carbs: round2(carb * k), fat: round2(fat * k),
    }).eq('id', id);
    if (servLabel && servGramsNew) {
      await db.from('food_servings').insert({ id: 's' + Date.now(), food_id: id, label: servLabel, grams: servGramsNew });
    }
    return;
  }

  if (!servLabel || !servGramsNew) {
    showFormError('dbError', 'Define the serving size, e.g. 1 egg weighing 50 g.');
    return;
  }

  const k = 100 / servGramsNew;
  const id = 'f' + Date.now();
  dbFormMode = null;
  renderFoodDb();
  await db.from('foods').insert({
    id, name, brand, icon,
    calories: round2(cal * k), protein: round2(pro * k),
    carbs: round2(carb * k), fat: round2(fat * k),
  });
  await db.from('food_servings').insert({ id: 's' + Date.now(), food_id: id, label: servLabel, grams: servGramsNew });
}

function dbImportHTML() {
  return `
    <div class="log-food-header">
      <div class="food-result-name">Import foods</div>
      <div class="food-row-stats">One food per line, fields separated by tabs (paste straight from a spreadsheet)</div>
    </div>
    <div class="import-hint">Columns in order: Name, Serving label, Serving grams, Calories, Protein, Carbs, Fat, Brand (optional), Icon (optional). Nutrition values are per serving. No header row. Icons: ${FOOD_ICONS.map(i => i.key).join(', ')}.</div>
    <textarea id="dbImport" class="trash-input import-box" rows="8" placeholder="Paste rows here"></textarea>
    <div class="form-error" id="dbImportError"></div>
    <div class="goals-form-row">
      <button class="lift-save" data-action="db-import-run">Import</button>
      <button class="lift-cancel" data-action="db-cancel-food">&#215;</button>
    </div>`;
}

async function importFoods() {
  const raw = document.getElementById('dbImport')?.value || '';
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    showFormError('dbImportError', 'Nothing to import.');
    return;
  }
  const iconKeys = new Set(FOOD_ICONS.map(i => i.key));
  const rows = [];
  const errors = [];
  lines.forEach((line, idx) => {
    const p = line.split('\t').map(x => x.trim());
    if (p.length < 7) {
      errors.push(`Line ${idx + 1}: expected 7 to 9 tab separated fields, got ${p.length}.`);
      return;
    }
    const [name, label, gramsRaw, calRaw, proRaw, carbRaw, fatRaw, brand, icon] = p;
    const grams = parseFloat(gramsRaw);
    const cal = parseFloat(calRaw), pro = parseFloat(proRaw), carb = parseFloat(carbRaw), fat = parseFloat(fatRaw);
    if (!name || !label) { errors.push(`Line ${idx + 1}: missing name or serving label.`); return; }
    if (!(grams > 0)) { errors.push(`Line ${idx + 1}: serving grams must be a positive number.`); return; }
    if ([cal, pro, carb, fat].some(n => isNaN(n) || n < 0)) { errors.push(`Line ${idx + 1}: nutrition values must be numbers, zero or more.`); return; }
    if (icon && !iconKeys.has(icon)) { errors.push(`Line ${idx + 1}: unknown icon "${icon}".`); return; }
    rows.push({ name, label, grams, cal, pro, carb, fat, brand: brand || null, icon: icon || null });
  });
  if (errors.length > 0) {
    showFormError('dbImportError',
      errors.slice(0, 4).join(' ') +
      (errors.length > 4 ? ` Plus ${errors.length - 4} more.` : '') +
      ' Nothing was imported.');
    return;
  }
  const base = Date.now();
  const foodRows = rows.map((r, i) => {
    const k = 100 / r.grams;
    return {
      id: `f${base}x${i}`, name: r.name, brand: r.brand, icon: r.icon,
      calories: round2(r.cal * k), protein: round2(r.pro * k),
      carbs: round2(r.carb * k), fat: round2(r.fat * k),
    };
  });
  const servRows = rows.map((r, i) => ({ id: `s${base}x${i}`, food_id: `f${base}x${i}`, label: r.label, grams: r.grams }));
  dbFormMode = null;
  renderFoodDb();
  const { error } = await db.from('foods').insert(foodRows);
  if (error) {
    alert('Import failed: ' + error.message);
    return;
  }
  await db.from('food_servings').insert(servRows);
}

async function deleteServing(servingId) {
  await db.from('food_servings').delete().eq('id', servingId);
}

async function deleteDbFood(foodId) {
  const { error } = await db.from('foods').delete().eq('id', foodId);
  if (error) {
    alert('This food has logged entries and cannot be deleted.');
    return;
  }
  dbFormMode = null;
  dbEditingId = null;
  renderFoodDb();
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
  const { action, id, slot, lift, entryId, commentId, memberId, type, foodId, logId } = btn.dataset;

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

  if (action === 'nut-prev-day')        { shiftNutDate(-1); resetNutPanels(); renderNutritionBody(); }
  if (action === 'nut-next-day')        { shiftNutDate(1);  resetNutPanels(); renderNutritionBody(); }
  if (action === 'nut-open-add')        { resetNutPanels(); addFoodOpen = true; renderNutritionBody(); focusFoodSearch(); }
  if (action === 'nut-cancel-add')      { resetNutPanels(); renderNutritionBody(); }
  if (action === 'nut-pick-food')       { pendingLogFoodId = foodId; renderNutritionBody(); }
  if (action === 'nut-back-to-search')  { pendingLogFoodId = null; renderNutritionBody(); focusFoodSearch(); }
  if (action === 'nut-log-food')        logFood();
  if (action === 'nut-delete-log')      deleteFoodLog(logId);
  if (action === 'nut-new-food')        { foodFormMode = 'create'; renderNutritionBody(); }
  if (action === 'nut-edit-food')       { foodFormMode = 'edit'; editingFoodId = foodId; renderNutritionBody(); }
  if (action === 'nut-save-food')       saveFood();
  if (action === 'nut-cancel-food')     { foodFormMode = null; editingFoodId = null; renderNutritionBody(); }
  if (action === 'nut-edit-goals')      { editingGoals = true; goalCalcOpen = false; goalCalcResult = null; renderNutritionBody(); }
  if (action === 'nut-save-goals')      saveGoals();
  if (action === 'nut-cancel-goals')    { editingGoals = false; renderNutritionBody(); }
  if (action === 'nut-calc-goals')      { goalCalcOpen = true; goalCalcResult = null; editingGoals = false; renderNutritionBody(); }
  if (action === 'nut-run-goal-calc')   runGoalCalc();
  if (action === 'nut-apply-goal-calc') applyGoalCalc();
  if (action === 'nut-calc-cancel')     { goalCalcOpen = false; goalCalcResult = null; renderNutritionBody(); }

  if (action === 'pick-food-icon') {
    const row = btn.closest('.icon-row');
    const input = document.getElementById(row.dataset.iconInput);
    const already = input.value === btn.dataset.iconKey;
    input.value = already ? '' : btn.dataset.iconKey;
    row.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected'));
    if (!already) btn.classList.add('selected');
  }
  if (action === 'del-serving')         { btn.closest('.serving-row').remove(); deleteServing(btn.dataset.servingId); }

  if (action === 'db-new-food')         { dbFormMode = 'create'; dbEditingId = null; renderFoodDb(); }
  if (action === 'db-import-open')      { dbFormMode = 'import'; dbEditingId = null; renderFoodDb(); }
  if (action === 'toggle-food-group') {
    const key = btn.dataset.groupKey;
    if (expandedFoodGroups.has(key)) expandedFoodGroups.delete(key);
    else expandedFoodGroups.add(key);
    renderDbFoodList();
    renderFoodSearchResults();
  }
  if (action === 'db-import-run')       importFoods();
  if (action === 'db-edit-food')        { dbFormMode = 'edit'; dbEditingId = foodId; renderFoodDb(); }
  if (action === 'db-save-food')        saveDbFood();
  if (action === 'db-cancel-food')      { dbFormMode = null; dbEditingId = null; renderFoodDb(); }
  if (action === 'db-delete-food')      deleteDbFood(foodId);
});

function resetNutPanels() {
  addFoodOpen = false;
  pendingLogFoodId = null;
  foodFormMode = null;
  editingFoodId = null;
  foodSearchQuery = '';
}

function focusFoodSearch() {
  const input = document.getElementById('foodSearch');
  if (input) input.focus();
}

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
  currentStrengthMember = e.target.value || null;
  loggingLiftId = null; expandedLiftId = null; showingLiftForm = false;
  renderStrengthList(); renderStrengthAddArea();
});

document.getElementById('panel-leaderboard').addEventListener('change', e => {
  if (e.target.id === 'htPicker1') { htMember1 = e.target.value || null; renderHeadToHead(); }
  if (e.target.id === 'htPicker2') { htMember2 = e.target.value || null; renderHeadToHead(); }
});

document.getElementById('panel-trash').addEventListener('change', e => {
  if (e.target.id === 'trashPoster') trashTalkPoster = e.target.value || null;
});

document.getElementById('nutritionPicker').addEventListener('change', e => {
  nutMember = e.target.value || null;
  addFoodOpen = false; pendingLogFoodId = null; foodFormMode = null;
  editingFoodId = null; editingGoals = false; foodSearchQuery = '';
  goalCalcOpen = false; goalCalcResult = null;
  const m = members.find(x => x.id === nutMember);
  if (m) nutDate = effectiveDiaryToday(m.day_start, new Date());
  renderNutrition();
});

document.getElementById('panel-nutrition').addEventListener('change', e => {
  if (e.target.id === 'dbGroupSel' || e.target.id === 'logGroupSel') {
    foodGroupMode = e.target.value;
    renderDbFoodList();
    renderFoodSearchResults();
  }
  if (e.target.id === 'dayStartInput' && nutMember) {
    const v = e.target.value;
    if (!v) return;
    const m = members.find(x => x.id === nutMember);
    m.day_start = v;
    db.from('members').update({ day_start: v }).eq('id', nutMember);
    renderNutritionBody();
  }
});

document.getElementById('panel-nutrition').addEventListener('input', e => {
  if (e.target.id === 'foodSearch') {
    foodSearchQuery = e.target.value;
    renderFoodSearchResults();
  }
  if (e.target.id === 'dbSearch') {
    dbSearch = e.target.value;
    renderDbFoodList();
  }
});
document.getElementById('panel-trash').addEventListener('keydown', e => {
  if (e.target.id === 'trashInput' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') postComment();
});

// ─────────────────────────────────────────────
// Theme
// Per-device preference in localStorage; first visit follows the
// system setting.
// ─────────────────────────────────────────────

function updateThemeToggleLabel() {
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = document.documentElement.dataset.theme === 'dark' ? 'Light mode' : 'Dark mode';
}

const savedTheme = localStorage.getItem('wc-theme');
const startDark = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
if (startDark) document.documentElement.dataset.theme = 'dark';
updateThemeToggleLabel();

document.getElementById('themeToggle').addEventListener('click', () => {
  const nowDark = document.documentElement.dataset.theme !== 'dark';
  if (nowDark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  localStorage.setItem('wc-theme', nowDark ? 'dark' : 'light');
  updateThemeToggleLabel();
});

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

loadData();
