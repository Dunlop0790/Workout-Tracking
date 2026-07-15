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

// Sakura swaps every workout emoji for a cat
const SAKURA_EMOJI = { lift: '😾', run: '🐈', cardio: '😻', sport: '😼', cross: '🙀', other: '😸' };

function isSakura() { return document.documentElement.dataset.theme === 'sakura'; }

function workoutEmoji(t) { return isSakura() ? SAKURA_EMOJI[t.key] : t.emoji; }

function workoutLabel(t) {
  const name = t.label.replace(t.emoji, '').trim();
  return `${workoutEmoji(t)} ${name}`;
}

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

// Optional nutrient input: blank means unknown (null), never zero.
function optNum(id) {
  const v = document.getElementById(id)?.value.trim();
  if (v === '' || v == null) return null;
  return parseFloat(v);
}

// The serving a food was defined with (oldest). Nutrition entry and
// display are per serving; storage stays per 100g.
function primaryServing(foodId) {
  const list = foodServings.filter(s => s.food_id === foodId);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => a.id.localeCompare(b.id))[0];
}

// Most recently logged distinct foods for a member, newest first.
function recentFoodsFor(memberId, n) {
  const logs = foodLog
    .filter(e => e.member_id === memberId)
    .sort((a, b) => (b.log_date + b.log_time).localeCompare(a.log_date + a.log_time));
  const seen = new Set();
  const out = [];
  for (const e of logs) {
    if (seen.has(e.food_id)) continue;
    seen.add(e.food_id);
    const f = foodById(e.food_id);
    if (f) out.push(f);
    if (out.length >= n) break;
  }
  return out;
}

function prevDateStr(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

function foodCalDisplay(f) {
  const sv = primaryServing(f.id);
  if (sv) return `${Math.round(f.calories * sv.grams / 100)} cal · ${esc(sv.label)}`;
  return `${Math.round(f.calories)} cal / 100g`;
}

function best1RM(memberId, liftName) {
  return liftEntries
    .filter(e => e.member_id === memberId && e.lift_name === liftName)
    .reduce((best, e) => Math.max(best, epley1RM(e.weight, e.reps)), 0);
}

function sparklineSVG(vals) {
  const n = vals.length;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = n === 1 ? 50 : (i / (n - 1)) * 100;
    const y = 25 - ((v - min) / range) * 20;
    return [round2(x), round2(y)];
  });
  const last = pts[pts.length - 1];
  return `
    <svg class="lift-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="2" fill="currentColor" vector-effect="non-scaling-stroke"/>
    </svg>`;
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
let logCopyMsg            = '';
let pendingAttachment     = null;
let sweepRunning          = false;

const COMMENT_MAX_AGE_MS = 14 * 24 * 3600 * 1000;

function freshComments() {
  const cutoff = Date.now() - COMMENT_MAX_AGE_MS;
  return comments.filter(c => c.ts >= cutoff);
}

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
  sweepExpiredComments();

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
    const typeDef = workoutType ? WORKOUT_TYPES.find(t => t.key === workoutType) : null;
    const typeEmoji = typeDef ? workoutEmoji(typeDef) : '';
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
          style="--type-color:${t.color}">${workoutLabel(t)}</button>`).join('')}
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
      <div class="attach-row">
        <input type="file" id="attachInput" accept="image/png,image/jpeg,image/gif,image/webp" hidden/>
        <button class="attach-btn" data-action="attach-pick">Attach image</button>
        <span class="attach-name" id="attachName"></span>
        <button class="comment-del attach-clear" id="attachClear" data-action="attach-clear" aria-label="Remove attachment" style="display:none">&#215;</button>
      </div>
      <div class="form-error" id="trashError"></div>
      <button class="trash-post-btn" data-action="post-comment">Post</button>
      <p class="trash-expiry-note">Posts disappear after 2 weeks.</p>
    </div>`;
}

function renderTrashFeed() {
  const el = document.getElementById('trash-feed');
  if (!el) return;
  const fresh = freshComments();
  if (fresh.length === 0) {
    el.innerHTML = `<p class="empty-msg">No trash talk yet.<br/>Be the first to chirp.</p>`;
    return;
  }
  el.innerHTML = fresh.map(c => {
    const member = members.find(m => m.id === c.member_id);
    const name   = member ? member.name : 'Unknown';
    let attach = '';
    if (c.attachment) {
      const url = db.storage.from('attachments').getPublicUrl(c.attachment).data.publicUrl;
      attach = `<a href="${url}" target="_blank" rel="noopener"><img class="comment-attach" src="${url}" loading="lazy" alt="attachment"/></a>`;
    }
    return `
      <div class="comment-card">
        <div class="comment-avatar">${initials(name)}</div>
        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-name">${esc(name)}</span>
            <span class="comment-time">${timeAgo(c.ts)}</span>
          </div>
          ${c.content ? `<div class="comment-text">${esc(c.content)}</div>` : ''}
          ${attach}
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
  renderRecordsOptIn();
  renderStrengthList();
  renderStrengthAddArea();
  renderClubRecords();
}

function renderRecordsOptIn() {
  const el = document.getElementById('records-optin-area');
  if (!el) return;
  const m = members.find(x => x.id === currentStrengthMember);
  if (!m) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <label class="records-optin">
      <input type="checkbox" id="recordsOptIn" ${m.records_opt_in ? 'checked' : ''}/>
      Include ${esc(m.name)}'s lifts in Club Records
    </label>`;
}

function renderClubRecords() {
  const el = document.getElementById('club-records');
  if (!el) return;
  const inMembers = members.filter(m => m.records_opt_in);
  if (inMembers.length === 0) {
    el.innerHTML = `<p class="empty-msg">Nobody has opted in yet. Pick a member and tick the box under the picker to join.</p>`;
    return;
  }

  const recordRow = (label, best, holder) => `
    <div class="record-row">
      <div>
        <div class="record-lift">${esc(label)}</div>
        <div class="record-holder">${holder ? esc(holder.name) : 'No entries yet'}</div>
      </div>
      <div class="record-val">${best > 0 ? Math.round(best) + '<span class="lift-unit">lb</span>' : '—'}</div>
    </div>`;

  const big4 = DEFAULT_LIFTS.map(name => {
    let best = 0, holder = null;
    inMembers.forEach(m => {
      const v = best1RM(m.id, name);
      if (v > best) { best = v; holder = m; }
    });
    return recordRow(name, best, holder);
  }).join('');

  // 1000 lb club: best squat + bench + deadlift, all three required
  const totals = inMembers.map(m => {
    const sq = best1RM(m.id, 'Squat');
    const be = best1RM(m.id, 'Bench Press');
    const de = best1RM(m.id, 'Deadlift');
    return { m, total: sq + be + de, complete: sq > 0 && be > 0 && de > 0 };
  }).filter(t => t.complete).sort((a, b) => b.total - a.total);
  const qualifiers = totals.filter(t => t.total >= 1000);
  let clubHTML;
  if (qualifiers.length > 0) {
    clubHTML = qualifiers.map(t => `
      <div class="record-row">
        <div class="record-lift">${esc(t.m.name)}</div>
        <div class="record-val">${Math.round(t.total)}<span class="lift-unit">lb</span></div>
      </div>`).join('');
  } else if (totals.length > 0) {
    const c = totals[0];
    clubHTML = `<p class="club-note">No members yet. Closest: ${esc(c.m.name)} at ${Math.round(c.total)} lb.</p>`;
  } else {
    clubHTML = `<p class="club-note">Needs a squat, bench, and deadlift on record.</p>`;
  }

  // Misc bests: custom lifts across opted-in members
  const inIds = new Set(inMembers.map(m => m.id));
  const customNames = [...new Set(
    liftEntries
      .filter(e => inIds.has(e.member_id) && !DEFAULT_LIFTS.includes(e.lift_name))
      .map(e => e.lift_name)
  )].sort((a, b) => a.localeCompare(b));
  const miscHTML = customNames.map(name => {
    let best = 0, holder = null;
    inMembers.forEach(m => {
      const v = best1RM(m.id, name);
      if (v > best) { best = v; holder = m; }
    });
    return recordRow(name, best, holder);
  }).join('');

  el.innerHTML = `
    <p class="club-note">Estimated 1RMs (Epley), opted-in members only.</p>
    ${big4}
    <div class="serving-label">1000 lb Club</div>
    ${clubHTML}
    ${customNames.length > 0 ? `<div class="serving-label">Misc bests</div>${miscHTML}` : ''}`;
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

  const series = [...entries].sort((a, b) => a.ts - b.ts).slice(-30).map(e => epley1RM(e.weight, e.reps));
  const sparkHTML = series.length >= 2 ? sparklineSVG(series) : '';

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
      ${sparkHTML}
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

  if (weight === 69 || weight === 420 || reps === 69) showToast('nice.');

  const existing  = entriesForMemberLift(currentStrengthMember, liftName);
  const new1RM    = epley1RM(weight, reps);
  const currentPR = existing.length > 0 ? Math.max(...existing.map(e => epley1RM(e.weight, e.reps))) : 0;
  const isNewPR   = new1RM > currentPR;

  const BIG3 = ['Squat', 'Bench Press', 'Deadlift'];
  if (BIG3.includes(liftName)) {
    const bests = BIG3.map(n => best1RM(currentStrengthMember, n));
    const beforeTotal = bests.every(v => v > 0) ? bests.reduce((a, b) => a + b, 0) : 0;
    const afterBests = BIG3.map(n => n === liftName ? Math.max(best1RM(currentStrengthMember, n), new1RM) : best1RM(currentStrengthMember, n));
    const afterTotal = afterBests.every(v => v > 0) ? afterBests.reduce((a, b) => a + b, 0) : 0;
    if (afterTotal >= 1000 && beforeTotal < 1000) showToast('1000 LB CLUB', true);
  }

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

function clearAttachment() {
  pendingAttachment = null;
  const nameEl = document.getElementById('attachName');
  const clearEl = document.getElementById('attachClear');
  const input = document.getElementById('attachInput');
  if (nameEl) nameEl.textContent = '';
  if (clearEl) clearEl.style.display = 'none';
  if (input) input.value = '';
}

async function postComment() {
  const textarea = document.getElementById('trashInput');
  const content  = textarea?.value.trim();
  if (!trashTalkPoster) {
    showFormError('trashError', 'Pick who you are posting as.');
    return;
  }
  if (!content && !pendingAttachment) return;

  let attachment = null;
  if (pendingAttachment) {
    const ext = pendingAttachment.name.split('.').pop().toLowerCase();
    attachment = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from('attachments')
      .upload(attachment, pendingAttachment, { contentType: pendingAttachment.type });
    if (error) {
      showFormError('trashError', 'Upload failed: ' + error.message);
      return;
    }
  }

  if (textarea) textarea.value = '';
  showFormError('trashError', '');
  clearAttachment();
  await db.from('comments').insert({ member_id: trashTalkPoster, content: content || '', ts: Date.now(), attachment });
}

async function deleteComment(commentId) {
  const c = comments.find(x => x.id === Number(commentId));
  if (c?.attachment) {
    await db.storage.from('attachments').remove([c.attachment]);
  }
  await db.from('comments').delete().eq('id', Number(commentId));
}

// Expired comments with files must go through the Storage API (SQL
// deletion orphans the file), so the app sweeps them on load. Text-only
// expired comments are purged by the daily pg_cron job.
async function sweepExpiredComments() {
  if (sweepRunning) return;
  const cutoff = Date.now() - COMMENT_MAX_AGE_MS;
  const expired = comments.filter(c => c.attachment && c.ts < cutoff).slice(0, 10);
  if (expired.length === 0) return;
  sweepRunning = true;
  try {
    await db.storage.from('attachments').remove(expired.map(c => c.attachment));
    for (const c of expired) {
      await db.from('comments').delete().eq('id', c.id);
    }
  } finally {
    sweepRunning = false;
  }
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
  renderNutTrends();
  // Realtime refreshes must not destroy an open search or form mid-typing.
  // Actions call the render functions directly, bypassing these guards.
  if (!dbFormMode) renderFoodDb();
  if (addFoodOpen || editingGoals || goalCalcOpen || goalCalcResult) {
    // The one refresh allowed while panels are open: a just-created
    // food arriving over realtime, so its log form can appear. The
    // waiting state has no inputs, so nothing being typed is lost.
    if (pendingLogFoodId && foodById(pendingLogFoodId) && !document.getElementById('logQty')) {
      renderNutritionBody();
    }
    return;
  }
  renderNutritionBody();
}

// ─────────────────────────────────────────────
// Render: Food database panel
// ─────────────────────────────────────────────

function renderNutTrends() {
  const wrap = document.getElementById('nut-trends-wrap');
  const el = document.getElementById('nut-trends');
  if (!wrap || !el) return;
  const member = members.find(m => m.id === nutMember);
  if (!member) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  // Last 7 diary days ending at the member's effective today
  const end = effectiveDiaryToday(member.day_start, new Date());
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end + 'T12:00:00');
    d.setDate(d.getDate() - i);
    days.push(localDateStr(d));
  }
  const perDay = days.map(date => {
    return foodLog
      .filter(e => e.member_id === nutMember && e.log_date === date)
      .reduce((acc, e) => {
        const food = foodById(e.food_id);
        if (!food) return acc;
        const m = macrosFor(food, e.grams);
        acc.cal += m.cal; acc.pro += m.pro;
        return acc;
      }, { cal: 0, pro: 0 });
  });
  const goals = macroGoals.find(g => g.member_id === nutMember);
  const dayLetters = days.map(date => new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' }));

  el.innerHTML =
    trendBlockHTML('Calories', perDay.map(d => d.cal), goals?.calories, dayLetters) +
    trendBlockHTML('Protein',  perDay.map(d => d.pro), goals?.protein,  dayLetters);
}

function trendBlockHTML(label, vals, goal, dayLetters) {
  const logged = vals.filter(v => v > 0);
  const avg = logged.length > 0 ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : 0;
  const max = Math.max(...vals, goal || 0, 1);
  const bars = vals.map((v, i) => {
    const h = v > 0 ? Math.max(2, (v / max) * 30) : 1.5;
    const x = i * 14 + 1;
    const today = i === vals.length - 1;
    return `<rect x="${x}" y="${round2(32 - h)}" width="12" height="${round2(h)}" rx="1.5"
      class="trend-bar${today ? ' trend-bar-today' : ''}"><title>${Math.round(v)}</title></rect>`;
  }).join('');
  const goalLine = goal
    ? `<line x1="0" x2="99" y1="${round2(32 - (goal / max) * 30)}" y2="${round2(32 - (goal / max) * 30)}" class="trend-goal"/>`
    : '';
  return `
    <div class="trend-block">
      <div class="trend-head">
        <span>${label}</span>
        <span class="trend-avg">${avg > 0 ? `avg ${avg}` : 'no data'}</span>
      </div>
      <svg class="trend-chart" viewBox="0 0 99 33" preserveAspectRatio="none" aria-hidden="true">${bars}${goalLine}</svg>
      <div class="trend-days">${dayLetters.map(l => `<span>${l}</span>`).join('')}</div>
    </div>`;
}

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

// ─────────────────────────────────────────────
// Shared food form: both entry points (Food Database panel and the
// meal-flow add panel) render the same fields and save through the
// same payload builder. Only headers, buttons, and state wiring
// differ per caller.
// ─────────────────────────────────────────────

function foodFormFieldsHTML(prefix, editing) {
  const basis = editing ? primaryServing(editing.id) : null;
  const k = basis ? basis.grams / 100 : 1;
  const f = editing
    ? { name: editing.name, brand: editing.brand, icon: editing.icon,
        calories: round2(editing.calories * k), protein: round2(editing.protein * k),
        carbs: round2(editing.carbs * k), fat: round2(editing.fat * k),
        sodium: editing.sodium == null ? '' : round2(editing.sodium * k),
        fiber:  editing.fiber  == null ? '' : round2(editing.fiber  * k),
        sugar:  editing.sugar  == null ? '' : round2(editing.sugar  * k) }
    : { name: '', brand: '', icon: '', calories: '', protein: '', carbs: '', fat: '', sodium: '', fiber: '', sugar: '' };

  return `
    <div class="log-food-header">
      <div class="food-result-name">${editing ? 'Edit food' : 'New food'}</div>
      <div class="food-row-stats">${editing && basis ? `Values shown per ${esc(basis.label)}` : 'Define the serving, then enter nutrition per serving'}</div>
    </div>
    <div class="goals-form-row">
      <input id="${prefix}Name"  class="add-input" placeholder="Name" value="${esc(f.name)}"/>
    </div>
    <div class="goals-form-row">
      <input id="${prefix}Brand" class="add-input" placeholder="Brand (optional)" value="${esc(f.brand || '')}"/>
    </div>
    ${iconPickerHTML(prefix + 'Icon', f.icon)}
    ${editing ? servingListHTML(editing.id) : ''}
    <div class="serving-label">Serving size${editing ? ' (add another)' : ''}</div>
    <div class="goals-form-row">
      <input id="${prefix}ServLabel" class="add-input" placeholder="One serving is... (e.g. 1 egg)"/>
      <input type="number" inputmode="decimal" id="${prefix}ServAmt" class="lift-input" placeholder="Weight"/>
      <select id="${prefix}ServUnit" class="strength-picker serving-unit">
        ${MASS_UNITS.map(u => `<option value="${u.key}">${u.label}</option>`).join('')}
      </select>
    </div>
    <div class="serving-label">Nutrition per serving</div>
    <div class="goals-form-row">
      <input type="number" inputmode="decimal" id="${prefix}Cal" class="lift-input" placeholder="Calories" value="${f.calories}"/>
      <input type="number" inputmode="decimal" id="${prefix}Pro" class="lift-input" placeholder="Protein g" value="${f.protein}"/>
    </div>
    <div class="goals-form-row">
      <input type="number" inputmode="decimal" id="${prefix}Carb" class="lift-input" placeholder="Carbs g" value="${f.carbs}"/>
      <input type="number" inputmode="decimal" id="${prefix}Fat"  class="lift-input" placeholder="Fat g" value="${f.fat}"/>
    </div>
    <div class="serving-label">Optional, per serving</div>
    <div class="goals-form-row">
      <input type="number" inputmode="decimal" id="${prefix}Sodium" class="lift-input" placeholder="Sodium mg" value="${f.sodium}"/>
      <input type="number" inputmode="decimal" id="${prefix}Fiber"  class="lift-input" placeholder="Fiber g" value="${f.fiber}"/>
      <input type="number" inputmode="decimal" id="${prefix}Sugar"  class="lift-input" placeholder="Sugar g" value="${f.sugar}"/>
    </div>
    <div class="form-error" id="${prefix}Error"></div>`;
}

// Reads and validates the form; returns { error } or a commit-ready
// description. Nutrition is entered per serving, stored per 100g.
function buildFoodPayload(prefix, editingId) {
  const val = id => document.getElementById(prefix + id)?.value;
  const name  = val('Name')?.trim();
  const brand = val('Brand')?.trim() || null;
  const cal   = parseFloat(val('Cal'));
  const pro   = parseFloat(val('Pro'));
  const carb  = parseFloat(val('Carb'));
  const fat   = parseFloat(val('Fat'));
  if (!name || isNaN(cal) || isNaN(pro) || isNaN(carb) || isNaN(fat)) {
    return { error: 'Fill in the name and all four nutrition fields.' };
  }
  if (cal < 0 || pro < 0 || carb < 0 || fat < 0) {
    return { error: 'Nutrition values cannot be negative.' };
  }
  const sod = optNum(prefix + 'Sodium');
  const fib = optNum(prefix + 'Fiber');
  const sug = optNum(prefix + 'Sugar');
  if ([sod, fib, sug].some(n => n !== null && (isNaN(n) || n < 0))) {
    return { error: 'Optional nutrition values must be numbers, zero or more.' };
  }

  const icon = val('Icon') || null;
  const servLabel = val('ServLabel')?.trim();
  const servAmt   = parseFloat(val('ServAmt'));
  const servUnit  = MASS_UNITS.find(u => u.key === val('ServUnit'));
  const servGramsNew = servAmt > 0 && servUnit ? servAmt * servUnit.grams : null;

  let basisGrams;
  if (editingId) {
    const basis = primaryServing(editingId);
    basisGrams = basis ? basis.grams : servGramsNew;
    if (!basisGrams) return { error: 'Define the serving size; nutrition is entered per serving.' };
  } else {
    if (!servLabel || !servGramsNew) return { error: 'Define the serving size, e.g. 1 egg weighing 50 g.' };
    basisGrams = servGramsNew;
  }

  const k = 100 / basisGrams;
  return {
    mode: editingId ? 'edit' : 'create',
    id: editingId || 'f' + Date.now(),
    payload: {
      name, brand, icon,
      calories: round2(cal * k), protein: round2(pro * k),
      carbs: round2(carb * k), fat: round2(fat * k),
      sodium: sod === null ? null : round2(sod * k),
      fiber:  fib === null ? null : round2(fib * k),
      sugar:  sug === null ? null : round2(sug * k),
    },
    serving: (servLabel && servGramsNew) ? { label: servLabel, grams: servGramsNew } : null,
  };
}

async function commitFood(r) {
  if (r.mode === 'edit') {
    await db.from('foods').update(r.payload).eq('id', r.id);
  } else {
    await db.from('foods').insert({ id: r.id, ...r.payload });
  }
  if (r.serving) {
    await db.from('food_servings').insert({ id: 's' + Date.now(), food_id: r.id, label: r.serving.label, grams: r.serving.grams });
  }
}

function dbFoodFormHTML() {
  const editing = dbFormMode === 'edit' ? foodById(dbEditingId) : null;
  return `
    ${foodFormFieldsHTML('db', editing)}
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
  renderNutTrends();
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
    const g = e.grams / 100;
    [['sodium', 'sod'], ['fiber', 'fib'], ['sugar', 'sug']].forEach(([col, key]) => {
      if (food[col] == null) acc[key + 'Miss'] = true;
      else { acc[key] += food[col] * g; acc[key + 'Has'] = true; }
    });
    return acc;
  }, { cal: 0, pro: 0, carb: 0, fat: 0,
       sod: 0, sodHas: false, sodMiss: false,
       fib: 0, fibHas: false, fibMiss: false,
       sug: 0, sugHas: false, sugMiss: false });

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

function microLineHTML(t) {
  const parts = [];
  const part = (label, val, unit, has, miss) => {
    if (!has) return;
    parts.push(`${label} ${Math.round(val)}${unit}${miss ? ' <span class="micro-incomplete" title="Some logged foods are missing this value">incomplete</span>' : ''}`);
  };
  part('Fiber',  t.fib, ' g',  t.fibHas, t.fibMiss);
  part('Sugar',  t.sug, ' g',  t.sugHas, t.sugMiss);
  part('Sodium', t.sod, ' mg', t.sodHas, t.sodMiss);
  if (parts.length === 0) return '';
  return `<div class="micro-line">${parts.join(' · ')}</div>`;
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
      ${microLineHTML(totals)}
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
    : `<div class="log-actions">
         <button class="add-trigger log-add" data-action="nut-open-add">+ Add food</button>
         <button class="add-trigger log-add log-copy" data-action="nut-copy-yesterday">Copy yesterday</button>
       </div>
       ${logCopyMsg ? `<div class="log-copy-msg">${esc(logCopyMsg)}</div>` : ''}`;

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

function recentStripHTML() {
  if (foodSearchQuery.trim()) return '';
  const recents = recentFoodsFor(nutMember, 8);
  if (recents.length === 0) return '';
  return `
    <div class="serving-label">Recent</div>
    <div class="recent-strip">
      ${recents.map(f => `
        <button class="recent-chip" data-action="nut-pick-food" data-food-id="${f.id}">
          ${iconSvg(f.icon)}${esc(f.name)}
        </button>`).join('')}
    </div>`;
}

function foodAddPanelHTML() {
  if (foodFormMode) return foodFormHTML();
  if (pendingLogFoodId) return logFormHTML();
  return `
    <div class="food-add-panel">
      <input class="add-input" id="foodSearch" placeholder="Search foods" value="${esc(foodSearchQuery)}"/>
      ${recentStripHTML()}
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
  // A just-created food may not have arrived over realtime yet; hold
  // the pending state and the next render opens the log form.
  if (!food) return `<div class="food-add-panel"><div class="food-row-stats">Adding food…</div></div>`;
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
  return `
    <div class="food-add-panel">
      ${foodFormFieldsHTML('nf', editing)}
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
  const r = buildFoodPayload('nf', foodFormMode === 'edit' ? editingFoodId : null);
  if (r.error) {
    showFormError('nfError', r.error);
    return;
  }
  if (r.mode === 'create') pendingLogFoodId = r.id;
  foodFormMode = null;
  editingFoodId = null;
  renderNutritionBody();
  await commitFood(r);
}

async function logFood() {
  const qty = parseFloat(document.getElementById('logQty')?.value);
  const unit = document.getElementById('logUnit')?.value;
  if (!qty || qty <= 0) {
    showFormError('logError', 'Enter an amount greater than zero.');
    return;
  }
  if (qty === 69 || qty === 420) showToast('nice.');
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

async function copyYesterday() {
  if (!nutMember) return;
  const prev = prevDateStr(nutDate);
  const entries = foodLog.filter(e => e.member_id === nutMember && e.log_date === prev);
  if (entries.length === 0) {
    logCopyMsg = 'Nothing logged the day before.';
    renderNutritionBody();
    return;
  }
  logCopyMsg = '';
  renderNutritionBody();
  await db.from('food_log').insert(entries.map(e => ({
    member_id: nutMember,
    log_date:  nutDate,
    log_time:  e.log_time,
    food_id:   e.food_id,
    grams:     e.grams,
  })));
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
  const r = buildFoodPayload('db', dbFormMode === 'edit' ? dbEditingId : null);
  if (r.error) {
    showFormError('dbError', r.error);
    return;
  }
  dbFormMode = null;
  dbEditingId = null;
  renderFoodDb();
  await commitFood(r);
}

function dbImportHTML() {
  return `
    <div class="log-food-header">
      <div class="food-result-name">Import foods</div>
      <div class="food-row-stats">One food per line, fields separated by tabs (paste straight from a spreadsheet)</div>
    </div>
    <div class="import-hint">Columns in order: Name, Serving label, Serving grams, Calories, Protein, Carbs, Fat, Brand (optional), Icon (optional), Sodium mg, Fiber g, Sugar g (all optional). Nutrition values are per serving. No header row. Icons: ${FOOD_ICONS.map(i => i.key).join(', ')}.</div>
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
    if (p.length < 7 || p.length > 12) {
      errors.push(`Line ${idx + 1}: expected 7 to 12 tab separated fields, got ${p.length}.`);
      return;
    }
    const [name, label, gramsRaw, calRaw, proRaw, carbRaw, fatRaw, brand, icon, sodRaw, fibRaw, sugRaw] = p;
    const grams = parseFloat(gramsRaw);
    const cal = parseFloat(calRaw), pro = parseFloat(proRaw), carb = parseFloat(carbRaw), fat = parseFloat(fatRaw);
    if (!name || !label) { errors.push(`Line ${idx + 1}: missing name or serving label.`); return; }
    if (!(grams > 0)) { errors.push(`Line ${idx + 1}: serving grams must be a positive number.`); return; }
    if ([cal, pro, carb, fat].some(n => isNaN(n) || n < 0)) { errors.push(`Line ${idx + 1}: nutrition values must be numbers, zero or more.`); return; }
    if (icon && !iconKeys.has(icon)) { errors.push(`Line ${idx + 1}: unknown icon "${icon}".`); return; }
    const opt = v => (v == null || v === '') ? null : parseFloat(v);
    const sod = opt(sodRaw), fib = opt(fibRaw), sug = opt(sugRaw);
    if ([sod, fib, sug].some(n => n !== null && (isNaN(n) || n < 0))) {
      errors.push(`Line ${idx + 1}: sodium, fiber, and sugar must be numbers, zero or more.`);
      return;
    }
    rows.push({ name, label, grams, cal, pro, carb, fat, brand: brand || null, icon: icon || null, sod, fib, sug });
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
      sodium: r.sod === null ? null : round2(r.sod * k),
      fiber:  r.fib === null ? null : round2(r.fib * k),
      sugar:  r.sug === null ? null : round2(r.sug * k),
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
  if (action === 'attach-pick')         document.getElementById('attachInput')?.click();
  if (action === 'attach-clear')        clearAttachment();
  if (action === 'delete-comment')      deleteComment(commentId);

  if (action === 'nut-prev-day')        { shiftNutDate(-1); resetNutPanels(); logCopyMsg = ''; renderNutritionBody(); }
  if (action === 'nut-next-day')        { shiftNutDate(1);  resetNutPanels(); logCopyMsg = ''; renderNutritionBody(); }
  if (action === 'nut-open-add')        { resetNutPanels(); addFoodOpen = true; logCopyMsg = ''; renderNutritionBody(); focusFoodSearch(); }
  if (action === 'nut-copy-yesterday')  copyYesterday();
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
  renderRecordsOptIn(); renderStrengthList(); renderStrengthAddArea();
});

document.getElementById('panel-strength').addEventListener('change', e => {
  if (e.target.id === 'recordsOptIn' && currentStrengthMember) {
    const m = members.find(x => x.id === currentStrengthMember);
    m.records_opt_in = e.target.checked;
    db.from('members').update({ records_opt_in: e.target.checked }).eq('id', currentStrengthMember);
    renderClubRecords();
  }
});

document.getElementById('panel-leaderboard').addEventListener('change', e => {
  if (e.target.id === 'htPicker1') { htMember1 = e.target.value || null; renderHeadToHead(); }
  if (e.target.id === 'htPicker2') { htMember2 = e.target.value || null; renderHeadToHead(); }
});

document.getElementById('panel-trash').addEventListener('change', e => {
  if (e.target.id === 'trashPoster') trashTalkPoster = e.target.value || null;
  if (e.target.id === 'attachInput') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showFormError('trashError', 'Images only (png, jpg, gif, webp).');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showFormError('trashError', 'Image is over the 5 MB limit.');
      e.target.value = '';
      return;
    }
    showFormError('trashError', '');
    pendingAttachment = file;
    document.getElementById('attachName').textContent = file.name;
    document.getElementById('attachClear').style.display = '';
  }
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

const THEMES = [
  { key: 'paper',    label: 'Paper',    attr: null },
  { key: 'midnight', label: 'Midnight', attr: 'dark' },
  { key: 'wii',      label: 'Wii',      attr: 'wii' },
  { key: 'dmg',      label: 'Game Boy', attr: 'dmg' },
  { key: 'terminal', label: 'Terminal', attr: 'terminal', locked: 'wc-terminal-unlocked' },
  { key: 'sakura',   label: 'Sakura',   attr: 'sakura',   locked: 'wc-sakura-unlocked' },
];

function themeUnlocked(t) {
  return !t.locked || localStorage.getItem(t.locked) === '1';
}

function terminalUnlocked() {
  return localStorage.getItem('wc-terminal-unlocked') === '1';
}

function applyTheme(key) {
  let t = THEMES.find(x => x.key === key) || THEMES[0];
  if (!themeUnlocked(t)) t = THEMES[0];
  const wasDark = document.documentElement.dataset.theme === 'dark';
  const wasSakura = isSakura();
  if (t.attr) document.documentElement.dataset.theme = t.attr;
  else delete document.documentElement.dataset.theme;
  if (t.attr === 'dark' && !wasDark) {
    document.documentElement.classList.add('neon-on');
    setTimeout(() => document.documentElement.classList.remove('neon-on'), 950);
  }
  // Workout emojis are theme-dependent, so entering or leaving Sakura
  // needs a re-render
  if (isSakura() !== wasSakura) render();
  syncPetals();
  const sel = document.getElementById('themePicker');
  if (sel) sel.value = t.key;
}

function syncPetals() {
  const existing = document.getElementById('petals');
  if (isSakura() && !existing) {
    const el = document.createElement('div');
    el.id = 'petals';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = Array.from({ length: 12 }, () => '<span class="petal"></span>').join('');
    document.body.appendChild(el);
  } else if (!isSakura() && existing) {
    existing.remove();
  }
}

function populateThemePicker() {
  const sel = document.getElementById('themePicker');
  sel.innerHTML = THEMES
    .filter(themeUnlocked)
    .map(t => `<option value="${t.key}">${t.label}</option>`).join('');
}

// Legacy values from the old two-state toggle
const legacyThemeMap = { light: 'paper', dark: 'midnight' };
const savedThemeRaw = localStorage.getItem('wc-theme');
const savedTheme = legacyThemeMap[savedThemeRaw] || savedThemeRaw;
const startTheme = savedTheme && THEMES.some(t => t.key === savedTheme)
  ? savedTheme
  : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'midnight' : 'paper');
populateThemePicker();
applyTheme(startTheme);

document.getElementById('themePicker').addEventListener('change', e => {
  applyTheme(e.target.value);
  localStorage.setItem('wc-theme', e.target.value);
});

// ─────────────────────────────────────────────
// Toasts
// ─────────────────────────────────────────────

function showToast(text, big) {
  const el = document.createElement('div');
  el.className = 'wc-toast' + (big ? ' wc-toast-big' : '');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ─────────────────────────────────────────────
// Konami code: unlocks the Terminal theme
// ─────────────────────────────────────────────

const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiPos = 0;

document.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === KONAMI[konamiPos]) konamiPos++;
  else konamiPos = (k === KONAMI[0]) ? 1 : 0;
  if (konamiPos === KONAMI.length) {
    konamiPos = 0;
    unlockTerminal();
  }
});

// Mobile unlock: ten quick taps on the title
let titleTaps = 0;
let titleTapTimer = null;
document.querySelector('#sidenav h1').addEventListener('click', () => {
  titleTaps++;
  clearTimeout(titleTapTimer);
  titleTapTimer = setTimeout(() => { titleTaps = 0; }, 2500);
  if (titleTaps >= 10) { titleTaps = 0; unlockTerminal(); }
});

const MEOW = ['m', 'e', 'o', 'w'];
let meowPos = 0;

document.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  if (e.key.length !== 1) return;
  const k = e.key.toLowerCase();
  if (k === MEOW[meowPos]) meowPos++;
  else meowPos = (k === MEOW[0]) ? 1 : 0;
  if (meowPos === MEOW.length) {
    meowPos = 0;
    unlockSakura();
  }
});

let weekTaps = 0;
let weekTapTimer = null;
document.getElementById('weekLabel').addEventListener('click', () => {
  weekTaps++;
  clearTimeout(weekTapTimer);
  weekTapTimer = setTimeout(() => { weekTaps = 0; }, 2500);
  if (weekTaps >= 10) { weekTaps = 0; unlockSakura(); }
});

function unlockSakura() {
  const first = localStorage.getItem('wc-sakura-unlocked') !== '1';
  localStorage.setItem('wc-sakura-unlocked', '1');
  populateThemePicker();
  applyTheme('sakura');
  localStorage.setItem('wc-theme', 'sakura');
  document.documentElement.classList.add('bloom-on');
  setTimeout(() => document.documentElement.classList.remove('bloom-on'), 950);
  showToast(first ? 'SAKURA UNLOCKED (=^\uFF65\u03C9\uFF65^=)' : '(=^\uFF65\u03C9\uFF65^=)', true);
}

function unlockTerminal() {
  const first = !terminalUnlocked();
  localStorage.setItem('wc-terminal-unlocked', '1');
  populateThemePicker();
  applyTheme('terminal');
  localStorage.setItem('wc-theme', 'terminal');
  document.documentElement.classList.add('crt-flicker');
  setTimeout(() => document.documentElement.classList.remove('crt-flicker'), 700);
  showToast(first ? 'TERMINAL UNLOCKED' : 'TERMINAL', true);
}

// ─────────────────────────────────────────────
// Idle screensaver: DVD bounce and CRT stat cycle, alternating
// per idle session. Any input dismisses it.
// ─────────────────────────────────────────────

const SAVER_DELAY = 180000;
let saverTimer = null;
let saverActive = false;
let saverRAF = null;
let saverInterval = null;

function resetSaverTimer() {
  if (saverActive) dismissSaver();
  clearTimeout(saverTimer);
  saverTimer = setTimeout(startSaver, SAVER_DELAY);
}

['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev =>
  document.addEventListener(ev, resetSaverTimer, { passive: true })
);

function startSaver() {
  if (document.getElementById('jumpscare-overlay')) { resetSaverTimer(); return; }
  saverActive = true;
  const mode = localStorage.getItem('wc-saver-mode') === 'dvd' ? 'crt' : 'dvd';
  localStorage.setItem('wc-saver-mode', mode);
  const ov = document.createElement('div');
  ov.id = 'screensaver';
  ov.className = 'saver saver-' + mode;
  document.body.appendChild(ov);
  if (mode === 'dvd') startDvdSaver(ov);
  else startCrtSaver(ov);
}

function dismissSaver() {
  const ov = document.getElementById('screensaver');
  if (ov) ov.remove();
  if (saverRAF) cancelAnimationFrame(saverRAF);
  if (saverInterval) clearInterval(saverInterval);
  saverRAF = null;
  saverInterval = null;
  saverActive = false;
}

function startDvdSaver(ov) {
  const cw = getMonday();
  const counts = members
    .map(m => ({ m, count: workouts.filter(w => w.member_id === m.id && w.week_start === cw).length }))
    .filter(x => x.count > 0);
  let sub = '';
  if (counts.length > 0) {
    const max = Math.max(...counts.map(x => x.count));
    const names = counts.filter(x => x.count === max).map(x => x.m.name).join(', ');
    sub = `Leader: ${names}`;
  }
  ov.innerHTML = `
    <div class="dvd">
      <div class="dvd-title">WORKOUT CLUB</div>
      ${sub ? `<div class="dvd-sub">${esc(sub)}</div>` : ''}
    </div>`;
  const box = ov.firstElementChild;
  const colors = ['#ffb000', '#33ff66', '#54c2ef', '#ff5f8f', '#c084fc', '#f4f4f2'];
  let x = 40, y = 40, dx = 2.2, dy = 1.7, ci = 0;
  const step = () => {
    const W = ov.clientWidth, H = ov.clientHeight;
    const bw = box.offsetWidth, bh = box.offsetHeight;
    x += dx; y += dy;
    let hit = false;
    if (x <= 0 || x + bw >= W) { dx = -dx; hit = true; x = Math.max(0, Math.min(x, W - bw)); }
    if (y <= 0 || y + bh >= H) { dy = -dy; hit = true; y = Math.max(0, Math.min(y, H - bh)); }
    if (hit) { ci = (ci + 1) % colors.length; box.style.color = colors[ci]; }
    box.style.transform = `translate(${x}px, ${y}px)`;
    saverRAF = requestAnimationFrame(step);
  };
  saverRAF = requestAnimationFrame(step);
}

function buildSaverSlides() {
  const cw = getMonday();
  const slides = [];
  const hit = members.filter(m =>
    workouts.filter(w => w.member_id === m.id && w.week_start === cw).length >= 3
  ).length;
  if (members.length > 0) slides.push(`${hit}/${members.length} hit goal this week`);

  const counts = members
    .map(m => ({ m, count: workouts.filter(w => w.member_id === m.id && w.week_start === cw).length }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count);
  if (counts.length > 0) slides.push(`Leading this week: ${esc(counts[0].m.name)} (${counts[0].count})`);

  const streaks = members
    .map(m => ({ m, s: calcStreak(m.id, workouts) }))
    .sort((a, b) => b.s - a.s);
  if (streaks.length > 0 && streaks[0].s > 0) slides.push(`Longest streak: ${esc(streaks[0].m.name)}, ${streaks[0].s} weeks`);

  const inMembers = members.filter(m => m.records_opt_in);
  DEFAULT_LIFTS.forEach(name => {
    let best = 0, holder = null;
    inMembers.forEach(m => {
      const v = best1RM(m.id, name);
      if (v > best) { best = v; holder = m; }
    });
    if (holder) slides.push(`Club ${esc(name)}: ${Math.round(best)} lb, ${esc(holder.name)}`);
  });

  slides.push(`${workouts.length} sessions logged all time`);
  return slides;
}

function startCrtSaver(ov) {
  const slides = buildSaverSlides();
  let idx = 0;
  ov.innerHTML = `<div class="crt-frame"><div class="crt-slide" id="crtSlide"></div></div>`;
  const slideEl = ov.querySelector('#crtSlide');
  const show = () => {
    slideEl.classList.remove('crt-show');
    void slideEl.offsetWidth;
    slideEl.innerHTML = slides[idx % slides.length];
    slideEl.classList.add('crt-show');
    idx++;
  };
  show();
  saverInterval = setInterval(show, 5000);
}

resetSaverTimer();

// ─────────────────────────────────────────────
// BLOCKS: falling-tetromino game living in the Game Boy theme's
// right margin on wide screens. Logic is separated from canvas
// rendering so it stays testable.
// ─────────────────────────────────────────────

const GB_W = 10;
const GB_H = 18;
const GB_CELL = 16;
const GB_INK = '#2b3022';
const GB_MID = '#7a8163';
const GB_BG  = '#c2c8a5';

// Shapes as grids; four rotation states are derived at init
const GB_SHAPES = [
  ['....', 'XXXX', '....', '....'],           // I
  ['XX', 'XX'],                               // O
  ['.X.', 'XXX', '...'],                      // T
  ['.XX', 'XX.', '...'],                      // S
  ['XX.', '.XX', '...'],                      // Z
  ['X..', 'XXX', '...'],                      // J
  ['..X', 'XXX', '...'],                      // L
];

function gbRotateGrid(g) {
  const n = g.length;
  return g.map((row, y) => row.split('').map((_, x) => g[n - 1 - x][y]).join(''));
}

function gbCells(grid) {
  const out = [];
  grid.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch === 'X') out.push([x, y]); }));
  return out;
}

const GB_PIECES = GB_SHAPES.map(shape => {
  const rotations = [];
  let g = shape;
  for (let i = 0; i < 4; i++) { rotations.push(gbCells(g)); g = gbRotateGrid(g); }
  return rotations;
});

const gb = {
  board: null, piece: null, next: null,
  score: 0, lines: 0, level: 1,
  running: false, over: false, timer: null,
};

function gbNewBoard() { return Array.from({ length: GB_H }, () => Array(GB_W).fill(0)); }

function gbRandPiece() {
  return { type: Math.floor(Math.random() * GB_PIECES.length), rot: 0, x: 3, y: -1 };
}

function gbPieceCells(p, rot = p.rot, ox = p.x, oy = p.y) {
  return GB_PIECES[p.type][rot].map(([x, y]) => [x + ox, y + oy]);
}

function gbCollides(board, cells) {
  return cells.some(([x, y]) =>
    x < 0 || x >= GB_W || y >= GB_H || (y >= 0 && board[y][x] !== 0));
}

function gbMerge(board, cells) {
  cells.forEach(([x, y]) => { if (y >= 0) board[y][x] = 1; });
}

function gbClearLines(board) {
  let cleared = 0;
  for (let y = GB_H - 1; y >= 0; y--) {
    if (board[y].every(c => c !== 0)) {
      board.splice(y, 1);
      board.unshift(Array(GB_W).fill(0));
      cleared++;
      y++;
    }
  }
  return cleared;
}

const GB_LINE_SCORES = [0, 100, 300, 500, 800];

function gbDropMs() { return Math.max(90, 620 - (gb.level - 1) * 55); }

function gbSpawn() {
  gb.piece = gb.next || gbRandPiece();
  gb.next = gbRandPiece();
  if (gbCollides(gb.board, gbPieceCells(gb.piece))) gbGameOver();
}

function gbLock() {
  gbMerge(gb.board, gbPieceCells(gb.piece));
  const cleared = gbClearLines(gb.board);
  if (cleared > 0) {
    gb.score += GB_LINE_SCORES[cleared] * gb.level;
    gb.lines += cleared;
    const newLevel = Math.floor(gb.lines / 10) + 1;
    if (newLevel !== gb.level) { gb.level = newLevel; gbRestartTimer(); }
  }
  gbSpawn();
}

function gbTick() {
  if (!gb.running) return;
  // Switching away from the Game Boy theme ends the game
  if (document.documentElement.dataset.theme !== 'dmg') { gbGameOver(); return; }
  const moved = gbPieceCells(gb.piece, gb.piece.rot, gb.piece.x, gb.piece.y + 1);
  if (gbCollides(gb.board, moved)) gbLock();
  else gb.piece.y++;
  gbDraw();
}

function gbMove(dx) {
  const cells = gbPieceCells(gb.piece, gb.piece.rot, gb.piece.x + dx, gb.piece.y);
  if (!gbCollides(gb.board, cells)) { gb.piece.x += dx; gbDraw(); }
}

function gbRotate() {
  const rot = (gb.piece.rot + 1) % 4;
  // Try in place, then one-cell wall kicks
  for (const kick of [0, -1, 1, -2, 2]) {
    const cells = gbPieceCells(gb.piece, rot, gb.piece.x + kick, gb.piece.y);
    if (!gbCollides(gb.board, cells)) {
      gb.piece.rot = rot;
      gb.piece.x += kick;
      gbDraw();
      return;
    }
  }
}

function gbHardDrop() {
  while (!gbCollides(gb.board, gbPieceCells(gb.piece, gb.piece.rot, gb.piece.x, gb.piece.y + 1))) {
    gb.piece.y++;
    gb.score += 2;
  }
  gbLock();
  gbDraw();
}

function gbRestartTimer() {
  clearInterval(gb.timer);
  gb.timer = setInterval(gbTick, gbDropMs());
}

function gbStart() {
  gb.board = gbNewBoard();
  gb.score = 0; gb.lines = 0; gb.level = 1;
  gb.over = false; gb.running = true;
  gb.next = null;
  gbSpawn();
  gbRestartTimer();
  document.getElementById('gbOver').style.display = 'none';
  document.getElementById('gbHint').style.display = 'none';
  gbDraw();
}

function gbStop() {
  gb.running = false;
  clearInterval(gb.timer);
  gb.timer = null;
}

function gbGameOver() {
  gbStop();
  gb.over = true;
  const overEl = document.getElementById('gbOver');
  if (overEl && gb.score > 0) overEl.style.display = '';
  const hint = document.getElementById('gbHint');
  if (hint) { hint.textContent = 'CLICK TO RETRY'; hint.style.display = ''; }
}

function gbVisible() {
  return document.documentElement.dataset.theme === 'dmg' &&
    window.matchMedia('(min-width: 1500px)').matches;
}

function gbDraw() {
  const meta = { gbScore: gb.score, gbLines: gb.lines, gbLevel: gb.level };
  Object.entries(meta).forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  });
  const canvas = document.getElementById('gbCanvas');
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  ctx.fillStyle = GB_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cell = (x, y, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x * GB_CELL + 1, y * GB_CELL + 1, GB_CELL - 2, GB_CELL - 2);
  };
  gb.board?.forEach((row, y) => row.forEach((v, x) => { if (v) cell(x, y, GB_INK); }));
  if (gb.piece && gb.running) {
    gbPieceCells(gb.piece).forEach(([x, y]) => { if (y >= 0) cell(x, y, GB_INK); });
    // Next piece ghost in the top-right corner
    GB_PIECES[gb.next.type][0].forEach(([x, y]) => {
      ctx.fillStyle = GB_MID;
      ctx.fillRect((GB_W - 4 + x) * GB_CELL + 5, y * GB_CELL + 5, 6, 6);
    });
  }
}

async function gbLoadScores() {
  const el = document.getElementById('gbScores');
  if (!el) return;
  const { data } = await db.from('dmg_scores').select('*').order('score', { ascending: false }).limit(5);
  const rows = data || [];
  el.innerHTML = rows.length === 0
    ? '<div class="gb-score-row">NO SCORES YET</div>'
    : rows.map((r, i) => `<div class="gb-score-row"><span>${i + 1}. ${esc(r.initials)}</span><span>${r.score}</span></div>`).join('');
}

async function gbSubmitScore() {
  const input = document.getElementById('gbInitials');
  const initials = (input?.value || 'AAA').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'AAA';
  document.getElementById('gbOver').style.display = 'none';
  input.value = '';
  await db.from('dmg_scores').insert({ initials, score: gb.score, lines: gb.lines, ts: Date.now() });
  gbLoadScores();
}

document.getElementById('gbCanvas').addEventListener('click', () => {
  if (!gb.running) gbStart();
});
document.getElementById('gbSubmit').addEventListener('click', gbSubmitScore);

document.addEventListener('keydown', e => {
  if (!gb.running || !gbVisible()) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  const handled = {
    ArrowLeft:  () => gbMove(-1),
    ArrowRight: () => gbMove(1),
    ArrowDown:  () => { gb.score += 1; gbTick(); },
    ArrowUp:    gbRotate,
    ' ':        gbHardDrop,
  }[e.key];
  if (handled) { e.preventDefault(); handled(); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && gb.running) gbGameOver();
});

gbLoadScores();

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

loadData();
