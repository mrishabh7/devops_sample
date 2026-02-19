'use strict';

const WINNING_COMBOS = [
  [0, 1, 2], // top row
  [3, 4, 5], // middle row
  [6, 7, 8], // bottom row
  [0, 3, 6], // left col
  [1, 4, 7], // center col
  [2, 5, 8], // right col
  [0, 4, 8], // diagonal
  [2, 4, 6], // anti-diagonal
];

const state = {
  board: Array(9).fill(null),
  currentPlayer: 'X',
  gameOver: false,
  scores: { X: 0, O: 0, draw: 0 },
};

// DOM refs
const cells       = document.querySelectorAll('.cell');
const statusEl    = document.getElementById('status');
const scoreX      = document.getElementById('score-x');
const scoreO      = document.getElementById('score-o');
const scoreDraw   = document.getElementById('score-draw');
const restartBtn  = document.getElementById('restart-btn');
const resetBtn    = document.getElementById('reset-score-btn');

function renderBoard() {
  cells.forEach((cell, i) => {
    const mark = state.board[i];
    cell.textContent = mark || '';
    cell.className = 'cell' + (mark ? ` ${mark.toLowerCase()} taken` : '');
  });
}

function updateStatus(msg, cls = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + cls;
}

function checkWinner() {
  for (const [a, b, c] of WINNING_COMBOS) {
    if (
      state.board[a] &&
      state.board[a] === state.board[b] &&
      state.board[a] === state.board[c]
    ) {
      return { winner: state.board[a], combo: [a, b, c] };
    }
  }
  if (state.board.every(Boolean)) return { winner: null, combo: [] };
  return null;
}

function highlightWinner(combo) {
  combo.forEach(i => cells[i].classList.add('winning'));
}

function handleClick(e) {
  const cell = e.currentTarget;
  const idx  = Number(cell.dataset.index);

  if (state.gameOver || state.board[idx]) return;

  state.board[idx] = state.currentPlayer;
  renderBoard();

  const result = checkWinner();

  if (result !== null) {
    state.gameOver = true;
    if (result.winner) {
      state.scores[result.winner]++;
      highlightWinner(result.combo);
      updateStatus(`Player ${result.winner} wins!`, 'win');
    } else {
      state.scores.draw++;
      updateStatus("It's a draw!", 'draw');
    }
    updateScoreboard();
    return;
  }

  state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
  updateStatus(`Player ${state.currentPlayer}'s turn`);
}

function updateScoreboard() {
  scoreX.textContent    = state.scores.X;
  scoreO.textContent    = state.scores.O;
  scoreDraw.textContent = state.scores.draw;
}

function restartGame() {
  state.board         = Array(9).fill(null);
  state.currentPlayer = 'X';
  state.gameOver      = false;
  renderBoard();
  updateStatus("Player X's turn");
}

function resetScore() {
  state.scores = { X: 0, O: 0, draw: 0 };
  updateScoreboard();
  restartGame();
}

// Event listeners
cells.forEach(cell => cell.addEventListener('click', handleClick));
restartBtn.addEventListener('click', restartGame);
resetBtn.addEventListener('click', resetScore);

// Init
updateScoreboard();
updateStatus("Player X's turn");
