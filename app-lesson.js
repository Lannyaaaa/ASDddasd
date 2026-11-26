/* ===== Бимка · движок уроков ===== */
"use strict";

let session = null;
let qState = null;

const KICKERS = {
  choice: "Выберите один ответ",
  multi: "Выберите все верные варианты",
  tf: "Верно или неверно?",
  fill: "Впишите ответ",
  match: "Соедините пары",
  order: "Расставьте по порядку"
};

function startLessonById(id) {
  const found = findLesson(id);
  if (!found) return;
  const { lesson, unit } = found;
  startSession({
    mode: "lesson",
    lesson,
    unit,
    questions: lesson.questions.slice(),
    title: lesson.title,
    replay: !!state.completed[lesson.id]
  });
}

function startPractice(type) {
  let questions = [];
  let title = "Тренировка";
  let noHearts = false;
  if (type === "random") {
    questions = shuffle(allQuestionsFromCompleted()).slice(0, 8);
    title = "Случайная тренировка";
  } else if (type === "mistakes") {
    questions = shuffle(state.wrong).slice(0, 10).map(questionById).filter(Boolean);
    title = "Работа над ошибками";
  } else if (type === "marathon") {
    const pool = [];
    ALL_LESSONS.forEach(l => pool.push(...l.questions));
    questions = shuffle(pool).slice(0, 15);
    title = "Марафон";
    noHearts = true;
  }
  if (!questions.length) { toast(type === "mistakes" ? "Ошибок больше нет — отличная работа!" : "Пока нечего тренировать"); return false; }
  startSession({ mode: type, questions, title, noHearts });
  return true;
}

function startExam(trial) {
  if (!EXAM_POOL.length) { toast("Банк вопросов пуст"); return; }
  const questions = shuffle(EXAM_POOL).slice(0, 20);
  startSession({
    mode: "exam",
    questions,
    title: trial ? "Пробный экзамен" : "Дифференцированный зачёт",
    noHearts: true,
    trial: !!trial
  });
}

function startSession(opts) {
  session = {
    mode: opts.mode,
    lesson: opts.lesson || null,
    unit: opts.unit || null,
    questions: opts.questions || [],
    index: 0,
    answers: [],
    correctIds: new Set(),
    wrongIds: new Set(),
    startTime: Date.now(),
    title: opts.title || "Тренировка",
    replay: !!opts.replay,
    trial: !!opts.trial,
    noHearts: !!opts.noHearts,
    finished: false,
    perfect: true,
    unitWasDone: opts.unit ? unitDone(opts.unit) === opts.unit.lessons.length : false
  };
  qState = null;
  currentScreen = "lesson";
  closeModal();
  document.body.classList.add("lesson-mode");
  document.body.classList.remove("has-feedback");
  renderLesson();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function heartsHtml() {
  if (session.mode === "exam") {
    return `<div class="lesson-hearts inf">${icon("grad", 20)}<span>зачёт</span></div>`;
  }
  if (session.noHearts || state.settings.easyHearts) {
    return `<div class="lesson-hearts inf" id="lessonHearts">${icon("heart", 20)}<span>∞</span></div>`;
  }
  return `<div class="lesson-hearts" id="lessonHearts">${icon("heart", 20)}<span>${state.hearts}</span></div>`;
}

function updateLessonHearts() {
  const el = document.getElementById("lessonHearts");
  if (!el) return;
  if (session.noHearts || state.settings.easyHearts) {
    el.innerHTML = `${icon("heart", 20)}<span>∞</span>`;
    el.classList.add("inf");
  } else {
    el.innerHTML = `${icon("heart", 20)}<span>${state.hearts}</span>`;
    el.classList.toggle("inf", false);
  }
}

function renderLesson() {
  if (!session) return;
  if (session.index >= session.questions.length) { finishSession(); return; }
  const q = session.questions[session.index];
  const total = session.questions.length;
  const pct = Math.max(4, session.index / total * 100);
  initQState(q);
  const screen = document.getElementById("screen");
  screen.innerHTML = `
  <div class="lesson">
    <div class="lesson-top">
      <button class="icon-btn" data-action="quit" aria-label="Выйти из урока">${icon("x", 22)}</button>
      <div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
      ${heartsHtml()}
    </div>
    <div class="lesson-body">
      <div class="q-kicker">${KICKERS[q.type] || "Вопрос"}</div>
      <h1 class="q-title">${q.q}</h1>
      ${q.type === "match" ? '<p class="q-sub">Сначала нажми на левый элемент, затем на подходящий правый.</p>' : ""}
      ${q.type === "order" ? '<p class="q-sub">Нажимай на шаги внизу в правильной последовательности.</p>' : ""}
      <div class="q-area" id="qArea">${questionHtml(q)}</div>
    </div>
    <div class="lesson-footer" id="lessonFooter">
      <button class="btn btn-primary btn-wide" id="checkBtn" disabled>${q.type === "match" ? "Соедините все пары" : "Проверить"}</button>
    </div>
    <div id="feedbackRoot"></div>
  </div>`;
  bindQuestion(q);
  document.body.classList.remove("has-feedback");
  if (q.type === "fill") {
    const input = document.getElementById("fillInput");
    if (input) setTimeout(() => input.focus(), 80);
  }
}

function initQState(q) {
  qState = {
    type: q.type,
    selected: null,
    multi: new Set(),
    tf: null,
    fill: "",
    checked: false,
    correct: null,
    matchLeft: null,
    matched: new Set(),
    matchWrong: false,
    matchHeartLost: false,
    rightOrder: q.type === "match" ? shuffle(q.pairs.map((_, i) => i)) : [],
    orderAnswer: [],
    orderBank: q.type === "order" ? shuffle(q.items.map((text, i) => ({ text, i }))) : [],
    outOfHearts: false
  };
}

function questionHtml(q) {
  if (q.type === "choice") {
    return q.options.map((opt, i) => `
      <button class="option" data-opt="${i}" type="button">
        <span class="mark">${String.fromCharCode(65 + i)}</span>
        <span>${opt}</span>
      </button>`).join("");
  }
  if (q.type === "multi") {
    return q.options.map((opt, i) => `
      <button class="option" data-multi="${i}" type="button">
        <span class="mark"></span>
        <span>${opt}</span>
      </button>`).join("");
  }
  if (q.type === "tf") {
    return `<div class="tf-grid">
      <button class="tf-btn" data-tf="true" type="button">
        <span class="tf-ic">${icon("check", 28)}</span><span>Верно</span>
      </button>
      <button class="tf-btn" data-tf="false" type="button">
        <span class="tf-ic">${icon("x", 28)}</span><span>Неверно</span>
      </button>
    </div>`;
  }
  if (q.type === "fill") {
    return `<div class="fill-wrap" id="fillWrap">
      <input id="fillInput" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="Число" value="${qState.fill}">
      ${q.unit ? `<span class="fill-unit">${q.unit}</span>` : ""}
    </div>
    <div class="fill-hint">Введи число и нажми «Проверить». Можно использовать запятую.</div>`;
  }
  if (q.type === "match") {
    return `<div class="match-grid">
      <div class="match-col">${q.pairs.map((p, i) => `<button class="match-btn" data-left="${i}" type="button">${p[0]}</button>`).join("")}</div>
      <div class="match-col">${qState.rightOrder.map(i => `<button class="match-btn" data-right="${i}" type="button">${q.pairs[i][1]}</button>`).join("")}</div>
    </div>`;
  }
  if (q.type === "order") {
    return `<div class="order-answer" data-order-answer></div>
      <div class="order-bank" data-order-bank></div>`;
  }
  return "";
}

function bindQuestion(q) {
  const area = document.getElementById("qArea");
  if (!area) return;
  const quit = document.querySelector('[data-action="quit"]');
  if (quit) quit.addEventListener("click", requestQuit);
  const checkBtn = document.getElementById("checkBtn");
  if (checkBtn) checkBtn.addEventListener("click", checkCurrent);

  if (q.type === "choice") {
    area.querySelectorAll("[data-opt]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (qState.checked) return;
        qState.selected = Number(btn.dataset.opt);
        area.querySelectorAll("[data-opt]").forEach(b => b.classList.toggle("sel", b === btn));
        Sound.tap();
        updateCheck();
      });
    });
  } else if (q.type === "multi") {
    area.querySelectorAll("[data-multi]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (qState.checked) return;
        const i = Number(btn.dataset.multi);
        if (qState.multi.has(i)) qState.multi.delete(i); else qState.multi.add(i);
        btn.classList.toggle("sel", qState.multi.has(i));
        btn.querySelector(".mark").innerHTML = qState.multi.has(i) ? icon("check", 16) : "";
        Sound.tap();
        updateCheck();
      });
    });
  } else if (q.type === "tf") {
    area.querySelectorAll("[data-tf]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (qState.checked) return;
        qState.tf = btn.dataset.tf === "true";
        area.querySelectorAll("[data-tf]").forEach(b => b.classList.toggle("sel", b === btn));
        Sound.tap();
        updateCheck();
      });
    });
  } else if (q.type === "fill") {
    const input = document.getElementById("fillInput");
    if (input) {
      input.addEventListener("input", () => {
        if (qState.checked) return;
        qState.fill = input.value;
        updateCheck();
      });
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!qState.checked) checkCurrent();
        }
      });
    }
  } else if (q.type === "match") {
    area.addEventListener("click", e => {
      const left = e.target.closest("[data-left]");
      const right = e.target.closest("[data-right]");
      if (qState.checked) return;
      if (left) {
        const i = Number(left.dataset.left);
        if (qState.matched.has(i)) return;
        qState.matchLeft = i;
        area.querySelectorAll("[data-left]").forEach(b => b.classList.toggle("sel", Number(b.dataset.left) === i));
        Sound.tap();
        return;
      }
      if (right) {
        const i = Number(right.dataset.right);
        if (qState.matched.has(i)) return;
        if (qState.matchLeft === null) {
          right.classList.add("miss");
          setTimeout(() => right.classList.remove("miss"), 400);
          return;
        }
        const leftBtn = area.querySelector(`[data-left="${qState.matchLeft}"]`);
        const rightBtn = right;
        if (i === qState.matchLeft) {
          qState.matched.add(i);
          if (leftBtn) { leftBtn.classList.remove("sel"); leftBtn.classList.add("matched"); leftBtn.disabled = true; }
          rightBtn.classList.add("matched");
          rightBtn.disabled = true;
          qState.matchLeft = null;
          Sound.tap();
          if (qState.matched.size === q.pairs.length) {
            finishQuestion(!qState.matchWrong);
          }
        } else {
          qState.matchWrong = true;
          if (leftBtn) leftBtn.classList.add("miss");
          rightBtn.classList.add("miss");
          Sound.wrong();
          if (!qState.matchHeartLost) {
            qState.matchHeartLost = true;
            const empty = loseHeart();
            qState.outOfHearts = empty;
            updateLessonHearts();
          }
          setTimeout(() => {
            if (leftBtn) leftBtn.classList.remove("miss", "sel");
            rightBtn.classList.remove("miss");
            qState.matchLeft = null;
          }, 420);
        }
      }
    });
  } else if (q.type === "order") {
    const answerEl = area.querySelector("[data-order-answer]");
    const bankEl = area.querySelector("[data-order-bank]");
    if (answerEl) answerEl.addEventListener("click", e => {
      const chip = e.target.closest("[data-order-remove]");
      if (!chip || qState.checked) return;
      const idx = Number(chip.dataset.orderRemove);
      qState.orderAnswer = qState.orderAnswer.filter(x => x !== idx);
      Sound.tap();
      refreshOrder();
    });
    if (bankEl) bankEl.addEventListener("click", e => {
      const chip = e.target.closest("[data-order-add]");
      if (!chip || qState.checked) return;
      const idx = Number(chip.dataset.orderAdd);
      if (!qState.orderAnswer.includes(idx)) qState.orderAnswer.push(idx);
      Sound.tap();
      refreshOrder();
    });
    refreshOrder();
  }
}

function refreshOrder() {
  if (!qState || qState.type !== "order") return;
  const area = document.getElementById("qArea");
  if (!area) return;
  const answerEl = area.querySelector("[data-order-answer]");
  const bankEl = area.querySelector("[data-order-bank]");
  if (answerEl) {
    answerEl.innerHTML = qState.orderAnswer.map((idx, pos) =>
      `<button class="chip in-answer" data-order-remove="${idx}" type="button"><span class="num">${pos + 1}</span>${qState.orderBank.find(o => o.i === idx).text}</button>`
    ).join("");
  }
  if (bankEl) {
    bankEl.innerHTML = qState.orderBank.filter(o => !qState.orderAnswer.includes(o.i)).map(o =>
      `<button class="chip" data-order-add="${o.i}" type="button">${o.text}</button>`
    ).join("");
  }
  updateCheck();
}

function updateCheck() {
  const btn = document.getElementById("checkBtn");
  if (!btn || !qState) return;
  if (qState.checked) { btn.disabled = true; return; }
  let enabled = false;
  if (qState.type === "choice") enabled = qState.selected !== null;
  else if (qState.type === "multi") enabled = qState.multi.size > 0;
  else if (qState.type === "tf") enabled = qState.tf !== null;
  else if (qState.type === "fill") enabled = qState.fill.trim().length > 0;
  else if (qState.type === "order") enabled = qState.orderAnswer.length === session.questions[session.index].items.length;
  else if (qState.type === "match") enabled = false;
  btn.disabled = !enabled;
  if (qState.type === "order" && enabled) btn.textContent = "Проверить";
}

function parseNum(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function evaluate(q) {
  if (q.type === "choice") return qState.selected === q.a;
  if (q.type === "multi") {
    const a = new Set(q.a);
    if (a.size !== qState.multi.size) return false;
    for (const i of a) if (!qState.multi.has(i)) return false;
    return true;
  }
  if (q.type === "tf") return qState.tf === q.a;
  if (q.type === "fill") {
    const n = parseNum(qState.fill);
    const tol = q.tol != null ? q.tol : 0.01;
    return Number.isFinite(n) && Math.abs(n - q.a) <= tol;
  }
  if (q.type === "order") {
    const correct = q.items.map((_, i) => i);
    return qState.orderAnswer.length === correct.length && qState.orderAnswer.every((v, i) => v === correct[i]);
  }
  if (q.type === "match") return !qState.matchWrong;
  return false;
}

function correctText(q) {
  if (q.type === "choice") return q.options[q.a];
  if (q.type === "multi") return q.a.map(i => q.options[i]).join("; ");
  if (q.type === "tf") return q.a ? "Верно" : "Неверно";
  if (q.type === "fill") return `${q.a}${q.unit ? " " + q.unit : ""}`;
  if (q.type === "match") return q.pairs.map(p => `${p[0]} → ${p[1]}`).join("; ");
  if (q.type === "order") return q.items.map((t, i) => `${i + 1}. ${t}`).join(" → ");
  return "";
}

function checkCurrent() {
  if (!session || !qState || qState.checked) return;
  const q = session.questions[session.index];
  if (q.type === "match") return;
  finishQuestion(evaluate(q));
}

function finishQuestion(correct) {
  if (!session || !qState || qState.checked) return;
  const q = session.questions[session.index];
  qState.checked = true;
  qState.correct = correct;
  session.answers.push({ id: q.id, correct });
  if (correct) {
    session.correctIds.add(q.id);
    Sound.correct();
  } else {
    session.wrongIds.add(q.id);
    session.perfect = false;
    Sound.wrong();
    if (!session.noHearts && !(q.type === "match" && qState.matchHeartLost)) {
      const empty = loseHeart();
      qState.outOfHearts = empty;
      updateLessonHearts();
    }
  }
  markVisuals(q, correct);
  const bar = document.querySelector(".progress i");
  if (bar) bar.style.width = `${(session.index + 1) / session.questions.length * 100}%`;
  showFeedback(q, correct);
}

function markVisuals(q, correct) {
  const area = document.getElementById("qArea");
  if (!area) return;
  if (q.type === "choice") {
    area.querySelectorAll("[data-opt]").forEach(b => {
      const i = Number(b.dataset.opt);
      b.disabled = true;
      if (i === q.a) b.classList.add("correct");
      else if (i === qState.selected && !correct) b.classList.add("wrong");
      else b.classList.add("dim");
      b.classList.remove("sel");
    });
  } else if (q.type === "multi") {
    const right = new Set(q.a);
    area.querySelectorAll("[data-multi]").forEach(b => {
      const i = Number(b.dataset.multi);
      b.disabled = true;
      const mark = b.querySelector(".mark");
      if (right.has(i)) { b.classList.add("correct"); if (mark) mark.innerHTML = icon("check", 16); }
      else if (qState.multi.has(i)) { b.classList.add("wrong"); if (mark) mark.innerHTML = icon("x", 16); }
      else b.classList.add("dim");
      b.classList.remove("sel");
    });
  } else if (q.type === "tf") {
    area.querySelectorAll("[data-tf]").forEach(b => {
      b.disabled = true;
      const val = b.dataset.tf === "true";
      if (val === q.a) b.classList.add("correct");
      else if (val === qState.tf && !correct) b.classList.add("wrong");
      else b.classList.add("dim");
      b.classList.remove("sel");
    });
  } else if (q.type === "fill") {
    const wrap = document.getElementById("fillWrap");
    const input = document.getElementById("fillInput");
    if (wrap) wrap.classList.add(correct ? "correct" : "wrong");
    if (input) input.disabled = true;
  } else if (q.type === "order") {
    const ans = area.querySelector("[data-order-answer]");
    if (ans) ans.classList.add(correct ? "correct" : "wrong");
    area.querySelectorAll(".chip").forEach(c => { c.disabled = true; });
  }
}

function showFeedback(q, correct) {
  const root = document.getElementById("feedbackRoot");
  if (!root) return;
  const answer = correctText(q);
  root.innerHTML = `
    <div class="feedback ${correct ? "ok" : "bad"}">
      <div class="feedback-inner">
        <div class="fb-icon">${correct ? icon("check", 22) : icon("x", 22)}</div>
        <div class="fb-text">
          <h3>${correct ? "Верно!" : "Не совсем"}</h3>
          ${correct ? "" : `<p class="fb-answer">Правильный ответ: <b>${answer}</b></p>`}
          <p class="fb-why">${q.why || ""}</p>
        </div>
        <button class="btn ${correct ? "btn-primary" : "btn-red"}" data-action="next" type="button">Продолжить</button>
      </div>
    </div>`;
  const footer = document.getElementById("lessonFooter");
  if (footer) footer.classList.add("hidden");
  document.body.classList.add("has-feedback");
  const next = root.querySelector('[data-action="next"]');
  if (next) next.addEventListener("click", nextQuestion);
}

function nextQuestion() {
  if (!session || session.finished) return;
  if (state.hearts <= 0 && !state.settings.easyHearts && !session.noHearts && session.index + 1 < session.questions.length) {
    openHeartsModal({
      onResume: () => advanceQuestion(),
      onQuit: () => abandonSession(),
      quitLabel: "Выйти из урока"
    });
    return;
  }
  advanceQuestion();
}

function advanceQuestion() {
  if (!session || session.finished) return;
  session.index++;
  document.body.classList.remove("has-feedback");
  if (session.index >= session.questions.length) finishSession();
  else renderLesson();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function requestQuit() {
  if (!session || session.finished) return;
  const label = session.mode === "exam" ? "Выйти из экзамена?" : session.mode === "lesson" ? "Выйти из урока?" : "Прервать тренировку?";
  const modal = openModal(`
    <h2>${label}</h2>
    <p>Прогресс этой попытки не сохранится. Сердца и опыт останутся как есть.</p>
    <button class="btn btn-red" data-quit-yes>Выйти</button>
    <button class="btn btn-ghost" data-close-modal>Остаться</button>
  `);
  modal.querySelector("[data-quit-yes]").addEventListener("click", () => {
    closeModal();
    abandonSession();
  });
}

function abandonSession() {
  goHome();
}

function goHome() {
  session = null;
  qState = null;
  document.body.classList.remove("lesson-mode", "has-feedback");
  currentScreen = "home";
  closeModal();
  renderHome();
  updateNav();
  requestAnimationFrame(() => window.scrollTo({ top: homeScrollY, behavior: "auto" }));
}

function finishSession() {
  if (!session || session.finished) return;
  session.finished = true;
  const total = session.questions.length;
  const correctCount = session.answers.filter(a => a.correct).length;
  const accuracy = Math.round(correctCount / total * 100);
  const perfect = correctCount === total;
  const duration = Math.round((Date.now() - session.startTime) / 1000);
  const mode = session.mode;

  let earned = 0;
  let unitJustCompleted = false;
  let passed = false;

  if (mode === "lesson") {
    const already = !!state.completed[session.lesson.id];
    earned = already ? 5 : 10 + (perfect ? 5 : 0);
    const best = already ? Math.max(state.completed[session.lesson.id].best || 0, accuracy) : accuracy;
    state.completed[session.lesson.id] = { best, at: Date.now() };
    if (!already) state.stats.lessons++;
    if (perfect) state.stats.perfect++;
    if (session.unit) {
      const nowDone = unitDone(session.unit) === session.unit.lessons.length;
      unitJustCompleted = nowDone && !session.unitWasDone;
    }
  } else if (mode === "mistakes") {
    earned = correctCount * 3;
  } else if (mode === "exam") {
    passed = correctCount >= Math.ceil(total * 0.7);
    state.examBest = Math.max(state.examBest, correctCount);
    if (passed) state.examPassed = true;
    earned = passed ? 30 : 10;
  } else {
    earned = correctCount * 2;
  }

  session.correctIds.forEach(id => {
    const i = state.wrong.indexOf(id);
    if (i >= 0) state.wrong.splice(i, 1);
  });
  session.wrongIds.forEach(id => {
    if (!state.wrong.includes(id)) state.wrong.push(id);
  });

  state.stats.answered += total;
  state.stats.correct += correctCount;

  const dailyReward = addXp(earned);
  markStreak();
  const newAchievements = checkAchievements();
  saveState();
  updateTopbar();

  session.correctCount = correctCount;
  session.accuracy = accuracy;
  session.perfectRun = perfect;
  session.duration = duration;
  session.earned = earned;
  session.passed = passed;
  session.dailyReward = dailyReward;
  session.unitJustCompleted = unitJustCompleted;
  session.newAchievements = newAchievements;

  Sound.complete();
  if (mode === "lesson" || (mode === "exam" && passed) || perfect) confetti();
  renderSummary();
}

function renderSummary() {
  if (!session) return;
  const total = session.questions.length;
  const mode = session.mode;
  let title = "Готово!";
  let sub = "";
  let mood = "party";

  if (mode === "lesson") {
    title = session.replay ? "Урок повторён!" : "Урок пройден!";
    sub = session.replay
      ? `Ты ещё раз прошёл «${session.title}». Повторение закрепляет материал.`
      : `Ты закрыл урок «${session.title}». Следующий шаг уже открыт.`;
    if (!session.perfectRun) mood = "happy";
  } else if (mode === "mistakes") {
    title = "Ошибки разобраны!";
    sub = session.perfectRun ? "Ни одной ошибки — вопросы убраны из списка повторения." : "Правильные ответы убраны из списка ошибок. Остальные вернутся позже.";
    if (!session.perfectRun) mood = "happy";
  } else if (mode === "marathon") {
    title = "Марафон пройден!";
    sub = `Ты ответил на ${total} вопросов без сердец. Отличная выносливость.`;
    if (!session.perfectRun) mood = "happy";
  } else if (mode === "exam") {
    title = session.passed ? "Зачёт!" : "Почти получилось";
    sub = session.passed
      ? `Набрано ${session.correctCount} из ${total}. Порог пройден — можно готовиться к настоящему зачёту.`
      : `Набрано ${session.correctCount} из ${total}. Для зачёта нужно ${Math.ceil(total * 0.7)}. Разбери ошибки и попробуй ещё.`;
    mood = session.passed ? "party" : "sad";
  } else {
    title = "Тренировка завершена!";
    sub = "Материал закреплён. Можно вернуться к пути или повторить ещё раз.";
    if (!session.perfectRun) mood = "happy";
  }

  const screen = document.getElementById("screen");
  screen.innerHTML = `
  <div class="summary">
    <div class="mascot-big">${mascot(mood, 168)}</div>
    <h1>${title}</h1>
    <p class="sub">${sub}</p>
    ${mode === "exam" ? `<div class="exam-score ${session.passed ? "" : "fail"}">${session.correctCount}<small> / ${total}</small></div>` : ""}
    <div class="summary-chips">
      <div class="sum-chip green"><div class="n">+${session.earned} ${icon("bolt", 18)}</div><div class="l">опыт</div></div>
      <div class="sum-chip blue"><div class="n">${session.accuracy}%</div><div class="l">точность</div></div>
      <div class="sum-chip gold"><div class="n">${mmss(session.duration)}</div><div class="l">время</div></div>
    </div>
    ${session.dailyReward ? `<div class="unlocked"><div class="ach-icon" style="--tint:#eaffd6;--tone:#46a302">${icon("heart", 20)}</div><div><b>Цель на день выполнена</b><span>+1 сердце за ежедневную цель</span></div></div>` : ""}
    ${session.newAchievements.map(a => `<div class="unlocked"><div class="ach-icon" style="--tint:${a.tint};--tone:${a.color}">${icon(a.icon, 20)}</div><div><b>${a.title}</b><span>${a.desc}</span></div></div>`).join("")}
    ${session.unitJustCompleted && session.unit ? `<div class="unit-done"><div class="final-icon">${icon("trophy", 25)}</div><div><b>Блок «${session.unit.title}» пройден!</b><span>Все ${session.unit.lessons.length} урока закрыты. Так держать.</span></div></div>` : ""}
    <div class="summary-actions">
      <button class="btn btn-primary" data-summary-home>${mode === "exam" ? "На главную" : "Продолжить"}</button>
      <button class="btn btn-ghost" data-summary-again>${mode === "exam" ? "Ещё раз" : "Пройти ещё раз"}</button>
    </div>
  </div>`;

  const homeBtn = screen.querySelector("[data-summary-home]");
  if (homeBtn) homeBtn.addEventListener("click", goHome);
  const againBtn = screen.querySelector("[data-summary-again]");
  if (againBtn) againBtn.addEventListener("click", () => {
    const againMode = session.mode;
    const lessonId = session.lesson ? session.lesson.id : null;
    const trial = session.trial;
    session = null;
    document.body.classList.remove("lesson-mode", "has-feedback");
    if (againMode === "lesson" && lessonId) startLessonById(lessonId);
    else if (againMode === "exam") startExam(trial);
    else if (!startPractice(againMode)) goHome();
  });
}

document.addEventListener("keydown", e => {
  if (!session || session.finished) return;
  if (e.key === "Escape") {
    e.preventDefault();
    requestQuit();
    return;
  }
  if (e.key === "Enter") {
    const next = document.querySelector('[data-action="next"]');
    if (next) { e.preventDefault(); next.click(); return; }
    const btn = document.getElementById("checkBtn");
    if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
  }
});

init();
