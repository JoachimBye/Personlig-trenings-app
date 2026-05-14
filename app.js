// ============================================================
// TRENINGSAPP – hovedlogikk v2
// ============================================================

const state = {
  view: 'home',
  programs: [],
  currentProgram: null,
  exercises: [],
  currentExercise: null,
  sets: [],
  numpad: {
    active: 'reps',
    reps: '5',
    kg: '80',
    label: 'work',
  },
  timer: {
    seconds: 0,
    interval: null,
    active: false,
  },
  history: {
    weekOffset: 0,
  },
};

// ---------- Dato-utilities ----------
function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(timestamp) {
  if (!timestamp) return null;
  const ms = Date.now() - new Date(timestamp).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'i dag';
  if (days === 1) return 'i går';
  return `${days}d siden`;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('no-NO', {
    hour: '2-digit', minute: '2-digit',
  });
}

function formatWeekday(date) {
  return new Date(date).toLocaleDateString('no-NO', { weekday: 'long' });
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Navigasjon ----------
function navigate(viewName, payload = null) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('v-' + viewName).classList.add('active');
  state.view = viewName;
  closeLogModal();

  if (viewName === 'home')                     renderHome();
  else if (viewName === 'program'  && payload) renderProgram(payload);
  else if (viewName === 'exercise' && payload) renderExercise(payload);
  else if (viewName === 'history')             renderHistory();
}

// ---------- Tema ----------
function loadTheme() {
  const theme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

// ---------- HOME ----------
async function renderHome() {
  const listEl = document.getElementById('programs-list');
  try {
    const programs = await db.getPrograms();
    state.programs = programs;

    if (programs.length === 0) {
      listEl.innerHTML = `<div class="empty-state">
        <div class="title">Ingen programmer ennå</div>
        <div class="sub">Trykk på "+ Nytt program" nedenfor</div>
      </div>`;
    } else {
      // Ingen ●-ikon — navnene bærer siden alene
      listEl.innerHTML = programs.map(p => `
        <div class="list-row" data-program-id="${p.id}">
          <span class="list-row-title">${escapeHtml(p.name)}</span>
          <span class="list-row-meta">${p.exercise_count}</span>
          <span class="list-row-chev">›</span>
        </div>
      `).join('');

      listEl.querySelectorAll('.list-row').forEach(row => {
        row.addEventListener('click', () => {
          const id = parseInt(row.dataset.programId, 10);
          const program = programs.find(p => p.id === id);
          navigate('program', program);
        });
      });
    }
  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<div class="empty-state">
      <div class="title">Kunne ikke laste</div>
      <div class="sub">${escapeHtml(err.message)}</div>
    </div>`;
  }

  renderWeekGrid();
}

async function renderWeekGrid() {
  const gridEl = document.getElementById('week-grid');
  const weekStart = startOfWeek();

  try {
    const sets = await db.getWeekActivity(weekStart);
    const trainedDays = new Set();
    for (const s of sets) {
      const day = new Date(s.logged_at).getDay();
      const idx = day === 0 ? 6 : day - 1;
      trainedDays.add(idx);
    }

    const today = new Date();
    const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const labels = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

    gridEl.innerHTML = labels.map((label, i) => {
      const classes = ['week-day'];
      if (trainedDays.has(i)) classes.push('active');
      if (i === todayIdx)     classes.push('today');
      return `<div class="${classes.join(' ')}">
        <div class="week-day-dot"></div>
        <div class="week-day-label">${label}</div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('Uke-feil', err);
  }
}

// ---------- PROGRAM ----------
async function renderProgram(program) {
  state.currentProgram = program;
  document.getElementById('program-title').textContent = program.name;

  const listEl = document.getElementById('exercises-list');
  listEl.innerHTML = '<div class="loading">Laster…</div>';

  try {
    const exercises = await db.getExercises(program.id);
    state.exercises = exercises;

    if (exercises.length === 0) {
      listEl.innerHTML = `<div class="empty-state">
        <div class="title">Ingen øvelser</div>
        <div class="sub">Trykk "+ Legg til øvelse"</div>
      </div>`;
      return;
    }

    listEl.innerHTML = exercises.map(e => `
      <div class="list-row" data-exercise-id="${e.id}">
        <span class="list-row-title">${escapeHtml(e.name)}</span>
        <span class="list-row-meta">${e.last_logged_at ? daysAgo(e.last_logged_at) : 'aldri'}</span>
        <span class="list-row-chev">›</span>
      </div>
    `).join('');

    listEl.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.dataset.exerciseId, 10);
        const ex = exercises.find(e => e.id === id);
        navigate('exercise', ex);
      });
    });
  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<div class="empty-state">
      <div class="title">Feil</div>
      <div class="sub">${escapeHtml(err.message)}</div>
    </div>`;
  }
}

// ---------- EXERCISE ----------
async function renderExercise(exercise) {
  state.currentExercise = exercise;
  document.getElementById('exercise-title').textContent = exercise.name;

  const setsEl = document.getElementById('sets-area');
  setsEl.innerHTML = '<div class="loading">Laster…</div>';

  try {
    const sets = await db.getSets(exercise.id);
    state.sets = sets;

    if (sets.length === 0) {
      setsEl.innerHTML = `<div class="empty-state">
        <div class="title">Ingen sett ennå</div>
        <div class="sub">Trykk + for å logge ditt første sett</div>
      </div>`;
      return;
    }

    // Grupper per dag
    const groups = {};
    for (const s of sets) {
      const dayKey = new Date(s.logged_at).toDateString();
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(s);
    }

    let html = '';
    for (const dayKey of Object.keys(groups)) {
      const daySets = [...groups[dayKey]].reverse();
      html += `<div class="day-header">${capitalize(formatWeekday(dayKey))}</div>`;
      html += '<div class="card-list">';
      daySets.forEach((s, i) => {
        const w = parseFloat(s.weight_kg);
        const wDisplay = w % 1 === 0 ? w.toFixed(0) : w.toFixed(1);
        html += `
          <div class="set-row" data-set-id="${s.id}">
            <span class="set-num">${i + 1}</span>
            <span class="set-time">${formatTime(s.logged_at)}</span>
            ${s.is_warmup
              ? '<span class="set-warmup">W</span>'
              : '<span class="set-spacer"></span>'}
            <span class="set-reps">${s.reps}<span class="set-reps-unit">rep</span></span>
            <span class="set-kg">${wDisplay}<span class="set-kg-unit">kg</span></span>
          </div>`;
      });
      html += '</div>';
    }
    setsEl.innerHTML = html;
  } catch (err) {
    console.error(err);
    setsEl.innerHTML = `<div class="empty-state">
      <div class="title">Feil</div>
      <div class="sub">${escapeHtml(err.message)}</div>
    </div>`;
  }
}

// ---------- LOG MODAL ----------
function openLogModal() {
  if (state.sets.length > 0) {
    const last = state.sets[0];
    state.numpad.reps = String(last.reps);
    const w = parseFloat(last.weight_kg);
    state.numpad.kg = w % 1 === 0 ? w.toFixed(0) : String(w);
  }
  state.numpad.active = 'reps';
  state.numpad.label = 'work';
  renderNumpad();
  document.getElementById('log-modal').hidden = false;
}

function closeLogModal() {
  document.getElementById('log-modal').hidden = true;
}

function setActiveField(field) {
  state.numpad.active = field;
  renderNumpad();
}

function setLabel(label) {
  state.numpad.label = label;
  renderNumpad();
}

function pressKey(key) {
  const active = state.numpad.active;
  let current = state.numpad[active];

  if (key === 'del') {
    current = current.length > 1 ? current.slice(0, -1) : '0';
    if (current === '0.') current = '0';
  } else if (key === '.') {
    if (active !== 'kg') return;
    if (current.includes('.')) return;
    current += '.';
  } else {
    const limit = active === 'reps' ? 3 : 6;
    if (current === '0') current = key;
    else if (current.length < limit) current += key;
  }

  state.numpad[active] = current;
  renderNumpad();
}

function renderNumpad() {
  const isReps = state.numpad.active === 'reps';
  const fieldReps = document.getElementById('field-reps');
  const fieldKg   = document.getElementById('field-kg');

  fieldReps.classList.toggle('active', isReps);
  fieldKg.classList.toggle('active', !isReps);

  fieldReps.querySelector('.field-value').innerHTML =
    state.numpad.reps + (isReps  ? '<span class="cursor"></span>' : '');
  fieldKg.querySelector('.field-value').innerHTML =
    state.numpad.kg   + (!isReps ? '<span class="cursor"></span>' : '');

  const decimal = document.getElementById('key-decimal');
  decimal.disabled = isReps;

  document.querySelectorAll('.toggle').forEach(t => {
    t.classList.toggle('active', t.dataset.label === state.numpad.label);
  });
}

async function saveSet() {
  if (!state.currentExercise) return;

  const reps = parseInt(state.numpad.reps, 10);
  const kg   = parseFloat(state.numpad.kg);
  const isWarmup = state.numpad.label === 'warm';

  if (!reps || isNaN(kg)) { showToast('Sjekk verdiene'); return; }

  try {
    await db.addSet(state.currentExercise.id, reps, kg, isWarmup);
    closeLogModal();
    showToast('Sett lagret');
    await renderExercise(state.currentExercise);
    if (!isWarmup) startRestTimer();
  } catch (err) {
    showToast('Feil: ' + err.message);
  }
}

// ---------- HVILETIMER ----------
function startRestTimer() {
  stopRestTimer();
  state.timer.seconds = REST_SECONDS;
  state.timer.active = true;
  document.getElementById('rest-bar').hidden = false;
  document.getElementById('add-set-btn').classList.add('resting');
  updateRestDisplay();
  state.timer.interval = setInterval(() => {
    state.timer.seconds--;
    updateRestDisplay();
    if (state.timer.seconds <= 0) {
      playBeep(); vibrate(); stopRestTimer();
    }
  }, 1000);
}

function stopRestTimer() {
  if (state.timer.interval) { clearInterval(state.timer.interval); state.timer.interval = null; }
  state.timer.active = false;
  document.getElementById('rest-bar').hidden = true;
  document.getElementById('add-set-btn').classList.remove('resting');
}

function updateRestDisplay() {
  const m = Math.floor(state.timer.seconds / 60);
  const s = state.timer.seconds % 60;
  document.getElementById('rest-time').textContent = `${m}:${String(s).padStart(2,'0')}`;
  const circumference = 2 * Math.PI * 17;
  const offset = circumference * (1 - state.timer.seconds / REST_SECONDS);
  document.getElementById('rest-ring-fg').style.strokeDashoffset = offset;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 800;
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    o.start(); o.stop(ctx.currentTime + 0.6);
  } catch (e) { console.warn('Lyd feilet', e); }
}

function vibrate() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// ---------- HISTORY ----------
async function renderHistory() {
  const offset = state.history.weekOffset;
  const weekStart = startOfWeek();
  weekStart.setDate(weekStart.getDate() + offset * 7);

  document.getElementById('week-label').textContent =
    `Uke ${getWeekNumber(weekStart)} · ${weekStart.getFullYear()}`;
  document.getElementById('week-next').disabled = offset >= 0;

  const contentEl = document.getElementById('history-content');
  contentEl.innerHTML = '<div class="loading">Laster…</div>';

  try {
    const sets = await db.getWeekActivity(weekStart);
    const days = {};
    for (const s of sets) {
      const k = new Date(s.logged_at).toDateString();
      if (!days[k]) days[k] = { date: new Date(s.logged_at), exercises: new Set(), programs: new Set() };
      days[k].exercises.add(s.exercise_id);
      if (s.exercises?.programs?.name) days[k].programs.add(s.exercises.programs.name);
    }

    const trainedIdx = new Set();
    for (const d of Object.values(days)) {
      const day = d.date.getDay();
      trainedIdx.add(day === 0 ? 6 : day - 1);
    }

    const labels = ['Man','Tir','Ons','Tor','Fre','Lør','Søn'];
    let html = `<div class="week-card" style="margin:0 16px 12px">
      <div class="week-header">
        <span>Uke ${getWeekNumber(weekStart)}</span>
        <span class="link" style="cursor:default">${trainedIdx.size} av 7 dager</span>
      </div>
      <div class="week-grid">${labels.map((l,i) => `
        <div class="week-day ${trainedIdx.has(i)?'active':''}">
          <div class="week-day-dot"></div>
          <div class="week-day-label">${l}</div>
        </div>`).join('')}
      </div>
    </div>`;

    const sortedDays = Object.values(days).sort((a,b) => a.date - b.date);
    if (sortedDays.length === 0) {
      html += `<div class="empty-state">
        <div class="title">Ingen trening denne uken</div>
      </div>`;
    } else {
      html += '<div class="card-list">';
      for (const d of sortedDays) {
        const programList = [...d.programs].join(', ') || 'Ukjent';
        html += `
          <div class="session-row">
            <div class="session-info">
              <div class="session-day">${capitalize(formatWeekday(d.date))}</div>
              <div class="session-meta">${escapeHtml(programList)} · ${d.exercises.size} øvelser</div>
            </div>
            <span class="session-check">✓</span>
          </div>`;
      }
      html += '</div>';
    }

    contentEl.innerHTML = html;
  } catch (err) {
    console.error(err);
    contentEl.innerHTML = `<div class="empty-state">
      <div class="title">Feil</div>
      <div class="sub">${escapeHtml(err.message)}</div>
    </div>`;
  }
}

function changeWeek(delta) {
  const next = state.history.weekOffset + delta;
  if (next > 0) return;
  state.history.weekOffset = next;
  renderHistory();
}

// ---------- Toast ----------
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ---------- Init ----------
function init() {
  loadTheme();

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('back-from-program').addEventListener('click', () => navigate('home'));
  document.getElementById('back-from-exercise').addEventListener('click', () => navigate('program', state.currentProgram));
  document.getElementById('back-from-history').addEventListener('click', () => navigate('home'));
  document.getElementById('history-link').addEventListener('click', () => { state.history.weekOffset = 0; navigate('history'); });
  document.getElementById('week-prev').addEventListener('click', () => changeWeek(-1));
  document.getElementById('week-next').addEventListener('click', () => changeWeek(1));
  document.getElementById('add-set-btn').addEventListener('click', openLogModal);

  document.querySelectorAll('.field').forEach(f =>
    f.addEventListener('click', () => setActiveField(f.dataset.field)));
  document.querySelectorAll('.toggle').forEach(t =>
    t.addEventListener('click', () => setLabel(t.dataset.label)));
  document.querySelectorAll('.key').forEach(k =>
    k.addEventListener('click', () => pressKey(k.dataset.key)));

  document.getElementById('cancel-set').addEventListener('click', closeLogModal);
  document.getElementById('save-set').addEventListener('click', saveSet);
  document.getElementById('rest-skip').addEventListener('click', stopRestTimer);

  document.getElementById('add-program-btn').addEventListener('click', async () => {
    const name = prompt('Navn på programmet:');
    if (!name?.trim()) return;
    try { await db.addProgram(name.trim()); renderHome(); }
    catch (err) { showToast('Feil: ' + err.message); }
  });

  document.getElementById('add-exercise-btn').addEventListener('click', async () => {
    if (!state.currentProgram) return;
    const name = prompt('Navn på øvelsen:');
    if (!name?.trim()) return;
    try { await db.addExercise(state.currentProgram.id, name.trim()); renderProgram(state.currentProgram); }
    catch (err) { showToast('Feil: ' + err.message); }
  });

  document.getElementById('delete-program-btn').addEventListener('click', async () => {
    if (!state.currentProgram) return;
    if (!confirm(`Slett "${state.currentProgram.name}" og alle øvelser/sett?`)) return;
    try { await db.deleteProgram(state.currentProgram.id); navigate('home'); }
    catch (err) { showToast('Feil: ' + err.message); }
  });

  document.getElementById('delete-exercise-btn').addEventListener('click', async () => {
    if (!state.currentExercise) return;
    if (!confirm(`Slett "${state.currentExercise.name}" og alle sett?`)) return;
    try { await db.deleteExercise(state.currentExercise.id); navigate('program', state.currentProgram); }
    catch (err) { showToast('Feil: ' + err.message); }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('log-modal').hidden) closeLogModal();
  });

  renderHome();
}

document.addEventListener('DOMContentLoaded', init);
