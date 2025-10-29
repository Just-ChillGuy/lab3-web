/* ========================= Исправленный script.js =========================
- Добавлена проверка конца игры (checkGameOverCondition)
- Таймер автосохранения лидера при game over и очистка таймера при новой игре
- Защита от ошибок null / безопасные обращения
- Небольшие улучшения в рендере (data-атрибут для стилей)
========================================================================== */

const SIZE = 4;
const START_MIN = 1;
const START_MAX = 3;
const NEW_MIN = 1;
const NEW_MAX = 2;
const AUTO_SAVE_DELAY = 1500; // ms перед автосохранением лидера при game over

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
let board = [];
let score = 0;
let bestScore = 0;
let history = [];
let gameOver = false;
let leaderSaved = false;
let autoSaveTimer = null;

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
    } catch (e) { /* ignore storage errors */ }
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
}

/* ---------- Render ---------- */
function render() {
    if (safeEl(scoreEl)) scoreEl.textContent = score;
    if (safeEl(bestEl)) bestEl.textContent = bestScore;
    if (!safeEl(gridEl)) return;

    const cells = gridEl.querySelectorAll('.cell');
    for (const cell of cells) {
        const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
        cell.replaceChildren();
        const val = (board[r] && typeof board[r][c] === 'number') ? board[r][c] : 0;
        if (val !== 0) {
            const tile = document.createElement('div');
            tile.classList.add('tile', `tile-${val}`, 'new');
            tile.textContent = String(val);
            // добавляем data-value чтобы стили, если используют data-атрибуты, работали
            tile.dataset.value = String(val);
            setTimeout(() => tile.classList.remove('new'), 160);
            cell.appendChild(tile);
        }
    }
}

/* ---------- Board helpers ---------- */
function createEmptyBoard() {
    board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function addRandomTiles(count) {
    const empty = [];
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (board[r][c] === 0) empty.push({ r, c });
    if (!empty.length) return;
    const toAdd = Math.min(count, empty.length);
    for (let i = 0; i < toAdd; i++) {
        const idx = Math.floor(Math.random() * empty.length);
        const { r, c } = empty.splice(idx, 1)[0];
        board[r][c] = Math.random() < 0.9 ? 2 : 4;
    }
}

/* ---------- Move logic ---------- */
function compressLine(arr) {
    const newArr = arr.filter(v => v !== 0);
    while (newArr.length < SIZE) newArr.push(0);
    return newArr;
}

function mergeLine(arr) {
    let gained = 0;
    while (true) {
        let mergedThisPass = false;
        for (let i = 0; i < SIZE - 1; i++) {
            if (arr[i] !== 0 && arr[i] === arr[i + 1]) {
                arr[i] *= 2;
                arr[i + 1] = 0;
                gained += arr[i];
                mergedThisPass = true;
            }
        }
        arr = compressLine(arr);
        if (!mergedThisPass) break;
    }
    return { line: arr, gained };
}

function arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
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

    if (!res.moved) { history.pop(); return; }
    score += res.gainedTotal;
    const toAdd = NEW_MIN + Math.floor(Math.random() * (NEW_MAX - NEW_MIN + 1));
    addRandomTiles(toAdd);
    if (score > bestScore) {
        bestScore = score;
        try { localStorage.setItem('bestScore', String(bestScore)); } catch(e){}
    }
    saveGameStateToStorage();
    render();
    checkGameOverCondition();
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
    board = deepCopyBoard(prev.board);
    score = prev.score;
    render();
    saveGameStateToStorage();
}

/* ---------- Game over ---------- */
function hasMovesAvailable() {
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
            const v = board[r][c];
            if (v === 0) return true;
            if (c+1 < SIZE && board[r][c+1] === v) return true;
            if (r+1 < SIZE && board[r+1][c] === v) return true;
        }
    return false;
}

function saveLeader(name) {
    try {
        const raw = localStorage.getItem('leaders') || '[]';
        let arr = JSON.parse(raw);
        if (!Array.isArray(arr)) arr = [];
        arr.push({ name: name || 'Аноним', score, date: new Date().toLocaleString() });
        arr.sort((a,b) => b.score - a.score);
        if (arr.length > 10) arr = arr.slice(0,10);
        localStorage.setItem('leaders', JSON.stringify(arr));
        updateLeaderboardUI();
        if (safeEl(savedMsg)) savedMsg.classList.remove('hidden');
    } catch(e){ /* ignore */ }
}

function autoSaveLeaderIfNeeded() {
    if (leaderSaved) return;
    const name = (playerNameInput && playerNameInput.value) ? playerNameInput.value.trim() : '';
    saveLeader(name || 'Аноним');
    leaderSaved = true;
}

function showGameOverOverlay() {
    if (safeEl(gameOverOverlay)) gameOverOverlay.classList.remove('hidden');
    if (safeEl(mobileControls)) mobileControls.classList.add('hidden');
    if (safeEl(gameOverText)) gameOverText.textContent = `Игра окончена. Ваш счёт: ${score}`;

    // запуск отложенного автосохранения (если ещё не сохранено)
    if (!leaderSaved) {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            autoSaveLeaderIfNeeded();
            autoSaveTimer = null;
        }, AUTO_SAVE_DELAY);
    }
}

function checkGameOverCondition() {
    // если уже в состоянии gameOver — ничего не делаем
    if (gameOver) return;
    if (!hasMovesAvailable()) {
        gameOver = true;
        showGameOverOverlay();
        // сразу сохранять лидера не обязательно — showGameOverOverlay уже запускает таймер автосохранения
    }
}

/* ---------- Leaderboard UI ---------- */
function updateLeaderboardUI() {
    if (!safeEl(leaderboardBody)) return;
    leaderboardBody.replaceChildren();
    try {
        const arr = JSON.parse(localStorage.getItem('leaders') || '[]') || [];
        arr.forEach((item, i) => {
            const tr = document.createElement('tr');
            const td1 = document.createElement('td'); td1.textContent = String(i+1);
            const td2 = document.createElement('td'); td2.textContent = item.name;
            const td3 = document.createElement('td'); td3.textContent = String(item.score);
            const td4 = document.createElement('td'); td4.textContent = item.date;
            tr.appendChild(td1);
            tr.appendChild(td2);
            tr.appendChild(td3);
            tr.appendChild(td4);
            leaderboardBody.appendChild(tr);
        });
    } catch(e){ /* ignore */ }
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
function onPointerDown(e){ pointerStartX=e.clientX; pointerStartY=e.clientY; try{ boardWrap.setPointerCapture && boardWrap.setPointerCapture(e.pointerId); } catch(e){} }
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
        const startFn = () => { if(gameOver) autoSaveLeaderIfNeeded(); if (safeEl(gameOverOverlay)) gameOverOverlay.classList.add('hidden'); if (safeEl(leaderboardModal)) leaderboardModal.classList.add('hidden'); startNewGame(true); };
        btnNew.addEventListener('click', startFn, {capture:true});
        btnNew.addEventListener('pointerdown', startFn);
    }

    if(safeEl(btnBoard)) btnBoard.addEventListener('click', ()=>{ updateLeaderboardUI(); if (safeEl(leaderboardModal)) leaderboardModal.classList.remove('hidden'); if (safeEl(mobileControls)) mobileControls.classList.add('hidden'); });

    if(safeEl(restartOverlayBtn)){
        const restartFn = () => { if(gameOver) autoSaveLeaderIfNeeded(); if (safeEl(gameOverOverlay)) gameOverOverlay.classList.add('hidden'); startNewGame(true); };
        restartOverlayBtn.addEventListener('click', restartFn);
        restartOverlayBtn.addEventListener('pointerdown', restartFn);
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

/* ---------- Start / New Game ---------- */
function startNewGame(saveHistory=true){
    // очистка таймера автосохранения при новой игре
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    gameOverOverlay?.classList.add('hidden');
    leaderboardModal?.classList.add('hidden');
    createEmptyBoard();
    const startCount = START_MIN + Math.floor(Math.random()*(START_MAX-START_MIN+1));
    addRandomTiles(startCount);
    score = 0; history = []; gameOver = false; leaderSaved = false;
    if(playerNameInput) playerNameInput.value='';
    savedMsg?.classList.add('hidden');
    render();
    if(saveHistory) saveGameStateToStorage();
    showMobileControlsIfNeeded();
}

/* ---------- Boot ---------- */
/* ---------- Boot ---------- */
function boot() {
    initGridDOM();
    createEmptyBoard();
    attachEvents();
    loadBest();
    showMobileControlsIfNeeded();

    const loaded = loadGameStateFromStorage();
    if (loaded && isValidBoard(board)) {
        render();
        if (!hasMovesAvailable()) {
            gameOver = true;
            showGameOverOverlay();
        }
    } else {
        startNewGame(true);
    }
}

/* ---------- Run ---------- */
boot();


/* ---------- Run ---------- */
boot();
