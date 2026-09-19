(() => {
  const SIZE = 4;
  const BEST_KEY = "harness-2048-best";
  const DIRS = {
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    a: [0, -1],
    d: [0, 1],
    w: [-1, 0],
    s: [1, 0],
  };

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const tilesEl = document.getElementById("tiles");
  const gridEl = document.querySelector(".grid");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const keepGoingBtn = document.getElementById("keep-going");
  const tryAgainBtn = document.getElementById("try-again");
  const board = document.getElementById("board");

  for (let i = 0; i < SIZE * SIZE; i += 1) {
    gridEl.appendChild(document.createElement("span"));
  }

  let cells = [];
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let won = false;
  let keepGoing = false;
  let locked = false;

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function empties() {
    const out = [];
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (!cells[r][c]) out.push([r, c]);
      }
    }
    return out;
  }

  function spawn() {
    const spots = empties();
    if (!spots.length) return;
    const [r, c] = spots[Math.floor(Math.random() * spots.length)];
    cells[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  function canMove() {
    if (empties().length) return true;
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        const v = cells[r][c];
        if (c + 1 < SIZE && cells[r][c + 1] === v) return true;
        if (r + 1 < SIZE && cells[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  function slideLine(line) {
    const nums = line.filter((n) => n);
    const out = [];
    let gained = 0;
    for (let i = 0; i < nums.length; i += 1) {
      if (nums[i] === nums[i + 1]) {
        const merged = nums[i] * 2;
        out.push(merged);
        gained += merged;
        i += 1;
      } else {
        out.push(nums[i]);
      }
    }
    while (out.length < SIZE) out.push(0);
    return { line: out, gained, changed: out.some((n, i) => n !== line[i]) };
  }

  function move(dr, dc) {
    if (locked) return;
    let changed = false;
    let gained = 0;
    const next = emptyGrid();
    const vertical = dr !== 0;
    for (let i = 0; i < SIZE; i += 1) {
      const line = [];
      for (let j = 0; j < SIZE; j += 1) {
        const r = vertical ? (dr === 1 ? SIZE - 1 - j : j) : i;
        const c = vertical ? i : (dc === 1 ? SIZE - 1 - j : j);
        line.push(cells[r][c]);
      }
      const slid = slideLine(line);
      gained += slid.gained;
      changed = changed || slid.changed;
      for (let j = 0; j < SIZE; j += 1) {
        const r = vertical ? (dr === 1 ? SIZE - 1 - j : j) : i;
        const c = vertical ? i : (dc === 1 ? SIZE - 1 - j : j);
        next[r][c] = slid.line[j];
      }
    }
    if (!changed) return;
    cells = next;
    score += gained;
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    spawn();
    if (!won && cells.flat().some((n) => n >= 2048)) {
      won = true;
      if (!keepGoing) showOverlay("You win", true);
    } else if (!canMove()) {
      showOverlay("Game over", false);
    }
    render(true);
  }

  function tileClass(value) {
    if (value <= 2048) return `tile v-${value}`;
    return "tile v-super";
  }

  function cellSize() {
    const tile = tilesEl.getBoundingClientRect();
    const gap = 12;
    return (tile.width - gap * 3) / 4;
  }

  function render(animateSpawn) {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    const size = cellSize();
    const gap = 12;
    const html = [];
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        const value = cells[r][c];
        if (!value) continue;
        const left = c * (size + gap);
        const top = r * (size + gap);
        html.push(
          `<div class="${tileClass(value)}${animateSpawn ? " spawn" : ""}" style="left:${left}px;top:${top}px">${value}</div>`,
        );
      }
    }
    tilesEl.innerHTML = html.join("");
  }

  function showOverlay(title, canContinue) {
    overlay.hidden = false;
    overlayTitle.textContent = title;
    keepGoingBtn.hidden = !canContinue;
    locked = !canContinue;
  }

  function hideOverlay() {
    overlay.hidden = true;
    locked = false;
  }

  function reset() {
    cells = emptyGrid();
    score = 0;
    won = false;
    keepGoing = false;
    hideOverlay();
    spawn();
    spawn();
    render(true);
  }

  document.getElementById("new-game").onclick = reset;
  tryAgainBtn.onclick = reset;
  keepGoingBtn.onclick = () => {
    keepGoing = true;
    hideOverlay();
  };

  window.addEventListener("keydown", (e) => {
    const dir = DIRS[e.key] || DIRS[e.key.toLowerCase()];
    if (!dir) return;
    e.preventDefault();
    move(dir[0], dir[1]);
  });

  let touchStart = null;
  board.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  board.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(0, dx > 0 ? 1 : -1);
    else move(dy > 0 ? 1 : -1, 0);
  });

  window.addEventListener("resize", () => render(false));
  bestEl.textContent = String(best);
  reset();
})();
