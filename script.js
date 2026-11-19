'use strict';

/* ===== Значения по умолчанию (в приложении их можно менять) ===== */
const LESSONS_COUNT   = 6;   // уроков в день
const LESSON_MIN      = 40;  // длина урока, мин
const BREAK_MIN       = 10;  // обычная перемена, мин
const BIG_BREAK_MIN   = 15;  // большая перемена, мин
const BIG_BREAK_AFTER = 3;   // после какого урока большая перемена
const LESSON_NAMES    = [];  // например ['Математика', 'Русский', ...]
const SWIPE_MIN_PX    = 60;

const TIMES = ['12:10', '12:20', '13:50', '13:10', '14:00', '14:50', '15:00', '11:30'];

const THEMES = [
  { id: 'mono',     name: 'Моно',           bg: '#0b0b0d', c: ['#f5f5f7', '#8e8e93'] },
  { id: 'neon',     name: 'Неон',           bg: '#07000f', c: ['#00f0ff', '#ff00e5'] },
  { id: 'redblue',  name: 'Красно-синяя',   bg: '#07070f', c: ['#ff3b4e', '#3b82ff'] },
  { id: 'ghoul',    name: 'Токийский гуль', bg: '#060101', c: ['#ff1f2d', '#8a0010'] },
  { id: 'takizawa', name: 'Такидзава',      bg: '#07040c', c: ['#b388ff', '#ff4d6d'] },
  { id: 'chrome',   name: 'Хром',           bg: '#0e1014', c: ['#cfd6e4', '#7e8aa3'] },
  { id: 'cyber',    name: 'Киберпанк',      bg: '#05090a', c: ['#fcee0a', '#00f0ff'] },
  { id: 'forest',   name: 'Лес',            bg: '#041009', c: ['#5be37d', '#1b9e77'] },
  { id: 'sunset',   name: 'Закат',          bg: '#14070c', c: ['#ff9a4d', '#ff3d77'] },
  { id: 'space',    name: 'Космос',         bg: '#04030f', c: ['#8f9bff', '#c26bff'] }
];

const K = {
  time: 'raspisanie.time', theme: 'raspisanie.theme', fx: 'raspisanie.fx',
  cfg: 'raspisanie.cfg', custom: 'raspisanie.custom'
};

const DEF = { lessons: LESSONS_COUNT, lesson: LESSON_MIN, brk: BREAK_MIN, big: BIG_BREAK_MIN, bigAfter: BIG_BREAK_AFTER };
const LIM = { lessons: [1, 10, 1], lesson: [20, 90, 5], brk: [0, 30, 1], big: [0, 45, 1], bigAfter: [1, 9, 1] };
const NAMES = {
  lessons: 'Уроков в день', lesson: 'Длина урока, мин', brk: 'Перемена, мин',
  big: 'Большая перемена, мин', bigAfter: 'Большая после урока №'
};

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const toMin = t => { const p = t.split(':'); return +p[0] * 60 + +p[1]; };
const fmt = m => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
const fmtDur = s => {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(x);
};
const lessonName = n => LESSON_NAMES[n - 1] || n + ' урок';

/* ===== Хранилище ===== */
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
const clean = v => (v == null ? null : String(v).replace(/"/g, ''));
function loadJson(k, fb) { try { const v = JSON.parse(ls.get(k)); return v == null ? fb : v; } catch (e) { return fb; } }

function loadCfg() {
  const s = loadJson(K.cfg, {}), o = {};
  Object.keys(DEF).forEach(k => {
    const v = Number(s && s[k]);
    o[k] = (s && s[k] != null && Number.isFinite(v)) ? Math.min(LIM[k][1], Math.max(LIM[k][0], Math.round(v))) : DEF[k];
  });
  return o;
}
function loadCustom() {
  const a = loadJson(K.custom, []);
  return Array.isArray(a) ? a.filter(t => /^\d{2}:\d{2}$/.test(t)) : [];
}

/* ===== Состояние ===== */
const state = { cfg: loadCfg(), custom: loadCustom(), time: TIMES[0], theme: 'mono', plan: [], fxPref: null };
const allTimes = () => TIMES.concat(state.custom.filter(t => !TIMES.includes(t)));

(function initState() {
  const t = clean(ls.get(K.time));
  if (t && /^\d{1,2}:\d{2}$/.test(t)) {
    const n = fmt(toMin(t));
    if (allTimes().includes(n)) state.time = n;
  }
  const th = clean(ls.get(K.theme));
  if (THEMES.some(x => x.id === th)) state.theme = th;
  const fx = clean(ls.get(K.fx));
  if (fx != null) state.fxPref = !(fx === 'off' || fx === '0' || fx === 'lite' || fx === 'false');
})();

/* ===== План дня ===== */
function buildPlan() {
  const c = state.cfg, out = [];
  let t = toMin(state.time);
  for (let i = 1; i <= c.lessons; i++) {
    out.push({ type: 'lesson', n: i, start: t, end: t + c.lesson });
    t += c.lesson;
    if (i < c.lessons) {
      const b = i === c.bigAfter ? c.big : c.brk;
      if (b > 0) { out.push({ type: 'break', n: i, start: t, end: t + b }); t += b; }
    }
  }
  state.plan = out;
}

/* ===== Рендер расписания ===== */
function renderSchedule() {
  const ol = $('scheduleList');
  ol.innerHTML = '';
  state.plan.forEach(s => {
    const li = document.createElement('li');
    li.className = 'row' + (s.type === 'break' ? ' row--break' : '');
    const a = document.createElement('span');
    a.className = 'row__name';
    a.textContent = s.type === 'lesson' ? lessonName(s.n) : 'Перемена · ' + (s.end - s.start) + ' мин';
    const b = document.createElement('span');
    b.className = 'row__time';
    b.textContent = fmt(s.start) + ' – ' + fmt(s.end);
    li.append(a, b);
    ol.appendChild(li);
  });
}

function render() {
  const now = new Date();
  const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const p = state.plan;
  const first = p[0].start * 60, last = p[p.length - 1].end * 60;
  let mode, label, count, cap, frac = 0, next = '', idx = -1;

  if (sec < first) {
    mode = 'before'; label = 'До уроков'; count = fmtDur(first - sec);
    cap = 'до начала 1 урока'; next = 'Первый урок в ' + fmt(p[0].start);
  } else if (sec >= last) {
    mode = 'after'; label = 'Всё'; count = '00:00';
    cap = 'Уроки закончились'; frac = 1; next = 'Хорошего вечера!';
  } else {
    idx = p.findIndex(s => sec >= s.start * 60 && sec < s.end * 60);
    const s = p[idx];
    mode = s.type;
    label = s.type === 'lesson' ? lessonName(s.n) : 'Перемена';
    count = fmtDur(s.end * 60 - sec);
    cap = s.type === 'lesson' ? 'до конца урока' : 'до конца перемены';
    frac = (sec - s.start * 60) / ((s.end - s.start) * 60);
    const n = p[idx + 1];
    next = !n ? 'Дальше: конец уроков в ' + fmt(s.end)
      : n.type === 'lesson' ? 'Дальше: ' + lessonName(n.n) + ' в ' + fmt(n.start)
      : 'Дальше: перемена ' + (n.end - n.start) + ' мин';
  }

  $('statusCard').dataset.mode = mode;
  $('statusLabel').textContent = label;
  $('clock').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
  $('countdown').textContent = count;
  $('caption').textContent = cap;
  $('progressFill').style.transform = 'scaleX(' + Math.min(1, Math.max(0, frac)).toFixed(4) + ')';
  $('nextText').textContent = next;

  const rows = $('scheduleList').children;
  for (let i = 0; i < rows.length; i++) {
    rows[i].classList.toggle('is-current', i === idx);
    rows[i].classList.toggle('is-done', mode === 'after' || (idx >= 0 && i < idx));
  }
}

/* ===== Кнопки времени ===== */
function renderChips() {
  const box = $('timeButtons');
  box.innerHTML = '';
  allTimes().forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (t === state.time ? ' is-active' : '');
    b.dataset.time = t;
    b.textContent = t;
    box.appendChild(b);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'chip chip--add';
  add.textContent = '+';
  add.setAttribute('aria-label', 'Добавить своё время');
  box.appendChild(add);
}

function selectTime(t) {
  state.time = t;
  ls.set(K.time, t);
  buildPlan(); renderChips(); renderSchedule(); render();
}

/* ===== Настройки: длительности ===== */
function renderSteppers() {
  const box = $('stepperList');
  box.innerHTML = '';
  Object.keys(LIM).forEach(k => {
    const row = document.createElement('div');
    row.className = 'step';
    row.innerHTML = '<span class="step__name"></span><div class="step__ctl">' +
      '<button type="button" data-k="' + k + '" data-d="-1" aria-label="Меньше">−</button><output></output>' +
      '<button type="button" data-k="' + k + '" data-d="1" aria-label="Больше">+</button></div>';
    row.querySelector('.step__name').textContent = NAMES[k];
    row.querySelector('output').textContent = state.cfg[k];
    box.appendChild(row);
  });
}

function saveCfg() {
  ls.set(K.cfg, JSON.stringify(state.cfg));
  buildPlan(); renderSteppers(); renderSchedule(); render();
}

/* ===== Настройки: свои времена ===== */
function renderCustom() {
  const ul = $('customList');
  ul.innerHTML = '';
  $('customEmpty').hidden = state.custom.length > 0;
  state.custom.forEach(t => {
    const li = document.createElement('li');
    li.className = 'row';
    const s = document.createElement('span');
    s.textContent = t;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mini'; b.dataset.del = t; b.textContent = 'Удалить';
    li.append(s, b);
    ul.appendChild(li);
  });
}

/* ===== Темы ===== */
function renderThemes() {
  const box = $('themes');
  box.innerHTML = '';
  THEMES.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme';
    b.dataset.id = t.id;
    const d = document.createElement('span');
    d.className = 'theme__dot';
    d.style.background = 'linear-gradient(135deg,' + t.c[0] + ',' + t.c[1] + ')';
    const n = document.createElement('span');
    n.textContent = t.name;
    b.append(d, n);
    box.appendChild(b);
  });
}

function applyTheme(id, save) {
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  state.theme = t.id;
  document.documentElement.dataset.theme = t.id;
  $('metaTheme').setAttribute('content', t.bg);
  if (save) ls.set(K.theme, t.id);
  document.querySelectorAll('.theme').forEach(b => b.classList.toggle('is-active', b.dataset.id === t.id));
}

/* ===== Лёгкий режим ===== */
function setLite(lite) {
  document.documentElement.classList.toggle('lite', lite);
  $('fxToggle').setAttribute('aria-checked', String(!lite));
}

function detectWeak() {
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce || (mem && mem <= 2) || (cores && cores <= 3);
}

function measureFps() {
  let n = 0;
  const t0 = performance.now();
  function f(t) {
    n++;
    if (t - t0 < 1500) requestAnimationFrame(f);
    else if (n * 1000 / (t - t0) < 35 && state.fxPref === null) setLite(true);
  }
  requestAnimationFrame(f);
}

/* ===== Искры для темы «гуль» ===== */
function buildEmbers() {
  const box = document.querySelector('.bg__embers');
  if (!box) return;
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('i');
    s.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
    s.style.setProperty('--d', (6 + Math.random() * 7).toFixed(1) + 's');
    s.style.setProperty('--w', (-Math.random() * 10).toFixed(1) + 's');
    s.style.setProperty('--s', (2 + Math.random() * 3).toFixed(1) + 'px');
    s.style.setProperty('--dx', (Math.random() * 60 - 30).toFixed(0) + 'px');
    box.appendChild(s);
  }
}

/* ===== Вкладки ===== */
function setTab(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  state.tab = name;
  window.scrollTo(0, 0);
}

/* ===== События ===== */
function bind() {
  $('timeButtons').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (b.classList.contains('chip--add')) {
      const f = $('addTimeForm');
      f.hidden = !f.hidden;
      if (!f.hidden) $('customTimeInput').focus();
    } else if (b.dataset.time) {
      selectTime(b.dataset.time);
    }
  });

  $('addTimeForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('customTimeInput').value;
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    if (!TIMES.includes(v) && !state.custom.includes(v)) {
      state.custom.push(v);
      ls.set(K.custom, JSON.stringify(state.custom));
      renderCustom();
    }
    $('customTimeInput').value = '';
    $('addTimeForm').hidden = true;
    selectTime(v);
  });

  $('customTimeCancel').addEventListener('click', () => {
    $('customTimeInput').value = '';
    $('addTimeForm').hidden = true;
  });

  $('customList').addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    state.custom = state.custom.filter(t => t !== b.dataset.del);
    ls.set(K.custom, JSON.stringify(state.custom));
    renderCustom();
    if (state.time === b.dataset.del) selectTime(TIMES[0]);
    else renderChips();
  });

  $('stepperList').addEventListener('click', e => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    const k = b.dataset.k, lim = LIM[k];
    state.cfg[k] = Math.min(lim[1], Math.max(lim[0], state.cfg[k] + (+b.dataset.d) * lim[2]));
    saveCfg();
  });

  $('resetCfg').addEventListener('click', () => {
    state.cfg = Object.assign({}, DEF);
    saveCfg();
  });

  $('themes').addEventListener('click', e => {
    const b = e.target.closest('.theme');
    if (b) applyTheme(b.dataset.id, true);
  });

  $('fxToggle').addEventListener('click', () => {
    const lite = !document.documentElement.classList.contains('lite');
    state.fxPref = !lite;
    ls.set(K.fx, lite ? 'off' : 'on');
    setLite(lite);
  });

  $('tabbar').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (b) setTab(b.dataset.tab);
  });

  let sx = 0, sy = 0, track = false;
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { track = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    track = !e.target.closest('input,textarea');
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!track) return;
    track = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setTab(dx < 0 ? 'settings' : 'schedule');
  }, { passive: true });

  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowRight') setTab('settings');
    if (e.key === 'ArrowLeft') setTab('schedule');
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
}

/* ===== Старт ===== */
function init() {
  buildPlan();
  renderChips(); renderSteppers(); renderCustom(); renderThemes(); renderSchedule();
  applyTheme(state.theme, false);
  buildEmbers();
  bind();

  setLite(state.fxPref === null ? !!detectWeak() : !state.fxPref);
  if (state.fxPref === null) measureFps();

  render();
  setInterval(render, 1000);
  setTab('schedule');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}

init();