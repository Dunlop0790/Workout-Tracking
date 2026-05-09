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
let lifts          = [];
let liftEntries    = [];
let currentPeriod  = 'week';
let currentStrengthMember = null;
let confirmingId   = null;
let showingAddForm = false;
let showingLiftForm = false;
let loggingLiftId  = null;
let expandedLiftId = null;

// ─────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────

async function loadData() {
  const [{ data: m }, { data: w }, { data: l }, { data: le }] = await Promise.all([
    db.from('members').select('*').order('name'),
    db.from('workouts').select('*'),
    db.from('lifts').select('*'),
    db.from('lift_entries').select('*'),
  ]);
  members     = m  || [];
  workouts    = w  || [];
  lifts       = l  || [];
  liftEntries = le || [];

  // Default strength selection to first member alphabetically
  if (!currentStrengthMember && members.length > 0) {
    currentStrengthMember = members[0].id;
  }
  // If selected member was removed, fall back
  if (currentStrengthMember && !members.find(x => x.id === currentStrengthMember)) {
    currentStrengthMember = members[0]?.id || null;
  }
  render();
}

// Real-time: re-fetch whenever anything changes
db.channel('db-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'members' },      () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' },     () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lifts' },        () => loadData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lift_entries' }, () => loadData())
  .subscribe();

// ─────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────

function render() {
  renderHeader();
  renderTracker();
  renderLeaderboard();
  renderStrength();
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
  renderNudgeBanner(cw);
  document.getElementById('member-list').innerHTML = members.length === 0
    ? `<p class="empty-msg">No members yet.<br/>Add someone to get started.</p>`
    : members.map(m => memberRowHTML(m, cw)).join('');
  renderAddArea();
}

function renderNudgeBanner(cw) {
  const banner = document.getElementById('nudge-banner');
  if (!banner) return;

  const dayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday, ...
  // Show only Wed (3) onward, and on Sunday (0)
  const showDay = dayOfWeek === 0 || dayOfWeek >= 3;
  if (!showDay || members.length === 0) { banner.innerHTML = ''; return; }

  const behind = members.filter(m =>
    workouts.filter(w => w.member_id === m.id && w.week_start === cw).length < 3
  );

  if (behind.length === 0) { banner.innerHTML = ''; return; }

  // Different tone depending on day
  let prefix;
  if (dayOfWeek === 0)        prefix = 'Last day to hit goal';   // Sunday
  else if (dayOfWeek >= 5)    prefix = 'Running out of week';    // Fri/Sat
  else                        prefix = 'Behind on the goal';     // Wed/Thu

  const names = behind.map(m => esc(m.name)).join(', ');
  banner.innerHTML = `
    <div class="nudge">
      <span class="nudge-label">${prefix}:</span>
      <span class="nudge-names">${names}</span>
    </div>`;
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
        <div class="member-name">${done ? '&#10003; ' : ''}${esc(m.name)}</div>
        <div class="member-meta"><span class="member-sub">${count}/3 this week${done ? ' · goal met' : ''}${extraLabel}</span>${streakHtml}${coolHtml}</div>
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
// Strength helpers
// ─────────────────────────────────────────────

const DEFAULT_LIFTS = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press'];

function epley1RM(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

function roundTo5(n) {
  return Math.round(n / 5) * 5;
}

function entriesForMemberLift(memberId, liftName) {
  return liftEntries
    .filter(e => e.member_id === memberId && e.lift_name === liftName)
    .sort((a, b) => b.ts - a.ts);
}

function liftsForMember(memberId) {
  // Defaults always shown, plus any custom lifts owned by this member
  const customNames = lifts
    .filter(l => l.owner_member_id === memberId && !DEFAULT_LIFTS.includes(l.name))
    .map(l => l.name);
  return [...DEFAULT_LIFTS, ...customNames];
}

function formatDate(ts) {
  const d = new Date(Number(ts));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─────────────────────────────────────────────
// Strength render
// ─────────────────────────────────────────────

function renderStrength() {
  renderStrengthPicker();
  renderStrengthList();
  renderStrengthAddArea();
}

function renderStrengthPicker() {
  const sel = document.getElementById('strengthPicker');
  if (!sel) return;
  if (members.length === 0) {
    sel.innerHTML = `<option>No members yet</option>`;
    sel.disabled = true;
    return;
  }
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

  const memberLifts = liftsForMember(currentStrengthMember);
  list.innerHTML = memberLifts.map(name => liftCardHTML(name, currentStrengthMember)).join('');
}

function liftCardHTML(liftName, memberId) {
  const entries = entriesForMemberLift(memberId, liftName);
  const isCustom = !DEFAULT_LIFTS.includes(liftName);
  const expanded = expandedLiftId === liftName;
  const logging  = loggingLiftId === liftName;

  // Latest entry → current 1RM
  const latest = entries[0];
  const current1RM = latest ? epley1RM(latest.weight, latest.reps) : 0;

  // All-time PR → highest 1RM ever
  let prEntry = null;
  let pr1RM = 0;
  entries.forEach(e => {
    const oneRM = epley1RM(e.weight, e.reps);
    if (oneRM > pr1RM) { pr1RM = oneRM; prEntry = e; }
  });

  // Build percentage breakdown if we have a current 1RM
  let percentHTML = '';
  if (current1RM > 0) {
    const pcts = [60, 65, 70, 75, 80, 85, 90, 95];
    percentHTML = `
      <div class="pct-grid">
        ${pcts.map(p => `
          <div class="pct-cell">
            <div class="pct-label">${p}%</div>
            <div class="pct-val">${roundTo5(current1RM * (p/100))}</div>
          </div>`).join('')}
      </div>`;
  }

  // Stats row
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

  // Logging form
  const formHTML = logging
    ? `<div class="lift-log-form">
         <input type="number" inputmode="decimal" id="logWeight-${esc(liftName)}" class="lift-input" placeholder="Weight (lb)"/>
         <span class="lift-x">×</span>
         <input type="number" inputmode="numeric" id="logReps-${esc(liftName)}" class="lift-input lift-input-sm" placeholder="Reps"/>
         <button class="lift-save" data-action="save-lift" data-lift="${esc(liftName)}">Save</button>
         <button class="lift-cancel" data-action="cancel-lift">&#215;</button>
       </div>`
    : `<button class="lift-log-btn" data-action="start-log-lift" data-lift="${esc(liftName)}">+ Log a set</button>`;

  // History
  let historyHTML = '';
  if (expanded && entries.length > 0) {
    historyHTML = `
      <div class="lift-history">
        ${entries.slice(0, 8).map(e => `
          <div class="lift-history-row">
            <span class="lift-history-set">${e.weight}×${e.reps}</span>
            <span class="lift-history-1rm">${Math.round(epley1RM(e.weight, e.reps))} 1RM</span>
            <span class="lift-history-date">${formatDate(e.ts)}</span>
            <button class="lift-history-del" data-action="delete-lift-entry" data-entry-id="${e.id}" aria-label="Delete entry">&#215;</button>
          </div>`).join('')}
      </div>`;
  }

  const historyToggle = entries.length > 0
    ? `<button class="lift-history-toggle" data-action="toggle-lift-history" data-lift="${esc(liftName)}">
         ${expanded ? '▴ Hide history' : `▾ History (${entries.length})`}
       </button>`
    : '';

  const removeCustom = isCustom && memberId === currentStrengthMember
    ? `<button class="lift-remove" data-action="remove-custom-lift" data-lift="${esc(liftName)}" aria-label="Remove lift">&#215;</button>`
    : '';

  return `
    <div class="lift-card">
      <div class="lift-header">
        <div class="lift-name">${esc(liftName)}${isCustom ? '<span class="lift-custom-tag">custom</span>' : ''}</div>
        ${removeCustom}
      </div>
      <div class="lift-stats">
        ${currentBlock}
        ${prBlock}
      </div>
      ${percentHTML}
      ${formHTML}
      ${historyToggle}
      ${historyHTML}
    </div>`;
}

function renderStrengthAddArea() {
  const area = document.getElementById('strength-add-area');
  if (!area) return;
  if (!currentStrengthMember) { area.innerHTML = ''; return; }

  // Only let the viewer add custom lifts to their OWN profile.
  // For now, "viewer" === selected person (no auth in this app), so we always allow.
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
// Strength actions
// ─────────────────────────────────────────────

async function saveLiftEntry(liftName) {
  const wEl = document.getElementById(`logWeight-${liftName}`);
  const rEl = document.getElementById(`logReps-${liftName}`);
  const weight = parseFloat(wEl?.value);
  const reps   = parseInt(rEl?.value, 10);
  if (!weight || !reps || weight <= 0 || reps <= 0) return;

  loggingLiftId = null;
  await db.from('lift_entries').insert({
    member_id: currentStrengthMember,
    lift_name: liftName,
    weight,
    reps,
    ts: Date.now()
  });
}

async function deleteLiftEntry(entryId) {
  await db.from('lift_entries').delete().eq('id', entryId);
}

async function doAddCustomLift() {
  const input = document.getElementById('newLiftInput');
  const name = input?.value.trim();
  if (!name) return;
  // Prevent duplicates of defaults or existing customs
  const existing = liftsForMember(currentStrengthMember);
  if (existing.some(n => n.toLowerCase() === name.toLowerCase())) {
    showingLiftForm = false;
    renderStrengthAddArea();
    return;
  }
  showingLiftForm = false;
  renderStrengthAddArea();
  await db.from('lifts').insert({
    id: 'l' + Date.now(),
    owner_member_id: currentStrengthMember,
    name,
    is_default: false
  });
}

async function removeCustomLift(liftName) {
  // Find the lift row owned by this member
  const lift = lifts.find(l => l.owner_member_id === currentStrengthMember && l.name === liftName);
  if (!lift) return;
  // Also delete entries for it
  await db.from('lift_entries').delete().eq('member_id', currentStrengthMember).eq('lift_name', liftName);
  await db.from('lifts').delete().eq('id', lift.id);
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

  const audio = new Audio('jumpscare.mp3');

  const dismiss = () => {
    if (!document.getElementById('jumpscare-overlay')) return;
    overlay.remove();
    if (callback) callback();
  };

  audio.addEventListener('ended', dismiss);
  // Fallback: if audio fails or is very long, bail after 10s
  const fallback = setTimeout(dismiss, 10000);
  audio.addEventListener('ended', () => clearTimeout(fallback));

  audio.play().catch(dismiss); // if autoplay is blocked, skip straight to callback
}

// ─────────────────────────────────────────────
// Event delegation
// ─────────────────────────────────────────────

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, slot, lift, entryId } = btn.dataset;
  if (action === 'toggle')               toggleSlot(id, Number(slot));
  if (action === 'start-remove')         { triggerJumpscare(() => { confirmingId = id; renderTracker(); }); }
  if (action === 'cancel-remove')        { confirmingId = null; renderTracker(); }
  if (action === 'confirm-remove')       removeMember(id);
  if (action === 'show-add')             { showingAddForm = true; renderAddArea(); }
  if (action === 'cancel-add')           { showingAddForm = false; renderAddArea(); }
  if (action === 'submit-add')           doAddMember();

  // Strength actions
  if (action === 'start-log-lift')       { loggingLiftId = lift; renderStrengthList(); }
  if (action === 'cancel-lift')          { loggingLiftId = null; renderStrengthList(); }
  if (action === 'save-lift')            saveLiftEntry(lift);
  if (action === 'toggle-lift-history')  { expandedLiftId = expandedLiftId === lift ? null : lift; renderStrengthList(); }
  if (action === 'delete-lift-entry')    deleteLiftEntry(entryId);
  if (action === 'show-custom-lift')     { showingLiftForm = true; renderStrengthAddArea(); }
  if (action === 'cancel-custom-lift')   { showingLiftForm = false; renderStrengthAddArea(); }
  if (action === 'submit-custom-lift')   doAddCustomLift();
  if (action === 'remove-custom-lift')   removeCustomLift(lift);
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
  loggingLiftId = null;
  expandedLiftId = null;
  showingLiftForm = false;
  renderStrengthList();
  renderStrengthAddArea();
});

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

loadData();
