'use strict';

// ─────────────────────────────────────────────
// Guard — show setup screen if not configured
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

function calcStreak(memberId, workouts) {
  const cw = getMonday();
  const weekCounts = {};
  workouts.forEach(w => {
    if (w.member_id !== memberId) return;
    weekCounts[w.week_start] = (weekCounts[w.week_start] || 0) + 1;
  });

  let streak = 0;
  let cursor = new Date(cw + 'T12:00:00');

  while (true) {
    const key   = getMonday(cursor);
    const count = weekCounts[key] || 0;
    if (count >= 3)  { streak++; }
    else if (key === cw) { /* in-progress week, skip without breaking */ }
    else { break; }
    cursor.setDate(cursor.getDate() - 7);
    if (streak > 260) break;
  }
  return streak;
}

function calcSessionsInPeriod(memberId, workouts, period) {
  const rs = rangeStart(period);
  return workouts.filter(w => w.member_id === memberId && w.week_start >= rs).length;
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

let members        = [];
let workouts       = [];
let currentPeriod  = 'week';
let confirmingId   = null;
let showingAddForm = false;

// ─────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────

async function loadData() {
  const [{ data: m }, { data: w }] = await Promise.all([
    db.from('members').select('*').order('name'),
    db.from('workouts').select('*'),
  ]);
  members  = m || [];
  workouts = w || [];
  render();
}

// Real-time: re-fetch whenever anything changes
db.channel('db-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'members' },  () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' }, () => loadData())
  .subscribe();

// ─────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────

function render() {
  renderHeader();
  renderTracker();
  renderLeaderboard();
}

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

function renderTracker() {
  const cw = getMonday();
  document.getElementById('member-list').innerHTML = members.length === 0
    ? `<p class="empty-msg">No members yet.<br/>Add someone to get started.</p>`
    : members.map(m => memberRowHTML(m, cw)).join('');
  renderAddArea();
}

function memberRowHTML(m, cw) {
  const myWorkouts = workouts.filter(w => w.member_id === m.id && w.week_start === cw);
  const count      = myWorkouts.length;
  const done       = count >= 3;
  const streak     = calcStreak(m.id, workouts);
  const removing   = confirmingId === m.id;

  // Always show at least 3 slots; show extra slots for any logged beyond 3,
  // plus one empty slot so there's always a way to add another.
  const maxSlot    = Math.max(3, count + 1);
  const checksHtml = Array.from({ length: maxSlot }, (_, i) => {
    const slot    = i + 1;
    const checked = myWorkouts.some(w => w.slot === slot);
    const isExtra = slot > 3;
    return `<button class="check-btn ${checked ? 'checked' : ''} ${isExtra ? 'extra' : ''}"
              data-action="toggle" data-id="${m.id}" data-slot="${slot}"
              aria-label="Workout ${slot}"></button>`;
  }).join('');

  const extraLabel  = count > 3 ? ` · +${count - 3} extra` : '';
  const coolHtml    = count > 3 ? `<span class="cool-badge">&#8599; This guy is cool</span>` : '';
  const streakHtml  = streak >= 2 ? `<span class="streak-badge">${streak}w streak</span>` : '';

  const removeHtml = removing
    ? `<div class="confirm-wrap"><span>Remove?</span>
         <button class="confirm-yes" data-action="confirm-remove" data-id="${m.id}">Yes</button>
         <button class="confirm-no" data-action="cancel-remove">No</button>
       </div>`
    : `<button class="remove-btn" data-action="start-remove" data-id="${m.id}">&#215;</button>`;

  return `
    <div class="member-row ${done ? 'done' : ''}" data-member-id="${m.id}">
      <div class="member-info">
        <div class="member-name">${done ? '&#10003; ' : ''}${esc(m.name)}${coolHtml}</div>
        <div class="member-meta"><span class="member-sub">${count}/3 this week${done ? ' · goal met' : ''}${extraLabel}</span>${streakHtml}</div>
      </div>
      <div class="checks">${checksHtml}</div>
      ${removeHtml}
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

function renderLeaderboard() {
  const rows = [...members]
    .map(m => ({ ...m, count: calcSessionsInPeriod(m.id, workouts, currentPeriod), streak: calcStreak(m.id, workouts) }))
    .sort((a, b) => b.count - a.count || b.streak - a.streak);

  const el = document.getElementById('leaderboard-list');
  if (rows.length === 0) { el.innerHTML = `<p class="empty-msg">No members yet.</p>`; return; }

  const maxCount  = rows[0].count || 1;
  const rankClass = ['gold','silver','bronze'];

  el.innerHTML = rows.map((m, i) => `
    <div class="lb-row">
      <div class="lb-top">
        <span class="lb-rank ${rankClass[i]||''}">#${i+1}</span>
        <span class="lb-name">${esc(m.name)}</span>
        <div class="lb-right">
          <span class="lb-count">${m.count} <span class="lb-count-label">session${m.count!==1?'s':''}</span></span>
          ${m.streak>=2?`<div class="lb-streak">${m.streak}w streak</div>`:''}
        </div>
      </div>
      <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${Math.round((m.count/maxCount)*100)}%"></div></div>
    </div>`).join('');
}

// ─────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────

async function toggleSlot(memberId, slot) {
  const cw       = getMonday();
  const existing = workouts.find(w => w.member_id === memberId && w.week_start === cw && w.slot === slot);
  if (existing) {
    await db.from('workouts').delete().eq('id', existing.id);
  } else {
    await db.from('workouts').insert({ member_id: memberId, week_start: cw, slot, ts: Date.now() });
  }
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
  await db.from('members').delete().eq('id', id);
}

// ─────────────────────────────────────────────
// Event delegation
// ─────────────────────────────────────────────

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, slot } = btn.dataset;
  if (action === 'toggle')          toggleSlot(id, Number(slot));
  if (action === 'start-remove')    { confirmingId = id; renderTracker(); }
  if (action === 'cancel-remove')   { confirmingId = null; renderTracker(); }
  if (action === 'confirm-remove')  removeMember(id);
  if (action === 'show-add')        { showingAddForm = true; renderAddArea(); }
  if (action === 'cancel-add')      { showingAddForm = false; renderAddArea(); }
  if (action === 'submit-add')      doAddMember();
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

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

loadData();
