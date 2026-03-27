Original prompt: lets build a flappy birds kind of game with a twist

- Chosen direction: build a browser game called `Rift Flyer`.
- Twist: the player can flip gravity with `A`, and each pipe includes a bonus rift orb that only scores if the current gravity matches its marker.
- First pass includes start/game-over overlays, fullscreen toggle, `render_game_to_text`, and deterministic `advanceTime(ms)` for automated testing.
- Installed local `playwright` dev dependency so the browser client can run inside this workspace.
- Added a local copy of the Playwright game client because the shared skill script cannot resolve project-local dependencies from outside the repo.
- Fixed the real-time loop to use a proper accumulator instead of ticking once per RAF no matter the frame time.
- HUD values now refresh every render, so gravity state and the flip cooldown stay truthful while playing.
- Added seeded spawning via `?seed=...` so repeatable browser verification is possible without changing normal unseeded play.
- Added `tools/verify_gameplay.mjs` and `npm run verify:game`.
- Verified automatically: start flow, gravity flip on `A` with cooldown, adaptive play to a real score, forced crash to game-over, Enter restart to a fresh run, screenshot capture, and `render_game_to_text` state output.
- Latest verification artifact: `output/verification/verification.json`.
- Latest automated runs produced no console or page errors.
