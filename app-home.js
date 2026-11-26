/* ===== Бимка · главная, практика, профиль ===== */
"use strict";

function coachText() {
  const done = completedCount();
  if (!done) return "Привет! Я Бимка. Начнём с блока «Требования и нагрузки»? Там всего 7 вопросов.";
  if (allDone()) return "Все 33 урока позади! Осталось сдать зачёт — я в тебя верю.";
  if (state.streak >= 2) return `Серия ${state.streak} ${plural(state.streak, "день", "дня", "дней")} — не теряй темп!`;
  if (state.wrong.length) return `У тебя ${state.wrong.length} ${plural(state.wrong.length, "вопрос", "вопроса", "вопросов")} на повторение. Закрепим?`;
  return `Пройдено ${done} из ${ALL_LESSONS.length} уроков. Продолжим путь?`;
}

function renderHome() {
  const screen = document.getElementById("screen");
  if (!screen) return;
  const done = completedCount();
  const total = ALL_LESSONS.length;
  const pct = coursePct();
  const dailyPct = Math.min(100, Math.round(state.dailyXp / DAILY_GOAL * 100));
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - dailyPct / 100);
  const first = firstIncomplete();
  const bubble = coachText();

  screen.innerHTML = `
  <div class="screen home">
    <div class="home-top">
      <div>
        <div class="hello">ОП.03 · подготовка к зачёту</div>
        <h1>Проектирование многоэтажных зданий</h1>
        <p>11 блоков · ${total} коротких уроков · Бимка рядом</p>
      </div>
      <button class="avatar-btn" data-nav="profile" aria-label="Профиль">${mascot("happy", 56)}</button>
    </div>

    <div class="coach">
      <div class="coach-mascot">${mascot("happy", 88)}</div>
      <div class="coach-bubble">${bubble}</div>
    </div>

    <div class="daily-card">
      <div class="daily-ring" aria-label="Цель на день">
        <svg viewBox="0 0 48 48">
          <circle class="bg" cx="24" cy="24" r="${r}"/>
          <circle class="fg" cx="24" cy="24" r="${r}" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
        </svg>
        <span>${Math.min(state.dailyXp, DAILY_GOAL)}</span>
      </div>
      <div class="daily-info">
        <strong>${dailyPct >= 100 ? "Цель выполнена!" : "Цель на день"}</strong>
        <div class="daily-sub">${state.dailyXp} / ${DAILY_GOAL} XP ${dailyPct >= 100 ? "· +1 сердце" : "· до награды"}</div>
        <div class="daily-bar"><i style="width:${dailyPct}%"></i></div>
      </div>
      <div class="daily-gift">${dailyPct >= 100 ? icon("check", 20) : icon("heart", 20)}<br>${dailyPct >= 100 ? "готово" : "+1"}</div>
    </div>

    <div class="section-head">
      <h2>Твой путь</h2>
      <span>${done} / ${total} · ${pct}%</span>
    </div>

    ${COURSE.units.map(renderUnit).join("")}
    ${renderFinalCard()}

    <p class="footer-note">Бимка — учебный тренажёр по материалам лекций и чек-листа ОП.03.<br>Прогресс сохраняется в браузере.</p>
  </div>`;
  updateNav();
}

function renderUnit(u) {
  const done = unitDone(u);
  const first = firstIncomplete();
  return `
  <section class="unit" style="--c:${u.color};--cd:${u.dark}">
    <div class="unit-banner">
      <div class="unit-banner-top">
        <div>
          <div class="unit-kicker">Блок ${u.index + 1}</div>
          <h2>${u.title}</h2>
          <p>${u.subtitle}</p>
        </div>
        <div class="unit-icon">${icon(u.icon, 28)}</div>
      </div>
      <div class="unit-banner-bottom">
        <span class="unit-count">${done} / ${u.lessons.length} урока</span>
        <button class="guide-btn" data-guide="${u.id}">${icon("book", 15)} Шпаргалка</button>
      </div>
    </div>
    <div class="path">
      ${u.lessons.map((l, li) => {
        const isDone = !!state.completed[l.id];
        const isCurrent = !isDone && first && first.id === l.id;
        const locked = !isDone && !isCurrent;
        const dx = [0, 46, 0, -46][li % 4];
        return `
        <div class="node-wrap ${isCurrent ? "is-current" : ""}" style="--dx:${dx}px">
          ${isCurrent ? '<div class="node-label">НАЧАТЬ</div>' : ""}
          <button class="node ${isDone ? "is-done" : ""} ${locked ? "is-locked" : ""} ${isCurrent ? "is-current" : ""}"
            data-lesson="${l.id}" aria-label="${l.title}" ${locked ? 'aria-disabled="true"' : ""}>
            ${isDone ? icon("check", 34) : locked ? icon("lock", 26) : icon("star", 32)}
          </button>
          <div class="node-title ${locked ? "muted" : ""}">${l.title}</div>
        </div>`;
      }).join("")}
    </div>
  </section>`;
}

function renderFinalCard() {
  const open = allDone();
  const best = state.examBest;
  return `
  <div class="final-section">
    <div class="final-card">
      <div class="final-icon">${icon("trophy", 32)}</div>
      <div class="final-info">
        <b>Дифференцированный зачёт</b>
        <span>${open ? (best ? `Лучший результат: ${best} / 20` : "20 вопросов · зачёт от 14") : "Пройди все уроки, чтобы открыть"}</span>
      </div>
      <button class="final-btn" data-exam>${open ? "Начать" : "Закрыто"}</button>
    </div>
  </div>`;
}

function openGuide(unitId) {
  const u = COURSE.units.find(x => x.id === unitId);
  if (!u) return;
  openModal(`
    <div class="modal-kicker">Блок ${u.index + 1}</div>
    <h2>${u.title}</h2>
    <p>${u.subtitle}. Короткая шпаргалка перед уроками.</p>
    <ul class="guide-list">
      ${u.guide.map(g => `<li>${icon("check", 17)}<span>${g}</span></li>`).join("")}
    </ul>
    <button class="btn btn-primary" data-close-modal style="margin-top:16px">Понятно</button>
  `);
}

/* ---------- практика ---------- */
function renderPractice() {
  const screen = document.getElementById("screen");
  if (!screen) return;
  const done = completedCount();
  const wrong = state.wrong.length;
  const pct = coursePct();
  const examOpen = pct >= 50;
  const best = state.examBest;

  screen.innerHTML = `
  <div class="screen practice">
    <div class="page-head">
      <div class="hello">Практика</div>
      <h1>Закрепим материал?</h1>
      <p>Короткие тренировки помогают не забыть нормы, размеры и расчёты.</p>
    </div>

    <div class="practice-hero">
      <div class="mascot-wrap">${mascot("party", 86)}</div>
      <div>
        <h2>${done ? "Отличный темп!" : "Начни с малого"}</h2>
        <p>${done ? `Пройдено ${done} из ${ALL_LESSONS.length} уроков. Ошибки тоже работают на результат.` : "Пройди первый урок — и откроется случайная тренировка."}</p>
      </div>
    </div>

    <div class="practice-list">
      <button class="practice-card ${done ? "" : "locked"}" data-practice="random">
        <span class="practice-icon" style="--tint:#ddf4ff;--tone:#1cb0f6">${icon("refresh", 28)}</span>
        <span class="practice-body">
          <b>Случайная тренировка</b>
          <span>${done ? "8 вопросов из уже пройденных уроков" : "Сначала пройди хотя бы один урок"}</span>
        </span>
        <span class="practice-meta"><span class="pill">+XP</span><span class="chev">${icon("chevron", 20)}</span></span>
      </button>

      <button class="practice-card ${wrong ? "" : "locked"}" data-practice="mistakes">
        <span class="practice-icon" style="--tint:#ffe6e6;--tone:#ff4b4b">${icon("target", 28)}</span>
        <span class="practice-body">
          <b>Работа над ошибками</b>
          <span>${wrong ? `${wrong} ${plural(wrong, "вопрос", "вопроса", "вопросов")} ждут повторения` : "Ошибок нет — можно двигаться дальше"}</span>
        </span>
        <span class="practice-meta"><span class="pill">${wrong || "0"}</span><span class="chev">${icon("chevron", 20)}</span></span>
      </button>

      <button class="practice-card" data-practice="marathon">
        <span class="practice-icon" style="--tint:#fff3cd;--tone:#e6a800">${icon("bolt", 28)}</span>
        <span class="practice-body">
          <b>Марафон</b>
          <span>15 случайных вопросов со всего курса · без сердец</span>
        </span>
        <span class="practice-meta"><span class="pill gold">15</span><span class="chev">${icon("chevron", 20)}</span></span>
      </button>

      <button class="practice-card ${examOpen ? "" : "locked"}" data-practice="exam">
        <span class="practice-icon" style="--tint:#d7ffb8;--tone:#46a302">${icon("grad", 28)}</span>
        <span class="practice-body">
          <b>Пробный экзамен</b>
          <span>${examOpen ? "20 вопросов · зачёт от 14 правильных" : "Откроется после 50% курса"}</span>
        </span>
        <span class="practice-meta">${best ? `<span class="pill gold">${best}/20</span>` : `<span class="pill">70%</span>`}<span class="chev">${icon("chevron", 20)}</span></span>
      </button>
    </div>

    <p class="footer-note">Практика не открывает новые уроки, но закрепляет материал и убирает вопросы из списка ошибок.</p>
  </div>`;
  updateNav();
}

/* ---------- профиль ---------- */
function levelInfo(xp) {
  if (xp >= 400) return { name: "Главный инженер", icon: "trophy" };
  if (xp >= 200) return { name: "Ведущий проектировщик", icon: "award" };
  if (xp >= 80) return { name: "Проектировщик", icon: "layers" };
  return { name: "Новичок", icon: "star" };
}

function renderProfile() {
  const screen = document.getElementById("screen");
  if (!screen) return;
  const done = completedCount();
  const acc = state.stats.answered ? Math.round(state.stats.correct / state.stats.answered * 100) : 0;
  const level = levelInfo(state.xp);
  const unlocked = ACHIEVEMENTS.filter(a => state.achievements.includes(a.id)).length;

  screen.innerHTML = `
  <div class="screen profile">
    <div class="page-head">
      <div class="hello">Профиль</div>
      <h1>Твой прогресс</h1>
      <p>Здесь хранится всё: опыт, серия, достижения и настройки тренажёра.</p>
    </div>

    <div class="profile-card">
      <div class="profile-ava">${mascot("happy", 96)}</div>
      <h2>Будущий проектировщик</h2>
      <div class="role">ОП.03 · Проектирование многоэтажных зданий</div>
      <div class="level-pill">${icon(level.icon, 16)} ${level.name}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card green">
        <div class="lbl">Опыт</div>
        <div class="val">${state.xp} <small>XP</small></div>
      </div>
      <div class="stat-card orange">
        <div class="lbl">Серия</div>
        <div class="val">${icon("flame", 20)} ${state.streak} <small>${plural(state.streak, "день", "дня", "дней")}</small></div>
      </div>
      <div class="stat-card blue">
        <div class="lbl">Уроки</div>
        <div class="val">${done} <small>/ ${ALL_LESSONS.length}</small></div>
      </div>
      <div class="stat-card purple">
        <div class="lbl">Точность</div>
        <div class="val">${state.stats.answered ? acc + "%" : "—"} <small>${state.stats.answered ? state.stats.correct + " из " + state.stats.answered : "нет ответов"}</small></div>
      </div>
    </div>

    <div class="block-title">
      <h3>Достижения</h3>
      <span>${unlocked} / ${ACHIEVEMENTS.length}</span>
    </div>
    <div class="ach-grid">
      ${ACHIEVEMENTS.map(a => {
        const on = state.achievements.includes(a.id);
        return `<div class="ach ${on ? "" : "locked"}">
          <div class="ach-icon" style="--tint:${a.tint};--tone:${a.color}">${icon(a.icon, 23)}</div>
          <div><b>${a.title}</b><span>${a.desc}</span></div>
        </div>`;
      }).join("")}
    </div>

    <div class="block-title">
      <h3>Настройки</h3>
    </div>
    <div class="settings-card">
      <div class="setting-row">
        <div class="setting-ic">${icon("volume", 19)}</div>
        <div class="setting-txt"><b>Звуки</b><span>Короткие сигналы на ответы</span></div>
        <label class="switch"><input type="checkbox" data-setting="sound" ${state.settings.sound ? "checked" : ""}><i></i></label>
      </div>
      <div class="setting-row">
        <div class="setting-ic">${icon("heart", 19)}</div>
        <div class="setting-txt"><b>Бесконечные сердца</b><span>Тренировочный режим без потери сердец</span></div>
        <label class="switch"><input type="checkbox" data-setting="easyHearts" ${state.settings.easyHearts ? "checked" : ""}><i></i></label>
      </div>
      <div class="setting-row">
        <div class="setting-ic">${icon("sparkles", 19)}</div>
        <div class="setting-txt"><b>Анимации</b><span>Конфетти и праздничные эффекты</span></div>
        <label class="switch"><input type="checkbox" data-setting="motion" ${state.settings.motion ? "checked" : ""}><i></i></label>
      </div>
    </div>

    <button class="danger-btn" data-reset-open>${icon("trash", 18)} Сбросить прогресс</button>
    <p class="about-note">Бимка · тренажёр для подготовки к дифференцированному зачёту.<br>Вопросы составлены по лекции и чек-листу ОП.03. Прогресс хранится локально в браузере.</p>
  </div>`;
  updateNav();

  const resetBtn = screen.querySelector("[data-reset-open]");
  if (resetBtn) resetBtn.addEventListener("click", openResetConfirm);
}

function openResetConfirm() {
  openModal(`
    <h2>Сбросить прогресс?</h2>
    <p>Исчезнут XP, серия, пройденные уроки, ошибки и достижения. Настройки останутся. Это действие нельзя отменить.</p>
    <button class="btn btn-red" data-confirm-reset>Да, сбросить</button>
    <button class="btn btn-ghost" data-close-modal>Отмена</button>
  `);
}

function resetProgress() {
  const settings = Object.assign({}, state.settings);
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  state.settings = settings;
  state.createdAt = Date.now();
  state.dailyDay = todayStr();
  state.dailyXp = 0;
  state.dailyReward = false;
  state.hearts = MAX_HEARTS;
  state.heartsAt = Date.now();
  saveState();
  updateTopbar();
  closeModal();
  currentScreen = "home";
  renderHome();
  updateNav();
  window.scrollTo({ top: 0, behavior: "auto" });
  toast("Прогресс сброшен. Начинаем заново!");
}
