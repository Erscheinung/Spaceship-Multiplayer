# NEON WING — objective and resume log

## Objective
Deliver a complete locally testable, Vercel-deployable SvelteKit + pure Three.js two-player synthwave survival game. Use PeerJS/WebRTC, four-character rooms, host-authoritative combat, synced Escape pause, procedural assets, bloom, upgrades, and scaling difficulty.

## Architecture decisions
- Vercel serves the app; PeerJS cloud brokers WebRTC. No persistent application WebSocket server.
- Host runs a fixed 60 Hz simulation; guest streams normalized movement at 30 Hz and receives snapshots at 20 Hz.
- Each pilot owns a pause flag; host publishes canonical pause state. Network heartbeat runs while rendering is stopped.
- All assets are procedural. Solo practice supports offline gameplay testing.
- Keep game simulation independent of Three.js for deterministic unit tests.

## Progress
- [x] Inspect empty repository and create scaffold.
- [x] Implement simulation, procedural scene, engine, networking and UI.
- [x] Install dependencies and pass checks, tests and production build.
- [x] Browser smoke test and document limitations.
- [x] README with local setup, Vercel CLI deployment, protocol and TURN configuration.
- [x] Prepare completed repository for git checkpoint (commit identified in session handoff).

## Verification — September 6, 2026
- `npm run check`: zero errors and warnings.
- `npm test`: seven passing simulation tests, including bounded three-minute simulation.
- `npm run test:e2e`: three passing Chromium tests in 57.9 seconds. Real PeerJS host/guest over a test-only local signaling broker: room creation/join, snapshots, pause initiated by either pilot, both flags held independently, resume, host disconnect. Desktop solo and mobile checks pass; no WebGL/shader errors.
- Desktop/mobile screenshots in git-ignored `test-results/` visually reviewed. Inactive solo ship blink bug fixed; neon bloom and sun framing adjusted.
- `npm run build`: success, Vercel Node 22 output generated. Approximately 521.5 kB engine chunk (131.6 kB gzip); expected Vite size advisory remains.
- `npm audit`: six transitive advisories (three low through SvelteKit/cookie, three moderate through the test-only PeerServer/Express/qs). Normal `npm audit fix` did not resolve them. No forced framework downgrade applied. Track upstream dependency updates; app has no custom cookie handling, and test broker binds only loopback.

## Remaining deployment validation / optional follow-up
- No production deployment was requested or performed; run README Vercel CLI commands when ready.
- Public-internet NAT traversal, TURN relay and Firefox/Safari/device GPU checks have not been exercised.
- No connected in-app browser was available. Repository-owned headless Chromium tests provided visual and functional verification.
- No host migration or mid-run reconnect by design; disconnect ends the session.
- Future improvements: pooled projectile meshes, adaptive bloom quality, optional audio, short-lived TURN credential service.

## Session continuity
The assistant cannot inspect the user's five-hour usage quota. Update this log at milestones and commit verified work before handing off. Preserve user changes. If interrupted, inspect `git status`, this file and README; run `npm run check`, `npm test`, `npm run build` and continue unchecked work. No deployment is required by the initial request; repository must be deployable with the Vercel CLI.

## Illustrated city branch — September 6, 2026
- User requested a separate branch, a more immersive centered flight view, meaningful navigation through buildings, better phone framing, and a visual direction closer to https://messenger.abeto.co; explicitly requested commit and push, with no Blender.
- Branch: `feat/illustrated-city-flight`. Replaced neon wireframe scenery with original procedural outlined pastel architecture, trees, street lamps, overhead infrastructure, projected ground shadows, detailed delta ships and restrained bloom/FXAA.
- Low chase camera follows the local pilot through a deterministic winding road. Portrait uses a wider field of view instead of moving the camera away. Camera resets on launch; flight HUD is compact and has no dark scene overlay. Touch steering is also available on larger coarse-pointer screens.
- `course.js` defines shared route geometry and road towers. Host snapshots include towers; collisions damage and push pilots clear even during damage immunity, and towers absorb bullets. This remains a forward flight corridor, not free-roaming or six-axis flight.
- Protocol is now `neon-wing-city-v2` so old arena builds cannot silently join incompatible runs.
- Menu rendering is capped at 24 fps. Expensive multisampling caused software-rendered multi-tab startup stalls; FXAA and the menu frame cap resolved the traced startup issue.
- Verification: zero Svelte errors/warnings; ten simulation tests pass; all four Chromium tests pass in 53.0 seconds, covering solo/pause, two real peers with pause ownership/disconnect, mobile HUD/touch input and desktop/portrait/landscape camera projection. Test Vite used `E2E_PORT=5174` to preserve the existing local server on 5173.
- Desktop, 402×874 portrait and landscape screenshots reviewed and saved in `docs/screenshots/`. Reference site inspected with headless Chromium; no connected Browser was available. No reference assets were copied.
- Vercel production build succeeds. Engine is approximately 560 kB minified / 143 kB gzip; expected chunk-size advisory remains. Actual iPhone/Safari GPU performance and public-internet NAT/TURN remain unverified; no deployment performed.
