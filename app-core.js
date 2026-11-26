/* ===== Бимка · ядро приложения ===== */
"use strict";

const COURSE = window.COURSE;
const EXAM_POOL = window.EXAM_POOL || [];
const STORAGE_KEY = "bimka_op03_v1";
const MAX_HEARTS = 5;
const HEART_REGEN = 3 * 60 * 1000;
const DAILY_GOAL = 30;
const RESTORE_COST = 30;

const DEFAULT_STATE = {
  version: 1,
  xp: 0,
  hearts: MAX_HEARTS,
  heartsAt: 0,
  streak: 0,
  lastDay: null,
  dailyXp: 0,
  dailyDay: null,
  dailyReward: false,
  completed: {},
  wrong: [],
  stats: { answered: 0, correct: 0, lessons: 0, perfect: 0 },
  achievements: [],
  settings: { sound: true, easyHearts: false, motion: true },
  examBest: 0,
  examPassed: false,
  createdAt: 0
};

let state;
let currentScreen = "home";
let homeScrollY = 0;
let modalTimer = null;

/* ---------- утилиты ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayStr(d);
}
function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}
function mmss(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- состояние ---------- */
function normalizeHearts(s = state) {
  if (!s || s.settings.easyHearts) return false;
  if (s.hearts >= MAX_HEARTS) { s.hearts = MAX_HEARTS; return false; }
  if (!s.heartsAt) s.heartsAt = Date.now();
  const gain = Math.floor((Date.now() - s.heartsAt) / HEART_REGEN);
  if (gain <= 0) return false;
  s.hearts = Math.min(MAX_HEARTS, s.hearts + gain);
  s.heartsAt = s.hearts >= MAX_HEARTS ? Date.now() : s.heartsAt + gain * HEART_REGEN;
  return true;
}

function loadState() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (e) { saved = {}; }
  const s = JSON.parse(JSON.stringify(DEFAULT_STATE));
  if (saved && typeof saved === "object") {
    Object.assign(s, saved);
    s.settings = Object.assign({}, DEFAULT_STATE.settings, saved.settings || {});
    s.stats = Object.assign({}, DEFAULT_STATE.stats, saved.stats || {});
    if (!Array.isArray(s.wrong)) s.wrong = [];
    if (!Array.isArray(s.achievements)) s.achievements = [];
    if (!s.completed || typeof s.completed !== "object") s.completed = {};
  }
  const t = todayStr();
  if (s.lastDay && s.lastDay !== t && s.lastDay !== yesterdayStr()) s.streak = 0;
  if (s.dailyDay !== t) {
    s.dailyDay = t;
    s.dailyXp = 0;
    s.dailyReward = false;
  }
  normalizeHearts(s);
  if (!s.createdAt) s.createdAt = Date.now();
  return s;
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* приватный режим */ }
}

function addXp(n) {
  if (!n) return false;
  if (state.dailyDay !== todayStr()) {
    state.dailyDay = todayStr();
    state.dailyXp = 0;
    state.dailyReward = false;
  }
  state.xp += n;
  state.dailyXp += n;
  let reward = false;
  if (!state.dailyReward && state.dailyXp >= DAILY_GOAL) {
    state.dailyReward = true;
    if (!state.settings.easyHearts) {
      state.hearts = Math.min(MAX_HEARTS, state.hearts + 1);
      if (state.hearts >= MAX_HEARTS) state.heartsAt = Date.now();
    }
    reward = true;
  }
  saveState();
  updateTopbar();
  return reward;
}

function markStreak() {
  const t = todayStr();
  if (state.lastDay === t) return false;
  state.streak = state.lastDay === yesterdayStr() ? state.streak + 1 : 1;
  state.lastDay = t;
  return true;
}

function loseHeart() {
  if (state.settings.easyHearts) return false;
  if (state.hearts >= MAX_HEARTS) state.heartsAt = Date.now();
  state.hearts = Math.max(0, state.hearts - 1);
  saveState();
  updateTopbar();
  return state.hearts <= 0;
}

function restoreHearts() {
  state.hearts = MAX_HEARTS;
  state.heartsAt = Date.now();
  saveState();
  updateTopbar();
}

function secondsToNextHeart() {
  if (state.settings.easyHearts || state.hearts >= MAX_HEARTS) return 0;
  const at = state.heartsAt || Date.now();
  return Math.max(0, (HEART_REGEN - (Date.now() - at)) / 1000);
}

/* ---------- индексы данных ---------- */
const ALL_LESSONS = [];
const QUESTION_INDEX = new Map();
COURSE.units.forEach((u, ui) => {
  u.index = ui;
  u.lessons.forEach((l, li) => {
    l.unit = u;
    l.index = li;
    l.questions.forEach((q, qi) => {
      q.id = `${u.id}:${l.id}:${qi}`;
      q.lessonId = l.id;
      q.unitId = u.id;
      QUESTION_INDEX.set(q.id, q);
    });
    ALL_LESSONS.push(l);
  });
});
EXAM_POOL.forEach((q, i) => {
  q.id = `exam:${i}`;
  q.isExam = true;
  QUESTION_INDEX.set(q.id, q);
});

function findLesson(id) {
  for (const u of COURSE.units) {
    const lesson = u.lessons.find(l => l.id === id);
    if (lesson) return { unit: u, lesson };
  }
  return null;
}
function completedCount() {
  return ALL_LESSONS.filter(l => !!state.completed[l.id]).length;
}
function allDone() {
  return completedCount() === ALL_LESSONS.length;
}
function coursePct() {
  return ALL_LESSONS.length ? Math.round(completedCount() / ALL_LESSONS.length * 100) : 0;
}
function unitDone(u) {
  return u.lessons.filter(l => !!state.completed[l.id]).length;
}
function firstIncomplete() {
  for (const u of COURSE.units) for (const l of u.lessons) if (!state.completed[l.id]) return l;
  return null;
}
function isUnlocked(lesson) {
  const first = firstIncomplete();
  return !!state.completed[lesson.id] || !first || first.id === lesson.id;
}
function allQuestionsFromCompleted() {
  const out = [];
  ALL_LESSONS.forEach(l => { if (state.completed[l.id]) out.push(...l.questions); });
  return out;
}
function questionById(id) { return QUESTION_INDEX.get(id) || null; }

/* ---------- достижения ---------- */
const ACHIEVEMENTS = [
  { id: "first", title: "Первый шаг", desc: "Пройди первый урок", icon: "star", color: "#58cc02", tint: "#eaffd6", check: () => completedCount() >= 1 },
  { id: "perfect", title: "Без единой ошибки", desc: "Пройди урок идеально", icon: "target", color: "#1cb0f6", tint: "#ddf4ff", check: () => state.stats.perfect >= 1 },
  { id: "streak3", title: "В ударе", desc: "Серия из 3 дней", icon: "flame", color: "#ff9600", tint: "#fff0dd", check: () => state.streak >= 3 },
  { id: "xp100", title: "Сто очков", desc: "Набери 100 XP", icon: "bolt", color: "#f0a500", tint: "#fff5cc", check: () => state.xp >= 100 },
  { id: "half", title: "Половина пути", desc: "Пройди 50% курса", icon: "layers", color: "#ce82ff", tint: "#f6e9ff", check: () => coursePct() >= 50 },
  { id: "graduate", title: "Выпускник", desc: "Пройди все 33 урока", icon: "grad", color: "#00c2a8", tint: "#d9fff9", check: () => allDone() },
  { id: "exam", title: "Зачёт получен", desc: "Сдай пробный экзамен", icon: "award", color: "#f0a500", tint: "#fff3cd", check: () => state.examPassed },
  { id: "flawless", title: "Идеальный зачёт", desc: "20 из 20 на экзамене", icon: "trophy", color: "#ff6b6b", tint: "#ffe6e6", check: () => state.examBest >= 20 }
];

function checkAchievements() {
  const newly = [];
  ACHIEVEMENTS.forEach(a => {
    if (!state.achievements.includes(a.id) && a.check()) {
      state.achievements.push(a.id);
      newly.push(a);
    }
  });
  if (newly.length) saveState();
  return newly;
}

/* ---------- иконки и маскот ---------- */
function icon(name, size = 24, cls = "") {
  return `<svg class="${cls}" width="${size}" height="${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function mascot(mood = "happy", size = 120) {
  const mouth = {
    happy: '<path d="M86 133 Q100 148 114 133" fill="none" stroke="#2f5f00" stroke-width="5" stroke-linecap="round"/>',
    sad: '<path d="M88 142 Q100 131 112 142" fill="none" stroke="#2f5f00" stroke-width="5" stroke-linecap="round"/>',
    wow: '<ellipse cx="100" cy="137" rx="7" ry="8" fill="#2f5f00"/>',
    party: '<path d="M84 130 Q100 152 116 130 Z" fill="#2f5f00"/><path d="M93 141 Q100 146 107 141" fill="#ff8fa8"/>'
  }[mood] || "";
  const brows = mood === "sad"
    ? '<path d="M68 100 Q77 95 86 99M114 99 Q123 95 132 100" fill="none" stroke="#c58f00" stroke-width="3.4" stroke-linecap="round"/>'
    : "";
  const eyes = mood === "party"
    ? '<path d="M70 112 Q80 102 90 112M110 112 Q120 102 130 112" fill="none" stroke="#3c3c3c" stroke-width="4.2" stroke-linecap="round"/>'
    : `<ellipse cx="80" cy="112" rx="11" ry="12" fill="#fff"/>
       <ellipse cx="120" cy="112" rx="11" ry="12" fill="#fff"/>
       <circle cx="82" cy="${mood === "sad" ? 116 : 113}" r="5.5" fill="#3c3c3c"/>
       <circle cx="122" cy="${mood === "sad" ? 116 : 113}" r="5.5" fill="#3c3c3c"/>
       <circle cx="84" cy="${mood === "sad" ? 114 : 111}" r="1.7" fill="#fff"/>
       <circle cx="124" cy="${mood === "sad" ? 114 : 111}" r="1.7" fill="#fff"/>`;
  const cheeks = mood === "sad" ? "" :
    '<circle cx="65" cy="132" r="7" fill="#ff9fb2" opacity=".75"/><circle cx="135" cy="132" r="7" fill="#ff9fb2" opacity=".75"/>';
  return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="Бимка" class="mascot-svg">
    <ellipse cx="100" cy="184" rx="52" ry="8" fill="#000" opacity=".07"/>
    <rect x="40" y="112" width="18" height="38" rx="9" fill="#58cc02"/>
    <rect x="142" y="112" width="18" height="38" rx="9" fill="#58cc02"/>
    <rect x="54" y="76" width="92" height="100" rx="44" fill="#58cc02"/>
    <rect x="54" y="76" width="92" height="100" rx="44" fill="none" stroke="#46a302" stroke-width="2.5" opacity=".25"/>
    <path d="M48 86C48 48 70 28 100 28C130 28 152 48 152 86Z" fill="#ffc800"/>
    <rect x="96" y="28" width="8" height="58" rx="4" fill="#ffb020"/>
    <rect x="36" y="78" width="128" height="16" rx="8" fill="#ffb020"/>
    <rect x="41" y="80" width="118" height="4" rx="2" fill="#ffd34d"/>
    <circle cx="60" cy="60" r="7" fill="#fff" opacity=".35"/>
    ${brows}${eyes}${cheeks}${mouth}
    <circle cx="100" cy="160" r="11" fill="#fff" opacity=".94"/>
    <text x="100" y="163.4" text-anchor="middle" font-family="Nunito,Arial,sans-serif" font-size="7.5" font-weight="900" fill="#46a302">BIM</text>
  </svg>`;
}

/* ---------- звук ---------- */
const Sound = {
  ctx: null,
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (e) { this.ctx = null; }
  },
  tone(freq, dur = .1, type = "sine", vol = .05, delay = 0) {
    if (!state || !state.settings.sound) return;
    this.init();
    if (!this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + .012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + .03);
    } catch (e) { /* без звука */ }
  },
  tap() { this.tone(540, .045, "sine", .025); },
  correct() { this.tone(660, .09, "sine", .055); this.tone(880, .13, "sine", .05, .08); },
  wrong() { this.tone(220, .12, "sawtooth", .035); this.tone(155, .18, "sawtooth", .035, .1); },
  complete() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .18, "sine", .05, i * .12)); },
  heart() { this.tone(300, .1, "sine", .04); this.tone(200, .14, "sine", .04, .09); }
};

/* ---------- тосты и модалки ---------- */
function toast(message, ms = 2800) {
  const root = document.getElementById("toastRoot");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }, ms);
}

function openModal(html, opts = {}) {
  closeModal();
  const root = document.getElementById("overlayRoot");
  root.innerHTML = `<div class="overlay" data-overlay>
    <div class="modal-wrap">
      <div class="modal ${opts.className || ""}">
        ${opts.dismissible === false ? "" : `<button class="icon-btn modal-close" data-close-modal aria-label="Закрыть">${icon("x", 20)}</button>`}
        ${html}
      </div>
    </div>
  </div>`;
  const overlay = root.querySelector("[data-overlay]");
  overlay.addEventListener("click", e => {
    if (e.target === overlay && opts.dismissible !== false) closeModal();
  });
  document.body.style.overflow = "hidden";
  return root.querySelector(".modal");
}

function closeModal() {
  if (modalTimer) { clearInterval(modalTimer); modalTimer = null; }
  const root = document.getElementById("overlayRoot");
  if (root) root.innerHTML = "";
  document.body.style.overflow = "";
}

function openHeartsModal({ onResume, onQuit, quitLabel = "Выйти" } = {}) {
  if (state.settings.easyHearts) { if (onResume) onResume(); return; }
  normalizeHearts();
  saveState();
  updateTopbar();
  const modal = openModal(`
    <div class="mascot-sm">${mascot("sad", 120)}</div>
    <h2>Сердца закончились</h2>
    <p>Ошибки отнимают сердца. Подожди немного — или восстанови их за опыт.</p>
    <div class="heart-timer">${icon("heart", 19)} <span data-heart-timer>${mmss(secondsToNextHeart())}</span></div>
    <button class="btn btn-primary" data-heart-action>Восстановить за ${RESTORE_COST} XP</button>
    <button class="btn btn-ghost" data-heart-quit>${quitLabel}</button>
  `, { dismissible: false });

  const action = modal.querySelector("[data-heart-action]");
  const timerEl = modal.querySelector("[data-heart-timer]");
  let mode = "restore";

  function refresh() {
    normalizeHearts();
    if (state.hearts > 0) {
      mode = "continue";
      action.disabled = false;
      action.textContent = "Продолжить";
      if (timerEl) timerEl.textContent = "Сердце восстановилось!";
      if (modalTimer) { clearInterval(modalTimer); modalTimer = null; }
    } else {
      mode = "restore";
      action.textContent = `Восстановить за ${RESTORE_COST} XP`;
      action.disabled = state.xp < RESTORE_COST;
      if (timerEl) timerEl.textContent = mmss(secondsToNextHeart());
    }
  }
  action.addEventListener("click", () => {
    if (mode === "continue") {
      closeModal();
      if (onResume) onResume();
      return;
    }
    if (state.xp < RESTORE_COST) return;
    state.xp -= RESTORE_COST;
    restoreHearts();
    closeModal();
    toast("Сердца восстановлены");
    if (onResume) onResume();
  });
  modal.querySelector("[data-heart-quit]").addEventListener("click", () => {
    closeModal();
    if (onQuit) onQuit();
  });
  refresh();
  modalTimer = setInterval(() => { refresh(); saveState(); updateTopbar(); }, 1000);
}

/* ---------- шапка ---------- */
function updateTopbar() {
  if (!state) return;
  const st = document.getElementById("statStreak");
  const xp = document.getElementById("statXp");
  const hp = document.getElementById("statHearts");
  if (st) st.textContent = state.streak;
  if (xp) xp.textContent = state.xp;
  if (hp) hp.textContent = state.settings.easyHearts ? "∞" : state.hearts;
  const box = document.getElementById("heartsStat");
  if (box) {
    const low = !state.settings.easyHearts && state.hearts > 0 && state.hearts <= 2;
    box.classList.toggle("is-low", low);
    box.classList.toggle("is-empty", !state.settings.easyHearts && state.hearts === 0);
  }
}

function updateNav() {
  $$(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.nav === currentScreen));
}

/* ---------- навигация ---------- */
function go(name, opts = {}) {
  if (name === "lesson") return;
  currentScreen = name;
  document.body.classList.remove("lesson-mode");
  closeModal();
  updateNav();
  if (name === "home") renderHome();
  else if (name === "practice") renderPractice();
  else if (name === "profile") renderProfile();
  if (opts.keepScroll !== true) window.scrollTo({ top: 0, behavior: "auto" });
  if (opts.restoreScroll) requestAnimationFrame(() => window.scrollTo({ top: homeScrollY, behavior: "auto" }));
}

function rememberHomeScroll() { homeScrollY = window.scrollY || 0; }

function onLessonClick(id) {
  const found = findLesson(id);
  if (!found) return;
  const { lesson } = found;
  if (!isUnlocked(lesson)) { toast("Сначала пройди предыдущий урок"); return; }
  if (!state.settings.easyHearts && state.hearts <= 0) {
    rememberHomeScroll();
    openHeartsModal({ onResume: () => startLessonById(id), onQuit: () => {} });
    return;
  }
  rememberHomeScroll();
  startLessonById(id);
}

function onExamClick() {
  if (!allDone()) { toast("Пройди все уроки, чтобы открыть зачёт"); return; }
  startExam(false);
}

function onPracticeClick(type) {
  if (type === "random") {
    if (completedCount() === 0) { toast("Сначала пройди хотя бы один урок"); return; }
    startPractice("random");
  } else if (type === "mistakes") {
    if (!state.wrong.length) { toast("Ошибок пока нет — отличная работа!"); return; }
    startPractice("mistakes");
  } else if (type === "marathon") {
    startPractice("marathon");
  } else if (type === "exam") {
    if (coursePct() < 50) { toast("Экзамен откроется после 50% курса"); return; }
    startExam(true);
  }
}

/* ---------- конфетти ---------- */
let confettiRaf = null;
function confetti() {
  if (!state || !state.settings.motion) return;
  const canvas = document.getElementById("confetti");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const colors = ["#58cc02", "#1cb0f6", "#ffc800", "#ff4b4b", "#ce82ff", "#ff9600", "#00c2a8"];
  const parts = [];
  for (let i = 0; i < 150; i++) {
    parts.push({
      x: w / 2 + (Math.random() - .5) * 260,
      y: h * .28 + (Math.random() - .5) * 60,
      vx: (Math.random() - .5) * 11,
      vy: -Math.random() * 11 - 3,
      w: 5 + Math.random() * 7,
      h: 8 + Math.random() * 9,
      c: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - .5) * .35,
      life: 0
    });
  }
  let frame = 0;
  cancelAnimationFrame(confettiRaf);
  function tick() {
    frame++;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += .32;
      p.vx *= .992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life++;
      if (p.y > h + 30) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (frame < 260) confettiRaf = requestAnimationFrame(tick);
    else { ctx.clearRect(0, 0, w, h); }
  }
  tick();
}

/* ---------- глобальные события ---------- */
document.addEventListener("click", e => {
  const nav = e.target.closest("[data-nav]");
  if (nav) { Sound.tap(); go(nav.dataset.nav); return; }
  const close = e.target.closest("[data-close-modal]");
  if (close) { closeModal(); return; }
  const guide = e.target.closest("[data-guide]");
  if (guide) { Sound.tap(); openGuide(guide.dataset.guide); return; }
  const lessonBtn = e.target.closest("[data-lesson]");
  if (lessonBtn) { Sound.tap(); onLessonClick(lessonBtn.dataset.lesson); return; }
  const examBtn = e.target.closest("[data-exam]");
  if (examBtn) { Sound.tap(); if (examBtn.disabled) return; onExamClick(); return; }
  const practice = e.target.closest("[data-practice]");
  if (practice) { Sound.tap(); onPracticeClick(practice.dataset.practice); return; }
  const reset = e.target.closest("[data-confirm-reset]");
  if (reset) { resetProgress(); return; }
});

document.addEventListener("change", e => {
  const cb = e.target.closest("input[data-setting]");
  if (!cb) return;
  const key = cb.dataset.setting;
  if (!(key in state.settings)) return;
  state.settings[key] = cb.checked;
  if (key === "sound" && cb.checked) Sound.tap();
  if (key === "easyHearts" && !cb.checked) normalizeHearts();
  saveState();
  updateTopbar();
  if (currentScreen === "profile") renderProfile();
});

document.addEventListener("pointerdown", () => Sound.init(), { once: true });

window.addEventListener("resize", () => {
  if (currentScreen === "home" || currentScreen === "practice" || currentScreen === "profile") {
    // пересчёт не нужен: вёрстка адаптивная
  }
});

/* ---------- запуск ---------- */
function init() {
  state = loadState();
  saveState();
  updateTopbar();
  updateNav();
  renderHome();
  setInterval(() => {
    if (normalizeHearts()) { saveState(); updateTopbar(); }
  }, 15000);
}
