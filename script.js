'use strict';

/* =========================================================
   1. НАСТРОЙКИ — МЕНЯЙ ЧИСЛА ЗДЕСЬ
   ========================================================= */

// Варианты времени начала первого урока (порядок кнопок = порядок в списке)
const START_TIMES = ['12:10', '12:20', '13:50', '13:10', '14:00', '14:50', '15:00', '11:30'];

const LESSONS_COUNT   = 6;   // сколько уроков в день
const LESSON_MIN      = 40;  // длина урока, минут
const BREAK_MIN       = 10;  // обычная перемена, минут
const BIG_BREAK_MIN   = 15;  // большая перемена, минут
const BIG_BREAK_AFTER = 3;   // после какого урока большая перемена

// Названия предметов (необязательно). Пример: ['Математика', 'Русский', 'Физика', ...]
// Если оставить пустым, будут подписи «1 урок», «2 урок» и т.д.
const LESSON_NAMES = [];

const DEFAULT_TIME  = '12:10'; // что выбрано при первом запуске
const DEFAULT_THEME = 'mono';  // mono | neon | redblue | ghoul | chrome

// Порог «слабого устройства» для автоматического лёгкого режима
const LOW_CORES     = 4;   // ядер процессора столько или меньше → слабое
const LOW_MEMORY_GB = 2;   // памяти столько или меньше → слабое (знает только Chrome)
const MIN_FPS       = 40;  // если реальная частота кадров ниже → включаем лёгкий режим

// Ключи для сохранения в браузере
const KEY_TIME  = 'raspisanie.time';
const KEY_THEME = 'raspisanie.theme';
const KEY_FX    = 'raspisanie.fx';

// Темы: цвет для адресной строки телефона
const THEMES = {
  mono:    { color: '#0d0d0f' },
  neon:    { color: '#0d0120' },
  redblue: { color: '#11121f' },
  ghoul:   { color: '#040203' },
  chrome:  { color: '#aab2bd' }
};

/* =========================================================
   2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ========================================================= */

// Ищет элемент по id. Если не нашёл, пишет понятную ошибку в консоль
function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error('В index.html нет элемента с id="' + id + '"');
  return el;
}

const pad = (n) => String(n).padStart(2, '0');

// "12:10" → 730 (минут от полуночи)
function toMinutes(str) {
  const parts = str.split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

// 730 → "12:10"
function fmtTime(min) {
  return pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60);
}

// 125 секунд → "02:05"; больше часа → "1:02:05"
function fmtCountdown(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Безопасная работа с localStorage (в приватном режиме он может быть недоступен)
function load(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function save(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ничего страшного */ }
}

/* =========================================================
   3. ЭЛЕМЕНТЫ СТРАНИЦЫ (id должны совпадать с index.html)
   ========================================================= */
const root         = document.documentElement;
const metaTheme    = $('metaTheme');
const timeButtons  = $('timeButtons');
const statusCard   = $('statusCard');
const statusLabel  = $('statusLabel');
const clockEl      = $('clock');
const countdownEl  = $('countdown');
const captionEl    = $('caption');
const progressEl   = $('progress');
const progressFill = $('progressFill');
const nextText     = $('nextText');
const scheduleList = $('scheduleList');
const themesBox    = $('themes');
const fxToggle     = $('fxToggle');
const tabbar       = $('tabbar');

// Две вкладки: ключ = значение data-tab у кнопки в нижней панели
const views = {
  schedule: $('view-schedule'),
  settings: $('view-settings')
};

/* =========================================================
   4. РАСПИСАНИЕ
   ========================================================= */
let segments = [];       // список уроков и перемен с началом и концом
let currentTime = '';    // выбранное время старта
let lastIdx = -99;       // какой пункт сейчас подсвечен

function buildSchedule(startStr) {
  const result = [];
  let t = toMinutes(startStr);

  for (let i = 1; i <= LESSONS_COUNT; i++) {
    const name = LESSON_NAMES[i - 1];
    result.push({
      type: 'lesson',
      num: i,
      title: name ? i + '. ' + name : i + ' урок',
      start: t,
      end: t + LESSON_MIN
    });
    t += LESSON_MIN;

    if (i < LESSONS_COUNT) {
      const big = (i === BIG_BREAK_AFTER);
      const len = big ? BIG_BREAK_MIN : BREAK_MIN;
      result.push({
        type: 'break',
        big: big,
        title: big ? 'Большая перемена' : 'Перемена',
        start: t,
        end: t + len
      });
      t += len;
    }
  }
  return result;
}

function renderSchedule() {
  scheduleList.textContent = '';
  const frag = document.createDocumentFragment();

  segments.forEach(function (s, i) {
    const li = makeEl('li', 'item ' + (s.type === 'lesson' ? 'item--lesson' : 'item--break'));
    li.dataset.index = String(i);

    const time  = makeEl('span', 'item__time', fmtTime(s.start) + '–' + fmtTime(s.end));
    const title = makeEl('span', 'item__title', s.title);
    title.appendChild(makeEl('em', 'item__badge', 'сейчас'));
    const dur   = makeEl('span', 'item__dur', (s.end - s.start) + ' мин');

    li.append(time, title, dur);
    frag.appendChild(li);
  });

  scheduleList.appendChild(frag);
}

// Подсветка: текущий пункт и «прошедшие»
function highlight(idx) {
  if (idx === lastIdx) return;
  lastIdx = idx;
  const items = scheduleList.children;
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle('is-current', i === idx);
    items[i].classList.toggle('is-past', i < idx);
  }
}

/* =========================================================
   5. ТАЙМЕР (обновляется раз в секунду, меняет только текст)
   ========================================================= */
function tick() {
  if (!segments.length) return;

  const now = new Date();
  const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  clockEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

  const first = segments[0];
  const last  = segments[segments.length - 1];
  const startSec = first.start * 60;
  const endSec   = last.end * 60;

  let idx, state, label, caption, left, progress, next;

  if (sec < startSec) {
    idx = -1;
    state = 'before';
    label = 'Уроки ещё не начались';
    caption = 'до начала первого урока';
    left = startSec - sec;
    progress = 0;
    next = 'Дальше: ' + first.title + ' в ' + fmtTime(first.start);

  } else if (sec >= endSec) {
    idx = segments.length;
    state = 'after';
    label = 'Уроки закончились';
    caption = 'можно отдыхать';
    left = 0;
    progress = 1;
    next = 'Дальше: завтра в ' + fmtTime(first.start);

  } else {
    idx = segments.findIndex(function (s) {
      return sec >= s.start * 60 && sec < s.end * 60;
    });
    const cur = segments[idx];
    const curStart = cur.start * 60;
    const curEnd = cur.end * 60;
    const following = segments[idx + 1];

    state = cur.type;
    label = cur.type === 'lesson' ? 'Идёт ' + cur.title : cur.title;
    caption = cur.type === 'lesson' ? 'до конца урока' : 'до конца перемены';
    left = curEnd - sec;
    progress = (sec - curStart) / (curEnd - curStart);
    next = following
      ? 'Дальше: ' + following.title + ' в ' + fmtTime(following.start)
      : 'Дальше: конец уроков в ' + fmtTime(cur.end);
  }

  highlight(idx);

  statusCard.dataset.state = state;
  statusLabel.textContent = label;
  captionEl.textContent = caption;
  countdownEl.textContent = fmtCountdown(left);
  nextText.textContent = next;

  const percent = Math.round(progress * 1000) / 10;
  progressFill.style.width = percent + '%';
  progressEl.setAttribute('aria-valuenow', String(Math.round(percent)));
}

let timerId = null;
function loop() {
  tick();
  // Следующий тик точно на границе секунды, чтобы цифры не «прыгали»
  timerId = setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
}
function startTimer() { stopTimer(); loop(); }
function stopTimer()  { clearTimeout(timerId); timerId = null; }

// Вкладка браузера скрыта: останавливаем таймер и анимации, экономим батарею
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    stopTimer();
    root.classList.add('paused');
  } else {
    root.classList.remove('paused');
    startTimer();
  }
});

/* =========================================================
   6. КНОПКИ ВРЕМЕНИ
   ========================================================= */
function createTimeButtons() {
  const frag = document.createDocumentFragment();
  START_TIMES.forEach(function (t) {
    const b = makeEl('button', 'time-btn', t);
    b.type = 'button';
    b.dataset.time = t;
    b.setAttribute('aria-pressed', 'false');
    frag.appendChild(b);
  });
  timeButtons.appendChild(frag);

  timeButtons.addEventListener('click', function (e) {
    const btn = e.target.closest('.time-btn');
    if (btn) setStartTime(btn.dataset.time, true);
  });
}

function setStartTime(str, store) {
  if (START_TIMES.indexOf(str) === -1) str = START_TIMES[0];
  currentTime = str;
  segments = buildSchedule(str);
  lastIdx = -99;
  renderSchedule();

  const btns = timeButtons.children;
  for (let i = 0; i < btns.length; i++) {
    btns[i].setAttribute('aria-pressed', String(btns[i].dataset.time === str));
  }

  if (store) save(KEY_TIME, str);
  tick();
}

/* =========================================================
   7. ВКЛАДКИ (Расписание / Настройки)
   ========================================================= */
function setTab(name) {
  if (!views[name]) name = 'schedule';

  Object.keys(views).forEach(function (key) {
    views[key].hidden = (key !== name);
  });

  const btns = tabbar.querySelectorAll('.tab-btn');
  for (let i = 0; i < btns.length; i++) {
    btns[i].setAttribute('aria-selected', String(btns[i].dataset.tab === name));
  }

  window.scrollTo(0, 0);
}

tabbar.addEventListener('click', function (e) {
  const btn = e.target.closest('.tab-btn');
  if (btn) setTab(btn.dataset.tab);
});

/* =========================================================
   8. ТЕМЫ (кнопки лежат на вкладке «Настройки»)
   ========================================================= */
function setTheme(name, store) {
  if (!THEMES[name]) name = DEFAULT_THEME;
  root.setAttribute('data-theme', name);
  metaTheme.setAttribute('content', THEMES[name].color);

  const btns = themesBox.querySelectorAll('.theme-btn');
  for (let i = 0; i < btns.length; i++) {
    const active = btns[i].dataset.theme === name;
    btns[i].classList.toggle('is-active', active);
    btns[i].setAttribute('aria-pressed', String(active));
  }
  if (store) save(KEY_THEME, name);
}

themesBox.addEventListener('click', function (e) {
  const btn = e.target.closest('.theme-btn');
  if (btn) setTheme(btn.dataset.theme, true);
});

/* =========================================================
   9. ЭФФЕКТЫ И ЛЁГКИЙ РЕЖИМ ДЛЯ СЛАБЫХ УСТРОЙСТВ
   ========================================================= */
function isWeakDevice() {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  const lowMem = navigator.deviceMemory && navigator.deviceMemory <= LOW_MEMORY_GB;
  const lowCpu = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= LOW_CORES;
  return Boolean(reduce || saveData || lowMem || lowCpu);
}

// lite = true → эффекты выключены; тумблер в настройках показывает обратное
function setLite(lite) {
  root.classList.toggle('lite', lite);
  fxToggle.setAttribute('aria-checked', String(!lite));
}

let userChoseFx = false;

fxToggle.addEventListener('click', function () {
  userChoseFx = true;
  const lite = !root.classList.contains('lite');
  setLite(lite);
  save(KEY_FX, lite ? 'off' : 'on');
});

// Замеряем реальную частоту кадров. Если ниже MIN_FPS, упрощаем эффекты
function autoCheckFps() {
  setTimeout(function () {
    let startT = 0;
    let frames = 0;

    function step(t) {
      if (userChoseFx || document.hidden || root.classList.contains('lite')) return;
      if (!startT) startT = t;
      frames++;
      if (t - startT < 2000) {
        requestAnimationFrame(step);
      } else {
        const fps = frames / ((t - startT) / 1000);
        if (fps < MIN_FPS) setLite(true);   // не сохраняем: при следующем запуске проверим снова
      }
    }
    requestAnimationFrame(step);
  }, 1500);
}

function initFx() {
  const pref = load(KEY_FX);
  if (pref === 'off') { userChoseFx = true; setLite(true); }
  else if (pref === 'on') { userChoseFx = true; setLite(false); }
  else {
    setLite(isWeakDevice());
    if (!root.classList.contains('lite')) autoCheckFps();
  }
}

/* =========================================================
   10. ЗАПУСК
   ========================================================= */
function init() {
  createTimeButtons();
  setTheme(load(KEY_THEME) || DEFAULT_THEME, false);
  initFx();
  setStartTime(load(KEY_TIME) || DEFAULT_TIME, false);
  setTab('schedule');
  startTimer();
}

init();

// Service worker: чтобы сайт работал без интернета и ставился на телефон
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () {});
  });
}