/* ===========================================================
   Рефакторинг логики 2048 — script.js
   Изменены имена переменных и функций, структура и комментарии.
   Сохранены ключевые localStorage-ключи: "gameState", "bestScore", "leaders"
   =========================================================== */

/* ====== Конфигурация игры (короткие имена) ====== */
const N = 4;                    // размер сетки (4x4)
const S_MIN = 1, S_MAX = 3;     // стартовое кол-во тайлов (1..3)
const A_MIN = 1, A_MAX = 2;     // добавляемое после хода (1..2)
const MAX_HISTORY = 100;        // разрешённая длина истории undo

/* ====== DOM-элементы (переименованы) ====== */
const gridNode = document.getElementById('boardGrid');
const scoreNode = document.getElementById('scoreVal');
const bestNode = document.getElementById('bestVal');
const undoBtn = document.getElementById('undoBtn');
const newBtn = document.getElementById('newBtn');
const leadersBtn = document.getElementById('leadersBtn');

const overlayGO = document.getElementById('overlayGameOver');
const goMsg = document.getElementById('gameOverMsg');
const nameInput = document.getElementById('nameInput');
const restartBtn = document.getElementById('restartBtn');
const savedNote = document.getElementById('savedNote');

const wrap = document.getElementById('wrapBoard');
const mobileNav = document.getElementById('mobileNav');

const leadersModal = document.getElementById('leadersModal');
const leadersBody = document.getElementById('leadersBody');
const closeLeadersBtn = document.getElementById('closeLeadersBtn');
const clearLeadersBtn = document.getElementById('clearLeadersBtn');

/* ====== Состояние игры (новые имена) ====== */
let field = [];         // матрица N x N с числами (0 = пусто)
let pts = 0;            // текущие очки
let best = 0;           // лучший результат
let hist = [];          // история состояний для undo [{field, pts}, ...]
let isOver = false;     // флаг game over
let leaderSaved = false; // флаг, что при завершении лидер уже сохранён

/* ====== Вспомогательные утилиты ====== */

/** Безопасная проверка наличия DOM-узла */
const exists = el => !!el;

/** Клонирование поля (глубокое) */
const cloneField = f => f.map(r => r.slice());

/** Проверка, что board валиден (массив N x N чисел) */
function validField(obj) {
  if (!Array.isArray(obj) || obj.length !== N) return false;
  for (let r = 0; r < N; r++) {
    if (!Array.isArray(obj[r]) || obj[r].length !== N) return false;
    for (let c = 0; c < N; c++) {
      if (typeof obj[r][c] !== 'number' || !Number.isFinite(obj[r][c])) return false;
    }
  }
  return true;
}

/* ====== Сохранение / загрузка состояния (localStorage) ====== */
function persistState() {
  try {
    localStorage.setItem('gameState', JSON.stringify({ field, pts, hist, best }));
  } catch (e) { /* ignore storage errors */ }
}

function loadState() {
  try {
    const s = localStorage.getItem('gameState');
    if (!s) return false;
    const obj = JSON.parse(s);
    if (!obj || !validField(obj.field)) return false;
    field = obj.field;
    pts = typeof obj.pts === 'number' ? obj.pts : 0;
    hist = Array.isArray(obj.hist) ? obj.hist : [];
    best = typeof obj.best === 'number' ? obj.best : Number(localStorage.getItem('bestScore') || 0);
    return true;
  } catch (e) { return false; }
}

function loadBestScore() {
  const b = Number(localStorage.getItem('bestScore') || '0');
  best = isNaN(b) ? 0 : b;
  if (exists(bestNode)) bestNode.textContent = best;
}

/* ====== Создание DOM-сетки и контейнера плиток ====== */
function buildGridDOM() {
  if (!exists(gridNode)) return;
  gridNode.replaceChildren();

  // создаём пустые ячейки (визуально)
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      gridNode.appendChild(cell);
    }
  }

  // контейнер для плиток поверх ячеек
  let tilesWrap = gridNode.querySelector('.tile-container');
  if (!tilesWrap) {
    tilesWrap = document.createElement('div');
    tilesWrap.className = 'tile-container';
    gridNode.appendChild(tilesWrap);
  } else {
    tilesWrap.replaceChildren();
  }
}

/* ====== Рендер плиток (позиционирование ABSOLUTE) ====== */
/*
  renderTiles(optionalTiles, addedPositions)
  - optionalTiles: если передать массив плиток, рендерит их (используется редко)
  - addedPositions: массив {r,c} для пометки новых плиток (анимация)
*/
let lastDir = null;
let lastWasMove = false;

function renderTiles(passed, added = []) {
  const wrapTiles = document.querySelector('.tile-container');
  if (!wrapTiles) return;

  // собрать список тайлов из field, если не переданы
  const tiles = Array.isArray(passed) ? passed : (function collect(){
    const out = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = field[r][c];
        if (v !== 0) {
          const isNew = added.some(p => p.r === r && p.c === c);
          out.push({ v, r, c, isNew, merged: false });
        }
      }
    }
    return out;
  })();

  wrapTiles.replaceChildren();

  // размеры ячейки вычисляем по первой .cell (адаптивно)
  const cell = gridNode.querySelector('.cell');
  const gStyle = getComputedStyle(gridNode);
  const gap = parseFloat(gStyle.getPropertyValue('gap')) || parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 0;
  const padLeft = parseFloat(gStyle.paddingLeft) || 0;
  const padTop = parseFloat(gStyle.paddingTop) || 0;
  const w = cell ? cell.getBoundingClientRect().width : (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 88);
  const h = cell ? cell.getBoundingClientRect().height : w;
  const stepX = w + gap;
  const stepY = h + gap;

  tiles.forEach(t => {
    const el = document.createElement('div');
    el.className = `tile tile-${t.v}`;
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    inner.textContent = t.v;
    el.appendChild(inner);

    el.style.position = 'absolute';
    el.style.left = `${padLeft + t.c * stepX}px`;
    el.style.top = `${padTop + t.r * stepY}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = 'translate(0,0)';

    if (t.isNew) el.classList.add('tile-new');
    if (t.merged) el.classList.add('tile-merged');

    // простая анимация смещения при последнем ходе
    if (lastWasMove && lastDir && !t.isNew && !t.merged) {
      if (lastDir === 'left')  el.style.transform = `translateX(${stepX}px)`;
      if (lastDir === 'right') el.style.transform = `translateX(${-stepX}px)`;
      if (lastDir === 'up')    el.style.transform = `translateY(${stepY}px)`;
      if (lastDir === 'down')  el.style.transform = `translateY(${-stepY}px)`;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{ el.style.transform = 'translate(0,0)'; }));
    }

    el.addEventListener('animationend', () => {
      el.classList.remove('tile-new', 'tile-merged');
    });

    wrapTiles.appendChild(el);
  });

  if (exists(scoreNode)) scoreNode.textContent = String(pts || 0);
  if (exists(bestNode)) bestNode.textContent = String(best || 0);
}

/* ====== Игровая логика: создание пустого поля и добавление случайных тайлов ====== */
function makeEmptyField() {
  field = Array.from({ length: N }, () => Array(N).fill(0));
}

function getEmptyCells() {
  const res = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (field[r][c] === 0) res.push({ r, c });
  return res;
}

/** Добавить count случайных тайлов (2 или 4) и вернуть список добавленных позиций */
function addRandom(count) {
  const empty = getEmptyCells();
  if (!empty.length) return [];
  const toAdd = Math.min(count, empty.length);
  const added = [];
  for (let i = 0; i < toAdd; i++) {
    const idx = Math.floor(Math.random() * empty.length);
    const { r, c } = empty.splice(idx, 1)[0];
    field[r][c] = Math.random() < 0.9 ? 2 : 4;
    added.push({ r, c });
  }
  return added;
}

/* ====== Слияние одной строки/столбца (поведение как в вашем коде — несколько проходов,
         чтобы при [4,4,4,4] конечный результат был [16,0,0,0]) ====== */

/** Сжать ряд влево (удалить нули между числами) */
function compress(arr) {
  const a = arr.filter(x => x !== 0);
  while (a.length < N) a.push(0);
  return a;
}

/**
 * mergeArray — делает итеративные слияния пока возможны
 * возвращает {arr: newLine, gained: сумма_очки}
 */
function mergeArray(line) {
  let gained = 0;
  let arr = compress(line);
  let mergedHappened = true;

  // цикл повторяется, чтобы результат [4,4,4,4] -> [16,0,0,0]
  while (mergedHappened) {
    mergedHappened = false;
    for (let i = 0; i < N - 1; i++) {
      if (arr[i] !== 0 && arr[i] === arr[i + 1]) {
        arr[i] = arr[i] * 2;
        arr[i + 1] = 0;
        gained += arr[i];
        mergedHappened = true;
      }
    }
    if (mergedHappened) arr = compress(arr);
  }
  return { arr, gained };
}

/* ====== Перемещения (внутренние реализации, которые изменяют `field`) ====== */
function eqArr(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function moveLeftImpl() {
  let moved = false, gainedTotal = 0;
  for (let r = 0; r < N; r++) {
    const old = field[r].slice();
    const res = mergeArray(old.slice());
    field[r] = res.arr;
    if (!eqArr(old, field[r])) moved = true;
    gainedTotal += res.gained;
  }
  return { moved, gainedTotal };
}

function moveRightImpl() {
  let moved = false, gainedTotal = 0;
  for (let r = 0; r < N; r++) {
    const old = field[r].slice();
    const rev = old.slice().reverse();
    const res = mergeArray(rev);
    field[r] = res.arr.reverse();
    if (!eqArr(old, field[r])) moved = true;
    gainedTotal += res.gained;
  }
  return { moved, gainedTotal };
}

function moveUpImpl() {
  let moved = false, gainedTotal = 0;
  for (let c = 0; c < N; c++) {
    const col = field.map(row => row[c]);
    const res = mergeArray(col);
    for (let r = 0; r < N; r++) field[r][c] = res.arr[r];
    if (!eqArr(col, res.arr)) moved = true;
    gainedTotal += res.gained;
  }
  return { moved, gainedTotal };
}

function moveDownImpl() {
  let moved = false, gainedTotal = 0;
  for (let c = 0; c < N; c++) {
    const col = field.map(row => row[c]);
    const rev = col.slice().reverse();
    const res = mergeArray(rev);
    const final = res.arr.reverse();
    for (let r = 0; r < N; r++) field[r][c] = final[r];
    if (!eqArr(col, final)) moved = true;
    gainedTotal += res.gained;
  }
  return { moved, gainedTotal };
}

/* ====== Выполнение хода (перезапись истории, обновление очков, добавление тайлов, render) ====== */
function doMove(dir) {
  if (isOver) return;
  // сохраняем состояние в историю для undo
  try { hist.push({ field: cloneField(field), pts }); } catch (e) { /* ignore */ }
  if (hist.length > MAX_HISTORY) hist.shift();

  let res;
  if (dir === 'left') res = moveLeftImpl();
  else if (dir === 'right') res = moveRightImpl();
  else if (dir === 'up') res = moveUpImpl();
  else if (dir === 'down') res = moveDownImpl();
  else return;

  lastDir = dir;
  lastWasMove = !!res.moved;

  if (!res.moved) {
    // если ход не изменил поле — откатываем запись в историю
    hist.pop();
    checkGameOver();
    lastDir = null;
    lastWasMove = false;
    return;
  }

  // увеличить очки
  pts += res.gainedTotal;

  // добавить 1..2 новых плитки
  const toAdd = A_MIN + Math.floor(Math.random() * (A_MAX - A_MIN + 1));
  const added = addRandom(toAdd);

  // обновить лучший
  if (pts > best) {
    best = pts;
    try { localStorage.setItem('bestScore', String(best)); } catch (e) {}
  }

  persistState();
  renderTiles(undefined, added);
  checkGameOver();

  setTimeout(() => { lastDir = null; lastWasMove = false; }, 300);
}

/* ====== Обработка клавиатуры ====== */
function onKey(e) {
  if (isOver) return;
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); doMove('left'); break;
    case 'ArrowRight': e.preventDefault(); doMove('right'); break;
    case 'ArrowUp': e.preventDefault(); doMove('up'); break;
    case 'ArrowDown': e.preventDefault(); doMove('down'); break;
  }
}

/* ====== Undo (отмена хода) ====== */
function undo() {
  if (isOver) return;
  const prev = hist.pop();
  if (!prev) return;
  field = cloneField(prev.field);
  pts = prev.pts;

  // пересчёт best: берем максимум из истории и текущего
  try {
    const allPts = [...(hist.map(h => h.pts)), pts].filter(x => typeof x === 'number');
    const recalc = allPts.length ? Math.max(...allPts) : pts;
    if (best !== recalc) {
      best = recalc;
      try { localStorage.setItem('bestScore', String(best)); } catch (e) {}
    }
  } catch (e) { best = pts; }

  renderTiles();
  if (exists(bestNode)) bestNode.textContent = String(best);
  persistState();
}

/* ====== Проверка доступных ходов (наличие пустой клетки или одинаковых соседей) ====== */
function hasMoves() {
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = field[r][c];
      if (v === 0) return true;
      if (c + 1 < N && field[r][c + 1] === v) return true;
      if (r + 1 < N && field[r + 1][c] === v) return true;
    }
  }
  return false;
}

/* ====== Лидерборд (сохранение, автосохранение при game over, UI) ====== */
function saveLeader(name) {
  try {
    const raw = localStorage.getItem('leaders') || '[]';
    let arr = JSON.parse(raw);
    if (!Array.isArray(arr)) arr = [];
    arr.push({ name: name || 'Аноним', score: pts, date: new Date().toLocaleString() });
    arr.sort((a, b) => b.score - a.score);
    if (arr.length > 10) arr = arr.slice(0, 10);
    localStorage.setItem('leaders', JSON.stringify(arr));
    refreshLeadersUI();
    if (exists(savedNote)) savedNote.classList.remove('hidden');
  } catch (e) {}
}

function autoSaveLeaderIfNeeded() {
  if (leaderSaved) return;
  const nm = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
  saveLeader(nm || 'Аноним');
  leaderSaved = true;
}

function refreshLeadersUI() {
  if (!exists(leadersBody)) return;
  leadersBody.replaceChildren();
  try {
    const arr = JSON.parse(localStorage.getItem('leaders') || '[]') || [];
    arr.forEach((it, i) => {
      const tr = document.createElement('tr');
      tr.appendChild(Object.assign(document.createElement('td'), { textContent: String(i + 1) }));
      tr.appendChild(Object.assign(document.createElement('td'), { textContent: it.name }));
      tr.appendChild(Object.assign(document.createElement('td'), { textContent: String(it.score) }));
      tr.appendChild(Object.assign(document.createElement('td'), { textContent: it.date }));
      leadersBody.appendChild(tr);
    });
  } catch (e) {}
}

function clearLeaders() {
  try { localStorage.removeItem('leaders'); } catch (e) {}
  refreshLeadersUI();
}

/* ====== Показ / скрытие мобильных контролов (по ширине) ====== */
function showMobileControlsAdaptive() {
  if (!exists(mobileNav)) return;
  const small = window.matchMedia('(max-width:520px)').matches;
  if (small && !isOver) {
    mobileNav.classList.remove('hidden');
    mobileNav.setAttribute('aria-hidden', 'false');
  } else {
    mobileNav.classList.add('hidden');
    mobileNav.setAttribute('aria-hidden', 'true');
  }
}

/* ====== Инициализация мобильных кнопок (нажатия) ====== */
function initMobileBtns() {
  if (!exists(mobileNav)) return;
  mobileNav.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-dir]');
    if (!btn) return;
    doMove(btn.dataset.dir);
  });
}

/* ====== Свайпы: touch и pointer ====== */
let tStartX = 0, tStartY = 0;
function onTouchStart(e) { const t = e.touches ? e.touches[0] : e; tStartX = t.clientX; tStartY = t.clientY; }
function onTouchEnd(e) {
  const t = (e.changedTouches && e.changedTouches[0]) || e;
  const dx = t.clientX - tStartX, dy = t.clientY - tStartY;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < 20) return;
  ax > ay ? (dx > 0 ? doMove('right') : doMove('left')) : (dy > 0 ? doMove('down') : doMove('up'));
}

let pStartX = null, pStartY = null;
function onPointerDown(e) { pStartX = e.clientX; pStartY = e.clientY; try { wrap.setPointerCapture(e.pointerId); } catch (e) {} }
function onPointerUp(e) {
  if (pStartX === null) return;
  const dx = e.clientX - pStartX, dy = e.clientY - pStartY;
  pStartX = pStartY = null;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < 10) return;
  ax > ay ? (dx > 0 ? doMove('right') : doMove('left')) : (dy > 0 ? doMove('down') : doMove('up'));
}

/* ====== Показ overlay game over и проверка состояния ====== */
function showGameOverOverlay() {
  if (!exists(overlayGO)) return;
  overlayGO.classList.remove('hidden');
  overlayGO.style.display = '';
  overlayGO.setAttribute('aria-hidden', 'false');

  if (exists(mobileNav)) {
    mobileNav.classList.add('hidden');
    mobileNav.setAttribute('aria-hidden', 'true');
  }
  if (exists(goMsg)) goMsg.textContent = `Игра окончена. Ваш счёт: ${pts}`;
}

function checkGameOver() {
  if (isOver) return;
  if (hasMoves()) return;
  isOver = true;
  showGameOverOverlay();
}

/* ====== Начало новой игры (сброс состояния) ====== */
function startNew(resetHistory = true) {
  if (isOver) autoSaveLeaderIfNeeded();

  overlayGO?.classList.add('hidden');
  leadersModal?.classList.add('hidden');

  makeEmptyField();
  const startCount = S_MIN + Math.floor(Math.random() * (S_MAX - S_MIN + 1));
  const initial = addRandom(startCount);

  pts = 0;
  hist = [];
  isOver = false;
  leaderSaved = false;
  if (exists(nameInput)) nameInput.value = '';
  savedNote?.classList.add('hidden');

  renderTiles(undefined, initial);
  if (resetHistory) persistState();
  showMobileControlsAdaptive();
}

/* ====== События / привязки ====== */
function attachEvents() {
  if (exists(document)) document.addEventListener('keydown', onKey);
  if (exists(undoBtn)) undoBtn.addEventListener('click', undo);

  const top = document.querySelector('.hdr-bar');
  if (top) { top.style.position = 'relative'; top.style.zIndex = '1000'; }

  if (exists(newBtn)) {
    newBtn.addEventListener('click', () => { if (isOver) autoSaveLeaderIfNeeded(); overlayGO?.classList.add('hidden'); leadersModal?.classList.add('hidden'); startNew(true); }, { capture: true });
    newBtn.addEventListener('pointerdown', () => { if (isOver) autoSaveLeaderIfNeeded(); overlayGO?.classList.add('hidden'); leadersModal?.classList.add('hidden'); startNew(true); });
  }

  if (exists(leadersBtn)) leadersBtn.addEventListener('click', () => { refreshLeadersUI(); leadersModal?.classList.remove('hidden'); mobileNav?.classList.add('hidden'); });

  if (exists(restartBtn)) {
    restartBtn.addEventListener('click', () => { if (isOver) autoSaveLeaderIfNeeded(); overlayGO?.classList.add('hidden'); startNew(true); });
    restartBtn.addEventListener('pointerdown', () => { if (isOver) autoSaveLeaderIfNeeded(); overlayGO?.classList.add('hidden'); startNew(true); });
  }

  if (exists(closeLeadersBtn)) closeLeadersBtn.addEventListener('click', () => leadersModal?.classList.add('hidden'));
  if (exists(clearLeadersBtn)) clearLeadersBtn.addEventListener('click', clearLeaders);

  initMobileBtns();
  window.addEventListener('resize', showMobileControlsAdaptive);

  if (exists(wrap)) {
    wrap.addEventListener('touchstart', onTouchStart, { passive: true });
    wrap.addEventListener('touchend', onTouchEnd, { passive: true });
    wrap.addEventListener('pointerdown', onPointerDown);
    wrap.addEventListener('pointerup', onPointerUp);
  }

  if (exists(overlayGO)) {
    overlayGO.addEventListener('click', ev => { if (ev.target === overlayGO) overlayGO.classList.add('hidden'); });
  }

  if (exists(leadersModal)) {
    leadersModal.addEventListener('click', ev => { if (ev.target === leadersModal) leadersModal.classList.add('hidden'); });
  }

  if (exists(nameInput)) {
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        autoSaveLeaderIfNeeded();
        savedNote?.classList.remove('hidden');
      }
    });
  }
}

/* ====== Запуск (boot) ====== */
function boot() {
  buildGridDOM();
  attachEvents();
  loadBestScore();
  showMobileControlsAdaptive();

  const loaded = loadState();
  if (!loaded || !validField(field)) {
    startNew(true);
  } else {
    renderTiles();
    isOver = !hasMoves();
    if (isOver) showGameOverOverlay();
  }
}

/* старт */
boot();
