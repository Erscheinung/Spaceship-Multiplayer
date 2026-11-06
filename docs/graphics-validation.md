# Local graphics validation — November 7, 2026

The graphics were implemented in the primary session after Luna's read-only renderer/reference scope and Astra Medium's bounded visual architecture plan. Astra reviewed the implementation and captures; the primary corrected the buried storefront panes, filtered distant pattern contrast, softened celestial-light handoff and replaced the moon's crosshatching with broad crater shapes.

## Performance

Hardware: Apple M4, Chromium 153, ANGLE Metal. Isolated scene: 1280 × 800, DPR 1; the existing shadow and composer settings remain. Each view warms for eight frames, then samples forty frames with a synchronous one-pixel GPU readback. These are CPU-to-render-completion measurements, not GPU timer queries. Compare on the same machine; short samples have normal scheduling noise.

| View | Previous median / p95 | New median / p95 | Previous / new draw calls |
| --- | --- | --- | --- |
| Day street | 2.3 / 4.1 ms | 2.7 / 3.6 ms | 90 / 92 |
| Night street | 2.3 / 3.9 ms | 2.5 / 3.6 ms | 90 / 90 |
| Boost through turn | 2.3 / 4.1 ms | 2.5 / 4.1 ms | 83 / 89 |
| High night skyline | 2.4 / 4.0 ms | 2.4 / 4.2 ms | 78 / 86 |

The previous renderer has no clock cycle; its rows use the same camera/flight parameters with its original fixed lighting. Different sun/moon shadow frusta change the meshes counted in each view. New resident texture count is 15 versus 14: one shared 512 × 512 sign atlas. Sampled geometry counts remain bounded (72–81 versus 68–80); city density and its instance pools are retained. The additional facade/ship geometry increases triangles by approximately 19–30% in these views, while retaining merged district batches.

A separate native gameplay run held Shift boost, climbed and followed turns with the actual simulation and HUD at 1440 × 900 and 402 × 874. Both recorded approximately 60 FPS (median animation-frame interval 16 ms, p95 18 ms), with zero page or WebGL/shader errors. This establishes local M4 headroom, not phone hardware or Safari performance.

To repeat the current scene sample, start the dev server and run:

```sh
GRAPHICS_URL=http://127.0.0.1:5173 node scripts/benchmark-graphics.mjs
```

Add `--software` for SwiftShader. The original source was temporarily copied for the baseline; baseline fixtures are not shipped. The optional `GRAPHICS_MODULE_ROOT` accepts a local source-module directory for a future before/after comparison.

## Visual inspection

Reviewed [day](screenshots/graphics-day.png), [golden hour](screenshots/graphics-golden.png), [dawn](screenshots/graphics-dawn.png), [night](screenshots/graphics-night.png), [portrait night](screenshots/graphics-night-mobile.png), and actual [desktop](screenshots/graphics-gameplay-desktop.png) / [portrait](screenshots/graphics-gameplay-portrait.png) boosted gameplay captures. Surface coordinates remain attached during banked flight, occupied windows/lanterns are distinct at night, and the ship and route remain readable.

Dedicated [sun](screenshots/graphics-sun.png) and [moon](screenshots/graphics-moon.png) captures point the camera toward the celestial directions to inspect the actual sky shader. Sun rays stop at the rooftop silhouette. Stars and soft crater patches replace the former blank sky. These celestial captures directly render the scene to inspect sky framing; the gameplay captures use the full composer.

The original [business-sign atlas](screenshots/graphics-storefronts.png), material choices and future art standards are described in [art-direction.md](art-direction.md).

## Automated checks

- `npm run check`: zero errors and warnings.
- `npm test`: all 41 unit tests pass, including clock-transition and banked-surface-coordinate checks.
- `E2E_PORT=5176 npm run test:e2e`: all six repository Chromium checks pass in the final local source snapshot: solo/pause, real two-peer UI/departure, mobile controls, camera framing, clock/material rendering through long route views, and jitter/loss/transport recovery. One temporary diagnostic also ran in that invocation (seven passing tests total); it is not shipped. All 35 repository app/test/script/configuration files were verified against the snapshot.
- `npm run build`: Vercel production output succeeds; the existing chunk-size advisory remains (engine 596.18 kB minified / 156.21 kB gzip).

## Scope and environment

The cycle uses device-local civil time, centered on fixed 06:00 dawn and 18:00 dusk; seasonal/latitude-dependent astronomy and geolocation are not implemented. Multiplayer simulation is unchanged.

Thousands of dependency/cache files had macOS cloud-placeholder flags, preventing startup. Installed the unchanged lockfile's dependencies locally and regenerated SvelteKit's generated cache. No package versions, lockfile or credentials were changed. The original placeholder dependency/cache directories were preserved as locally ignored `.node_modules-cloud-backup` and `.svelte-kit-cloud-backup` directories. A diagnostic browser log also confirmed unsolicited Vite updates to an unchanged route followed by reloads of generated client files in the Documents workspace. Final automated validation uses a matching, fully materialized source snapshot outside that cloud-backed folder (`/tmp/neon-graphics-validation`); no runtime workaround or retry was added to hide the reload.

The isolated network harness now navigates to a real loopback-served HTTP response rather than a synthetic fulfilled document. A controlled probe changing only that fixture restored peer launch within five seconds; the API stub, signaling options and permission grant stayed the same. The intentional 404 avoids mounting a second game renderer. This keeps the local address-space behavior faithful; see [Chrome’s local-network guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access). Production networking was unchanged.

Physical phones, Safari/iOS GPU frame pacing and real public-network/VPN conditions were not tested. The earlier UI test's abrupt browser-close recovery timing was inconsistent; the UI integration now checks explicit departure, while the separate network harness closes the real transport and verifies same-peer recovery with injected jitter/loss. This update does not establish browser-process termination timing on every platform.

## City charm, presets and contact follow-up — November 7, 2026

Astra's context was compacted before this iteration. Astra implemented architectural identities, end facades, roof tiles, quieter limewash and radial impact sparks; the configured implementation workers owned local appearance controls and swept rock contact. The primary accepted their focused validation reports and checked the resulting application without reviewing their code.

Inspected [day](screenshots/charm-day.png), [banked golden-hour turn](screenshots/charm-golden-turn.png), [night](screenshots/charm-night.png), [portrait](screenshots/charm-portrait.png), actual boosted [desktop](screenshots/charm-gameplay-desktop.png) / [portrait](screenshots/charm-gameplay-portrait.png) gameplay, and the [portrait pause controls](screenshots/charm-pause-portrait.png). Roof silhouettes, shop entrances and contrasting wall bases are visible from the chase camera. The preset control fits the pause panel; switching it keeps the simulation paused. Auto remains the default, with local storage for overrides and independent appearance per pilot.

The expanded static district pool has 84,180 triangles versus 73,788 previously, retaining the baked batch structure. Roof/plaster changes add no textures, lights or passes. An extra limewash noise field was removed after the first performance investigation.

The same M4 Metal renderer comparison was repeated with a longer window: 240 frames per view, 60 warmup frames and 180 measured frames, at 1280 × 800 / DPR 1. The initial short runs showed substantial system variation in both builds. These paired longer measurements are useful budget checks, not evidence that the new shader is faster:

| View | Before median / p95 | Final median / p95 | Before / final calls |
| --- | --- | --- | --- |
| Day street | 3.9 / 10.2 ms | 3.7 / 7.9 ms | 88 / 88 |
| Night street | 3.6 / 5.4 ms | 2.9 / 3.6 ms | 88 / 88 |
| Boost through turn | 3.8 / 5.6 ms | 4.1 / 5.5 ms | 84 / 84 |
| High night skyline | 3.5 / 7.0 ms | 3.7 / 5.9 ms | 89 / 89 |

Visible triangles increased approximately 4–6% in these views; texture count remains 15 and geometry counts remain 73–81. No shader/page errors occurred. Short native gameplay samples at 1440 × 900 and 402 × 874, including four seconds of boost/climb/descent, had median animation-frame intervals of 16.7 ms and p95 of 16.8 / 16.7 ms respectively, with no horizontal overflow. These are desktop measurements with a portrait viewport, not physical phone benchmarks.

Validation: all 44 unit tests pass, Svelte check reports zero errors/warnings, and the Vercel production build succeeds. Four focused Chromium checks pass: solo pause/resume, mobile controls/layout, desktop/portrait/landscape camera framing, and the final clock/material/long-view rendering check. The preset worker additionally verified rendered day/night/dawn values, saved selection after reload, shared menu/pause choice and Auto restoration. Rock regressions cover visible wing contact, thin vertical clearance and a fast boosted altitude crossing. Multiplayer transport was not changed or rerun in this follow-up; physical Safari/iOS and phone GPU performance remain unverified.

## Foundational material reset and ground continuity

The later follow-up replaces generic structural shader grids with a shared illustrated sixteen-surface atlas and 72 independently arranged properties. See [the asset and generation prompt](texture-assets.md), [final day](screenshots/rich-day.png), [final night](screenshots/rich-night.png), [courtyard view](screenshots/rich-courtyards.png), and [portrait](screenshots/rich-portrait.png). Final district geometry is 81,704 triangles, below the preceding 84,180; the material atlas adds one shared 1024 texture and route-following foundation adds one rolling draw call. Delivery WebP is approximately 544 KB. The foundation spans the complete near-property zone, following the road's sampled frame instead of rigid block pads.

All 47 unit tests and Svelte check passed before the final layout/emission/geometry simplification; worker final geometry/layout checks pass. Final Vercel build succeeds. Final six-view scene capture confirms atlas loading and no shader/page errors. The final day/night captures were inspected. The user requested an immediate quota-conscious wrap, so final actual gameplay/FPS, full browser checks and physical phone/Safari verification were not run. Earlier performance tables belong to earlier revisions and must not be attributed to this one.

When repeating renderer probes after copying source into a running Vite tree, restart Vite first. HMR timestamped imports can duplicate the atlas module and make a separate bare import report false readiness even while the scene's own atlas has loaded. Await the scene's shared atlas before timing; the benchmark now does so.
