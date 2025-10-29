/* ========================= Исправленный script.js (полная версия) =========================
- Надёжное создание .tile-container
- Точное позиционирование плиток (left/top) с учётом gap/padding
- addRandomTiles возвращает добавленные позиции -> render помечает isNew
- Движение анимируется только для не-новых плиток и ровно на шаг (cell + gap)
- Защита от ошибок null, безопасный load/save
==================================================================================== */

const SIZE = 4;
const START_MIN = 1;
const START_MAX = 3;
const NEW_MIN = 1;
const NEW_MAX = 2;

/* DOM */
const gridEl = document.getElementById('grid');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best-score');
const btnUndo = document.getElementById('btn-undo');
const btnNew = document.getElementById('btn-new');
const btnBoard = document.getElementById('btn-board');
const gameOverOverlay = document.getElementById('game-over');
const gameOverText = document.getElementById('game-over-text');
const playerNameInput = document.getElementById('player-name');
const restartOverlayBtn = document.getElementById('restart-from-overlay');
const savedMsg = document.getElementById('saved-msg');
const boardWrap = document.getElementById('board-wrap');
const mobileControls = document.getElementById('mobile-controls');
const leaderboardModal = document.getElementById('leaderboard-modal');
const leaderboardBody = document.getElementById('leaderboard-body');
const btnCloseLeaders = document.getElementById('close-leaders');
const btnClearLeaders = document.getElementById('clear-leaders');

/* State */
// анимация движения
let lastMoveDir = null;
let lastMoveWasMove = false;

let board = [];
let score = 0;
let bestScore = 0;
let history = [];
let gameOver = false;
let leaderSaved = false;

/* ---------- Helpers ---------- */
const safeEl = (el) => !!el;
const deepCopyBoard = (b) => b.map(row => row.slice());

const isValidBoard = (obj) => {
    if (!Array.isArray(obj) || obj.length !== SIZE) return false;
    for (let r = 0; r < SIZE; r++) {
        if (!Array.isArray(obj[r]) || obj[r].length !== SIZE) return false;
        for (let c = 0; c < SIZE; c++) {
            if (typeof obj[r][c] !== 'number' || !Number.isFinite(obj[r][c])) return false;
        }
    }
    return true;
};

/* ---------- Storage ---------- */
function saveGameStateToStorage() {
    try {
        localStorage.setItem('gameState', JSON.stringify({ board, score, history, bestScore }));
    } catch (e) { /* noop */ }
}

function loadGameStateFromStorage() {
    try {
        const s = localStorage.getItem('gameState');
        if (!s) return false;
        const obj = JSON.parse(s);
        if (!obj || !isValidBoard(obj.board)) return false;
        board = obj.board;
        score = typeof obj.score === 'number' ? obj.score : 0;
        history = Array.isArray(obj.history) ? obj.history : [];
        bestScore = typeof obj.bestScore === 'number' ? obj.bestScore : Number(localStorage.getItem('bestScore') || 0);
        return true;
    } catch (e) { return false; }
}

function loadBest() {
    const b = Number(localStorage.getItem('bestScore') || '0');
    bestScore = isNaN(b) ? 0 : b;
    if (safeEl(bestEl)) bestEl.textContent = bestScore;
}

/* ---------- Grid DOM ---------- */
function initGridDOM() {
    if (!safeEl(gridEl)) return;
    // очистим существующие ячейки
    gridEl.replaceChildren();

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.r = r;
            cell.dataset.c = c;
            gridEl.appendChild(cell);
        }
    }

    // гарантируем, что grid является позиционированным контейнером для абсолютных плиток
    gridEl.style.position = gridEl.style.position || 'relative';

    // создаём .tile-container (или очищаем, если уже есть)
    let container = gridEl.querySelector('.tile-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'tile-container';
        gridEl.appendChild(container); // в конце — над ячейками
    } else {
        container.replaceChildren();
    }
}

/* ---------- Render ---------- */
/*
 render(passedTiles, addedPositions)
 - passedTiles: optional array of tile objects (if you want custom)
 - addedPositions: optional array [{r,c}, ...] — позиции, которые были только что добавлены -> помечаются isNew
*/
function render(passedTiles, addedPositions = []) {
  const container = document.querySelector('.tile-container');
  if (!container) return;
  const grid = gridEl;
  if (!grid) return;

  // Собираем плитки из board (если passedTiles не переданы)
  const gridTiles = Array.isArray(passedTiles) ? passedTiles : (function buildFromBoard(){
    const arr = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = board[r][c];
        if (v !== 0) {
          const isNew = addedPositions.some(p => p.r === r && p.c === c);
          arr.push({ value: v, x: c, y: r, isNew: !!isNew, merged: false });
        }
      }
    }
    return arr;
  })();

  // очистка контейнера
  container.innerHTML = '';

  // реальные размеры и шаг
  const gridStyle = getComputedStyle(grid);
  // поддержка старых браузеров: `gap` может называться column-gap/row-gap — но большинство современных возвращают gap
  const gap = parseFloat(gridStyle.getPropertyValue('gap')) || parseFloat(gridStyle.getPropertyValue('column-gap')) || parseFloat(gridStyle.getPropertyValue('row-gap')) || parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 0;
  const padLeft = parseFloat(gridStyle.paddingLeft) || 0;
  const padTop = parseFloat(gridStyle.paddingTop) || 0;

  const firstCell = grid.querySelector('.cell');
  const cellWidth = firstCell ? firstCell.getBoundingClientRect().width : (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 88);
  const cellHeight = firstCell ? firstCell.getBoundingClientRect().height : cellWidth;
  const stepX = cellWidth + gap;
  const stepY = cellHeight + gap;

  gridTiles.forEach(tile => {
    const tileEl = document.createElement('div');
    tileEl.className = `tile tile-${tile.value}`;
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    inner.textContent = tile.value;
    tileEl.appendChild(inner);

    // сбросим возможный inset от старого CSS
    tileEl.style.inset = 'auto';
    tileEl.style.right = 'auto';
    tileEl.style.bottom = 'auto';

    // позиционирование: учитываем padding + шаг с gap
    const left = padLeft + tile.x * stepX;
    const top = padTop + tile.y * stepY;
    tileEl.style.position = 'absolute';
    tileEl.style.left = `${left}px`;
    tileEl.style.top = `${top}px`;
    tileEl.style.width = `${cellWidth}px`;
    tileEl.style.height = `${cellHeight}px`;
    tileEl.style.transform = 'translate(0,0)';

    if (tile.isNew) tileEl.classList.add('tile-new');
    if (tile.merged) tileEl.classList.add('tile-merged');

    // Анимация движения: применяем ТОЛЬКО к не-новым и не-слитым плиткам
    if (lastMoveWasMove && lastMoveDir && !tile.isNew && !tile.merged) {
      if (lastMoveDir === 'left')  tileEl.style.transform = `translateX(${stepX}px)`;
      if (lastMoveDir === 'right') tileEl.style.transform = `translateX(${-stepX}px)`;
      if (lastMoveDir === 'up')    tileEl.style.transform = `translateY(${stepY}px)`;
      if (lastMoveDir === 'down')  tileEl.style.transform = `translateY(${-stepY}px)`;

      // триггерим переход в следующем кадре
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          tileEl.style.transform = 'translate(0,0)';
        });
      });
    }

    container.appendChild(tileEl);

    // очистка классов после завершения animation (если применялось)
    tileEl.addEventListener('animationend', () => {
      tileEl.classList.remove('tile-new', 'tile-merged');
    });
  });

  // Обновим счёт
  if (safeEl(scoreEl)) scoreEl.textContent = String(score || 0);
  if (safeEl(bestEl)) bestEl.textContent = String(bestScore || 0);
}

/* ---------- Board helpers ---------- */
function createEmptyBoard() {
    board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

// Возвращает массив добавленных позиций: [{r,c}, ...]
function addRandomTiles(count) {
    const empty = [];
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (board[r][c] === 0) empty.push({ r, c });
    if (!empty.length) return [];

    const toAdd = Math.min(count, empty.length);
    const added = [];
    for (let i = 0; i < toAdd; i++) {
        const idx = Math.floor(Math.random() * empty.length);
        const { r, c } = empty.splice(idx, 1)[0];
        board[r][c] = Math.random() < 0.9 ? 2 : 4;
        added.push({ r, c });
    }
    return added;
}

/* ---------- Move logic ---------- */
function compressLine(arr) {
    const newArr = arr.filter(v => v !== 0);
    while (newArr.length < SIZE) newArr.push(0);
    return newArr;
}

function mergeLine(arr) {
    // arr — предполагается как массив длины SIZE (вход может содержать нули)
    let gained = 0;
    let mergedOccurred = true;

    while (mergedOccurred) {
        arr = compressLine(arr);
        mergedOccurred = false;
        for (let i = 0; i < SIZE - 1; i++) {
            if (arr[i] !== 0 && arr[i] === arr[i + 1]) {
                arr[i] = arr[i] * 2;
                arr[i + 1] = 0;
                gained += arr[i];
                mergedOccurred = true;
            }
        }
    }

    arr = compressLine(arr);
    return { line: arr, gained };
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/* ---------- Internal moves ---------- */
function moveLeftInternal() {
    let moved = false, gainedTotal = 0;
    for (let r = 0; r < SIZE; r++) {
        const old = board[r].slice();
        const res = mergeLine(compressLine(old));
        board[r] = res.line;
        if (!arraysEqual(old, board[r])) moved = true;
        gainedTotal += res.gained;
    }
    return { moved, gainedTotal };
}

function moveRightInternal() {
    let moved = false, gainedTotal = 0;
    for (let r = 0; r < SIZE; r++) {
        const old = board[r].slice();
        const res = mergeLine(compressLine(old.slice().reverse()));
        board[r] = res.line.reverse();
        if (!arraysEqual(old, board[r])) moved = true;
        gainedTotal += res.gained;
    }
    return { moved, gainedTotal };
}

function moveUpInternal() {
    let moved = false, gainedTotal = 0;
    for (let c = 0; c < SIZE; c++) {
        const col = board.map(r => r[c]);
        const res = mergeLine(compressLine(col));
        for (let r = 0; r < SIZE; r++) board[r][c] = res.line[r];
        if (!arraysEqual(col, res.line)) moved = true;
        gainedTotal += res.gained;
    }
    return { moved, gainedTotal };
}

function moveDownInternal() {
    let moved = false, gainedTotal = 0;
    for (let c = 0; c < SIZE; c++) {
        const col = board.map(r => r[c]);
        const res = mergeLine(compressLine(col.slice().reverse()));
        const final = res.line.reverse();
        for (let r = 0; r < SIZE; r++) board[r][c] = final[r];
        if (!arraysEqual(col, final)) moved = true;
        gainedTotal += res.gained;
    }
    return { moved, gainedTotal };
}

/* ---------- Perform move ---------- */
function performMove(direction) {
    if (gameOver) return;
    try { history.push({ board: deepCopyBoard(board), score }); } catch(e){}
    if (history.length > 100) history.shift();

    let res;
    if (direction === 'left') res = moveLeftInternal();
    else if (direction === 'right') res = moveRightInternal();
    else if (direction === 'up') res = moveUpInternal();
    else if (direction === 'down') res = moveDownInternal();
    else return;

    // Устанавливаем направление для анимации — только если ход изменил доску
    lastMoveDir = direction;
    lastMoveWasMove = !!res.moved;

    if (!res.moved) {
        // неудачный ход — откатываем историю
        history.pop();
        checkGameOverCondition();
        lastMoveDir = null;
        lastMoveWasMove = false;
        return;
    }

    // успешный ход
    score += res.gainedTotal;
    const toAdd = NEW_MIN + Math.floor(Math.random() * (NEW_MAX - NEW_MIN + 1));
    const added = addRandomTiles(toAdd); // получаем массив добавленных позиций
    if (score > bestScore) {
        bestScore = score;
        try { localStorage.setItem('bestScore', String(bestScore)); } catch(e){}
    }
    saveGameStateToStorage();

    // рендер — помечаем добавленные плитки как isNew
    render(undefined, added);

    // проверяем конец игры
    checkGameOverCondition();

    // очистим флаги движения через время, чтобы не мешать следующим анимациям
    setTimeout(() => { lastMoveDir = null; lastMoveWasMove = false; }, 300);
}

/* ---------- Keyboard & undo ---------- */
function onKey(e) {
    if (gameOver) return;
    switch(e.key){
        case 'ArrowLeft': e.preventDefault(); performMove('left'); break;
        case 'ArrowRight': e.preventDefault(); performMove('right'); break;
        case 'ArrowUp': e.preventDefault(); performMove('up'); break;
        case 'ArrowDown': e.preventDefault(); performMove('down'); break;
    }
}

function undo() {
    if (gameOver) return;
    const prev = history.pop();
    if (!prev) return;

    // Восстанавливаем доску и счёт
    board = deepCopyBoard(prev.board);
    score = prev.score;

    // === Пересчёт лучшего счёта ===
    try {
        // собираем все очки: из истории + текущее
        const allScores = [...(history.map(h => h.score)), score].filter(s => typeof s === 'number');
        const recomputedBest = allScores.length ? Math.max(...allScores) : score;

        // если текущий bestScore больше, чем recomputed — обновляем и localStorage
        if (bestScore !== recomputedBest) {
            bestScore = recomputedBest;
            try {
                localStorage.setItem('bestScore', String(bestScore));
            } catch (e) { /* ignore */ }
        }
    } catch (e) {
        bestScore = score;
    }

    // Обновляем UI и сохраняем
    render();
    if (safeEl(bestEl)) bestEl.textContent = String(bestScore);
    saveGameStateToStorage();
}



/* ---------- Game over ---------- */
function hasMovesAvailable() {
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
            const v = board[r][c];
            if (v === 0) return true;
            if (c + 1 < SIZE && board[r][c + 1] === v) return true;
            if (r + 1 < SIZE && board[r + 1][c] === v) return true;
        }
    return false;
}

function saveLeader(name) {
    try {
        const raw = localStorage.getItem('leaders') || '[]';
        let arr = JSON.parse(raw);
        if (!Array.isArray(arr)) arr = [];
        arr.push({ name: name || 'Аноним', score, date: new Date().toLocaleString() });
        arr.sort((a, b) => b.score - a.score);
        if (arr.length > 10) arr = arr.slice(0, 10);
        localStorage.setItem('leaders', JSON.stringify(arr));
        updateLeaderboardUI();
        if (safeEl(savedMsg)) savedMsg.classList.remove('hidden');
    } catch (e) {}
}

function autoSaveLeaderIfNeeded() {
    if (leaderSaved) return;
    const name = (playerNameInput && playerNameInput.value) ? playerNameInput.value.trim() : '';
    saveLeader(name || 'Аноним');
    leaderSaved = true;
}

function showGameOverOverlay() {
    if (!safeEl(gameOverOverlay)) return;
    gameOverOverlay.classList.remove('hidden');
    try { gameOverOverlay.style.display = ''; } catch(e){}
    gameOverOverlay.setAttribute('aria-hidden', 'false');

    if (safeEl(mobileControls)) {
        mobileControls.classList.add('hidden');
        mobileControls.setAttribute('aria-hidden', 'true');
    }
    if (safeEl(gameOverText)) gameOverText.textContent = `Игра окончена. Ваш счёт: ${score}`;
}

function checkGameOverCondition() {
    if (gameOver) return;
    if (hasMovesAvailable()) return;
    gameOver = true;
    showGameOverOverlay();
}

/* ---------- Start / New Game ---------- */
function startNewGame(saveHistory = true) {
    if (gameOver) autoSaveLeaderIfNeeded();

    gameOverOverlay?.classList.add('hidden');
    leaderboardModal?.classList.add('hidden');
    createEmptyBoard();
    const startCount = START_MIN + Math.floor(Math.random() * (START_MAX - START_MIN + 1));
    const initialAdded = addRandomTiles(startCount);

    score = 0;
    history = [];
    gameOver = false;
    leaderSaved = false;

    if (playerNameInput) playerNameInput.value = '';
    savedMsg?.classList.add('hidden');

    render(undefined, initialAdded);
    if (saveHistory) saveGameStateToStorage();
    showMobileControlsIfNeeded();
}

/* ---------- Leaderboard UI ---------- */
function updateLeaderboardUI() {
    if (!safeEl(leaderboardBody)) return;
    leaderboardBody.replaceChildren();
    try {
        const arr = JSON.parse(localStorage.getItem('leaders') || '[]') || [];
        arr.forEach((item, i) => {
            const tr = document.createElement('tr');
            tr.appendChild(Object.assign(document.createElement('td'), { textContent: String(i+1) }));
            tr.appendChild(Object.assign(document.createElement('td'), { textContent: item.name }));
            tr.appendChild(Object.assign(document.createElement('td'), { textContent: String(item.score) }));
            tr.appendChild(Object.assign(document.createElement('td'), { textContent: item.date }));
            leaderboardBody.appendChild(tr);
        });
    } catch(e){}
}

function clearLeaders() {
    try { localStorage.removeItem('leaders'); } catch(e){}
    updateLeaderboardUI();
}

/* ---------- Mobile controls / swipe ---------- */
function showMobileControlsIfNeeded() {
    if (!safeEl(mobileControls)) return;
    const isSmall = window.matchMedia('(max-width:520px)').matches;
    if (isSmall && !gameOver) {
        mobileControls.classList.remove('hidden');
        mobileControls.setAttribute('aria-hidden','false');
    } else {
        mobileControls.classList.add('hidden');
        mobileControls.setAttribute('aria-hidden','true');
    }
}

function initMobileButtons() {
    if (!safeEl(mobileControls)) return;
    mobileControls.addEventListener('click', ev => {
        const btn = ev.target.closest('button[data-dir]');
        if (!btn) return;
        performMove(btn.dataset.dir);
    });
}

let touchStartX=0, touchStartY=0;
function onTouchStart(e){ const t = e.touches ? e.touches[0] : e; touchStartX=t.clientX; touchStartY=t.clientY; }
function onTouchEnd(e){
    const t = (e.changedTouches && e.changedTouches[0]) || e;
    const dx = t.clientX-touchStartX, dy=t.clientY-touchStartY;
    const absX=Math.abs(dx), absY=Math.abs(dy);
    if(Math.max(absX,absY)<20) return;
    absX>absY ? (dx>0 ? performMove('right') : performMove('left')) : (dy>0 ? performMove('down') : performMove('up'));
}

let pointerStartX=null, pointerStartY=null;
function onPointerDown(e){ pointerStartX=e.clientX; pointerStartY=e.clientY; try{ boardWrap.setPointerCapture(e.pointerId); } catch(e){} }
function onPointerUp(e){
    if(pointerStartX===null) return;
    const dx=e.clientX-pointerStartX, dy=e.clientY-pointerStartY;
    pointerStartX=pointerStartY=null;
    const absX=Math.abs(dx), absY=Math.abs(dy);
    if(Math.max(absX,absY)<10) return;
    absX>absY ? (dx>0 ? performMove('right') : performMove('left')) : (dy>0 ? performMove('down') : performMove('up'));
}

/* ---------- Attach events ---------- */
function attachEvents() {
    if(safeEl(document)) document.addEventListener('keydown', onKey);
    if(safeEl(btnUndo)) btnUndo.addEventListener('click', undo);

    const topbar=document.querySelector('.topbar');
    if(topbar){ topbar.style.position='relative'; topbar.style.zIndex='1000'; }

    if(safeEl(btnNew)){
        btnNew.addEventListener('click', e=>{ if(gameOver) autoSaveLeaderIfNeeded(); gameOverOverlay?.classList.add('hidden'); leaderboardModal?.classList.add('hidden'); startNewGame(true); }, {capture:true});
        btnNew.addEventListener('pointerdown', e=>{ if(gameOver) autoSaveLeaderIfNeeded(); gameOverOverlay?.classList.add('hidden'); leaderboardModal?.classList.add('hidden'); startNewGame(true); });
    }

    if(safeEl(btnBoard)) btnBoard.addEventListener('click', ()=>{ updateLeaderboardUI(); leaderboardModal?.classList.remove('hidden'); mobileControls?.classList.add('hidden'); });

    if(safeEl(restartOverlayBtn)){
        restartOverlayBtn.addEventListener('click', ()=>{ if(gameOver) autoSaveLeaderIfNeeded(); gameOverOverlay?.classList.add('hidden'); startNewGame(true); });
        restartOverlayBtn.addEventListener('pointerdown', ()=>{ if(gameOver) autoSaveLeaderIfNeeded(); gameOverOverlay?.classList.add('hidden'); startNewGame(true); });
    }

    if(safeEl(btnCloseLeaders)) btnCloseLeaders.addEventListener('click', ()=>leaderboardModal?.classList.add('hidden'));
    if(safeEl(btnClearLeaders)) btnClearLeaders.addEventListener('click', clearLeaders);

    initMobileButtons();
    window.addEventListener('resize', showMobileControlsIfNeeded);

    if(safeEl(boardWrap)){
        boardWrap.addEventListener('touchstart', onTouchStart, {passive:true});
        boardWrap.addEventListener('touchend', onTouchEnd, {passive:true});
        boardWrap.addEventListener('pointerdown', onPointerDown);
        boardWrap.addEventListener('pointerup', onPointerUp);
    }

    if(safeEl(gameOverOverlay)){
        gameOverOverlay.addEventListener('click', ev=>{ if(ev.target===gameOverOverlay) gameOverOverlay.classList.add('hidden'); });
    }

    if(safeEl(leaderboardModal)){
        leaderboardModal.addEventListener('click', ev=>{ if(ev.target===leaderboardModal) leaderboardModal.classList.add('hidden'); });
    }

    if(safeEl(playerNameInput)){
        playerNameInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); autoSaveLeaderIfNeeded(); savedMsg?.classList.remove('hidden'); }});
    }
}

/* ---------- Boot ---------- */
function boot(){
    initGridDOM();
    attachEvents();
    loadBest();
    showMobileControlsIfNeeded();
    const loaded = loadGameStateFromStorage();
    if(!loaded || !isValidBoard(board)) {
        startNewGame(true);
    } else {
        render();
        gameOver = !hasMovesAvailable();
        if(gameOver) showGameOverOverlay();
    }
}

/* ---------- Run ---------- */
boot();
