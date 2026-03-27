const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const frameEl = document.querySelector(".frame");
const menuPanel = document.querySelector("#menu-panel");
const gameoverPanel = document.querySelector("#gameover-panel");
const gameoverTitle = document.querySelector("#gameover-title");
const gameoverSummary = document.querySelector("#gameover-summary");
const startButton = document.querySelector("#start-btn");
const restartButton = document.querySelector("#restart-btn");
const scoreValue = document.querySelector("#score-value");
const bestValue = document.querySelector("#best-value");
const gravityValue = document.querySelector("#gravity-value");
const cooldownValue = document.querySelector("#cooldown-value");
const flipChip = cooldownValue.closest(".hud-chip");
const audioToggle = document.querySelector("#audio-toggle");
const audioValue = document.querySelector("#audio-value");

const VIEW_W = 320;
const VIEW_H = 180;
const FIXED_STEP = 1 / 60;
const DISPLAY_SCALE_X = canvas.width / VIEW_W;
const DISPLAY_SCALE_Y = canvas.height / VIEW_H;
const PLAYER_X = 78;
const PLAYER_RADIUS = 7;
const PIPE_WIDTH = 26;
const PIPE_SPEED = 92;
const PIPE_SPACING = 108;
const GAP_SIZE = 60;
const PLAYER_FLAP_FORCE = 136;
const GRAVITY_FORCE = 318;
const AUTO_FLIP_INITIAL_MS = 2350;
const AUTO_FLIP_BASE_MS = 3900;
const AUTO_FLIP_VARIANCE_MS = 450;
const AUTO_FLIP_WARNING_MS = 980;
const TOP_BOUNDS = 10;
const BOTTOM_BOUNDS = VIEW_H - 14;

const buffer = document.createElement("canvas");
buffer.width = VIEW_W;
buffer.height = VIEW_H;

const pixel = buffer.getContext("2d", { alpha: false });
ctx.imageSmoothingEnabled = false;
pixel.imageSmoothingEnabled = false;

const seedParam = new URLSearchParams(window.location.search).get("seed");

const state = {
  mode: "menu",
  time: 0,
  score: 0,
  bestScore: readBestScore(),
  pipePoints: 0,
  orbPoints: 0,
  runSeed: "",
  muted: false,
  player: null,
  gravityCycle: null,
  pipes: [],
  clouds: [],
  sparkles: [],
  accumulator: 0,
  lastRealTimestamp: performance.now(),
};

let playRng = createRng("boot:play");
let sceneRng = createRng("boot:scene");

const audio = createAudioSystem();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function hashSeed(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seed) {
  const seedFactory = hashSeed(String(seed));
  const generator = mulberry32(seedFactory());
  return {
    next() {
      return generator();
    },
    range(min, max) {
      return min + (max - min) * generator();
    },
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    },
    pick(items) {
      return items[Math.floor(generator() * items.length)];
    },
  };
}

function readBestScore() {
  try {
    return (
      Number(window.localStorage.getItem("duckuu-best")) ||
      Number(window.localStorage.getItem("rift-flyer-best")) ||
      0
    );
  } catch {
    return 0;
  }
}

function saveBestScore() {
  try {
    window.localStorage.setItem("duckuu-best", String(state.bestScore));
  } catch {
    return;
  }
}

function createAudioSystem() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  let audioContext = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let nextBeatAt = 0;
  let beatIndex = 0;

  const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 493.88, 392];
  const bass = [130.81, 0, 146.83, 0, 174.61, 0, 146.83, 0];

  function init() {
    if (!AudioCtor || audioContext) {
      return;
    }
    try {
      audioContext = new AudioCtor();
      masterGain = audioContext.createGain();
      musicGain = audioContext.createGain();
      sfxGain = audioContext.createGain();

      masterGain.gain.value = state.muted ? 0.0001 : 0.24;
      musicGain.gain.value = 0.42;
      sfxGain.gain.value = 0.7;

      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(audioContext.destination);
      nextBeatAt = audioContext.currentTime;
    } catch {
      audioContext = null;
    }
  }

  function ensureReady() {
    init();
    if (!audioContext) {
      return;
    }
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
  }

  function playVoice(freq, start, duration, volume, type, gainNode) {
    if (!audioContext || !freq) {
      return;
    }
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration + 0.09);

    oscillator.connect(gain);
    gain.connect(gainNode);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.12);
  }

  function pumpMusic() {
    ensureReady();
    if (!audioContext || state.muted) {
      return;
    }
    while (nextBeatAt < audioContext.currentTime + 0.34) {
      const index = beatIndex % melody.length;
      playVoice(bass[index], nextBeatAt, 0.16, 0.055, "square", musicGain);
      playVoice(
        melody[index],
        nextBeatAt + 0.03,
        0.1,
        index % 2 === 0 ? 0.042 : 0.03,
        index % 2 === 0 ? "triangle" : "square",
        musicGain,
      );
      nextBeatAt += 0.22;
      beatIndex += 1;
    }
  }

  function chirp(kind) {
    ensureReady();
    if (!audioContext || state.muted) {
      return;
    }
    const start = audioContext.currentTime + 0.01;

    if (kind === "flap") {
      playVoice(620, start, 0.05, 0.1, "square", sfxGain);
      playVoice(820, start + 0.03, 0.04, 0.07, "triangle", sfxGain);
      return;
    }
    if (kind === "flip") {
      playVoice(300, start, 0.06, 0.08, "sawtooth", sfxGain);
      playVoice(460, start + 0.04, 0.07, 0.08, "triangle", sfxGain);
      return;
    }
    if (kind === "warning") {
      playVoice(450, start, 0.04, 0.05, "square", sfxGain);
      playVoice(525, start + 0.08, 0.04, 0.05, "square", sfxGain);
      playVoice(610, start + 0.16, 0.04, 0.05, "square", sfxGain);
      return;
    }
    if (kind === "score") {
      playVoice(660, start, 0.05, 0.09, "square", sfxGain);
      playVoice(880, start + 0.05, 0.06, 0.08, "square", sfxGain);
      return;
    }
    if (kind === "orb") {
      playVoice(740, start, 0.05, 0.1, "triangle", sfxGain);
      playVoice(1110, start + 0.03, 0.07, 0.07, "square", sfxGain);
      return;
    }
    playVoice(180, start, 0.12, 0.12, "sawtooth", sfxGain);
    playVoice(120, start + 0.04, 0.16, 0.08, "square", sfxGain);
  }

  function setMuted(muted) {
    state.muted = muted;
    if (audioContext && masterGain) {
      const target = muted ? 0.0001 : 0.24;
      masterGain.gain.setTargetAtTime(target, audioContext.currentTime, 0.02);
    }
    if (!muted) {
      ensureReady();
    }
    updateHud();
  }

  return {
    ensureReady,
    pumpMusic,
    chirp,
    setMuted,
  };
}

function createPlayer() {
  return {
    x: PLAYER_X,
    y: VIEW_H / 2,
    r: PLAYER_RADIUS,
    vy: 0,
    gravity: "down",
    flipCooldownMs: 0,
    flapStretch: 0,
    wingTimer: 0,
  };
}

function createGravityCycle() {
  return {
    msUntilFlip: AUTO_FLIP_INITIAL_MS,
    nextGravity: "up",
    warningActive: false,
    flashMs: 0,
  };
}

function applyPanels() {
  menuPanel.classList.toggle("hidden", state.mode !== "menu");
  gameoverPanel.classList.toggle("hidden", state.mode !== "gameover");
}

function updateHud() {
  const nextMs = Math.max(0, state.gravityCycle.msUntilFlip);
  const nextGravityLabel = state.gravityCycle.nextGravity === "down" ? "Down" : "Up";
  scoreValue.textContent = String(state.score);
  bestValue.textContent = String(state.bestScore);
  gravityValue.textContent = state.player.gravity === "down" ? "Down" : "Up";
  cooldownValue.textContent = `${nextGravityLabel} ${(nextMs / 1000).toFixed(1)}s`;
  flipChip.classList.toggle("is-warning", state.mode === "playing" && state.gravityCycle.warningActive);
  audioValue.textContent = state.muted ? "Off" : "On";
  audioToggle.setAttribute("aria-pressed", String(!state.muted));
}

function reseedRun() {
  const baseSeed = seedParam ?? `${Date.now()}-${Math.random()}`;
  state.runSeed = baseSeed;
  playRng = createRng(`${baseSeed}:play`);
  sceneRng = createRng(`${baseSeed}:scene`);
}

function buildClouds() {
  state.clouds = Array.from({ length: 5 }, () => ({
    x: sceneRng.range(-20, VIEW_W + 30),
    y: sceneRng.range(12, 58),
    w: sceneRng.range(20, 38),
    h: sceneRng.range(8, 14),
    speed: sceneRng.range(4, 10),
  }));
}

function emitSparkles(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    state.sparkles.push({
      x,
      y,
      vx: playRng.range(-20, 20),
      vy: playRng.range(-20, 20),
      life: playRng.range(0.2, 0.45),
      maxLife: 1,
      color,
    });
  }
}

function resetRun(nextMode) {
  reseedRun();
  state.mode = nextMode;
  state.time = 0;
  state.score = 0;
  state.pipePoints = 0;
  state.orbPoints = 0;
  state.player = createPlayer();
  state.gravityCycle = createGravityCycle();
  state.pipes = [];
  state.sparkles = [];
  state.accumulator = 0;

  buildClouds();
  seedStartingPipes();
  queueNextAutoFlip(true);
  gameoverTitle.textContent = "Bonk!";
  gameoverSummary.textContent = "";
  applyPanels();
  updateHud();
  render();
}

function seedStartingPipes() {
  let spawnX = VIEW_W + 34;
  for (let i = 0; i < 4; i += 1) {
    spawnPipe(spawnX);
    spawnX += PIPE_SPACING;
  }
}

function spawnPipe(x) {
  const gapY = playRng.range(56, 124);
  const orbOffset = playRng.range(-12, 12);
  state.pipes.push({
    x,
    width: PIPE_WIDTH,
    gapY,
    gapSize: GAP_SIZE,
    passed: false,
    orb: {
      x: x + PIPE_WIDTH / 2,
      y: gapY + orbOffset,
      phase: playRng.range(0, Math.PI * 2),
      preferredGravity: playRng.next() > 0.5 ? "down" : "up",
      collected: false,
    },
  });
}

function startRun() {
  audio.ensureReady();
  resetRun("playing");
}

function toggleMute() {
  audio.setMuted(!state.muted);
}

function queueNextAutoFlip(initial = false) {
  const base = initial ? AUTO_FLIP_INITIAL_MS : AUTO_FLIP_BASE_MS;
  const variance = initial ? AUTO_FLIP_VARIANCE_MS * 0.35 : AUTO_FLIP_VARIANCE_MS;
  state.gravityCycle.msUntilFlip = Math.max(
    AUTO_FLIP_WARNING_MS + 320,
    base + playRng.range(-variance, variance),
  );
  state.gravityCycle.nextGravity = state.player.gravity === "down" ? "up" : "down";
  state.gravityCycle.warningActive = false;
  state.player.flipCooldownMs = state.gravityCycle.msUntilFlip;
}

function flap() {
  if (state.mode !== "playing") {
    return;
  }
  const impulse = state.player.gravity === "down" ? -PLAYER_FLAP_FORCE : PLAYER_FLAP_FORCE;
  state.player.vy = impulse + state.player.vy * 0.22;
  state.player.flapStretch = 1;
  emitSparkles(state.player.x - 2, state.player.y + 3, "#fff4bb", 3);
  audio.chirp("flap");
}

function triggerAutoFlip() {
  state.player.gravity = state.gravityCycle.nextGravity;
  state.player.vy *= 0.38;
  state.player.vy += state.player.gravity === "down" ? 30 : -30;
  state.player.y = clamp(state.player.y, TOP_BOUNDS + 2, BOTTOM_BOUNDS - 2);
  state.gravityCycle.warningActive = false;
  state.gravityCycle.flashMs = 280;
  emitSparkles(state.player.x, state.player.y, "#7ce8ff", 6);
  audio.chirp("flip");
  queueNextAutoFlip(false);
}

function crash(reason) {
  if (state.mode !== "playing") {
    return;
  }
  state.mode = "gameover";
  state.bestScore = Math.max(state.bestScore, state.score);
  saveBestScore();
  gameoverTitle.textContent = reason === "bounds" ? "Splash Out" : "Bonk!";
  gameoverSummary.textContent =
    `Score ${state.score}. Pipes ${state.pipePoints}, ` +
    `rift matches ${state.orbPoints}. Press Enter or Retry Run.`;
  emitSparkles(state.player.x, state.player.y, "#ff9db9", 10);
  audio.chirp("hit");
  applyPanels();
  updateHud();
}

function getOrbY(pipe) {
  return pipe.orb.y + Math.sin(state.time * 4 + pipe.orb.phase) * 2;
}

function updateClouds(dt) {
  for (const cloud of state.clouds) {
    cloud.x -= cloud.speed * dt;
    if (cloud.x + cloud.w < -8) {
      cloud.x = VIEW_W + sceneRng.range(4, 20);
      cloud.y = sceneRng.range(12, 58);
      cloud.w = sceneRng.range(20, 38);
      cloud.h = sceneRng.range(8, 14);
      cloud.speed = sceneRng.range(4, 10);
    }
  }
}

function updateSparkles(dt) {
  for (const sparkle of state.sparkles) {
    sparkle.life -= dt * 2.2;
    sparkle.x += sparkle.vx * dt;
    sparkle.y += sparkle.vy * dt;
    sparkle.vy += 22 * dt;
  }
  state.sparkles = state.sparkles.filter((sparkle) => sparkle.life > 0);
}

function updatePlaying(dt) {
  const player = state.player;
  const gravityCycle = state.gravityCycle;

  state.time += dt;
  gravityCycle.flashMs = Math.max(0, gravityCycle.flashMs - dt * 1000);
  gravityCycle.msUntilFlip = Math.max(0, gravityCycle.msUntilFlip - dt * 1000);
  player.flipCooldownMs = gravityCycle.msUntilFlip;
  if (!gravityCycle.warningActive && gravityCycle.msUntilFlip <= AUTO_FLIP_WARNING_MS) {
    gravityCycle.warningActive = true;
    emitSparkles(
      player.x + 4,
      gravityCycle.nextGravity === "up" ? 24 : VIEW_H - 24,
      gravityCycle.nextGravity === "up" ? "#7ce8ff" : "#ffe97a",
      8,
    );
    audio.chirp("warning");
  }
  if (gravityCycle.msUntilFlip <= 0) {
    triggerAutoFlip();
  }
  player.wingTimer += dt * (8 + Math.abs(player.vy) * 0.03);
  player.flapStretch = Math.max(0, player.flapStretch - dt * 3.4);
  player.vy += (player.gravity === "down" ? GRAVITY_FORCE : -GRAVITY_FORCE) * dt;
  player.vy *= 0.996;
  player.vy = clamp(player.vy, -160, 160);
  player.y += player.vy * dt;

  for (const pipe of state.pipes) {
    pipe.x -= PIPE_SPEED * dt;
    pipe.orb.x = pipe.x + pipe.width / 2;
  }

  const lastPipe = state.pipes[state.pipes.length - 1];
  if (!lastPipe || lastPipe.x < VIEW_W - PIPE_SPACING) {
    spawnPipe(VIEW_W + 34);
  }
  state.pipes = state.pipes.filter((pipe) => pipe.x + pipe.width > -40);

  for (const pipe of state.pipes) {
    const gapTop = pipe.gapY - pipe.gapSize / 2;
    const gapBottom = pipe.gapY + pipe.gapSize / 2;

    if (!pipe.passed && pipe.x + pipe.width < player.x - player.r) {
      pipe.passed = true;
      state.score += 1;
      state.pipePoints += 1;
      state.bestScore = Math.max(state.bestScore, state.score);
      audio.chirp("score");
      emitSparkles(pipe.x + pipe.width, pipe.gapY, "#ffe281", 6);
    }

    if (
      player.x + player.r > pipe.x &&
      player.x - player.r < pipe.x + pipe.width &&
      (player.y - player.r < gapTop + 1 || player.y + player.r > gapBottom - 1)
    ) {
      crash("pipe");
      return;
    }

    if (!pipe.orb.collected) {
      const orbY = getOrbY(pipe);
      const closeEnough =
        Math.abs(player.x - pipe.orb.x) < player.r + 6 &&
        Math.abs(player.y - orbY) < player.r + 6;

      if (closeEnough && player.gravity === pipe.orb.preferredGravity) {
        pipe.orb.collected = true;
        state.score += 1;
        state.orbPoints += 1;
        state.bestScore = Math.max(state.bestScore, state.score);
        audio.chirp("orb");
        emitSparkles(pipe.orb.x, orbY, "#7ce8ff", 8);
      }
    }
  }

  if (player.y < TOP_BOUNDS || player.y > BOTTOM_BOUNDS) {
    crash("bounds");
  }
}

function tick(dt) {
  updateClouds(dt);
  updateSparkles(dt);
  audio.pumpMusic();

  if (state.mode === "playing") {
    updatePlaying(dt);
  } else {
    state.time += dt;
    state.player.wingTimer += dt * 3;
    state.player.flapStretch = Math.max(0, state.player.flapStretch - dt * 2);
    state.player.y = VIEW_H / 2 + Math.sin(state.time * 2.2) * 4;
  }

  updateHud();
}

function drawPixelRect(x, y, w, h, color) {
  pixel.fillStyle = color;
  pixel.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawBackground() {
  drawPixelRect(0, 0, VIEW_W, 64, "#5b74ff");
  drawPixelRect(0, 64, VIEW_W, 44, "#8d93ff");
  drawPixelRect(0, 108, VIEW_W, 34, "#ff92b3");
  drawPixelRect(0, 142, VIEW_W, 38, "#ffd87b");

  drawPixelRect(238, 20, 18, 18, "#fff2a8");
  drawPixelRect(242, 16, 10, 26, "#ffe07b");
  drawPixelRect(234, 24, 26, 10, "#ffe07b");

  for (const cloud of state.clouds) {
    drawPixelRect(cloud.x, cloud.y, cloud.w, cloud.h, "#f7fbff");
    drawPixelRect(cloud.x + 4, cloud.y - 4, cloud.w - 8, 4, "#f7fbff");
    drawPixelRect(cloud.x + 3, cloud.y + cloud.h, cloud.w - 6, 2, "#d6e0ff");
  }

  for (let x = 0; x < VIEW_W; x += 4) {
    const backHill = 18 + Math.floor(10 * Math.sin(x * 0.055 + 0.6));
    const frontHill = 16 + Math.floor(12 * Math.sin(x * 0.08 + 2.2));
    drawPixelRect(x, 124 - backHill, 4, backHill, "#7894dd");
    drawPixelRect(x, 138 - frontHill, 4, frontHill, "#4a6d90");
  }

  drawPixelRect(0, 150, VIEW_W, 30, "#4db0d9");
  for (let x = 0; x < VIEW_W; x += 8) {
    const rippleY = 154 + ((x + Math.floor(state.time * 30)) % 16 < 8 ? 0 : 2);
    drawPixelRect(x, rippleY, 5, 1, "#98ecff");
    drawPixelRect(x + 2, 164, 6, 1, "#7ad8ee");
  }

  for (let x = 0; x < VIEW_W; x += 12) {
    const reedHeight = 6 + ((x * 7) % 8);
    drawPixelRect(x, 150 - reedHeight, 2, reedHeight, "#3d8240");
    drawPixelRect(x + 1, 149 - reedHeight, 1, 2, "#b8ff8d");
  }
}

function drawPipe(x, y, w, h, inverted) {
  const bodyY = inverted ? y : y;
  drawPixelRect(x, bodyY, w, h, "#58b94c");
  drawPixelRect(x, bodyY, 2, h, "#2f6c35");
  drawPixelRect(x + w - 2, bodyY, 2, h, "#2f6c35");
  drawPixelRect(x + 2, bodyY + 2, w - 4, 2, "#a8ff88");
  const capY = inverted ? y + h - 8 : y;
  drawPixelRect(x - 3, capY, w + 6, 8, "#79da65");
  drawPixelRect(x - 3, capY, w + 6, 2, "#cbff95");
  drawPixelRect(x - 3, capY + 6, w + 6, 2, "#2f6c35");
}

function drawOrb(pipe) {
  if (pipe.orb.collected) {
    return;
  }
  const orbX = Math.round(pipe.orb.x - 5);
  const orbY = Math.round(getOrbY(pipe) - 5);
  const glow = pipe.orb.preferredGravity === "down" ? "#ffe97a" : "#7ce8ff";
  const core = pipe.orb.preferredGravity === "down" ? "#ffb347" : "#8cecff";

  drawPixelRect(orbX + 1, orbY, 8, 10, glow);
  drawPixelRect(orbX, orbY + 1, 10, 8, glow);
  drawPixelRect(orbX + 2, orbY + 2, 6, 6, "#24386e");
  drawPixelRect(orbX + 3, orbY + 3, 4, 4, core);

  if (pipe.orb.preferredGravity === "down") {
    drawPixelRect(orbX + 4, orbY + 3, 2, 2, "#1c2852");
    drawPixelRect(orbX + 3, orbY + 5, 4, 1, "#1c2852");
    drawPixelRect(orbX + 2, orbY + 6, 6, 1, "#1c2852");
  } else {
    drawPixelRect(orbX + 2, orbY + 3, 6, 1, "#1c2852");
    drawPixelRect(orbX + 3, orbY + 4, 4, 1, "#1c2852");
    drawPixelRect(orbX + 4, orbY + 5, 2, 2, "#1c2852");
  }
}

function drawPipes() {
  for (const pipe of state.pipes) {
    const gapTop = Math.round(pipe.gapY - pipe.gapSize / 2);
    const gapBottom = Math.round(pipe.gapY + pipe.gapSize / 2);
    const pipeX = Math.round(pipe.x);
    const width = Math.round(pipe.width);

    drawPipe(pipeX, 0, width, gapTop, true);
    drawPipe(pipeX, gapBottom, width, VIEW_H - gapBottom, false);
    drawOrb(pipe);
  }
}

function drawSparkles() {
  for (const sparkle of state.sparkles) {
    const size = sparkle.life > 0.35 ? 2 : 1;
    drawPixelRect(sparkle.x, sparkle.y, size, size, sparkle.color);
  }
}

function drawArrowGlyph(x, y, direction, color) {
  if (direction === "up") {
    drawPixelRect(x + 2, y, 2, 2, color);
    drawPixelRect(x + 1, y + 2, 4, 2, color);
    drawPixelRect(x, y + 4, 6, 2, color);
    drawPixelRect(x + 2, y + 6, 2, 4, color);
    return;
  }
  drawPixelRect(x + 2, y, 2, 4, color);
  drawPixelRect(x, y + 4, 6, 2, color);
  drawPixelRect(x + 1, y + 6, 4, 2, color);
  drawPixelRect(x + 2, y + 8, 2, 2, color);
}

function drawAutoFlipIndicator() {
  if (state.mode !== "playing") {
    return;
  }

  const { warningActive, flashMs, msUntilFlip, nextGravity } = state.gravityCycle;
  const accent = nextGravity === "up" ? "#7ce8ff" : "#ffe97a";
  const dark = "#223563";

  if (flashMs > 0) {
    const edgeY = state.player.gravity === "up" ? 0 : VIEW_H - 8;
    drawPixelRect(0, edgeY, VIEW_W, 8, state.player.gravity === "up" ? "#84f0ff" : "#fff3a7");
  }

  if (!warningActive) {
    return;
  }

  const pulseOn = Math.floor(state.time * 12) % 2 === 0;
  const stripY = nextGravity === "up" ? 0 : VIEW_H - 18;
  const barY = nextGravity === "up" ? 12 : VIEW_H - 15;
  const textY = nextGravity === "up" ? 4 : VIEW_H - 14;
  const arrowY = nextGravity === "up" ? 4 : VIEW_H - 14;
  const progress = clamp(msUntilFlip / AUTO_FLIP_WARNING_MS, 0, 1);
  const barWidth = Math.max(8, Math.round((VIEW_W - 46) * progress));

  drawPixelRect(0, stripY, VIEW_W, 18, pulseOn ? accent : "#4d6298");
  drawPixelRect(0, stripY + (nextGravity === "up" ? 16 : 0), VIEW_W, 2, dark);
  drawPixelRect(20, barY, VIEW_W - 40, 3, dark);
  drawPixelRect(20, barY, barWidth, 3, pulseOn ? "#fff8d6" : "#ff9db9");

  for (let i = 0; i < 3; i += 1) {
    drawArrowGlyph(6 + i * 12, arrowY, nextGravity, dark);
    drawArrowGlyph(VIEW_W - 42 + i * 12, arrowY, nextGravity, dark);
  }

  pixel.save();
  pixel.fillStyle = dark;
  pixel.font = "bold 8px monospace";
  pixel.textAlign = "center";
  pixel.textBaseline = "top";
  pixel.fillText(nextGravity === "up" ? "MOVE UP" : "DROP DOWN", VIEW_W / 2, textY);
  pixel.restore();
}

function drawDuck() {
  const player = state.player;
  const wingUp = player.flapStretch > 0.35 || Math.floor(player.wingTimer * 2) % 2 === 1;
  const x = Math.round(player.x);
  const y = Math.round(player.y);

  pixel.save();
  pixel.translate(x, y);
  if (player.gravity === "up") {
    pixel.scale(1, -1);
  }

  drawPixelRect(-11, -4, 17, 12, "#2d2a4d");
  drawPixelRect(-10, -3, 15, 10, "#ffe26c");
  drawPixelRect(-5, 1, 9, 5, "#fff1b1");
  drawPixelRect(-3, -12, 10, 9, "#2d2a4d");
  drawPixelRect(-2, -11, 8, 7, "#fff3a7");
  drawPixelRect(0, -14, 2, 2, "#ffe26c");
  drawPixelRect(3, -14, 2, 2, "#ffe26c");
  drawPixelRect(5, -5, 6, 4, "#ff9d45");
  drawPixelRect(7, -3, 4, 1, "#ffc76b");
  drawPixelRect(3, -8, 1, 2, "#1e213d");
  drawPixelRect(4, -8, 1, 1, "#ffffff");
  drawPixelRect(1, -3, 2, 2, "#ff93b9");
  drawPixelRect(-5, -1, 9, 3, "#79dcff");
  drawPixelRect(4, 0, 4, 2, "#79dcff");
  drawPixelRect(-12, 0, 2, 3, "#fff0a3");

  if (wingUp) {
    drawPixelRect(-11, -9, 6, 7, "#c28b29");
    drawPixelRect(-10, -8, 4, 5, "#ffe07b");
  } else {
    drawPixelRect(-12, 0, 7, 6, "#c28b29");
    drawPixelRect(-11, 1, 5, 4, "#ffe07b");
  }

  drawPixelRect(-4, 8, 2, 1, "#ff9d45");
  drawPixelRect(1, 8, 2, 1, "#ff9d45");
  drawPixelRect(-8, 7, 3, 1, "#2d2a4d");
  pixel.restore();
}

function render() {
  drawBackground();
  drawPipes();
  drawAutoFlipIndicator();
  drawSparkles();
  drawDuck();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
}

function handlePrimaryAction() {
  audio.ensureReady();
  if (state.mode === "playing") {
    flap();
    return;
  }
  startRun();
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  frameEl.requestFullscreen?.().catch(() => {});
}

function animationFrame(now) {
  const pausedForCapture = window.__riftFlyerPauseForCapture === true;
  const elapsed = pausedForCapture
    ? 0
    : Math.min(0.05, Math.max(0, (now - state.lastRealTimestamp) / 1000));
  state.lastRealTimestamp = now;
  state.accumulator += elapsed;

  while (state.accumulator >= FIXED_STEP) {
    tick(FIXED_STEP);
    state.accumulator -= FIXED_STEP;
  }

  render();
  window.requestAnimationFrame(animationFrame);
}

function renderGameToText() {
  const player = state.player;
  return JSON.stringify({
    game: "Duckku Birds",
    mode: state.mode,
    coordinateSystem: {
      origin: "top-left",
      x: "right",
      y: "down",
      units: "canvas pixels for positions, pixels per frame for velocity",
    },
    player: {
      x: round(player.x * DISPLAY_SCALE_X),
      y: round(player.y * DISPLAY_SCALE_Y),
      r: round(player.r * DISPLAY_SCALE_X),
      vy: round((player.vy * DISPLAY_SCALE_Y) / 60),
      gravity: player.gravity,
      flipCooldownMs: Math.round(player.flipCooldownMs),
    },
    pipes: state.pipes.slice(0, 5).map((pipe) => ({
      x: round(pipe.x * DISPLAY_SCALE_X),
      width: round(pipe.width * DISPLAY_SCALE_X),
      gapY: round(pipe.gapY * DISPLAY_SCALE_Y),
      gapSize: round(pipe.gapSize * DISPLAY_SCALE_Y),
      passed: pipe.passed,
      orb: {
        x: round(pipe.orb.x * DISPLAY_SCALE_X),
        y: round(getOrbY(pipe) * DISPLAY_SCALE_Y),
        preferredGravity: pipe.orb.preferredGravity,
        collected: pipe.orb.collected,
      },
    })),
    score: state.score,
    bestScore: state.bestScore,
    pipePoints: state.pipePoints,
    orbPoints: state.orbPoints,
    gravityCycle: {
      msUntilFlip: Math.round(state.gravityCycle.msUntilFlip),
      warningActive: state.gravityCycle.warningActive,
      nextGravity: state.gravityCycle.nextGravity,
    },
    muted: state.muted,
    seed: state.runSeed,
  });
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms) => {
  const totalSteps = Math.max(1, Math.round(ms / (FIXED_STEP * 1000)));
  for (let i = 0; i < totalSteps; i += 1) {
    tick(FIXED_STEP);
  }
  render();
};

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }
  handlePrimaryAction();
});

startButton.addEventListener("click", () => {
  startRun();
});

restartButton.addEventListener("click", () => {
  startRun();
});

audioToggle.addEventListener("click", () => {
  audio.ensureReady();
  toggleMute();
});

window.addEventListener("keydown", (event) => {
  if (["Space", "Enter", "KeyM", "KeyF"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "Space") {
    handlePrimaryAction();
    return;
  }
  if (event.code === "Enter") {
    if (state.mode === "playing") {
      flap();
    } else {
      startRun();
    }
    return;
  }
  if (event.code === "KeyM") {
    audio.ensureReady();
    toggleMute();
    return;
  }
  if (event.code === "KeyF") {
    toggleFullscreen();
  }
});

resetRun("menu");
applyPanels();
updateHud();
render();
window.requestAnimationFrame(animationFrame);
