'use strict';

/* ================================================================
   НАСТРОЙКИ ПО УМОЛЧАНИЮ (их можно менять и прямо в приложении)
   ================================================================ */
const START_TIMES     = ['12:10', '12:20', '13:50', '13:10', '14:00', '14:50', '15:00', '11:30'];
const LESSONS_COUNT   = 6;   // сколько уроков
const LESSON_MIN      = 40;  // длина урока, минут
const BREAK_MIN       = 10;  // обычная перемена, минут
const BIG_BREAK_MIN   = 15;  // большая перемена, минут
const BIG_BREAK_AFTER = 3;   // большая перемена после этого урока (0 = нет)
const LESSON_NAMES    = [];  // например ['Математика', 'Русский', ...]
const SWIPE_MIN_PX    = 60;  // насколько надо провести пальцем для свайпа

const KEYS = {
  time:   'raspisanie.time',
  theme:  'raspisanie.theme',
  fx:     'raspisanie.fx',
  cfg:    'raspisanie.cfg',
  custom: 'raspisanie.custom'
};

const DEFAULT_CFG = {
  lessons: LESSONS_COUNT,
  lessonMin: LESSON_MIN,
  breakMin: BREAK_MIN,
  bigBreakMin: BIG_BREAK_MIN,
  bigBreakAfter: BIG_BREAK_AFTER
};

const STEPPERS = [
  { key: 'lessons',       label: 'Количество уроков',    min: 1,  max: 10,  step: 1, unit: '' },
  { key: 'lessonMin',     label: 'Длина урока',          min: 10, max: 120, step: 5, unit: ' мин' },
  { key: 'breakMin',      label: 'Перемена',             min: 0,  max: 30,  step: 1, unit: ' мин' },
  { key: 'bigBreakMin',   label: 'Большая перемена',     min: 0,  max: 60,  step: 1, unit: ' мин' },
  { key: 'bigBreakAfter', label: 'Большая после урока',  min: 0,  max: 9,   step: 1, unit: '', zeroText: 'нет' }
];

const THEMES = [
  { id: 'mono',     name: 'Моно',            bg: '#0b0b0d', c: ['#ffffff', '#8e8e96'] },
  { id: 'neon',     name: 'Неон',            bg: '#07040f', c: ['#ff2bd6', '#19f0ff'] },
  { id: 'redblue',  name: 'Красно-синяя',    bg: '#080a14', c: ['#ff3b4a', '#3b82ff'] },
  { id: 'ghoul',    name: 'Токийский гуль',  bg: '#050203', c: ['#ff1f1f', '#2a0000'] },
  { id: 'takizawa', name: 'Такидзава',       bg: '#07040c', c: ['#b388ff', '#ff4d6d'] },
  { id: 'chrome',   name: 'Хром',            bg: '#0e1013', c: ['#d7e0ea', '#7f8c9a'] },
  { id: 'cyber',    name: 'Киберпанк',       bg: '#0a0a05', c: ['#fcee0a', '#00f0ff'] },
  { id: 'forest',   name: 'Лес',             bg: '#06100a', c: ['#5be37d', '#c8e66a'] },
  { id: 'sunset',   name: 'Закат',           bg: '#1a0b1f', c: ['#ff8a4c', '#ff4d8d'] },
  { id: 'space',    name: 'Космос',          bg: '#04030d', c: ['#8f8bff', '#5ee0ff'] }
];

const TABS = ['schedule', 'settings'];

/* ================================================================
   ВСПОМОГАТЕЛЬНОЕ
   ================================================================ */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');

function loadRaw(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function saveRaw(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) { return fallback; }
}
function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

function parseHM(s) {
  const p = s.split(':').map(Number);
  return p[0] * 3600 + p[1] * 60;
}
function fmtHM(sec) {
  sec = ((Math.round(sec) % 86400) + 86400) % 86400;
  return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor((sec % 3600) / 60));
}
function fmtCount(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function setText(el, text) { if (el.textContent !== text) el.textContent = text; }

/* ================================================================
   СОСТОЯНИЕ
   ================================================================ */
const state = {
  time: START_TIMES[0],
  theme: 'mono',
  tab: 'schedule',
  custom: [],
  cfg: Object.assign({}, DEFAULT_CFG)
};
let schedule = [];
let lastKey = '';

function sanitizeCfg(raw) {
  const out = Object.assign({}, DEFAULT_CFG);
  if (raw && typeof raw === 'object') {
    STEPPERS.forEach(s => {
      const v = Number(raw[s.key]);
      if (Number.isFinite(v)) out[s.key] = Math.min(s.max, Math.max(s.min, Math.round(v)));
    });
  }
  return out;
}

function allTimes() {
  return START_TIMES.concat(state.custom.filter(t => !START_TIMES.includes(t)));
}

/* ================================================================
   РАСПИСАНИЕ
   ================================================================ */
function lessonName(n) { return LESSON_NAMES[n - 1] || (n + ' урок'); }
function segName(seg) {
  if (seg.type === 'lesson') return lessonName(seg.n);
  return seg.big ? 'Большая перемена' : 'Перемена';
}

function buildSchedule() {
  const c = state.cfg;
  const out = [];
  let t = parseHM(state.time);
  for (let i = 1; i <= c.lessons; i++) {
    out.push({ type: 'lesson', n: i, start: t, end: t + c.lessonMin * 60 });
    t += c.lessonMin * 60;
    if (i < c.lessons) {
      const big = c.bigBreakAfter === i;
      const len = big ? c.bigBreakMin : c.breakMin;
      if (len > 0) {
        out.push({ type: 'break', n: i, big: big, start: t, end: t + len * 60 });
        t += len * 60;
      }
    }
  }
  return out;
}

function renderSchedule() {
  $('scheduleList').innerHTML = schedule.map((s, i) => {
    const dur = Math.round((s.end - s.start) / 60) + ' мин';
    return '<li class="row row--' + s.type + '" data-i="' + i + '">' +
      '<span class="row__time">' + fmtHM(s.start) + '–' + fmtHM(s.end) + '</span>' +
      '<span class="row__name">' + esc(segName(s)) + '</span>' +
      '<span class="row__dur">' + dur + '</span></li>';
  }).join('');
}

function rebuild() {
  schedule = buildSchedule();
  renderSchedule();
  lastKey = '';
  tick();
}

function tick() {
  if (!schedule.length) return;
  const d = new Date();
  const now = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
  setText($('clock'), pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()));

  const first = schedule[0];
  const last = schedule[schedule.length - 1];
  let mode, idx = -1;

  if (now < first.start) {
    mode = 'wait';
  } else if (now >= last.end) {
    mode = 'done';
  } else {
    idx = schedule.findIndex(s => now >= s.start && now < s.end);
    mode = idx >= 0 ? schedule[idx].type : 'wait';
  }

  let label, count, caption, next, progress = 0;

  if (mode === 'wait') {
    label = 'Скоро уроки';
    count = fmtCount(first.start - now);
    caption = 'до начала ' + lessonName(1);
    next = 'Дальше: ' + lessonName(1) + ' в ' + fmtHM(first.start);
  } else if (mode === 'done') {
    label = 'Уроки закончились';
    count = '00:00';
    caption = 'Можно отдыхать 🎉';
    next = 'Завтра начало в ' + fmtHM(first.start);
    progress = 1;
  } else {
    const seg = schedule[idx];
    const nxt = schedule[idx + 1];
    label = segName(seg);
    count = fmtCount(seg.end - now);
    caption = seg.type === 'lesson' ? 'до конца урока' : 'до конца перемены';
    next = nxt
      ? 'Дальше: ' + segName(nxt) + ' в ' + fmtHM(nxt.start)
      : 'Дальше: конец уроков в ' + fmtHM(seg.end);
    progress = (now - seg.start) / (seg.end - seg.start);
  }

  $('statusCard').dataset.state = mode;
  setText($('statusLabel'), label);
  setText($('countdown'), count);
  setText($('caption'), caption);
  setText($('nextText'), next);
  $('progressFill').style.transform = 'scaleX(' + Math.min(1, Math.max(0, progress)).toFixed(4) + ')';

  const key = mode + ':' + idx;
  if (key !== lastKey) {
    lastKey = key;
    const rows = $('scheduleList').children;
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('is-current', i === idx);
      rows[i].classList.toggle('is-past', mode === 'done' || (idx >= 0 && i < idx));
    }
  }
}

/* ================================================================
   ВРЕМЯ НАЧАЛА: КНОПКИ, «+», СВОИ ВРЕМЕНА
   ================================================================ */
function renderTimes() {
  $('timeButtons').innerHTML = allTimes().map(t =>
    '<button type="button" class="chip' + (t === state.time ? ' is-active' : '') + '" data-time="' + t + '">' + t + '</button>'
  ).join('') +
  '<button type="button" class="chip chip--add" id="addTimeBtn" aria-label="Добавить своё время">+</button>';
}

function renderCustom() {
  $('customEmpty').hidden = state.custom.length > 0;
  $('customList').innerHTML = state.custom.map(t =>
    '<li class="custom-item"><span>' + t + '</span>' +
    '<button type="button" class="x" data-del="' + t + '" aria-label="Удалить ' + t + '">×</button></li>'
  ).join('');
}

function setTime(t) {
  state.time = t;
  saveRaw(KEYS.time, t);
  renderTimes();
  rebuild();
}

/* ================================================================
   СЧЁТЧИКИ (длины уроков и перемен)
   ================================================================ */
function renderSteppers() {
  $('stepperList').innerHTML = STEPPERS.map(s =>
    '<div class="stepper"><span class="stepper__name">' + s.label + '</span>' +
    '<div class="stepper__ctl">' +
    '<button type="button" class="round" data-key="' + s.key + '" data-dir="-1" aria-label="Меньше">−</button>' +
    '<span class="stepper__val" id="val-' + s.key + '"></span>' +
    '<button type="button" class="round" data-key="' + s.key + '" data-dir="1" aria-label="Больше">+</button>' +
    '</div></div>'
  ).join('');
  updateSteppers();
}

function updateSteppers() {
  STEPPERS.forEach(s => {
    const v = state.cfg[s.key];
    $('val-' + s.key).textContent = (s.zeroText && v === 0) ? s.zeroText : v + s.unit;
  });
}

/* ================================================================
   ТЕМЫ
   ================================================================ */
function renderThemes() {
  $('themes').innerHTML = THEMES.map(t =>
    '<button type="button" class="theme" data-id="' + t.id + '">' +
    '<span class="theme__sw" style="background:linear-gradient(135deg,' + t.c[0] + ',' + t.c[1] + ')"></span>' +
    '<span>' + t.name + '</span></button>'
  ).join('');
}

function applyTheme(id) {
  const th = THEMES.find(t => t.id === id) || THEMES[0];
  state.theme = th.id;
  document.documentElement.dataset.theme = th.id;
  $('metaTheme').setAttribute('content', th.bg);
  const btns = $('themes').children;
  for (let i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('is-active', btns[i].dataset.id === th.id);
  }
  saveRaw(KEYS.theme, th.id);
}

/* ================================================================
   ЭФФЕКТЫ / ЛЕГКИЙ РЕЖИМ
   ================================================================ */
function setLite(lite, persist) {
  document.documentElement.classList.toggle('lite', lite);
  $('fxToggle').setAttribute('aria-checked', String(!lite));
  if (persist) saveRaw(KEYS.fx, lite ? 'off' : 'on');
}

function detectWeak() {
  const n = navigator;
  const lowMem = n.deviceMemory && n.deviceMemory <= 2;
  const lowCpu = n.hardwareConcurrency && n.hardwareConcurrency <= 2;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !!(lowMem || lowCpu || reduce);
}

function measureFps(cb) {
  let frames = 0;
  const t0 = performance.now();
  function f(t) {
    if (document.hidden) return;           // вкладка свёрнута — замер не считаем
    frames++;
    if (t - t0 < 1500) requestAnimationFrame(f);
    else cb(frames / ((t - t0) / 1000));
  }
  requestAnimationFrame(f);
}

function initFx() {
  const saved = loadRaw(KEYS.fx);
  if (saved === 'on' || saved === 'off') {
    setLite(saved === 'off', false);
    return;
  }
  setLite(detectWeak(), false);
  setTimeout(() => {
    measureFps(fps => {
      if (fps < 40 && !loadRaw(KEYS.fx)) setLite(true, false);
    });
  }, 800);
}

/* ================================================================
   ВКЛАДКИ И СВАЙП
   ================================================================ */
function setTab(name, animate) {
  const next = TABS.indexOf(name);
  if (next < 0) return;
  const prev = TABS.indexOf(state.tab);
  const cls = next > prev ? 'from-right' : 'from-left';

  TABS.forEach(t => {
    const v = $('view-' + t);
    v.classList.remove('is-active', 'from-right', 'from-left');
    if (t === name) {
      v.classList.add('is-active');
      if (animate && next !== prev) v.classList.add(cls);
    }
  });

  const btns = $('tabbar').querySelectorAll('.tab');
  btns.forEach(b => b.classList.toggle('is-active', b.dataset.tab === name));

  state.tab = name;
  window.scrollTo(0, 0);
}

function shiftTab(dir) {
  const i = TABS.indexOf(state.tab) + dir;
  if (i >= 0 && i < TABS.length) setTab(TABS[i], true);
}

/* ================================================================
   ОБРАБОТЧИКИ
   ================================================================ */
function bindEvents() {
  // кнопки времени и «+»
  $('timeButtons').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.time) {
      setTime(b.dataset.time);
    } else if (b.id === 'addTimeBtn') {
      const form = $('addTimeForm');
      form.hidden = !form.hidden;
      if (!form.hidden) $('customTimeInput').focus();
    }
  });

  $('addTimeForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('customTimeInput').value;
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    if (!allTimes().includes(v)) {
      state.custom.push(v);
      state.custom.sort((a, b) => parseHM(a) - parseHM(b));
      saveJSON(KEYS.custom, state.custom);
      renderCustom();
    }
    $('addTimeForm').hidden = true;
    $('customTimeInput').value = '';
    setTime(v);
  });

  $('customTimeCancel').addEventListener('click', () => {
    $('addTimeForm').hidden = true;
    $('customTimeInput').value = '';
  });

  // удаление своего времени
  $('customList').addEventListener('click', e => {
    const b = e.target.closest('button[data-del]');
    if (!b) return;
    const t = b.dataset.del;
    state.custom = state.custom.filter(x => x !== t);
    saveJSON(KEYS.custom, state.custom);
    renderCustom();
    if (state.time === t) setTime(START_TIMES[0]);
    else renderTimes();
  });

  // счётчики
  $('stepperList').addEventListener('click', e => {
    const b = e.target.closest('button[data-key]');
    if (!b) return;
    const s = STEPPERS.find(x => x.key === b.dataset.key);
    const v = state.cfg[s.key] + Number(b.dataset.dir) * s.step;
    state.cfg[s.key] = Math.min(s.max, Math.max(s.min, v));
    saveJSON(KEYS.cfg, state.cfg);
    updateSteppers();
    rebuild();
  });

  $('resetCfg').addEventListener('click', () => {
    state.cfg = Object.assign({}, DEFAULT_CFG);
    saveJSON(KEYS.cfg, state.cfg);
    updateSteppers();
    rebuild();
  });

  // темы
  $('themes').addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (b) applyTheme(b.dataset.id);
  });

  // эффекты
  $('fxToggle').addEventListener('click', () => {
    const isOn = $('fxToggle').getAttribute('aria-checked') === 'true';
    setLite(isOn, true);   // было включено -> включаем lite
  });

  // нижняя панель
  $('tabbar').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (b) setTab(b.dataset.tab, true);
  });

  // свайп пальцем
  let sx = 0, sy = 0, tracking = false;
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { tracking = false; return; }
    if (e.target.closest('input')) { tracking = false; return; }
    tracking = true;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      shiftTab(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  // стрелки на ПК
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input')) return;
    if (e.key === 'ArrowRight') shiftTab(1);
    if (e.key === 'ArrowLeft') shiftTab(-1);
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

/* ================================================================
   СТАРТ
   ================================================================ */
function init() {
  state.cfg = sanitizeCfg(loadJSON(KEYS.cfg, null));

  const c = loadJSON(KEYS.custom, []);
  state.custom = Array.isArray(c) ? c.filter(t => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t)) : [];

  const savedTime = loadRaw(KEYS.time);
  state.time = (savedTime && allTimes().includes(savedTime)) ? savedTime : START_TIMES[0];

  renderThemes();
  applyTheme(loadRaw(KEYS.theme) || 'mono');
  initFx();

  renderTimes();
  renderCustom();
  renderSteppers();
  bindEvents();
  rebuild();
  setTab('schedule', false);

  setInterval(tick, 1000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

init();