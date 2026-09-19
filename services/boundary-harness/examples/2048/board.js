/** Pure 2048 board logic — no DOM. Used by the game and the smoke test. */

export const SIZE = 4;
export const WIN_TILE = 2048;

export function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function slideAndMerge(line) {
  const tiles = line.filter((n) => n !== 0);
  const out = [];
  let score = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2;
      out.push(merged);
      score += merged;
      i += 1;
    } else {
      out.push(tiles[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  const moved = out.some((v, i) => v !== line[i]);
  return { line: out, score, moved };
}

function rotateLeft(board) {
  const next = emptyBoard();
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      next[SIZE - 1 - c][r] = board[r][c];
    }
  }
  return next;
}

function rotateRight(board) {
  const next = emptyBoard();
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      next[c][SIZE - 1 - r] = board[r][c];
    }
  }
  return next;
}

function flipRows(board) {
  return board.map((row) => row.slice().reverse());
}

/**
 * @param {"left"|"right"|"up"|"down"} direction
 */
export function moveBoard(board, direction) {
  let working = cloneBoard(board);
  if (direction === "right") working = flipRows(working);
  else if (direction === "up") working = rotateLeft(working);
  else if (direction === "down") working = rotateRight(working);

  let score = 0;
  let moved = false;
  working = working.map((row) => {
    const result = slideAndMerge(row);
    score += result.score;
    moved = moved || result.moved;
    return result.line;
  });

  if (direction === "right") working = flipRows(working);
  else if (direction === "up") working = rotateRight(working);
  else if (direction === "down") working = rotateLeft(working);

  return { board: working, score, moved };
}

export function emptyCells(board) {
  const cells = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c] === 0) cells.push({ r, c });
    }
  }
  return cells;
}

export function addRandomTile(board, rng = Math.random) {
  const cells = emptyCells(board);
  if (!cells.length) return { board: cloneBoard(board), added: false };
  const pick = cells[Math.floor(rng() * cells.length)];
  const value = rng() < 0.9 ? 2 : 4;
  const next = cloneBoard(board);
  next[pick.r][pick.c] = value;
  return { board: next, added: true, value, at: pick };
}

export function hasWon(board, winTile = WIN_TILE) {
  return board.some((row) => row.some((n) => n >= winTile));
}

export function canMove(board) {
  if (emptyCells(board).length) return true;
  for (const dir of ["left", "right", "up", "down"]) {
    if (moveBoard(board, dir).moved) return true;
  }
  return false;
}

export function startBoard(rng = Math.random) {
  const first = addRandomTile(emptyBoard(), rng);
  return addRandomTile(first.board, rng).board;
}
