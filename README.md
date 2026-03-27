# Duckuu Birds

Duckuu Birds is a Flappy Bird-style browser game with a gravity-twist mechanic, rendered in chunky pixel art with synth-backed ambience.

## Project Details

- Design pillars: fast read of the playfield, predictable flip cadence, bright HUD for timing and scoring, and intentional retro styling without heavy shaders.
- Physics tuning: fixed-step simulation with lighter lift, moderated gravity, and auto-flip every few seconds; air control is intentionally minimal to keep runs skill-driven.
- Audio/feel: short synth stingers for flaps, flips, and scoring; ambience loops quietly in the back; all sounds are muted via HUD button or `M` key.
- Determinism: optional `?seed=` query enables reproducible obstacle/orb layouts for testing and speedrun practice.

Core idea:
- You flap forward through pipe gaps.
- Gravity flips happen automatically on a timer.
- A warning strip and HUD countdown tell you when the next inversion is coming.
- Each pipe has a rift orb inside/near the gap.
- You only get orb points when your current gravity matches the orb marker (`up` or `down`).
- The whole scene is rendered through a low-resolution pixel buffer for a retro arcade feel.

The project is intentionally simple: plain HTML/CSS/JS on a single canvas, plus Playwright tooling for repeatable gameplay verification.

## Features

- Classic tap-to-flap movement with collision-based fail states.
- Tuned, lighter-feeling fixed-step flight physics for more readable arcs.
- Automatic gravity inversion with an on-screen warning phase.
- Orb scoring twist layered on top of pipe navigation.
- Pixel-art presentation: bright HUD, chunky pipes, and a larger duck sprite.
- Procedural background soundtrack plus flap/flip/score/hit sound effects.
- Menu and game-over overlays with restart flow.
- Sound toggle via keyboard and HUD button.
- Responsive shell that fits narrow screens, plus a portrait-mode rotate hint for phones.
- Fullscreen toggle (`F`, exit with `Esc`).
- Deterministic test hooks exposed on `window`:
  - `window.render_game_to_text()`
  - `window.advanceTime(ms)`
- Seeded spawn mode for reproducible test runs via `?seed=<value>`.
- Automated browser verification with screenshots and JSON artifacts.

## Controls

- `Space` or mouse click: flap / start
- `Enter`: restart
- `M`: mute or unmute audio
- `F`: toggle fullscreen
- `Esc`: exit fullscreen

## Tech Stack

- Runtime: browser (vanilla JS)
- UI: `index.html`, `styles.css`
- Game logic: `game.js`
- Test tooling: Node.js + Playwright

## Project Structure

- `index.html`: page shell, canvas, UI overlays, HUD
- `styles.css`: visual system and responsive layout
- `game.js`: game state, physics, rendering, controls, deterministic hooks
- `tools/web_game_playwright_client.mjs`: generic action-burst browser runner
- `tools/verify_gameplay.mjs`: adaptive end-to-end verifier
- `test-actions/*.json`: predefined action payloads for scripted runs
- `output/`: generated screenshots and state/error artifacts
- `progress.md`: engineering log for ongoing iteration

## Prerequisites

- Node.js 18+ (tested on Node 24)
- npm

First-time dependency install:

```bash
npm install
```

First-time Playwright browser install:

```bash
npx playwright install chromium
```

## Running the Game

You can open `index.html` directly in a browser, or serve the folder locally.

### Option A: Open the file directly

Open `index.html` in your browser.

### Option B: Local static server

From the project directory:

```bash
python -m http.server 4173
```

Then open:
- `http://127.0.0.1:4173/index.html`

## npm Scripts

- `npm run test:play`
  - Runs the generic Playwright action runner (`tools/web_game_playwright_client.mjs`).
  - You must pass runner arguments manually if you invoke this directly.

- `npm run verify:game`
  - Runs `tools/verify_gameplay.mjs`.
  - Performs adaptive validation:
    - starts a run
    - verifies warning telegraph plus automatic gravity inversion
    - verifies mute via `M` and the HUD sound button
    - verifies a phone viewport capture
    - plays until it gets a real score
    - freezes the live frame for screenshot capture
    - forces a crash
    - verifies restart resets run state
  - Writes artifacts to `output/verification/`.

## Using the Generic Playwright Runner

`tools/web_game_playwright_client.mjs` is useful for quick scripted smoke checks.

Supported arguments:
- `--url <game-url>` (required)
- `--iterations <n>`
- `--pause-ms <ms>`
- `--headless <true|false|1|0>`
- `--screenshot-dir <path>`
- `--actions-file <json-path>`
- `--actions-json '<json-string>'`
- `--click x,y`
- `--click-selector <css-selector>`

Example:

```bash
node tools/web_game_playwright_client.mjs \
  --url file:///path/to/index.html \
  --click-selector '#start-btn' \
  --actions-file test-actions/steady-flight.json \
  --iterations 2 \
  --pause-ms 250 \
  --screenshot-dir output/web-game/manual-check
```

Runner output:
- `shot-<n>.png`: captured canvas image
- `state-<n>.json`: output from `window.render_game_to_text()`
- `errors-<n>.json`: console/page errors (if detected)

## Automated Verification Workflow

Run:

```bash
npm run verify:game
```

Artifacts generated in `output/verification/`:
- `verification.json`: summary of all checks and run metrics
- `mobile-state.png`: phone viewport page capture
- `score-state.png`: screenshot at successful scoring state
- `restart-state.png`: screenshot after restart verification

Important fields in `verification.json`:
- `ok`: overall result
- `seed`: seed that produced the successful run
- `scoreAfterSuccess`, `pipePoints`, `orbPoints`: scoring breakdown
- `flipCheck.before` / `flipCheck.after`: warning-to-auto-flip validation
- `muteCheck.afterKey` / `muteCheck.afterButton`: explicit audio toggle validation
- `mobileCheck`: phone viewport validation snapshot
- `restartState`: post-restart state validation
- `consoleErrors`: any runtime errors captured during verification

## GitHub Pages

This repo includes `.github/workflows/pages.yml` which publishes the static site to GitHub Pages on pushes to `main`/`master`. After pushing, enable Pages in the repository settings and select “GitHub Actions” as the source.

## Seeded Mode (Deterministic Runs)

`game.js` supports seeded obstacle/orb generation for reproducible tests:

```text
index.html?seed=score-a
```

Behavior:
- If `seed` is present, run-specific random generation is deterministic.
- If `seed` is absent, gameplay uses normal non-deterministic randomness.

This is used by `tools/verify_gameplay.mjs` to reduce flaky automation.

## In-Game State API (Testing Hooks)

### `window.render_game_to_text()`

Returns a concise JSON string describing current playable state, including:
- mode and score breakdown
- player position/velocity/gravity/next flip timer
- visible pipes and orb targets
- warning/next-gravity cycle state
- coordinate system note

### `window.advanceTime(ms)`

Advances simulation deterministically in fixed-step increments, then renders once.

This makes automated input/action scripts stable across machines and frame rates.

## Troubleshooting

- Playwright launch fails with missing browser:
  - Run `npx playwright install chromium`

- Empty or missing output artifacts:
  - Ensure `--url` is valid and points to the game.
  - Ensure actions are provided via `--actions-file`, `--actions-json`, or `--click`.

- Browser automation passes but visuals look wrong:
  - Inspect generated `shot-*.png` files under `output/`.
  - Compare with corresponding `state-*.json`.

- Runtime errors during verify:
  - Check `output/verification/verification.json` and `consoleErrors`.

## Development Notes

- Render/update is fixed-step based in `game.js` to avoid high refresh-rate speedups.
- Rendering happens on a 320x180 offscreen canvas scaled up to the main canvas for crisp pixels.
- HUD values are refreshed every render for accurate gravity and next-flip display.
- `window.__riftFlyerPauseForCapture` is used only by the verifier to freeze live frames before screenshot capture.
- Current verification is focused on end-to-end gameplay correctness, not lint/type pipelines.

## License

No license file is currently defined in this repository.
