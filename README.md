# NEON WING

A two-player illustrated city flight survival game built with **SvelteKit + pure Three.js + PeerJS**. Follow a low chase camera through a winding pastel city, dodge towers in the street, evade orange asteroids, and collect upgrades while your weapons automatically target the nearest threat.

This branch reinterprets the outlined architecture and street-level composition of [Messenger by Abeto](https://messenger.abeto.co). All geometry is original and generated in JavaScript; no Blender, downloaded models, or copied reference assets.

## Run locally

Use Node **22.12+** (Node 22 LTS recommended) and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Choose **Solo practice** for an offline run, or **Create a room** and share the four-character code with a second browser/device. The second player chooses **Join with code**. The run starts automatically when the second pilot connects. No accounts or server setup are required for normal play; multiplayer uses the public PeerJS signaling service and requires internet access.

For two devices on the same Wi-Fi, open the Network URL printed by Vite on the second device. For routine co-op testing, use two windows side by side: hiding a game tab or changing window focus requests a synchronized pause, so both pilots may need to resume. Chromium, Firefox, and Safari with WebGL2 and WebRTC enabled are the intended targets; only Chromium is automated here.

## Controls and gameplay

| Action | Control |
| --- | --- |
| Move | WASD or arrow keys |
| Shoot | Automatic; targets the nearest asteroid |
| Pause / resume | Escape or the pause button |
| Touch movement | Drag the circular steering pad on phones and other touch screens |
| Upgrade | Fly near cores to attract and collect them |

- Cyan cores increase fire rate (eight levels); magenta cores add spread (up to five projectiles).
- Roadside buildings establish the route; towers inside the corridor are solid hazards. Dodge left or right. Towers absorb projectiles, and colliding costs one hull point and pushes the ship clear.
- Both ships have five hull points. Hits briefly grant invulnerability.
- One downed pilot can spectate while the other survives; the run ends when both are down. Return to the terminal to start a new run.
- Enemy arrival rate increases continuously; speed increases each 25-second sector. Spawns and projectile lifetimes are capped to bound resource use.
- Either player can pause. Each pilot clears their own pause flag; both must be clear before the shared run resumes. Backgrounding a tab also pauses it.

## Verify

```sh
npm run check
npm test
npm run build
npm run preview
```

Automated browser tests exercise actual WebGL rendering, solo pause/resume, mobile layout, two real PeerJS peers, pause ownership and disconnect handling:

```sh
npx playwright install chromium
npm run test:e2e
```

The test runner starts a **development-only** local PeerJS signaling server on port 9000 and Vite on port 5173. Keep those ports free, or select another Vite port with `E2E_PORT=5174 npm run test:e2e`. This server is never used by the deployed app. Headless tests use software WebGL; browser downloads require internet, but the tests do not rely on PeerJS cloud. Screenshots are written to `test-results/` (git-ignored).

## Deploy to Vercel

```sh
npm install
npm run check
npm test
npm run build
npx vercel login
npx vercel
# After checking the preview deployment:
npx vercel --prod
```

Select the **SvelteKit** framework if prompted. Build command: `npm run build`. Leave the output-directory override unset; `@sveltejs/adapter-vercel` generates `.vercel/output`. The adapter explicitly targets `nodejs22.x`; select Node 22 in Vercel project settings. HTTPS is provided by Vercel. No database, application socket server, or Vercel environment variables are required for the default setup.

The Vercel CLI creates a deployment in your own account. This repository does not contain deployment credentials and has not been published automatically.

## How synchronization works

```text
Vercel ── serves Svelte UI + Three.js + PeerJS to both browsers
PeerJS signaling service ── introduces host and guest
Host browser ←──── direct WebRTC data channel ────→ Guest browser
  60 Hz authoritative simulation                    30 Hz movement input
  20 Hz snapshots ────────────────────────────────→ interpolated visuals
```

The four-character uppercase alphanumeric room code **is the host's Peer ID**. Code collisions retry up to eight times. A host accepts one guest with the matching protocol version (`neon-wing-city-v2`, incompatible with the original arena build) and rejects additional connections. Four characters are intended for casual invitations, not private authenticated sessions.

`Simulation` owns movement limits, spawns, auto-fire, collision detection, damage, drops, upgrades, score and run completion. Guests send only normalized movement intent and their pause state. Input is validated for finite coordinates and normalized by the host; stale input expires after 300 ms. Guests never submit health changes, hits, or enemies. Guest visuals interpolate toward snapshots; there is no rollback, client prediction, host migration, or reconnect-to-run support.

Reliable ordered data channels carry control messages and bounded snapshots. Disposable input/snapshots are dropped when transport buffering grows, preventing stale update accumulation. Each side sends a heartbeat every two seconds, even when paused; a lost connection ends the session. Pause stops `requestAnimationFrame`, rendering and simulation on both peers, while signaling and heartbeat timers remain active. In-flight messages can arrive during pause; the simulation does not advance.

## Signaling and restrictive networks

Vercel does **not** host a persistent WebSocket server for this game. PeerJS uses an external signaling broker to introduce browsers; game state travels over WebRTC. Public signaling is a third-party availability dependency. Some corporate networks, mobile carriers, and symmetric NATs require a TURN relay.

Copy `.env.example` to `.env` if you want a custom signaling service or TURN relay:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_PEER_HOST` | Optional signaling hostname; blank uses PeerJS cloud |
| `PUBLIC_PEER_PORT` | Custom signaling port, default `443` |
| `PUBLIC_PEER_PATH` | Custom signaling path, default `/` |
| `PUBLIC_PEER_SECURE` | `true` in production; `false` only for local HTTP tests |
| `PUBLIC_TURN_URL` | Relay URL, e.g. `turns:relay.example.com:5349` |
| `PUBLIC_TURN_USERNAME` | TURN username |
| `PUBLIC_TURN_CREDENTIAL` | TURN credential |

All `PUBLIC_*` values are visible to browsers. Use short-lived TURN credentials for a production service; do not embed a long-lived private secret. Dynamic credential issuance is an extension point, not implemented here. Put custom values in Vercel project environment settings and redeploy. Failure to connect is shown in the terminal with a retry path. Losing the host ends the run.

## Repository map

```text
src/
  app.html                     HTML document shell
  app.css                      Illustrated terminal and compact responsive HUD
  routes/
    +layout.svelte             Global styles
    +page.svelte               Menu, join, lobby, HUD, touch and synced pause UI
  lib/
    net/PeerSession.js         PeerJS lifecycle, room IDs and protocol
    game/
      course.js                Shared deterministic route and tower geometry
      simulation.js            Pure host-authoritative fixed-step game rules
      procedural.js            Batched outlined architecture, ships, rocks, cores
      scene.js                 Chase camera, daylight, curved road and subtle bloom
      Engine.js                Game loop, input, snapshots and visual interpolation
tests/
  simulation.test.js           Deterministic game-rule tests
  browser/game.spec.js         Chromium and two-peer integration tests
scripts/test-signaling.js      Test-only local signaling broker
playwright.config.js          Browser runner and isolated test services
svelte.config.js              Vercel adapter, explicit Node 22 runtime
agents.md                     Objective, progress and next-session handoff
```

All meshes are generated in code. City blocks batch static geometry by material and share dark contour lines. Toon materials, warm plaster, teal glazing, trees, street lamps, overhead infrastructure and projected ground shadows establish the illustrated style. A continuous road follows the shared route function; tower layouts and collision boxes come from `course.js`. Host snapshots include tower positions. Each pilot's camera follows their own ship, keeping it near the center without pulling away in portrait mode. The view remains a forward flight corridor with lateral/forward dodging, rather than a free-roaming city or six-axis flight simulator.

The composer uses FXAA edge smoothing and restrained bloom limited to bright effects. No dark overlay covers active gameplay. No models or texture assets need downloading. Optional Google Fonts enhance the terminal typography; system fallbacks remain usable offline.

The Three.js engine is dynamically imported on mount so server rendering never touches browser APIs. The engine chunk is approximately 560 kB minified (143 kB gzip); Vite may emit its standard 500 kB chunk advisory. Pixel ratio is capped at 1.5 to limit bloom cost. Full cross-device GPU performance and public-internet NAT traversal still need validation on the target devices.

Verification at handoff: Svelte checks, ten simulation tests, four Chromium integration tests and the Vercel production build pass. Dependency audit reports three low advisories through SvelteKit/cookie and three moderate advisories through the test-only PeerServer/Express/qs chain; normal `npm audit fix` did not clear these. See `agents.md` for the exact verification record and follow-up scope.

References: [PeerJS connection API](https://peerjs.com/client/api/peer), [SvelteKit on Vercel](https://vercel.com/docs/frameworks/full-stack/sveltekit).

## City edition screenshots

[Desktop flight](docs/screenshots/city-desktop.png) · [Phone portrait](docs/screenshots/city-mobile.png) · [Landscape](docs/screenshots/city-landscape.png)
