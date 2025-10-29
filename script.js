/* =========================
   2048 — main script.js
   Все клетки генерируются JS (не используется innerHTML/outerHTML)
   ========================= */

/* =========== Конфиг и DOM =========== */
const SIZE = 4; // 4x4 поле
const START_MIN = 1; // стартовое количество тайлов min..max
const START_MAX = 3;
const NEW_MIN = 1; // после хода добавить 1..2
const NEW_MAX = 2;

const gridEl = document.getElementById('grid');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best-score');
const btnUndo = document.getElementById('btn-undo');
const btnNew = document.getElementById('btn-new');
const btnBoard = document.getElementById('btn-board');
const gameOverOverlay = document.getElementById('game-over');
const gameOverText = document.getElementById('game-over-text');
const playerNameInput = document.getElementById('player-name');
const saveResultBtn = document.getElementById('save-result');
const restartOverlayBtn = document.getElementById('restart-from-overlay');
const savedMsg = document.getElementById('saved-msg');
const boardWrap = document.getElementById('board-wrap');
const mobileControls = document.getElementById('mobile-controls');
const leaderboardModal = document.getElementById('leaderboard-modal');
const leaderboardBody = document.getElementById('leaderboard-body');
const btnCloseLeaders = document.getElementById('close-leaders');
const btnClearLeaders = document.getElementById('clear-leaders');

let board = []; // матрица SIZE x SIZE
let score = 0;
let bestScore = 0;
let history = []; // стек состояний для undo
let gameOver = false;

/* =========== ИНИЦИАЛИЗАЦИЯ DOM GRID (динамически) =========== */
/* Создаем SIZE*SIZE пустых .cell в grid (без innerHTML) */
function initGridDOM(){
  gridEl.replaceChildren(); // безопасно очищаем
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.r = r;
      cell.dataset.c = c;
      /* внутри каждой ячейки прикрепим контейнер для плитки (или пустой) */
      // Но не создаём .tile пока нет числа — создаём динамически в render
      gridEl.appendChild(cell);
    }
  }
}

/* =========== УТИЛИТЫ =========== */
function deepCopyBoard(b){
  return b.map(row => row.slice());
}
function setBestIfNeeded(){
  if(score > bestScore){
    bestScore = score;
    localStorage.setItem('bestScore', String(bestScore));
    bestEl.textContent = bestScore;
  }
}
function saveGameStateToStorage(){
  const obj = { board, score, history, bestScore };
  localStorage.setItem('gameState', JSON.stringify(obj));
}
function loadGameStateFromStorage(){
  const s = localStorage.getItem('gameState');
  if(!s) return false;
  try{
    const obj = JSON.parse(s);
    if(obj && typeof obj === 'object'){
      board = obj.board;
      score = obj.score||0;
      history = obj.history || [];
      bestScore = obj.bestScore || 0;
      return true;
    }
  }catch(e){}
  return false;
}

/* =========== ИНИЦИАЛИЗАЦИЯ И СТАРТ НОВОЙ ИГРЫ =========== */
function createEmptyBoard(){
  board = [];
  for(let r=0;r<SIZE;r++){
    board.push(new Array(SIZE).fill(0));
  }
}

function addRandomTiles(count){
  // собираем пустые клетки
  const empty = [];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(board[r][c]===0) empty.push({r,c});
  if(empty.length===0) return;
  const toAdd = Math.min(count, empty.length);
  for(let i=0;i<toAdd;i++){
    const idx = Math.floor(Math.random()*empty.length);
    const {r,c} = empty.splice(idx,1)[0];
    board[r][c] = Math.random() < 0.9 ? 2 : 4; // 90% 2, 10% 4
  }
}

function startNewGame(saveHistory=true){
  createEmptyBoard();
  // старт 1..3 плиток
  const startCount = START_MIN + Math.floor(Math.random()*(START_MAX-START_MIN+1));
  addRandomTiles(startCount);
  score = 0;
  history = [];
  gameOver = false;
  playerNameInput.value = '';
  savedMsg.classList.add('hidden');
  setBestIfNeeded(); // если ранее bestScore из localStorage
  render();
  if(saveHistory) saveGameStateToStorage();
}

/* =========== ОТРИСОВКА =========== */
/* Обновляем клетки: создаём .tile в cell, на основе board[r][c] */
function render(){
  // обновим счёт
  scoreEl.textContent = score;
  bestEl.textContent = bestScore;

  // каждая cell имеет data-r,data-c
  const cells = gridEl.querySelectorAll('.cell');
  for(const cell of cells){
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    // удаляем старые плитки внутри
    // используем replaceChildren чтобы не использовать innerHTML
    cell.replaceChildren();
    const val = board[r][c];
    if(val !== 0){
      const tile = document.createElement('div');
      tile.classList.add('tile', `tile-${val}`);
      tile.textContent = String(val);
      // небольшой "pop" для вновь созданных плиток
      tile.classList.add('new');
      // через setTimeout удалим класс .new чтобы animation сработал
      setTimeout(()=> tile.classList.remove('new'), 160);
      cell.appendChild(tile);
    }
  }
}

/* =========== Логика движения и объединения =========== */
/* Комфортные вспомогательные для сжатия и слияния одномерного массива (длина SIZE) */
function compressLine(arr){
  const newArr = arr.filter(v => v !== 0);
  while(newArr.length < SIZE) newArr.push(0);
  return newArr;
}
function mergeLine(arr){
  // arr уже сжатый в сторону начала
  let gained = 0;
  for(let i=0;i<SIZE-1;i++){
    if(arr[i]!==0 && arr[i]===arr[i+1]){
      arr[i] = arr[i] * 2;
      arr[i+1] = 0;
      gained += arr[i];
    }
  }
  return { line: compressLine(arr), gained };
}

/* Для унификации: возвращает {moved:boolean,gained:int} */
function moveLeftInternal(){
  let moved = false;
  let gainedTotal = 0;
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
  // зеркалим массивы
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

/* сравнение массивов одномерных */
function arraysEqual(a,b){
  if(a.length!==b.length) return false;
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return false;
  return true;
}

/* выполняем ход (обертка): сохраняем состояние в history, делаем move, добавляем тайлы, обновляем счёт */
function performMove(direction){
  if(gameOver) return;
  // сохраняем состояние для undo
  history.push({ board: deepCopyBoard(board), score });
  if(history.length > 100) history.shift(); // ограничение длины
  let res;
  if(direction === 'left') res = moveLeftInternal();
  else if(direction === 'right') res = moveRightInternal();
  else if(direction === 'up') res = moveUpInternal();
  else if(direction === 'down') res = moveDownInternal();
  else return;
  if(res.moved){
    score += res.gainedTotal || res.gainedTotal === 0 ? res.gainedTotal : res.gained; //兼
  } else {
    // если не было сдвига, откат истории
    history.pop();
    return;
  }
  // после хода добавляем 1-2 новых плитки
  const toAdd = NEW_MIN + Math.floor(Math.random()*(NEW_MAX-NEW_MIN+1));
  addRandomTiles(toAdd);
  setBestIfNeeded();
  saveGameStateToStorage();
  render();
  checkGameOverCondition();
}

/* обработчик клавиатуры и внешних вызовов */
function onKey(e){
  if(gameOver) return;
  switch(e.key){
    case 'ArrowLeft': e.preventDefault(); performMove('left'); break;
    case 'ArrowRight': e.preventDefault(); performMove('right'); break;
    case 'ArrowUp': e.preventDefault(); performMove('up'); break;
    case 'ArrowDown': e.preventDefault(); performMove('down'); break;
    case 'z': // Ctrl+Z не используем, простое 'z' может быть удобным
      break;
  }
}

/* undo */
function undo(){
  if(gameOver) return;
  const prev = history.pop();
  if(!prev) return;
  board = deepCopyBoard(prev.board);
  score = prev.score;
  render();
  saveGameStateToStorage();
}

/* проверка окончания игры */
function hasMovesAvailable(){
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    const v = board[r][c];
    if(v===0) return true;
    if(c+1 < SIZE && board[r][c+1]===v) return true;
    if(r+1 < SIZE && board[r+1][c]===v) return true;
  }
  return false;
}

function checkGameOverCondition(){
  if(!hasMovesAvailable()){
    gameOver = true;
    // показываем оверлей
    gameOverText.textContent = `Игра окончена. Ваш счёт: ${score}`;
    gameOverOverlay.classList.remove('hidden');
    // скрываем мобильные контролы при показе оверлея
    mobileControls.classList.add('hidden');
  }
}

/* =========== LocalStorage — лидеры =========== */
function loadBest(){
  const b = Number(localStorage.getItem('bestScore') || '0');
  bestScore = isNaN(b) ? 0 : b;
  bestEl.textContent = bestScore;
}
function saveLeader(name){
  const raw = localStorage.getItem('leaders') || '[]';
  let arr;
  try{ arr = JSON.parse(raw); } catch(e){ arr = []; }
  arr.push({ name: name || 'Аноним', score, date: new Date().toLocaleString() });
  arr.sort((a,b) => b.score - a.score);
  if(arr.length>10) arr = arr.slice(0,10);
  localStorage.setItem('leaders', JSON.stringify(arr));
  updateLeaderboardUI();
  savedMsg.classList.remove('hidden');
}

/* заполнение UI таблицы лидеров (создаем DOM элементы, no innerHTML) */
function updateLeaderboardUI(){
  leaderboardBody.replaceChildren();
  const raw = localStorage.getItem('leaders') || '[]';
  let arr;
  try{ arr = JSON.parse(raw); } catch(e){ arr = []; }
  for(let i=0;i<arr.length;i++){
    const tr = document.createElement('tr');
    const tdPlace = document.createElement('td'); tdPlace.textContent = String(i+1);
    const tdName = document.createElement('td'); tdName.textContent = arr[i].name;
    const tdScore = document.createElement('td'); tdScore.textContent = String(arr[i].score);
    const tdDate = document.createElement('td'); tdDate.textContent = arr[i].date;
    tr.appendChild(tdPlace); tr.appendChild(tdName); tr.appendChild(tdScore); tr.appendChild(tdDate);
    leaderboardBody.appendChild(tr);
  }
}

/* очистка лидеров */
function clearLeaders(){
  localStorage.removeItem('leaders');
  updateLeaderboardUI();
}

/* =========== Управление мобильными кнопками, свайпы и drag (pointer) =========== */
function showMobileControlsIfNeeded(){
  const isSmall = window.matchMedia('(max-width:520px)').matches;
  if(isSmall && !gameOver){
    mobileControls.classList.remove('hidden');
    mobileControls.setAttribute('aria-hidden','false');
  } else {
    mobileControls.classList.add('hidden');
    mobileControls.setAttribute('aria-hidden','true');
  }
}

/* навешиваем обработчики на кнопки мобильных контролов */
function initMobileButtons(){
  mobileControls.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-dir]');
    if(!btn) return;
    const dir = btn.dataset.dir;
    performMove(dir);
  });
}

/* свайп */
let touchStartX = 0, touchStartY = 0;
function onTouchStart(e){
  const t = e.touches ? e.touches[0] : e;
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}
function onTouchEnd(e){
  const t = (e.changedTouches && e.changedTouches[0]) || e;
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const absX = Math.abs(dx), absY = Math.abs(dy);
  if(Math.max(absX, absY) < 20) return; // нечёткий жест
  if(absX > absY){
    // горизонтальный
    if(dx > 0) performMove('right');
    else performMove('left');
  } else {
    if(dy > 0) performMove('down');
    else performMove('up');
  }
}

/* drag/pointer (мышь) — поддержка pointer API */
let pointerStartX = null, pointerStartY = null;
function onPointerDown(e){
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;
  boardWrap.setPointerCapture(e.pointerId);
}
function onPointerUp(e){
  if(pointerStartX === null) return;
  const dx = e.clientX - pointerStartX;
  const dy = e.clientY - pointerStartY;
  const absX = Math.abs(dx), absY = Math.abs(dy);
  pointerStartX = pointerStartY = null;
  if(Math.max(absX, absY) < 10) return;
  if(absX > absY){
    if(dx > 0) performMove('right'); else performMove('left');
  } else {
    if(dy > 0) performMove('down'); else performMove('up');
  }
}

/* =========== ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ =========== */
function attachEvents(){
  document.addEventListener('keydown', onKey);
  btnUndo.addEventListener('click', undo);
  btnNew.addEventListener('click', ()=> { startNewGame(true); });
  btnBoard.addEventListener('click', ()=>{
    updateLeaderboardUI();
    leaderboardModal.classList.remove('hidden');
    // hide mobile controls when viewing leaders
    mobileControls.classList.add('hidden');
  });

  // overlay actions
  saveResultBtn.addEventListener('click', ()=>{
    const name = playerNameInput.value.trim() || 'Аноним';
    saveLeader(name);
    // при сохранении оставляем overlay (можно скрыть input)
    playerNameInput.value = '';
  });
  restartOverlayBtn.addEventListener('click', ()=>{
    gameOverOverlay.classList.add('hidden');
    startNewGame(true);
  });

  // leaderboard modal
  btnCloseLeaders.addEventListener('click', ()=> leaderboardModal.classList.add('hidden'));
  btnClearLeaders.addEventListener('click', ()=> clearLeaders());

  // mobile buttons init
  initMobileButtons();
  window.addEventListener('resize', showMobileControlsIfNeeded);

  // touch events for swipe
  boardWrap.addEventListener('touchstart', onTouchStart, {passive:true});
  boardWrap.addEventListener('touchend', onTouchEnd, {passive:true});

  // pointer for drag with mouse
  boardWrap.addEventListener('pointerdown', onPointerDown);
  boardWrap.addEventListener('pointerup', onPointerUp);

  // hide overlay clicking outside inner panel
  gameOverOverlay.addEventListener('click', (ev)=>{
    if(ev.target === gameOverOverlay) gameOverOverlay.classList.add('hidden');
  });
  leaderboardModal.addEventListener('click', (ev)=>{
    if(ev.target === leaderboardModal) leaderboardModal.classList.add('hidden');
  });
}

/* =========== Загрузка при старте страницы =========== */
function boot(){
  initGridDOM();
  attachEvents();
  loadBest();
  // покажем мобильные контролы если нужно
  showMobileControlsIfNeeded();
  // пытаемся загрузить сохранённую игру
  const loaded = loadGameStateFromStorage();
  if(!loaded){
    startNewGame(true);
  } else {
    render();
    // если игра была окончена в сохранении - проверим
    gameOver = !hasMovesAvailable();
    if(gameOver){
      gameOverText.textContent = `Игра окончена. Ваш счёт: ${score}`;
      gameOverOverlay.classList.remove('hidden');
    }
  }
}

/* =========== Run =========== */
boot();
