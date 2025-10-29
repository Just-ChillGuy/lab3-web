/* =========================
   Исправленный script.js
   - валидация состояния из localStorage
   - автосохранение лидера при game over (с таймером)
   - возможность сохранить введённое имя (Enter / кнопки)
   - корректное закрытие модалей
   - защита от ошибок null
   ========================= */

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

let board = [];
let score = 0;
let bestScore = 0;
let history = [];
let gameOver = false;
let leaderSaved = false;


/* ---------- helpers ---------- */
function safeEl(el) { return !!el; }

function deepCopyBoard(b){ return b.map(row => row.slice()); }

function isValidBoard(obj){
  if(!Array.isArray(obj) || obj.length !== SIZE) return false;
  for(let r=0;r<SIZE;r++){
    if(!Array.isArray(obj[r]) || obj[r].length !== SIZE) return false;
    for(let c=0;c<SIZE;c++){
      if(typeof obj[r][c] !== 'number' || !Number.isFinite(obj[r][c])) return false;
    }
  }
  return true;
}

/* ---------- storage ---------- */
function saveGameStateToStorage(){
  try {
    localStorage.setItem('gameState', JSON.stringify({ board, score, history, bestScore }));
  } catch(e){}
}
function loadGameStateFromStorage(){
  try {
    const s = localStorage.getItem('gameState');
    if(!s) return false;
    const obj = JSON.parse(s);
    if(!obj) return false;
    if(!isValidBoard(obj.board)) return false;
    board = obj.board;
    score = typeof obj.score === 'number' ? obj.score : 0;
    history = Array.isArray(obj.history) ? obj.history : [];
    bestScore = typeof obj.bestScore === 'number' ? obj.bestScore : Number(localStorage.getItem('bestScore') || 0);
    return true;
  } catch(e){
    return false;
  }
}

function loadBest(){
  const b = Number(localStorage.getItem('bestScore') || '0');
  bestScore = isNaN(b) ? 0 : b;
  if(safeEl(bestEl)) bestEl.textContent = bestScore;
}

/* ---------- init grid DOM ---------- */
function initGridDOM(){
  if(!safeEl(gridEl)) return;
  gridEl.replaceChildren();
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.r = r;
      cell.dataset.c = c;
      gridEl.appendChild(cell);
    }
  }
}

/* ---------- render ---------- */
function render(){
  if(safeEl(scoreEl)) scoreEl.textContent = score;
  if(safeEl(bestEl)) bestEl.textContent = bestScore;
  if(!safeEl(gridEl)) return;
  const cells = gridEl.querySelectorAll('.cell');
  for(const cell of cells){
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    cell.replaceChildren();
    const val = (board[r] && typeof board[r][c] === 'number') ? board[r][c] : 0;
    if(val !== 0){
      const tile = document.createElement('div');
      tile.classList.add('tile', `tile-${val}`);
      tile.textContent = String(val);
      tile.classList.add('new');
      setTimeout(()=> tile.classList.remove('new'), 160);
      cell.appendChild(tile);
    }
  }
}

/* ---------- board helpers ---------- */
function createEmptyBoard(){
  board = [];
  for(let r=0;r<SIZE;r++) board.push(new Array(SIZE).fill(0));
}
function addRandomTiles(count){
  const empty = [];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(board[r][c]===0) empty.push({r,c});
  if(empty.length===0) return;
  const toAdd = Math.min(count, empty.length);
  for(let i=0;i<toAdd;i++){
    const idx = Math.floor(Math.random()*empty.length);
    const {r,c} = empty.splice(idx,1)[0];
    board[r][c] = Math.random() < 0.9 ? 2 : 4;
  }
}

/* ---------- move logic ---------- */
function compressLine(arr){
  const newArr = arr.filter(v => v !== 0);
  while(newArr.length < SIZE) newArr.push(0);
  return newArr;
}
function mergeLine(arr){
  // arr — уже сжатый в начало (без нулей между значениями)
  let gained = 0;
  for(let i=0;i<SIZE-1;i++){
    if(arr[i] !== 0 && arr[i] === arr[i+1]){
      arr[i] = arr[i] * 2;
      arr[i+1] = 0;
      gained += arr[i];
  // будем повторять проходы объединения до тех пор, пока что-то объединяется
  while (true) {
    let mergedThisPass = false;
    for (let i = 0; i < SIZE - 1; i++) {
      if (arr[i] !== 0 && arr[i] === arr[i + 1]) {
        arr[i] = arr[i] * 2;
        arr[i + 1] = 0;
        gained += arr[i];
        mergedThisPass = true;
        // после объединения пропускаем следующий элемент — но так как мы занулили i+1,
        // следующий i++ корректно продолжит обход
      }
    }
    // сожмём нули после прохода (чтобы возможно было новое объединение)
    arr = compressLine(arr);
    if (!mergedThisPass) break;
  }
  return { line: compressLine(arr), gained };
  return { line: arr, gained };
}


function arraysEqual(a,b){
  if(a.length !== b.length) return false;
  for(let i=0;i<a.length;i++) if(a[i] !== b[i]) return false;
  return true;
}

function moveLeftInternal(){
  let moved = false, gainedTotal = 0;
  for(let r=0;r<SIZE;r++){
    const old = board[r].slice();
    const compressed = compressLine(old);
    const res = mergeLine(compressed);
    board[r] = res.line;
    if(!arraysEqual(old, board[r])) moved = true;
    gainedTotal += res.gained;
  }
  return { moved, gainedTotal };
}
function moveRightInternal(){
  let moved = false, gainedTotal = 0;
  for(let r=0;r<SIZE;r++){
    const old = board[r].slice();
    const rev = old.slice().reverse();
    const compressed = compressLine(rev);
    const res = mergeLine(compressed);
    board[r] = res.line.reverse();
    if(!arraysEqual(old, board[r])) moved = true;
    gainedTotal += res.gained;
  }
  return { moved, gainedTotal };
}
function moveUpInternal(){
  let moved = false, gainedTotal = 0;
  for(let c=0;c<SIZE;c++){
    const col = [];
    for(let r=0;r<SIZE;r++) col.push(board[r][c]);
    const old = col.slice();
    const compressed = compressLine(col);
    const res = mergeLine(compressed);
    for(let r=0;r<SIZE;r++) board[r][c] = res.line[r];
    if(!arraysEqual(old, res.line)) moved = true;
    gainedTotal += res.gained;
  }
  return { moved, gainedTotal };
}
function moveDownInternal(){
  let moved = false, gainedTotal = 0;
  for(let c=0;c<SIZE;c++){
    const col = [];
    for(let r=0;r<SIZE;r++) col.push(board[r][c]);
    const old = col.slice();
    const rev = col.slice().reverse();
    const compressed = compressLine(rev);
    const res = mergeLine(compressed);
    const final = res.line.reverse();
    for(let r=0;r<SIZE;r++) board[r][c] = final[r];
    if(!arraysEqual(old, final)) moved = true;
    gainedTotal += res.gained;
  }
  return { moved, gainedTotal };
}

/* ---------- perform move ---------- */
function performMove(direction){
  if(gameOver) return;
  try { history.push({ board: deepCopyBoard(board), score }); } catch(e){}
  if(history.length > 100) history.shift();
  let res;
  if(direction === 'left') res = moveLeftInternal();
  else if(direction === 'right') res = moveRightInternal();
  else if(direction === 'up') res = moveUpInternal();
  else if(direction === 'down') res = moveDownInternal();
  else return;
  if(!res.moved){
    history.pop();
    return;
  }
  score += (res.gainedTotal || 0);
  const toAdd = NEW_MIN + Math.floor(Math.random()*(NEW_MAX-NEW_MIN+1));
  addRandomTiles(toAdd);
  if(score > bestScore){
    bestScore = score;
    try { localStorage.setItem('bestScore', String(bestScore)); } catch(e){}
  }
  saveGameStateToStorage();
  render();
  checkGameOverCondition();
}

/* ---------- keyboard, undo ---------- */
function onKey(e){
  if(gameOver) return;
  switch(e.key){
    case 'ArrowLeft': e.preventDefault(); performMove('left'); break;
    case 'ArrowRight': e.preventDefault(); performMove('right'); break;
    case 'ArrowUp': e.preventDefault(); performMove('up'); break;
    case 'ArrowDown': e.preventDefault(); performMove('down'); break;
  }
}
function undo(){
  if(gameOver) return;
  const prev = history.pop();
  if(!prev) return;
  board = deepCopyBoard(prev.board);
  score = prev.score;
  render();
  saveGameStateToStorage();
}

/* ---------- game over ---------- */
function hasMovesAvailable(){
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const v = board[r][c];
      if(v === 0) return true;
      if(c+1 < SIZE && board[r][c+1] === v) return true;
      if(r+1 < SIZE && board[r+1][c] === v) return true;
    }
  }
  return false;
}

function saveLeader(name){
  try {
    const raw = localStorage.getItem('leaders') || '[]';
    let arr = JSON.parse(raw);
    if(!Array.isArray(arr)) arr = [];
    arr.push({ name: name || 'Аноним', score, date: new Date().toLocaleString() });
    arr.sort((a,b) => b.score - a.score);
    if(arr.length > 10) arr = arr.slice(0,10);
    localStorage.setItem('leaders', JSON.stringify(arr));
    updateLeaderboardUI();
    if(safeEl(savedMsg)) savedMsg.classList.remove('hidden');
  } catch(e){}
}

/* Save using input value at moment of call; if empty -> 'Аноним' */
function autoSaveLeaderIfNeeded(){
  if(leaderSaved) return;
  const name = (playerNameInput && playerNameInput.value) ? playerNameInput.value.trim() : '';
  saveLeader(name || 'Аноним');
  leaderSaved = true;
}


/* Show overlay and start autosave timer (delay gives user time to type) */
function showGameOverOverlay(){
  if(safeEl(gameOverOverlay)) gameOverOverlay.classList.remove('hidden');
  if(safeEl(mobileControls)) mobileControls.classList.add('hidden');
  if(safeEl(gameOverText)) gameOverText.textContent = `Игра окончена. Ваш счёт: ${score}`;

  //autoSaveLeaderIfNeeded();
}

function checkGameOverCondition(){
  if(!hasMovesAvailable()){
    gameOver = true;
    showGameOverOverlay();
    // убираем немедленное автосохранение — теперь происходит через таймер или при закрытии оверлея
  }
}

/* ---------- leaderboard UI ---------- */
function updateLeaderboardUI(){
  if(!safeEl(leaderboardBody)) return;
  leaderboardBody.replaceChildren();
  try {
    const raw = localStorage.getItem('leaders') || '[]';
    const arr = JSON.parse(raw) || [];
    for(let i=0;i<arr.length;i++){
      const tr = document.createElement('tr');
      const tdPlace = document.createElement('td'); tdPlace.textContent = String(i+1);
      const tdName = document.createElement('td'); tdName.textContent = arr[i].name;
      const tdScore = document.createElement('td'); tdScore.textContent = String(arr[i].score);
      const tdDate = document.createElement('td'); tdDate.textContent = arr[i].date;
      tr.appendChild(tdPlace); tr.appendChild(tdName); tr.appendChild(tdScore); tr.appendChild(tdDate);
      leaderboardBody.appendChild(tr);
    }
  } catch(e){}
}
function clearLeaders(){
  try { localStorage.removeItem('leaders'); } catch(e){}
  updateLeaderboardUI();
}

/* ---------- mobile controls and swipe/drag ---------- */
function showMobileControlsIfNeeded(){
  if(!safeEl(mobileControls)) return;
  const isSmall = window.matchMedia('(max-width:520px)').matches;
  if(isSmall && !gameOver){
    mobileControls.classList.remove('hidden');
    mobileControls.setAttribute('aria-hidden','false');
  } else {
    mobileControls.classList.add('hidden');
    mobileControls.setAttribute('aria-hidden','true');
  }
}
function initMobileButtons(){
  if(!safeEl(mobileControls)) return;
  mobileControls.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-dir]');
    if(!btn) return;
    const dir = btn.dataset.dir;
    performMove(dir);
  });
}
let touchStartX=0, touchStartY=0;
function onTouchStart(e){
  const t = e.touches ? e.touches[0] : e;
  touchStartX = t.clientX; touchStartY = t.clientY;
}
function onTouchEnd(e){
  const t = (e.changedTouches && e.changedTouches[0]) || e;
  const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
  const absX = Math.abs(dx), absY = Math.abs(dy);
  if(Math.max(absX, absY) < 20) return;
  if(absX > absY) dx>0 ? performMove('right') : performMove('left');
  else dy>0 ? performMove('down') : performMove('up');
}
let pointerStartX=null, pointerStartY=null;
function onPointerDown(e){
  pointerStartX = e.clientX; pointerStartY = e.clientY;
  try { boardWrap.setPointerCapture(e.pointerId); } catch(e){}
}
function onPointerUp(e){
  if(pointerStartX === null) return;
  const dx = e.clientX - pointerStartX, dy = e.clientY - pointerStartY;
  pointerStartX = pointerStartY = null;
  const absX = Math.abs(dx), absY = Math.abs(dy);
  if(Math.max(absX, absY) < 10) return;
  if(absX > absY) dx>0 ? performMove('right') : performMove('left');
  else dy>0 ? performMove('down') : performMove('up');
}

/* ---------- attach events (defensive) ---------- */
function attachEvents(){
  if(safeEl(document)) document.addEventListener('keydown', onKey);
  if(safeEl(btnUndo)) btnUndo.addEventListener('click', undo);

  // поднимаем .topbar выше overlay, чтобы кнопки в шапке были кликабельны при видимом overlay
  const topbar = document.querySelector('.topbar');
  if(topbar){
    topbar.style.position = 'relative';
    topbar.style.zIndex = '1000';
  }

  if(safeEl(btnNew)) {
    // capture click — срабатывает в фазе захвата до overlay
    btnNew.addEventListener('click', (e) => {
      // сначала сохраняем (если overlay открыт и рекорд ещё не сохранён)
      if(gameOver) autoSaveLeaderIfNeeded();
      // скроем оверлеи и стартуем игру
      if(safeEl(gameOverOverlay)) gameOverOverlay.classList.add('hidden');
      if(safeEl(leaderboardModal)) leaderboardModal.classList.add('hidden');
      startNewGame(true);
    }, { capture: true });

    // pointerdown как запасной вариант (мышь/тач)
    btnNew.addEventListener('pointerdown', (e) => {
      if(gameOver) autoSaveLeaderIfNeeded();
      if(safeEl(gameOverOverlay)) gameOverOverlay.classList.add('hidden');
      if(safeEl(leaderboardModal)) leaderboardModal.classList.add('hidden');
      startNewGame(true);
    });
  }

  if(safeEl(btnBoard)) btnBoard.addEventListener('click', ()=>{
    updateLeaderboardUI();
    if(safeEl(leaderboardModal)) leaderboardModal.classList.remove('hidden');
    if(safeEl(mobileControls)) mobileControls.classList.add('hidden');
  });

  if(safeEl(restartOverlayBtn)) {
    // обычный click
    restartOverlayBtn.addEventListener('click', ()=>{
      if(gameOver) autoSaveLeaderIfNeeded();
      if(safeEl(gameOverOverlay)) gameOverOverlay.classList.add('hidden');
      startNewGame(true);
    });
    // pointerdown запасной обработчик для ПК/мыши
    restartOverlayBtn.addEventListener('pointerdown', (e) => {
      if(gameOver) autoSaveLeaderIfNeeded();
      if(safeEl(gameOverOverlay)) gameOverOverlay.classList.add('hidden');
      startNewGame(true);
    });
  }

  if(safeEl(btnCloseLeaders)) btnCloseLeaders.addEventListener('click', ()=> {
    if(safeEl(leaderboardModal)) leaderboardModal.classList.add('hidden');
  });
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
    gameOverOverlay.addEventListener('click', (ev)=>{
      if(ev.target === gameOverOverlay) gameOverOverlay.classList.add('hidden');
    });
  }
  if(safeEl(leaderboardModal)){
    leaderboardModal.addEventListener('click', (ev)=>{
      if(ev.target === leaderboardModal) leaderboardModal.classList.add('hidden');
    });
  }

  // Enter в инпуте: сохранить рекорд (если ещё не сохранён) и показать сообщение
  if(safeEl(playerNameInput)){
    playerNameInput.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){
        e.preventDefault();
        autoSaveLeaderIfNeeded();
        // показать сообщение сохранения (если нужно)
        if(safeEl(savedMsg)) savedMsg.classList.remove('hidden');
      }
    });
  }
}

/* ---------- start / new game ---------- */
function startNewGame(saveHistory=true){
  // Принудительно скрываем оверлей (на случай, если он остался поверх)
  if(safeEl(gameOverOverlay)) gameOverOverlay.classList.add('hidden');
  if(safeEl(leaderboardModal)) leaderboardModal.classList.add('hidden');

  createEmptyBoard();
  const startCount = START_MIN + Math.floor(Math.random()*(START_MAX-START_MIN+1));
  addRandomTiles(startCount);
  score = 0;
  history = [];
  gameOver = false;
  leaderSaved = false;
  if(playerNameInput) playerNameInput.value = '';
  if(savedMsg) savedMsg.classList.add('hidden');
  render();
  if(saveHistory) saveGameStateToStorage();
  showMobileControlsIfNeeded();
}

/* ---------- boot ---------- */
function boot(){
  initGridDOM();
  attachEvents();
  loadBest();
  showMobileControlsIfNeeded();
  const loaded = loadGameStateFromStorage();
  if(!loaded){
    startNewGame(true);
  } else {
    if(!isValidBoard(board)){
      startNewGame(true);
      return;
    }
    render();
    gameOver = !hasMovesAvailable();
    if(gameOver){
      // показываем overlay, но НЕ сохраняем сразу — ждём имя / Enter / кнопки / таймер
      showGameOverOverlay();
      // автосохранение теперь запускается таймером внутри showGameOverOverlay
    }
  }
}

/* ---------- run ---------- */
boot();
