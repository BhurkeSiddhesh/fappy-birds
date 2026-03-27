import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "output", "playtest-40s");
const GAME_URL_BASE = "file:///C:/Users/siddh/Desktop/Projects%20-%20Codex/fappy%20birds/index.html";
const TARGET_SECONDS = 40;
const TARGET_FRAMES = TARGET_SECONDS * 60;
const SEARCH_SEEDS = Array.from({ length: 40 }, (_, index) => `survive-${index + 1}`);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function advance(page, frames = 1) {
  for (let i = 0; i < frames; i += 1) {
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
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

function chooseTarget(state) {
  const playerX = state.player.x;
  const nextPipe = state.pipes.find((pipe) => pipe.x + pipe.width >= playerX - 14);
  if (!nextPipe) {
    return { y: 270, pipe: null };
  }

  let targetY = nextPipe.gapY;

  if (state.gravityCycle.warningActive) {
    targetY += state.gravityCycle.nextGravity === "up" ? -32 : 32;
  }

  return { y: targetY, pipe: nextPipe };
}

async function controlStep(page, state) {
  const { y: targetY, pipe } = chooseTarget(state);
  const player = state.player;
  const gravityDown = player.gravity === "down";
  const gapDistance = pipe ? pipe.x - player.x : 999;
  const inFlipWarning = state.gravityCycle.warningActive;
  const margin = inFlipWarning ? 14 : pipe ? 20 : 28;

  if (gravityDown) {
    const shouldFlap =
      player.y > targetY + margin ||
      (player.vy > 5.2 && player.y > targetY - 2) ||
      (gapDistance < 90 && player.y > targetY - 10) ||
      (inFlipWarning && player.y > targetY - 4);
    if (shouldFlap) {
      await tapKey(page, "Space");
      return;
    }
  } else {
    const shouldFlap =
      player.y < targetY - margin ||
      (player.vy < -5.2 && player.y < targetY + 2) ||
      (gapDistance < 90 && player.y < targetY + 10) ||
      (inFlipWarning && player.y < targetY + 4);
    if (shouldFlap) {
      await tapKey(page, "Space");
      return;
    }
  }

  await advance(page, 1);
}

async function runSeed(page, seed) {
  await page.goto(`${GAME_URL_BASE}?seed=${encodeURIComponent(seed)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.click("#start-btn");
  await advance(page, 4);

  let frames = 0;
  let lastState = await readState(page);

  while (frames < TARGET_FRAMES) {
    if (lastState.mode !== "playing") {
      return { ok: false, seed, frames, state: lastState };
    }
    await controlStep(page, lastState);
    frames += 1;
    lastState = await readState(page);
  }

  return { ok: lastState.mode === "playing", seed, frames, state: lastState };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const attempts = [];
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
  for (const seed of SEARCH_SEEDS) {
    const result = await runSeed(page, seed);
    attempts.push({
      ok: result.ok,
      seed: result.seed,
      frames: result.frames,
      score: result.state.score,
      mode: result.state.mode,
      gravity: result.state.player.gravity,
      nextFlipMs: result.state.gravityCycle.msUntilFlip,
    });
    if (result.ok) {
      success = result;
      break;
    }
  }

  const summary = {
    ok: Boolean(success) && consoleErrors.length === 0,
    targetSeconds: TARGET_SECONDS,
    targetFrames: TARGET_FRAMES,
    success: success
      ? {
          seed: success.seed,
          frames: success.frames,
          score: success.state.score,
          pipePoints: success.state.pipePoints,
          orbPoints: success.state.orbPoints,
          gravity: success.state.player.gravity,
          nextFlipMs: success.state.gravityCycle.msUntilFlip,
        }
      : null,
    attempts,
    consoleErrors,
  };

  if (success) {
    await page.locator("canvas").screenshot({ path: path.join(OUTPUT_DIR, "survived-40s.png") });
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, "result.json"), JSON.stringify(summary, null, 2));
  await browser.close();

  if (!success) {
    throw new Error("No 40-second survival run found in the seeded playtest search.");
  }
  if (consoleErrors.length) {
    throw new Error("Console errors were recorded during the 40-second playtest.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
