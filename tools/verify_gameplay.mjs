import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "output", "verification");
const GAME_URL_BASE = "file:///C:/Users/siddh/Desktop/Projects%20-%20Codex/fappy%20birds/index.html";
const SEARCH_SEEDS = [
  "score-a",
  "score-b",
  "score-c",
  "score-d",
  "score-e",
  "score-f",
  "score-g",
  "score-h",
];

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function advance(page, frames = 1) {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(async () => {
      await window.advanceTime(1000 / 60);
    });
  }
}

async function tapKey(page, key) {
  await page.keyboard.down(key);
  await advance(page, 1);
  await page.keyboard.up(key);
}

async function readState(page) {
  const raw = await page.evaluate(() => window.render_game_to_text());
  return JSON.parse(raw);
}

function chooseTarget(state) {
  const playerX = state.player.x;
  const nextPipe = state.pipes.find((pipe) => pipe.x + pipe.width >= playerX - 10);
  if (!nextPipe) {
    return { y: 270, pipe: null };
  }
  const targetY = nextPipe.orb ? nextPipe.orb.y : nextPipe.gapY;
  return { y: targetY, pipe: nextPipe };
}

async function controlStep(page, state) {
  const { y: targetY, pipe } = chooseTarget(state);
  const player = state.player;
  const gravityDown = player.gravity === "down";
  const gapDistance = pipe ? pipe.x - player.x : 999;

  if (pipe && player.flipCooldownMs <= 0) {
    if (pipe.orb && gapDistance < 260 && gapDistance > 80) {
      const desiredGravity = pipe.orb.preferredGravity;
      const playerNearTarget = Math.abs(player.y - targetY) < 120;
      if (playerNearTarget && desiredGravity !== player.gravity) {
        await tapKey(page, "KeyA");
        return;
      }
    } else if (targetY < 150 && gravityDown && gapDistance < 220 && gapDistance > 80) {
      await tapKey(page, "KeyA");
      return;
    } else if (targetY > 390 && !gravityDown && gapDistance < 220 && gapDistance > 80) {
      await tapKey(page, "KeyA");
      return;
    }
  }

  const margin = pipe ? 24 : 30;
  if (gravityDown) {
    const shouldFlap =
      player.y > targetY + margin ||
      (player.vy > 5.8 && player.y > targetY - 4) ||
      (gapDistance < 110 && player.y > targetY - 12);
    if (shouldFlap) {
      await tapKey(page, "Space");
      return;
    }
  } else {
    const shouldFlap =
      player.y < targetY - margin ||
      (player.vy < -5.8 && player.y < targetY + 4) ||
      (gapDistance < 110 && player.y < targetY + 12);
    if (shouldFlap) {
      await tapKey(page, "Space");
      return;
    }
  }

  await advance(page, 1);
}

async function capture(page, fileName) {
  const canvas = page.locator("canvas");
  await canvas.screenshot({ path: path.join(OUTPUT_DIR, fileName) });
}

async function runSeed(page, seed) {
  await page.goto(`${GAME_URL_BASE}?seed=${encodeURIComponent(seed)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.click("#start-btn");
  await advance(page, 4);

  let frames = 0;
  let bestScore = 0;
  let sawGravityFlip = false;
  let lastGravity = "down";

  while (frames < 2200) {
    const state = await readState(page);
    bestScore = Math.max(bestScore, state.score);
    if (state.player.gravity !== lastGravity) {
      sawGravityFlip = true;
      lastGravity = state.player.gravity;
    }
    if (state.score >= 1) {
      return { ok: true, seed, frames, bestScore, sawGravityFlip, state };
    }
    if (state.mode !== "playing") {
      return { ok: false, seed, frames, bestScore, sawGravityFlip, state };
    }
    await controlStep(page, state);
    frames += 1;
  }

  return {
    ok: false,
    seed,
    frames,
    bestScore,
    sawGravityFlip,
    state: await readState(page),
  };
}

async function verifyGravityFlip(page, seed) {
  await page.goto(`${GAME_URL_BASE}?seed=${encodeURIComponent(seed)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.click("#start-btn");
  await advance(page, 4);

  const before = await readState(page);
  await tapKey(page, "KeyA");
  await advance(page, 2);
  const after = await readState(page);

  if (before.player.gravity !== "down") {
    throw new Error("Expected a fresh run to begin with downward gravity.");
  }
  if (after.player.gravity !== "up" || after.player.flipCooldownMs <= 0) {
    throw new Error("Expected gravity flip to invert direction and start cooldown.");
  }

  return { before, after };
}

async function forceCrashAndRestart(page) {
  let state = await readState(page);
  let frames = 0;
  while (state.mode === "playing" && frames < 500) {
    await advance(page, 1);
    state = await readState(page);
    frames += 1;
  }
  if (state.mode !== "gameover") {
    throw new Error("Expected a crash after releasing control.");
  }

  await tapKey(page, "Enter");
  await advance(page, 3);
  state = await readState(page);
  if (state.mode !== "playing" || state.score !== 0) {
    throw new Error("Expected restart to resume a fresh playing run.");
  }
  return state;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage();
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({ type: "console.error", text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push({ type: "pageerror", text: String(error) });
  });

  let success = null;
  const attempts = [];
  const flipCheck = await verifyGravityFlip(page, SEARCH_SEEDS[0]);

  for (const seed of SEARCH_SEEDS) {
    const result = await runSeed(page, seed);
    attempts.push(result);
    if (result.ok) {
      success = result;
      break;
    }
  }

  if (!success) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "verification.json"),
      JSON.stringify({ ok: false, attempts, consoleErrors }, null, 2),
    );
    throw new Error("Failed to score a point with the adaptive verifier.");
  }

  await capture(page, "score-state.png");
  const restartState = await forceCrashAndRestart(page);
  await capture(page, "restart-state.png");

  const summary = {
    ok: true,
    seed: success.seed,
    framesToScore: success.frames,
    scoreAfterSuccess: success.state.score,
    pipePoints: success.state.pipePoints,
    orbPoints: success.state.orbPoints,
    sawGravityFlip: success.sawGravityFlip,
    flipCheck,
    restartState,
    attempts,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "verification.json"),
    JSON.stringify(summary, null, 2),
  );

  await browser.close();
  if (consoleErrors.length) {
    throw new Error("Console errors were recorded during verification.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
