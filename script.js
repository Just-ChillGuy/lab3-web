let board = Array(4).fill().map(() => Array(4).fill(0)); 
const grid = document.getElementById('grid');
let score = 0;

function drawGrid() {
    grid.innerHTML = '';
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            let cell = document.createElement('div');
            cell.className = 'cell';
            let val = board[r][c];
            if (val) {
                cell.textContent = val;
                cell.classList.add(`tile-${val}`);
            }
            grid.appendChild(cell);
        }
    }
    document.getElementById('score').textContent = score;
}
function addRandomTile() {

    let empty = [];
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (board[r][c] === 0) empty.push({r, c});
        }
    }
    if (!empty.length) return;

    let count = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < count && empty.length > 0; i++) {
        let idx = Math.floor(Math.random() * empty.length);
        let {r, c} = empty.splice(idx, 1)[0];
        board[r][c] = (Math.random() > 0.1) ? 2 : 4; 
    }
}
function compress(row) {
  
    return row.filter(v => v !== 0).concat(row.filter(v => v === 0));
}
function merge(row) {
    for (let i = 0; i < 3; i++) {
        if (row[i] !== 0 && row[i] === row[i+1]) {
            row[i] *= 2;
            score += row[i];
            row[i+1] = 0;
        }
    }
    return compress(row);
}
function moveLeft() {
    for (let r = 0; r < 4; r++) {
        let newRow = merge(compress(board[r]));
        board[r] = newRow;
    }
}
document.addEventListener('keydown', function(e) {
    if (e.key.startsWith('Arrow')) {
        switch(e.key) {
            case 'ArrowUp': moveUp(); break;
            case 'ArrowDown': moveDown(); break;
            case 'ArrowLeft': moveLeft(); break;
            case 'ArrowRight': moveRight(); break;
        }
        if (moveOccurred) {
            saveStateForUndo();
            addRandomTile();
            drawGrid();
        }
        checkGameOver();
    }
});
let history = [];
function saveStateForUndo() {
    history.push({board: JSON.parse(JSON.stringify(board)), score: score});
}
function undo() {
    if (!history.length || gameOver) return;
    let prev = history.pop();
    board = prev.board;
    score = prev.score;
    drawGrid();
}
function saveGameState() {
    const state = { board: board, score: score, history: history };
    localStorage.setItem('gameState', JSON.stringify(state));
}
function loadGameState() {
    const stateStr = localStorage.getItem('gameState');
    if (stateStr) {
        const state = JSON.parse(stateStr);
        board = state.board;
        score = state.score;
        history = state.history || [];
        drawGrid();
    } else {
        startNewGame();
    }
}
window.addEventListener('load', loadGameState);
function saveRecord(name, score) {
    let board = JSON.parse(localStorage.getItem('leaderboard') || '[]');
    board.push({ name: name, score: score, date: new Date().toLocaleString() });
    board.sort((a,b) => b.score - a.score);
    board = board.slice(0, 10);
    localStorage.setItem('leaderboard', JSON.stringify(board));
    updateLeaderboardUI();
}
function loadLeaderboard() {
    let board = JSON.parse(localStorage.getItem('leaderboard') || '[]');
    // заполнить таблицу rows
    let tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';
    board.forEach(entry => {
        let tr = document.createElement('tr');
        tr.innerHTML = `<td>${entry.name}</td><td>${entry.score}</td><td>${entry.date}</td>`;
        tbody.appendChild(tr);
    });
}

