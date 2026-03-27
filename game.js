(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const urlParams = new URLSearchParams(window.location.search);
  const requestedSeed = urlParams.get("seed");

  const menuPanel = document.getElementById("menu-panel");
  const gameOverPanel = document.getElementById("gameover-panel");
  const startBtn = document.getElementById("start-btn");
  const restartBtn = document.getElementById("restart-btn");
  const scoreValue = document.getElementById("score-value");
  const bestValue = document.getElementById("best-value");
  const gravityValue = document.getElementById("gravity-value");
  const cooldownValue = document.getElementById("cooldown-value");
  const gameOverTitle = document.getElementById("gameover-title");
  const gameOverSummary = document.getElementById("gameover-summary");

  const world = {
    width: canvas.width,
    height: canvas.height,
    floorGlow: canvas.height * 0.74,
    horizon: canvas.height * 0.5,
  };

  const config = {
    stepMs: 1000 / 60,
    gravity: 0.45,
    flapImpulse: 8.2,
    forwardSpeed: 3.25,
    maxFall: 10.5,
    pipeWidth: 118,
    pipeSpacing: 306,
    pipeGap: 178,
    minGapY: 132,
    maxGapY: 408,
    playerX: 220,
    playerRadius: 17,
    flipCooldownMs: 900,
    introBobSpeed: 0.003,
  };

  const input = {
    flapQueued: false,
    flipQueued: false,
  };

  const state = {
    mode: "menu",
    bestScore: 0,
    totalScore: 0,
    pipePoints: 0,
    orbPoints: 0,
    distance: 0,
    manualControl: false,
    elapsedMs: 0,
    cloudPhase: 0,
    spawnTimer: 0,
    pulseTimer: 0,
    flashTimer: 0,
    shake: 0,
    deathReason: "",
    seed: requestedSeed,
    rng: Math.random,
    player: null,
    pipes: [],
    particles: [],
  };

  function hashSeed(input) {
    let value = 1779033703 ^ input.length;
    for (let i = 0; i < input.length; i++) {
      value = Math.imul(value ^ input.charCodeAt(i), 3432918353);
      value = (value << 13) | (value >>> 19);
    }
    return (value >>> 0) || 1;
  }

  function createSeededRandom(seedText) {
    let seed = hashSeed(seedText);
    return function nextRandom() {
      seed += 0x6d2b79f5;
      let value = seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createPlayer() {
    return {
      x: config.playerX,
      y: world.height * 0.48,
      vy: 0,
      radius: config.playerRadius,
      gravityDirection: 1,
      flipCooldown: 0,
      rotation: 0,
      trailPhase: 0,
    };
  }

  function resetRun() {
    state.mode = "playing";
    state.totalScore = 0;
    state.pipePoints = 0;
    state.orbPoints = 0;
    state.distance = 0;
    state.elapsedMs = 0;
    state.spawnTimer = 90;
    state.pulseTimer = 0;
    state.flashTimer = 0;
    state.shake = 0;
    state.deathReason = "";
    state.rng = state.seed ? createSeededRandom(state.seed) : Math.random;
    state.player = createPlayer();
    state.pipes = [];
    state.particles = [];
    input.flapQueued = false;
    input.flipQueued = false;
    menuPanel.classList.add("hidden");
    gameOverPanel.classList.add("hidden");
    updateHud();
  }

  function returnToMenu() {
    state.mode = "menu";
    state.player = createPlayer();
    state.pipes = [];
    state.particles = [];
    state.elapsedMs = 0;
    state.flashTimer = 0;
    state.shake = 0;
    menuPanel.classList.remove("hidden");
    gameOverPanel.classList.add("hidden");
    updateHud();
  }

  function updateHud() {
    scoreValue.textContent = String(state.totalScore);
    bestValue.textContent = String(state.bestScore);
    gravityValue.textContent =
      state.player && state.player.gravityDirection < 0 ? "Up" : "Down";

    if (!state.player) {
      cooldownValue.textContent = "Ready";
      return;
    }

    if (state.player.flipCooldown <= 0) {
      cooldownValue.textContent = "Ready";
    } else {
      cooldownValue.textContent = `${(state.player.flipCooldown / 1000).toFixed(1)}s`;
    }
  }

  function spawnPipe() {
    const difficulty = Math.min(42, state.pipePoints * 2.8);
    const gapSize = Math.max(136, config.pipeGap - difficulty);
    const gapY =
      config.minGapY + state.rng() * (config.maxGapY - config.minGapY);
    const preferredGravity = state.rng() > 0.5 ? 1 : -1;
    const orbY = gapY + preferredGravity * gapSize * 0.18;

    state.pipes.push({
      x: world.width + config.pipeWidth + 20,
      width: config.pipeWidth,
      gapY,
      gapSize,
      passed: false,
      orb: {
        xOffset: config.pipeWidth * 0.68,
        y: orbY,
        radius: 14,
        preferredGravity,
        claimed: false,
      },
    });
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 3.6;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 28 + Math.random() * 22,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }

  function queueFlap() {
    input.flapQueued = true;
    if (state.mode === "menu") {
      resetRun();
    } else if (state.mode === "gameover") {
      resetRun();
    }
  }

  function queueFlip() {
    if (state.mode === "menu" || state.mode === "gameover") {
      return;
    }
    input.flipQueued = true;
  }

  function endRun(reason) {
    state.mode = "gameover";
    state.deathReason = reason;
    state.bestScore = Math.max(state.bestScore, state.totalScore);
    updateHud();
    gameOverTitle.textContent = reason;
    gameOverSummary.textContent =
      `You banked ${state.pipePoints} pipe points and ${state.orbPoints} rift bonuses.` +
      " Press Enter or use the button to run it back.";
    gameOverPanel.classList.remove("hidden");
  }

  function flapPlayer() {
    if (state.mode !== "playing") {
      return;
    }
    const player = state.player;
    player.vy = -player.gravityDirection * config.flapImpulse;
    player.rotation = -0.36 * player.gravityDirection;
    burst(player.x - 10, player.y + player.gravityDirection * 8, "rgba(255, 218, 149, 0.9)", 8);
  }

  function flipGravity() {
    const player = state.player;
    if (state.mode !== "playing" || player.flipCooldown > 0) {
      return;
    }
    player.gravityDirection *= -1;
    player.flipCooldown = config.flipCooldownMs;
    player.vy *= 0.35;
    state.pulseTimer = 220;
    burst(player.x, player.y, player.gravityDirection < 0 ? "rgba(130, 233, 255, 0.9)" : "rgba(255, 184, 97, 0.9)", 18);
    updateHud();
  }

  function updateParticles() {
    for (const particle of state.particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.04;
      particle.life -= 1;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
  }

  function intersectsCircleRect(circle, rect) {
    const nearestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
    const nearestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
    const dx = circle.x - nearestX;
    const dy = circle.y - nearestY;
    return dx * dx + dy * dy <= circle.r * circle.r;
  }

  function updatePlaying() {
    const player = state.player;

    if (input.flapQueued) {
      flapPlayer();
    }
    if (input.flipQueued) {
      flipGravity();
    }
    input.flapQueued = false;
    input.flipQueued = false;

    player.flipCooldown = Math.max(0, player.flipCooldown - config.stepMs);
    player.trailPhase += config.stepMs * 0.008;
    player.vy += config.gravity * player.gravityDirection;
    player.vy = Math.max(-config.maxFall, Math.min(config.maxFall, player.vy));
    player.y += player.vy;
    player.rotation += ((player.vy / 10) - player.rotation) * 0.12;

    state.distance += config.forwardSpeed;
    state.elapsedMs += config.stepMs;
    state.cloudPhase += config.forwardSpeed * 0.18;
    state.spawnTimer -= config.forwardSpeed;
    if (state.spawnTimer <= 0) {
      spawnPipe();
      state.spawnTimer += config.pipeSpacing;
    }

    for (const pipe of state.pipes) {
      pipe.x -= config.forwardSpeed;
      const orbX = pipe.x + pipe.orb.xOffset;
      if (
        !pipe.orb.claimed &&
        Math.hypot(player.x - orbX, player.y - pipe.orb.y) <
          player.radius + pipe.orb.radius + 2
      ) {
        pipe.orb.claimed = true;
        if (player.gravityDirection === pipe.orb.preferredGravity) {
          state.orbPoints += 1;
          state.totalScore += 1;
          state.flashTimer = 180;
          burst(orbX, pipe.orb.y, "rgba(255, 236, 165, 0.95)", 20);
          updateHud();
        } else {
          burst(orbX, pipe.orb.y, "rgba(255, 255, 255, 0.55)", 10);
        }
      }

      if (!pipe.passed && pipe.x + pipe.width < player.x) {
        pipe.passed = true;
        state.pipePoints += 1;
        state.totalScore += 1;
        state.bestScore = Math.max(state.bestScore, state.totalScore);
        updateHud();
      }

      const topRect = {
        x: pipe.x,
        y: 0,
        w: pipe.width,
        h: pipe.gapY - pipe.gapSize / 2,
      };
      const bottomRect = {
        x: pipe.x,
        y: pipe.gapY + pipe.gapSize / 2,
        w: pipe.width,
        h: world.height - (pipe.gapY + pipe.gapSize / 2),
      };
      const circle = { x: player.x, y: player.y, r: player.radius };
      if (intersectsCircleRect(circle, topRect) || intersectsCircleRect(circle, bottomRect)) {
        state.shake = 14;
        burst(player.x, player.y, "rgba(255, 120, 99, 0.9)", 26);
        endRun("Pipe Collision");
      }
    }

    state.pipes = state.pipes.filter((pipe) => pipe.x + pipe.width > -30);

    if (player.y - player.radius <= 0) {
      player.y = player.radius;
      state.shake = 10;
      burst(player.x, player.y, "rgba(133, 228, 255, 0.9)", 18);
      endRun("Ceiling Impact");
    } else if (player.y + player.radius >= world.height) {
      player.y = world.height - player.radius;
      state.shake = 10;
      burst(player.x, player.y, "rgba(255, 181, 112, 0.9)", 18);
      endRun("Sea Impact");
    }
  }

  function updateMenuIdle() {
    state.elapsedMs += config.stepMs;
    state.cloudPhase += 0.28;
    state.player.y = world.height * 0.48 + Math.sin(state.elapsedMs * config.introBobSpeed) * 20;
    state.player.rotation = Math.sin(state.elapsedMs * config.introBobSpeed * 1.7) * 0.08;
  }

  function updateGameOverIdle() {
    state.elapsedMs += config.stepMs;
    state.cloudPhase += 0.18;
    state.player.rotation *= 0.98;
  }

  function tick() {
    if (!state.player) {
      state.player = createPlayer();
    }

    updateParticles();

    if (state.flashTimer > 0) {
      state.flashTimer = Math.max(0, state.flashTimer - config.stepMs);
    }
    if (state.pulseTimer > 0) {
      state.pulseTimer = Math.max(0, state.pulseTimer - config.stepMs);
    }
    if (state.shake > 0) {
      state.shake = Math.max(0, state.shake - 0.9);
    }

    if (state.mode === "playing") {
      updatePlaying();
    } else if (state.mode === "menu") {
      updateMenuIdle();
    } else {
      updateGameOverIdle();
      input.flapQueued = false;
      input.flipQueued = false;
    }
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, world.height);
    sky.addColorStop(0, "#17354a");
    sky.addColorStop(0.45, "#2c617f");
    sky.addColorStop(0.5, "#23516d");
    sky.addColorStop(0.5, "#163e4c");
    sky.addColorStop(1, "#0a1f2b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, world.width, world.height);

    const sunX = world.width * 0.74;
    const sunY = 96;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 130);
    sunGlow.addColorStop(0, "rgba(255, 235, 165, 0.85)");
    sunGlow.addColorStop(0.5, "rgba(255, 171, 75, 0.28)");
    sunGlow.addColorStop(1, "rgba(255, 171, 75, 0)");
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, world.width, world.height * 0.55);

    const moonX = world.width * 0.22;
    const moonY = world.height - 88;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 120);
    moonGlow.addColorStop(0, "rgba(142, 240, 255, 0.9)");
    moonGlow.addColorStop(0.45, "rgba(55, 190, 212, 0.28)");
    moonGlow.addColorStop(1, "rgba(55, 190, 212, 0)");
    ctx.fillStyle = moonGlow;
    ctx.fillRect(0, world.height * 0.48, world.width, world.height * 0.52);

    for (let i = 0; i < 5; i++) {
      const baseX = ((i * 260 - state.cloudPhase * (0.9 + i * 0.05)) % 1240) - 120;
      const y = 82 + (i % 2) * 42;
      ctx.fillStyle = "rgba(255, 248, 232, 0.14)";
      ctx.beginPath();
      ctx.ellipse(baseX, y, 52, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(baseX + 42, y + 2, 46, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(baseX - 44, y + 3, 36, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(8, 21, 34, 0.55)";
    ctx.beginPath();
    ctx.moveTo(0, world.horizon + 20);
    ctx.lineTo(90, world.horizon - 10);
    ctx.lineTo(170, world.horizon + 24);
    ctx.lineTo(260, world.horizon - 6);
    ctx.lineTo(360, world.horizon + 28);
    ctx.lineTo(470, world.horizon - 18);
    ctx.lineTo(570, world.horizon + 24);
    ctx.lineTo(690, world.horizon - 4);
    ctx.lineTo(800, world.horizon + 28);
    ctx.lineTo(960, world.horizon - 12);
    ctx.lineTo(960, world.height);
    ctx.lineTo(0, world.height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(18, 71, 88, 0.42)";
    for (let i = 0; i < 24; i++) {
      const x = ((i * 90 + state.cloudPhase * 2.2) % 1180) - 120;
      const y = world.height * 0.68 + Math.sin((i + state.cloudPhase) * 0.3) * 8;
      ctx.fillRect(x, y, 42, 2);
    }

    if (state.pulseTimer > 0 && state.player) {
      const alpha = state.pulseTimer / 220;
      ctx.strokeStyle =
        state.player.gravityDirection < 0
          ? `rgba(117, 233, 255, ${alpha * 0.5})`
          : `rgba(255, 186, 108, ${alpha * 0.5})`;
      ctx.lineWidth = 12 * alpha;
      ctx.beginPath();
      ctx.arc(state.player.x, state.player.y, 40 + (1 - alpha) * 110, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (state.flashTimer > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(state.flashTimer / 180) * 0.12})`;
      ctx.fillRect(0, 0, world.width, world.height);
    }
  }

  function drawPipe(pipe) {
    const topHeight = pipe.gapY - pipe.gapSize / 2;
    const bottomY = pipe.gapY + pipe.gapSize / 2;
    const bottomHeight = world.height - bottomY;
    const ribColor = "rgba(255, 226, 183, 0.18)";

    function drawColumn(x, y, h) {
      const body = ctx.createLinearGradient(x, y, x + pipe.width, y);
      body.addColorStop(0, "#20384a");
      body.addColorStop(0.45, "#2e5a72");
      body.addColorStop(0.55, "#44738d");
      body.addColorStop(1, "#1a2e3d");
      ctx.fillStyle = body;
      ctx.fillRect(x, y, pipe.width, h);

      ctx.fillStyle = "rgba(255, 194, 126, 0.24)";
      ctx.fillRect(x - 6, y, 8, h);
      ctx.fillRect(x + pipe.width - 2, y, 8, h);

      ctx.fillStyle = ribColor;
      for (let rib = 20; rib < h; rib += 28) {
        ctx.fillRect(x + 14, y + rib, pipe.width - 28, 4);
      }
    }

    drawColumn(pipe.x, 0, topHeight);
    drawColumn(pipe.x, bottomY, bottomHeight);

    ctx.fillStyle = "#395d74";
    ctx.fillRect(pipe.x - 10, topHeight - 22, pipe.width + 20, 22);
    ctx.fillRect(pipe.x - 10, bottomY, pipe.width + 20, 22);

    const orbX = pipe.x + pipe.orb.xOffset;
    if (!pipe.orb.claimed) {
      const orbGlow = ctx.createRadialGradient(orbX, pipe.orb.y, 4, orbX, pipe.orb.y, 26);
      if (pipe.orb.preferredGravity < 0) {
        orbGlow.addColorStop(0, "rgba(155, 245, 255, 0.95)");
        orbGlow.addColorStop(0.45, "rgba(85, 214, 235, 0.4)");
      } else {
        orbGlow.addColorStop(0, "rgba(255, 232, 165, 0.95)");
        orbGlow.addColorStop(0.45, "rgba(255, 184, 84, 0.38)");
      }
      orbGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = orbGlow;
      ctx.beginPath();
      ctx.arc(orbX, pipe.orb.y, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = pipe.orb.preferredGravity < 0 ? "#90f2ff" : "#ffe39a";
      ctx.beginPath();
      ctx.arc(orbX, pipe.orb.y, pipe.orb.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(12, 22, 30, 0.45)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(orbX, pipe.orb.y, pipe.orb.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(12, 22, 30, 0.72)";
      ctx.beginPath();
      if (pipe.orb.preferredGravity < 0) {
        ctx.moveTo(orbX, pipe.orb.y - 7);
        ctx.lineTo(orbX - 7, pipe.orb.y + 5);
        ctx.lineTo(orbX + 7, pipe.orb.y + 5);
      } else {
        ctx.moveTo(orbX, pipe.orb.y + 7);
        ctx.lineTo(orbX - 7, pipe.orb.y - 5);
        ctx.lineTo(orbX + 7, pipe.orb.y - 5);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPlayer() {
    const player = state.player;
    const gravityTint = player.gravityDirection < 0 ? "#8df0ff" : "#ffbf6a";
    const shadowAlpha = state.mode === "gameover" ? 0.2 : 0.35;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.rotation);

    ctx.fillStyle = `rgba(8, 17, 26, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 24, player.radius * 1.1, player.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(-20, -12, 18, 20);
    body.addColorStop(0, gravityTint);
    body.addColorStop(1, "#fff5d8");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, player.radius * 1.1, player.radius * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#20303e";
    ctx.beginPath();
    ctx.ellipse(-4, 3, player.radius * 0.76, player.radius * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff6e2";
    ctx.beginPath();
    ctx.arc(6, -5, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#141c24";
    ctx.beginPath();
    ctx.arc(7, -5, 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f07f4a";
    ctx.beginPath();
    ctx.moveTo(14, 1);
    ctx.lineTo(28, 6);
    ctx.lineTo(14, 12);
    ctx.closePath();
    ctx.fill();

    const wingLift = Math.sin(player.trailPhase) * 5;
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.ellipse(-5, 3 + wingLift * 0.2, 10, 6, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-16, -3);
    ctx.lineTo(-24, -10 - wingLift * 0.25);
    ctx.moveTo(-18, 7);
    ctx.lineTo(-28, 12 + wingLift * 0.2);
    ctx.stroke();

    ctx.restore();
  }

  function drawParticles() {
    for (const particle of state.particles) {
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (particle.life / 50), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCenterText() {
    if (state.mode === "playing") {
      return;
    }

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(249, 241, 222, 0.9)";
    if (state.mode === "menu") {
      ctx.font = "700 18px 'Trebuchet MS', sans-serif";
      ctx.fillText("Click launch or tap Space to begin", world.width / 2, world.height - 42);
    } else {
      ctx.font = "700 18px 'Trebuchet MS', sans-serif";
      ctx.fillText("Press Enter to restart", world.width / 2, world.height - 42);
    }
    ctx.restore();
  }

  function render() {
    updateHud();
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.save();
    ctx.clearRect(0, 0, world.width, world.height);
    ctx.translate(shakeX, shakeY);
    drawBackground();
    for (const pipe of state.pipes) {
      drawPipe(pipe);
    }
    drawParticles();
    drawPlayer();
    drawCenterText();
    ctx.restore();
  }

  let lastFrameTime = performance.now();
  let frameAccumulator = 0;
  function frame(now) {
    if (!state.manualControl) {
      const delta = Math.min(32, now - lastFrameTime);
      frameAccumulator += delta;
      while (frameAccumulator >= config.stepMs) {
        tick();
        frameAccumulator -= config.stepMs;
      }
    } else {
      frameAccumulator = 0;
    }
    lastFrameTime = now;
    render();
    requestAnimationFrame(frame);
  }

  function handlePrimaryAction(event) {
    if (event.target === startBtn || event.target === restartBtn) {
      return;
    }
    queueFlap();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const host = document.documentElement;
      if (host.requestFullscreen) {
        host.requestFullscreen().catch(() => {});
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
      event.preventDefault();
      queueFlap();
    } else if (event.code === "KeyA") {
      event.preventDefault();
      queueFlip();
    } else if (event.code === "Enter") {
      event.preventDefault();
      if (state.mode === "playing") {
        queueFlap();
      } else {
        resetRun();
      }
    } else if (event.code === "KeyF") {
      event.preventDefault();
      toggleFullscreen();
    }
  });

  canvas.addEventListener("pointerdown", handlePrimaryAction);
  startBtn.addEventListener("click", resetRun);
  restartBtn.addEventListener("click", resetRun);
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("fullscreenchange", resizeCanvas);

  window.render_game_to_text = function renderGameToText() {
    const player = state.player || createPlayer();
    const visiblePipes = state.pipes
      .filter((pipe) => pipe.x + pipe.width >= 0 && pipe.x <= world.width)
      .slice(0, 4)
      .map((pipe) => ({
        x: Number(pipe.x.toFixed(1)),
        width: pipe.width,
        gapY: Number(pipe.gapY.toFixed(1)),
        gapSize: Number(pipe.gapSize.toFixed(1)),
        orb: pipe.orb.claimed
          ? null
          : {
              x: Number((pipe.x + pipe.orb.xOffset).toFixed(1)),
              y: Number(pipe.orb.y.toFixed(1)),
              preferredGravity: pipe.orb.preferredGravity < 0 ? "up" : "down",
            },
      }));

    return JSON.stringify({
      coordinateSystem: "origin at top-left, +x right, +y down",
      mode: state.mode,
      score: state.totalScore,
      pipePoints: state.pipePoints,
      orbPoints: state.orbPoints,
      seed: state.seed,
      player: {
        x: Number(player.x.toFixed(1)),
        y: Number(player.y.toFixed(1)),
        vy: Number(player.vy.toFixed(2)),
        r: player.radius,
        gravity: player.gravityDirection < 0 ? "up" : "down",
        flipCooldownMs: Number(player.flipCooldown.toFixed(0)),
      },
      pipes: visiblePipes,
    });
  };

  window.advanceTime = function advanceTime(ms) {
    state.manualControl = true;
    const steps = Math.max(1, Math.round(ms / config.stepMs));
    for (let i = 0; i < steps; i++) {
      tick();
    }
    render();
    return Promise.resolve();
  };

  state.player = createPlayer();
  updateHud();
  resizeCanvas();
  render();
  requestAnimationFrame(frame);
})();
