const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const homeScreen = document.querySelector("#homeScreen");
const gameScreen = document.querySelector("#gameScreen");
const fillRange = document.querySelector("#fillRange");
const fillValue = document.querySelector("#fillValue");
const playButton = document.querySelector("#playButton");
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
};

function createCells() {
  return Array.from({ length: state.rows }, () =>
    Array.from({ length: state.cols }, () => ({ owner: -1, count: 0, exploding: 0 }))
  );
}

function resetGame() {
  state.cols = 6;
  state.rows = 9;
  state.playerCount = 2;
  state.currentPlayer = 0;
  state.cells = createCells();
  state.particles = [];
  state.moving = [];
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
  homeScreen.hidden = true;
  gameScreen.hidden = false;
  resetGame();
  requestAnimationFrame(resizeCanvas);
}

function showHome() {
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

function handleCanvasClick(event) {
  if (state.animating || state.gameOver) return;
  const target = getCellFromPointer(event);
  if (!target) return;
  const cell = state.cells[target.row][target.col];
  if (cell.owner !== -1 && cell.owner !== state.currentPlayer) return;

  state.started = true;
  addOrb(target.col, target.row, state.currentPlayer);
  state.turnNumber++;
  playTone(180 + state.currentPlayer * 90, 0.045, "sine", 0.055);
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
    playTone(260 + neighbors.length * 60, 0.035, "triangle", 0.035);

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
    playTone(500 + winner * 80, 0.18, "sawtooth", 0.04);
    updateHud();
    return;
  }

  advancePlayer();
  updateHud();
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
  ctx.strokeStyle = "rgba(40, 230, 84, 0.55)";
  ctx.shadowColor = "rgba(39, 255, 91, 0.45)";
  ctx.shadowBlur = 6;

  for (let row = 0; row <= state.rows; row++) {
    const y = metrics.y + row * metrics.cell;
    line(metrics.x, y, metrics.x + metrics.w, y);
    line(metrics.x + depth, y - depth, metrics.x + metrics.w + depth, y - depth);
    line(metrics.x, y, metrics.x + depth, y - depth);
    line(metrics.x + metrics.w, y, metrics.x + metrics.w + depth, y - depth);
  }

  for (let col = 0; col <= state.cols; col++) {
    const x = metrics.x + col * metrics.cell;
    line(x, metrics.y, x, metrics.y + metrics.h);
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

function playTone(frequency, duration, type, gainValue) {
  try {
    state.audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = gainValue;
    gain.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(state.audioCtx.destination);
    oscillator.start();
    oscillator.stop(state.audioCtx.currentTime + duration);
  } catch {
    return;
  }
}

canvas.addEventListener("click", handleCanvasClick);
playButton.addEventListener("click", startGame);
playAgainButton.addEventListener("click", resetGame);
homeButton.addEventListener("click", showHome);
fillRange.addEventListener("input", () => {
  fillValue.textContent = `${fillRange.value}%`;
});
window.addEventListener("resize", resizeCanvas);

fillValue.textContent = `${fillRange.value}%`;
state.cells = createCells();
updateHud();
requestAnimationFrame(draw);
