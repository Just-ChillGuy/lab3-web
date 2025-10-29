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

let prevBoard = null; // предыдущее состояние для анимаций
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

/**
 * render(finalPrev, mergeMap, newMap)
 * - finalPrev (optional) — предыдущее состояние для визуальной маркировки
 * - mergeMap — объект {'r,c': true} для ячеек, где происходило слияние (чтобы добавить .merge)
 * - newMap   — объект {'r,c': true} для новых плиток (чтобы добавить .new)
 */
function render(finalPrev = null, mergeMap = {}, newMap = {}){
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

      const key = `${r},${c}`;
      if(newMap[key]){
        tile.classList.add('new');
        // remove .new after animation so further merges can animate
        setTimeout(()=> tile.classList.remove('new'), 240);
      } else if(mergeMap[key]){
        tile.classList.add('merge');
        setTimeout(()=> tile.classList.remove('merge'), 340);
      } else {
        // ничего дополнительного
      }

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

function performMove(direction){
  if(gameOver) return;
  // сохраним предыдущее состояние для анимации
  prevBoard = deepCopyBoard(board);

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
  const gainedThisMove = (res.gainedTotal || 0);
  score += gainedThisMove;
  const toAdd = NEW_MIN + Math.floor(Math.random()*(NEW_MAX-NEW_MIN+1));
  addRandomTiles(toAdd);
  if(score > bestScore){
    bestScore = score;
    try { localStorage.setItem('bestScore', String(bestScore)); } catch(e){}
  }
  saveGameStateToStorage();

  // animate movement from prevBoard -> board; final render вызовется по завершении анимации
  animateMove(prevBoard, deepCopyBoard(board));
}
/* ---------- anim helpers: вычисление позиций ячеек ---------- */
function getCellRects(){
  // возвращает map 'r,c' => DOMRect (относительно документа)
  const map = {};
  const cells = gridEl.querySelectorAll('.cell');
  for(const cell of cells){
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    const rect = cell.getBoundingClientRect();
    map[`${r},${c}`] = rect;
  }
  return map;
}

/* subset-finder: находит подмножество prevTiles (ids) из available, сумма values === target
   пытается минимизировать суммарную дистанцию (опционально), но простая переборка достаточна для 16 элементов */
function findSubsetSumIndices(target, prevTiles, availIndices, destPos) {
  // prevTiles: [{r,c,val,idx}], availIndices: array of indices into prevTiles
  // попробуем сначала одиночный, затем пары, затем triples, максимум 4 элементов
  // возвращает массив индексов (в prevTiles) или null
  // пробуем комбинации возрастающей длины
  const maxLen = Math.min(4, availIndices.length);
  let best = null;
  for (let len = 1; len <= maxLen; len++) {
    // перебор комбинаций len элементов (рекурсивно)
    const comb = [];
    function dfs(start, depth, sum, distSum) {
      if (depth === len) {
        if (sum === target) {
          // найдена комбинация
          const candidate = comb.slice();
          if (!best || distSum < best.dist) best = { idxs: candidate.slice(), dist: distSum };
        }
        return;
      }
      for (let i = start; i < availIndices.length; i++) {
        const pi = availIndices[i];
        comb.push(pi);
        const tile = prevTiles[pi];
        // приблизительная дистанция: Manhattan к destPos
        const d = Math.abs(tile.r - destPos.r) + Math.abs(tile.c - destPos.c);
        dfs(i + 1, depth + 1, sum + tile.val, distSum + d);
        comb.pop();
      }
    }
    dfs(0, 0, 0, 0);
    if (best) return best.idxs;
  }
  return null;
}

/* основная функция анимации перехода */
function animateMove(prev, next){
  // собираем список тайлов prev и dest
  const prevTiles = [];
  const destTiles = [];

  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    const v = prev[r][c];
    if(v && v>0) prevTiles.push({ r, c, val: v, assigned: false, id: prevTiles.length });
  }
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    const v = next[r][c];
    if(v && v>0) destTiles.push({ r, c, val: v, assignedPrev: [], id: destTiles.length });
  }

  // карты DOMRects
  const cellRects = getCellRects();
  const wrapRect = boardWrap.getBoundingClientRect();

  // Найдём для каждого dest подмножество prev (subset sum)
  // сортируем dest по убыванию значения, чтобы большие (результат слияния) обрабатывались первыми
  destTiles.sort((a,b) => b.val - a.val);

  const availPrevIndices = prevTiles.map((t,i)=>i);

  for(const dest of destTiles){
    // сначала попытка найти одиночный prev с тем же значением (самое частое)
    let found = null;
    for(const pi of availPrevIndices){
      if(prevTiles[pi].val === dest.val){
        found = [pi];
        break;
      }
    }
    if(!found){
      // ищем подмножество суммирующееся в dest.val
      found = findSubsetSumIndices(dest.val, prevTiles, availPrevIndices, dest);
    }
    if(found){
      // пометим
      for(const pi of found){
        dest.assignedPrev.push(pi);
        // удалить pi из availPrevIndices
        const idx = availPrevIndices.indexOf(pi);
        if(idx !== -1) availPrevIndices.splice(idx,1);
      }
    }
  }

  // любые оставшиеся prev (не назначенные) — это исчезающие плитки (редко)
  // Теперь создаём плавающие плитки: для каждого prev создаём элемент и анимируем в target (если назначен)
  const floating = [];
  const animatedTiles = [];
  const promises = [];

  // helper to create tile element at absolute position (relative to boardWrap)
  function createFloatTile(val, fromRect){
    const el = document.createElement('div');
    el.className = `tile float tile-${val}`;
    el.textContent = String(val);
    // position relative to boardWrap
    const left = fromRect.left - wrapRect.left;
    const top = fromRect.top - wrapRect.top;
    el.style.width = `${fromRect.width}px`;
    el.style.height = `${fromRect.height}px`;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.lineHeight = `${fromRect.height}px`;
    boardWrap.appendChild(el);
    return el;
  }

  // создаём плавающие элементы для всех prevTiles
  for(const pt of prevTiles){
    const fromRect = cellRects[`${pt.r},${pt.c}`];
    const el = createFloatTile(pt.val, fromRect);
    floating.push({ el, src: pt, dest: null });
  }

  // назначаем dest позиции для созданных floating (по id сопоставляем)
  // для каждого destTile: для каждого assignedPrev — найдём floating с that src.id и назначим destRect
  for(const dest of destTiles){
    const destRect = cellRects[`${dest.r},${dest.c}`];
    if(dest.assignedPrev.length === 0) {
      // новая плитка — пометим как new (не анимируем сюда prev)
      continue;
    }
    for(const pi of dest.assignedPrev){
      const pt = prevTiles[pi];
      const fl = floating.find(f => f.src.r === pt.r && f.src.c === pt.c && !f.dest);
      if(fl){
        fl.dest = { r: dest.r, c: dest.c, rect: destRect, finalVal: dest.val, destId: dest.id };
      }
    }
  }

  // анимируем: для каждой floating, если dest задан — трансформируем в dest координаты, иначе — плавно исчезаем
  let activeTransitions = 0;
  const TRANS_DUR = 200; // ms

  return new Promise(resolve => {
    if(floating.length === 0){
      // ничего анимировать — просто render сразу
      // собрать mergeMap и newMap
      const mergeMap = {};
      const newMap = {};
      for(const d of destTiles){
        const key = `${d.r},${d.c}`;
        if(d.assignedPrev.length > 1) mergeMap[key] = true;
        if(d.assignedPrev.length === 0) newMap[key] = true;
      }
      render(prev, mergeMap, newMap);
      resolve();
      return;
    }

    for(const f of floating){
      const el = f.el;
      if(f.dest){
        const from = el.getBoundingClientRect();
        const to = f.dest.rect;
        // compute translation relative to current position
        const dx = (to.left - wrapRect.left) - (from.left - wrapRect.left);
        const dy = (to.top - wrapRect.top) - (from.top - wrapRect.top);
        activeTransitions++;
        // Force layout then set transform
        el.getBoundingClientRect();
        el.style.transition = `transform ${TRANS_DUR}ms cubic-bezier(.2,.8,.2,1), opacity ${TRANS_DUR}ms linear`;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        // когда анимация закончится — скрываем этот элемент (уберём его)
        const onEnd = (ev) => {
          el.removeEventListener('transitionend', onEnd);
          el.remove();
          activeTransitions--;
          if(activeTransitions === 0){
            // после завершения всех анимаций — финальная отрисовка
            const mergeMap = {};
            const newMap = {};
            for(const d of destTiles){
              const key = `${d.r},${d.c}`;
              if(d.assignedPrev.length > 1) mergeMap[key] = true;
              if(d.assignedPrev.length === 0) newMap[key] = true;
            }
            render(prev, mergeMap, newMap);
            resolve();
          }
        };
        el.addEventListener('transitionend', onEnd);
      } else {
        // нет dest — может исчезать (fade out)
        activeTransitions++;
        el.style.transition = `opacity ${TRANS_DUR}ms linear, transform ${TRANS_DUR}ms linear`;
        el.style.opacity = '0';
        el.style.transform = `scale(.8)`;
        const onEnd = (ev) => {
          el.removeEventListener('transitionend', onEnd);
          el.remove();
          activeTransitions--;
          if(activeTransitions === 0){
            const mergeMap = {};
            const newMap = {};
            for(const d of destTiles){
              const key = `${d.r},${d.c}`;
              if(d.assignedPrev.length > 1) mergeMap[key] = true;
              if(d.assignedPrev.length === 0) newMap[key] = true;
            }
            render(prev, mergeMap, newMap);
            resolve();
          }
        };
        el.addEventListener('transitionend', onEnd);
      }
    }

    // safety: если transitionend не сработают (редко), установим таймаут
    setTimeout(()=> {
      if(activeTransitions > 0){
        // очистим оставшиеся
        document.querySelectorAll('#board-wrap .tile.float').forEach(el => el.remove());
        const mergeMap = {};
        const newMap = {};
        for(const d of destTiles){
          const key = `${d.r},${d.c}`;
          if(d.assignedPrev.length > 1) mergeMap[key] = true;
          if(d.assignedPrev.length === 0) newMap[key] = true;
        }
        render(prev, mergeMap, newMap);
        resolve();
      }
    }, TRANS_DUR + 80);
  });
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
