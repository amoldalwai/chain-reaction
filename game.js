const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const homeScreen = document.querySelector("#homeScreen");
const gameScreen = document.querySelector("#gameScreen");
const fillRange = document.querySelector("#fillRange");
const fillValue = document.querySelector("#fillValue");
const playButton = document.querySelector("#playButton");
const playModeInputs = document.querySelectorAll("input[name='playMode']");
const difficultyInputs = document.querySelectorAll("input[name='difficulty']");
const difficultyGroup = document.querySelector("#difficultyGroup");
const gridStyleInputs = document.querySelectorAll("input[name='gridStyle']");
const themeInputs = document.querySelectorAll("input[name='theme']");
const redPercent = document.querySelector("#redPercent");
const greenPercent = document.querySelector("#greenPercent");
const redBar = document.querySelector("#redBar");
const greenBar = document.querySelector("#greenBar");
const turnOrb = document.querySelector("#turnOrb");
const winnerPanel = document.querySelector("#winnerPanel");
const winnerText = document.querySelector("#winnerText");
const playAgainButton = document.querySelector("#playAgainButton");
const homeButton = document.querySelector("#homeButton");

const PLAYERS = [
  { name: "Red", color: "#ff1515" },
  { name: "Green", color: "#24f52f" },
  { name: "Blue", color: "#2448ff" },
  { name: "Yellow", color: "#ffee2b" },
];

const state = {
  cols: 6,
  rows: 9,
  playerCount: 2,
  currentPlayer: 0,
  cells: [],
  particles: [],
  moving: [],
  animating: false,
  gameOver: false,
  started: false,
  turnNumber: 0,
  shake: 0,
  pulse: 0,
  lastTime: 0,
  audioCtx: null,
  masterGain: null,
  gridStyle: "3d",
  theme: "dark",
  playMode: "human",
  difficulty: "medium",
  cpuTimer: 0,
};

function createCells() {
  return Array.from({ length: state.rows }, () =>
    Array.from({ length: state.cols }, () => ({ owner: -1, count: 0, exploding: 0 }))
  );
}

function resetGame() {
  applySetupOptions();
  state.cols = 6;
  state.rows = 9;
  state.playerCount = 2;
  state.currentPlayer = 0;
  state.cells = createCells();
  state.particles = [];
  state.moving = [];
  clearTimeout(state.cpuTimer);
  state.animating = false;
  state.gameOver = false;
  state.started = false;
  state.turnNumber = 0;
  state.shake = 0;
  winnerPanel.hidden = true;
  seedRandomBoard(Number(fillRange.value));
  updateHud();
  resizeCanvas();
}

function startGame() {
  applySetupOptions();
  homeScreen.hidden = true;
  gameScreen.hidden = false;
  resetGame();
  requestAnimationFrame(resizeCanvas);
}

function applySetupOptions() {
  state.playMode = document.querySelector("input[name='playMode']:checked")?.value || "human";
  state.difficulty = document.querySelector("input[name='difficulty']:checked")?.value || "medium";
  state.gridStyle = document.querySelector("input[name='gridStyle']:checked")?.value || "3d";
  state.theme = document.querySelector("input[name='theme']:checked")?.value || "dark";
  difficultyGroup.classList.toggle("is-muted", state.playMode !== "cpu");
  document.body.classList.toggle("theme-white", state.theme === "white");
}

function showHome() {
  clearTimeout(state.cpuTimer);
  gameScreen.hidden = true;
  homeScreen.hidden = false;
  winnerPanel.hidden = true;
  state.gameOver = true;
}

function seedRandomBoard(fillPercent) {
  const totalCells = state.cols * state.rows;
  const cellsToFill = Math.round(totalCells * (fillPercent / 100));
  const positions = [];
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      positions.push({ col, row });
    }
  }

  shuffle(positions);
  for (let index = 0; index < cellsToFill; index++) {
    const { col, row } = positions[index];
    const cell = state.cells[row][col];
    const limit = criticalMass(col, row) - 1;
    cell.owner = Math.random() < 0.5 ? 0 : 1;
    cell.count = Math.max(1, Math.ceil(Math.random() * limit));
  }
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function boardMetrics() {
  const rect = canvas.getBoundingClientRect();
  const isPhone = window.matchMedia("(max-width: 430px)").matches;
  const padScale = isPhone ? 0.055 : 0.035;
  const minPad = isPhone ? 18 : 16;
  const pad = Math.max(minPad, Math.min(rect.width, rect.height) * padScale);
  const width = rect.width - pad * 2;
  const height = rect.height - pad * 2;
  const cell = Math.min(width / state.cols, height / state.rows);
  const boardW = cell * state.cols;
  const boardH = cell * state.rows;
  return {
    rect,
    pad,
    cell,
    x: (rect.width - boardW) / 2,
    y: (rect.height - boardH) / 2,
    w: boardW,
    h: boardH,
  };
}

function criticalMass(col, row) {
  let mass = 4;
  if (col === 0 || col === state.cols - 1) mass--;
  if (row === 0 || row === state.rows - 1) mass--;
  return mass;
}

function cellCenter(col, row, metrics = boardMetrics()) {
  return {
    x: metrics.x + col * metrics.cell + metrics.cell / 2,
    y: metrics.y + row * metrics.cell + metrics.cell / 2,
  };
}

function getCellFromPointer(event) {
  const metrics = boardMetrics();
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const col = Math.floor((x - metrics.x) / metrics.cell);
  const row = Math.floor((y - metrics.y) / metrics.cell);
  if (col < 0 || col >= state.cols || row < 0 || row >= state.rows) return null;
  return { col, row };
}

function handleBoardPointer(event) {
  event.preventDefault();
  unlockAudio();
  if (state.animating || state.gameOver) return;
  if (isCpuTurn()) return;
  const target = getCellFromPointer(event);
  if (!target) return;
  const cell = state.cells[target.row][target.col];
  if (cell.owner !== -1 && cell.owner !== state.currentPlayer) return;

  state.started = true;
  addOrb(target.col, target.row, state.currentPlayer);
  state.turnNumber++;
  playClickSound(state.currentPlayer);
  resolveChain();
}

function addOrb(col, row, owner) {
  const cell = state.cells[row][col];
  cell.owner = owner;
  cell.count++;
  cell.exploding = Math.max(cell.exploding, 0.18);
}

function resolveChain() {
  const queue = [];
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      if (state.cells[row][col].count >= criticalMass(col, row)) queue.push({ col, row });
    }
  }
  if (queue.length === 0) {
    endTurn();
    return;
  }

  state.animating = true;
  processExplosions(queue);
}

function processExplosions(queue) {
  const nextBursts = [];
  const metrics = boardMetrics();

  for (const burst of queue) {
    const cell = state.cells[burst.row][burst.col];
    if (cell.count < criticalMass(burst.col, burst.row) || cell.owner === -1) continue;

    const owner = cell.owner;
    const color = PLAYERS[owner].color;
    const start = cellCenter(burst.col, burst.row, metrics);
    const neighbors = [
      { col: burst.col + 1, row: burst.row },
      { col: burst.col - 1, row: burst.row },
      { col: burst.col, row: burst.row + 1 },
      { col: burst.col, row: burst.row - 1 },
    ].filter((item) => item.col >= 0 && item.col < state.cols && item.row >= 0 && item.row < state.rows);

    cell.count = 0;
    cell.owner = -1;
    cell.exploding = 0.38;
    state.shake = Math.min(8, state.shake + 1.4);
    makeSparks(start.x, start.y, color, neighbors.length * 6);
    playBurstSound(neighbors.length);

    for (const neighbor of neighbors) {
      const end = cellCenter(neighbor.col, neighbor.row, metrics);
      state.moving.push({
        owner,
        color,
        fromCol: burst.col,
        fromRow: burst.row,
        toCol: neighbor.col,
        toRow: neighbor.row,
        sx: start.x,
        sy: start.y,
        ex: end.x,
        ey: end.y,
        age: 0,
        duration: 0.22 + Math.random() * 0.06,
      });
    }
  }

  if (state.moving.length === 0) {
    endTurn();
    return;
  }

  const watcher = () => {
    if (state.moving.length > 0) {
      requestAnimationFrame(watcher);
      return;
    }

    for (let row = 0; row < state.rows; row++) {
      for (let col = 0; col < state.cols; col++) {
        if (state.cells[row][col].count >= criticalMass(col, row)) nextBursts.push({ col, row });
      }
    }

    if (nextBursts.length > 0) {
      setTimeout(() => processExplosions(nextBursts), 75);
    } else {
      endTurn();
    }
  };

  requestAnimationFrame(watcher);
}

function endTurn() {
  state.animating = false;
  const winner = findWinner();
  if (winner !== -1) {
    state.gameOver = true;
    winnerText.textContent = `${PLAYERS[winner].name} wins`;
    winnerText.style.color = PLAYERS[winner].color;
    winnerPanel.hidden = false;
    playWinSound(winner);
    updateHud();
    return;
  }

  advancePlayer();
  updateHud();
  queueCpuMove();
}

function advancePlayer() {
  for (let i = 1; i <= state.playerCount; i++) {
    const candidate = (state.currentPlayer + i) % state.playerCount;
    if (!state.started || isPlayerAlive(candidate) || state.turnNumber < state.playerCount) {
      state.currentPlayer = candidate;
      return;
    }
  }
}

function isPlayerAlive(player) {
  return state.cells.some((row) => row.some((cell) => cell.owner === player));
}

function findWinner() {
  if (state.turnNumber < state.playerCount) return -1;
  const alive = [];
  for (let player = 0; player < state.playerCount; player++) {
    if (isPlayerAlive(player)) alive.push(player);
  }
  return alive.length === 1 ? alive[0] : -1;
}

function isCpuTurn() {
  return state.playMode === "cpu" && state.currentPlayer === 1 && !state.gameOver;
}

function queueCpuMove() {
  clearTimeout(state.cpuTimer);
  if (!isCpuTurn() || state.animating) return;
  state.cpuTimer = setTimeout(makeCpuMove, 520);
}

function makeCpuMove() {
  if (!isCpuTurn() || state.animating || state.gameOver) return;
  const move = chooseCpuMove();
  if (!move) return;

  addOrb(move.col, move.row, 1);
  state.turnNumber++;
  playClickSound(1);
  resolveChain();
}

function chooseCpuMove() {
  const moves = getValidMoves(1);
  if (moves.length === 0) return null;
  if (state.difficulty === "low") return randomItem(moves);

  const scored = moves.map((move) => ({
    ...move,
    score: state.difficulty === "high" ? scoreHardCpuMove(move) : scoreCpuMove(move),
  }));
  scored.sort((a, b) => b.score - a.score);

  if (state.difficulty === "medium" && Math.random() < 0.35) {
    return randomItem(scored.slice(0, Math.min(4, scored.length)));
  }

  return scored[0];
}

function getValidMoves(player) {
  const moves = [];
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const cell = state.cells[row][col];
      if (cell.owner === -1 || cell.owner === player) moves.push({ col, row });
    }
  }
  return moves;
}

function scoreCpuMove(move) {
  const cell = state.cells[move.row][move.col];
  const mass = criticalMass(move.col, move.row);
  let score = Math.random() * 0.2;

  if (cell.owner === 1) score += 1.4 + cell.count * 0.55;
  if (cell.owner === -1) score += 0.55;
  if (cell.count + 1 >= mass) score += 4.8;

  for (const neighbor of getNeighbors(move.col, move.row)) {
    const neighborCell = state.cells[neighbor.row][neighbor.col];
    const neighborMass = criticalMass(neighbor.col, neighbor.row);
    if (neighborCell.owner === 0) {
      score += 0.75 + neighborCell.count * 0.35;
      if (cell.count + 1 >= mass) score += 1.2;
    }
    if (neighborCell.owner === 1 && neighborCell.count === neighborMass - 1) {
      score += 0.7;
    }
    if (neighborCell.owner === 0 && neighborCell.count === neighborMass - 1) {
      score -= state.difficulty === "high" ? 1.6 : 0.7;
    }
  }

  if (state.difficulty === "high") {
    score += simulateMoveScore(move.col, move.row, 1) * 0.55;
  }

  return score;
}

function scoreHardCpuMove(move) {
  const afterCpu = simulateBoardAfterMove(state.cells, move.col, move.row, 1);
  let score = evaluateBoard(afterCpu, 1);
  score += afterCpu.bursts * 2.1;
  score += countCapturedCells(state.cells, afterCpu.board, 1) * 1.2;

  const redReplies = getValidMovesForBoard(afterCpu.board, 0);
  let bestRedReply = -Infinity;
  for (const reply of redReplies) {
    const afterRed = simulateBoardAfterMove(afterCpu.board, reply.col, reply.row, 0);
    const replyScore = evaluateBoard(afterRed, 0) + afterRed.bursts * 2.2 + countCapturedCells(afterCpu.board, afterRed.board, 0) * 1.4;
    bestRedReply = Math.max(bestRedReply, replyScore);
  }

  if (bestRedReply > -Infinity) score -= bestRedReply * 0.82;
  score += scoreImmediateThreats(afterCpu.board, 1) * 1.1;
  score -= scoreImmediateThreats(afterCpu.board, 0) * 1.35;
  return score;
}

function simulateMoveScore(col, row, owner) {
  const result = simulateBoardAfterMove(state.cells, col, row, owner);
  return evaluateBoard(result, owner) + result.bursts * 1.4;
}

function simulateBoardAfterMove(board, col, row, owner) {
  const clone = board.map((line) => line.map((cell) => ({ ...cell })));
  const queue = [];
  clone[row][col].owner = owner;
  clone[row][col].count++;
  if (clone[row][col].count >= criticalMass(col, row)) queue.push({ col, row });

  let bursts = 0;
  while (queue.length && bursts < 40) {
    const current = queue.shift();
    const cell = clone[current.row][current.col];
    if (cell.owner === -1 || cell.count < criticalMass(current.col, current.row)) continue;
    const burstOwner = cell.owner;
    cell.owner = -1;
    cell.count = 0;
    bursts++;

    for (const neighbor of getNeighbors(current.col, current.row)) {
      const nextCell = clone[neighbor.row][neighbor.col];
      nextCell.owner = burstOwner;
      nextCell.count++;
      if (nextCell.count >= criticalMass(neighbor.col, neighbor.row)) queue.push(neighbor);
    }
  }

  return { board: clone, bursts };
}

function evaluateBoard(resultOrBoard, owner) {
  const board = Array.isArray(resultOrBoard) ? resultOrBoard : resultOrBoard.board;
  const opponent = owner === 1 ? 0 : 1;
  let score = 0;
  for (let row = 0; row < state.rows; row++) {
    const line = board[row];
    for (let col = 0; col < state.cols; col++) {
      const cell = line[col];
      const mass = criticalMass(col, row);
      if (cell.owner === owner) {
        score += 1 + cell.count * 0.42;
        if (cell.count === mass - 1) score += 1.8;
      }
      if (cell.owner === opponent) {
        score -= 1 + cell.count * 0.4;
        if (cell.count === mass - 1) score -= 1.5;
      }
    }
  }
  return score;
}

function getValidMovesForBoard(board, player) {
  const moves = [];
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const cell = board[row][col];
      if (cell.owner === -1 || cell.owner === player) moves.push({ col, row });
    }
  }
  return moves;
}

function countCapturedCells(before, after, owner) {
  let captured = 0;
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      if (before[row][col].owner !== owner && after[row][col].owner === owner) captured++;
    }
  }
  return captured;
}

function scoreImmediateThreats(board, owner) {
  let score = 0;
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const cell = board[row][col];
      if (cell.owner !== owner) continue;
      const mass = criticalMass(col, row);
      if (cell.count === mass - 1) {
        score += 2;
        for (const neighbor of getNeighbors(col, row)) {
          const neighborCell = board[neighbor.row][neighbor.col];
          if (neighborCell.owner !== -1 && neighborCell.owner !== owner) score += 0.8 + neighborCell.count * 0.25;
        }
      }
    }
  }
  return score;
}

function getNeighbors(col, row) {
  return [
    { col: col + 1, row },
    { col: col - 1, row },
    { col, row: row + 1 },
    { col, row: row - 1 },
  ].filter((item) => item.col >= 0 && item.col < state.cols && item.row >= 0 && item.row < state.rows);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function updateHud() {
  const totalCells = state.cols * state.rows;
  const ownedCells = [0, 0];
  for (const row of state.cells) {
    for (const cell of row) {
      if (cell.owner === 0 || cell.owner === 1) ownedCells[cell.owner]++;
    }
  }

  const redValue = Math.round((ownedCells[0] / totalCells) * 100);
  const greenValue = Math.round((ownedCells[1] / totalCells) * 100);
  redPercent.textContent = `${redValue}%`;
  greenPercent.textContent = `${greenValue}%`;
  redBar.style.width = `${redValue}%`;
  greenBar.style.width = `${greenValue}%`;
  const player = PLAYERS[state.currentPlayer];
  const bright = state.currentPlayer === 0 ? "#ff3b3b" : "#59ff66";
  turnOrb.style.setProperty("--turn-color", player.color);
  turnOrb.style.setProperty("--turn-bright", bright);
  turnOrb.style.setProperty("--turn-glow", `${player.color}77`);
}

function draw(time = 0) {
  const dt = Math.min(0.033, (time - state.lastTime) / 1000 || 0.016);
  state.lastTime = time;
  state.pulse += dt;
  updateMotion(dt);

  const metrics = boardMetrics();
  ctx.clearRect(0, 0, metrics.rect.width, metrics.rect.height);
  ctx.save();
  if (state.shake > 0.02) {
    const amount = state.shake;
    ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
    state.shake *= 0.9;
  }

  drawBackground(metrics);
  drawGrid(metrics);
  drawCells(metrics);
  drawMovingOrbs();
  drawParticles();
  ctx.restore();
  requestAnimationFrame(draw);
}

function updateMotion(dt) {
  for (let i = state.moving.length - 1; i >= 0; i--) {
    const orb = state.moving[i];
    orb.age += dt;
    if (orb.age >= orb.duration) {
      state.moving.splice(i, 1);
      addOrb(orb.toCol, orb.toRow, orb.owner);
      continue;
    }
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const spark = state.particles[i];
    spark.age += dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vx *= 0.985;
    spark.vy *= 0.985;
    if (spark.age >= spark.life) state.particles.splice(i, 1);
  }
}

function drawBackground(metrics) {
  if (state.theme === "white") {
    const gradient = ctx.createRadialGradient(
      metrics.rect.width * 0.5,
      metrics.rect.height * 0.3,
      0,
      metrics.rect.width * 0.5,
      metrics.rect.height * 0.46,
      metrics.rect.height * 0.85
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#dcebe0");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, metrics.rect.width, metrics.rect.height);
    return;
  }

  const gradient = ctx.createRadialGradient(
    metrics.rect.width * 0.5,
    metrics.rect.height * 0.35,
    0,
    metrics.rect.width * 0.5,
    metrics.rect.height * 0.45,
    metrics.rect.height * 0.75
  );
  gradient.addColorStop(0, "#061108");
  gradient.addColorStop(1, "#000100");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, metrics.rect.width, metrics.rect.height);
}

function drawGrid(metrics) {
  const depth = metrics.cell * 0.28;
  ctx.lineWidth = 1;
  ctx.strokeStyle = state.theme === "white" ? "rgba(9, 118, 35, 0.58)" : "rgba(40, 230, 84, 0.55)";
  ctx.shadowColor = state.theme === "white" ? "rgba(9, 118, 35, 0.24)" : "rgba(39, 255, 91, 0.45)";
  ctx.shadowBlur = state.gridStyle === "2d" ? 2 : 6;

  for (let row = 0; row <= state.rows; row++) {
    const y = metrics.y + row * metrics.cell;
    line(metrics.x, y, metrics.x + metrics.w, y);
    if (state.gridStyle === "2d") continue;
    line(metrics.x + depth, y - depth, metrics.x + metrics.w + depth, y - depth);
    line(metrics.x, y, metrics.x + depth, y - depth);
    line(metrics.x + metrics.w, y, metrics.x + metrics.w + depth, y - depth);
  }

  for (let col = 0; col <= state.cols; col++) {
    const x = metrics.x + col * metrics.cell;
    line(x, metrics.y, x, metrics.y + metrics.h);
    if (state.gridStyle === "2d") continue;
    line(x + depth, metrics.y - depth, x + depth, metrics.y + metrics.h - depth);
    line(x, metrics.y, x + depth, metrics.y - depth);
    line(x, metrics.y + metrics.h, x + depth, metrics.y + metrics.h - depth);
  }

  ctx.shadowBlur = 0;
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawCells(metrics) {
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const cell = state.cells[row][col];
      if (cell.owner === -1 || cell.count === 0) continue;
      const center = cellCenter(col, row, metrics);
      const mass = criticalMass(col, row);
      const danger = cell.count === mass - 1 ? 1 : 0;
      drawOrbCluster(center.x, center.y, metrics.cell, cell.count, PLAYERS[cell.owner].color, danger, col, row);
      cell.exploding = Math.max(0, cell.exploding - 0.02);
    }
  }
}

function drawOrbCluster(x, y, cell, count, color, danger, col, row) {
  const radius = cell * (count > 2 ? 0.21 : 0.26);
  const orbit = cell * 0.13;
  const wobble = Math.sin(state.pulse * 8 + col * 1.7 + row) * cell * 0.018;
  const positions = clusterOffsets(count, orbit, state.pulse * (1.8 + danger * 2.6) + col + row);
  for (const pos of positions) {
    drawOrb(x + pos.x + wobble, y + pos.y - wobble * 0.6, radius * (1 + danger * 0.08), color);
  }
}

function clusterOffsets(count, orbit, angle) {
  if (count === 1) return [{ x: 0, y: 0 }];
  if (count === 2) {
    return [
      { x: Math.cos(angle) * orbit, y: Math.sin(angle) * orbit },
      { x: Math.cos(angle + Math.PI) * orbit, y: Math.sin(angle + Math.PI) * orbit },
    ];
  }
  return Array.from({ length: count }, (_, index) => {
    const a = angle + (Math.PI * 2 * index) / count;
    return { x: Math.cos(a) * orbit, y: Math.sin(a) * orbit };
  });
}

function drawMovingOrbs() {
  for (const orb of state.moving) {
    const t = Math.min(1, orb.age / orb.duration);
    const ease = 1 - Math.pow(1 - t, 3);
    const hop = Math.sin(t * Math.PI) * 18;
    const x = lerp(orb.sx, orb.ex, ease);
    const y = lerp(orb.sy, orb.ey, ease) - hop;
    drawOrb(x, y, Math.max(12, boardMetrics().cell * 0.23), orb.color);
  }
}

function drawOrb(x, y, radius, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = radius * 0.35;
  const gradient = ctx.createRadialGradient(x - radius * 0.06, y - radius * 0.05, radius * 0.05, x, y, radius);
  gradient.addColorStop(0, shadeHexColor(color, 0.06));
  gradient.addColorStop(0.42, shadeHexColor(color, -0.04));
  gradient.addColorStop(0.76, shadeHexColor(color, -0.28));
  gradient.addColorStop(1, shadeHexColor(color, -0.72));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = shadeHexColor(color, 0.16);
  ctx.beginPath();
  ctx.arc(x - radius * 0.04, y - radius * 0.02, radius * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function shadeHexColor(hex, amount) {
  const value = hex.replace("#", "");
  const rgb = [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16));
  const shaded = rgb.map((channel) => {
    const target = amount > 0 ? 255 : 0;
    return Math.round(channel + (target - channel) * Math.abs(amount));
  });
  return `rgb(${shaded[0]}, ${shaded[1]}, ${shaded[2]})`;
}

function makeSparks(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 45 + Math.random() * 130;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      life: 0.22 + Math.random() * 0.22,
      color,
      size: 1.5 + Math.random() * 2.6,
    });
  }
}

function drawParticles() {
  for (const spark of state.particles) {
    const alpha = 1 - spark.age / spark.life;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = spark.color;
    ctx.shadowColor = spark.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function playClickSound(player) {
  if (player === 0) {
    playTone(280, 0.09, "sine", 0.12);
    playTone(420, 0.07, "triangle", 0.05, 0.018);
    return;
  }

  playTone(470, 0.085, "sine", 0.11);
  playTone(705, 0.065, "triangle", 0.05, 0.018);
}

function playBurstSound(neighborCount) {
  const base = 210 + neighborCount * 28;
  playTone(base, 0.16, "sine", 0.13);
  playTone(base * 1.34, 0.13, "triangle", 0.075, 0.028);
  playTone(base * 0.72, 0.18, "sine", 0.05, 0.012);
}

function playWinSound(winner) {
  const start = winner === 0 ? 440 : 520;
  [0, 0.1, 0.2, 0.34].forEach((delay, index) => {
    playTone(start * [1, 1.25, 1.5, 2][index], 0.16, "triangle", 0.16, delay);
  });
  playTone(start / 2, 0.42, "sine", 0.11, 0.04);
}

function playTone(frequency, duration, type, gainValue, delay = 0) {
  try {
    const audioCtx = unlockAudio();
    if (!audioCtx) return;
    const startTone = () => {
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const startAt = audioCtx.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(state.masterGain);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
    };

    if (audioCtx.state === "suspended") {
      audioCtx.resume().then(startTone).catch(() => {});
      return;
    }

    startTone();
  } catch {
    return;
  }
}

function unlockAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    state.audioCtx ||= new AudioContextClass();
    if (!state.masterGain) {
      state.masterGain = state.audioCtx.createGain();
      state.masterGain.gain.value = 0.72;
      state.masterGain.connect(state.audioCtx.destination);
    }
    if (state.audioCtx.state === "suspended") {
      state.audioCtx.resume();
    }
    return state.audioCtx;
  } catch {
    return null;
  }
}

canvas.addEventListener("pointerdown", handleBoardPointer);
canvas.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
playButton.addEventListener("pointerdown", unlockAudio, { passive: true });
playButton.addEventListener("click", startGame);
playAgainButton.addEventListener("click", resetGame);
homeButton.addEventListener("click", showHome);
fillRange.addEventListener("input", () => {
  fillValue.textContent = `${fillRange.value}%`;
});
playModeInputs.forEach((input) => input.addEventListener("change", applySetupOptions));
difficultyInputs.forEach((input) => input.addEventListener("change", applySetupOptions));
gridStyleInputs.forEach((input) => input.addEventListener("change", applySetupOptions));
themeInputs.forEach((input) => input.addEventListener("change", applySetupOptions));
window.addEventListener("resize", resizeCanvas);

fillValue.textContent = `${fillRange.value}%`;
applySetupOptions();
state.cells = createCells();
updateHud();
requestAnimationFrame(draw);
