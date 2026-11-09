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


## Neon cohesion, corridor panels and forward weapons

The three pending feedback tasks are complete. The transparent cyan corridor panels were 320 tall road-edge guard instances; those visuals and their uploads are removed while the low rails and physical lane boundary remain. The material pass coordinates ivory, rose, teal and indigo, softens rugged atlas detail by surface type, replaces cobbles with smooth midnight-teal asphalt, and uses cyan/coral/violet shop lettering and fixtures. The six property families, shared material atlas and construction details remain. The supplied screenshot and a visit to [Messenger](https://messenger.abeto.co/) informed the broad tonal surfaces and cohesive palette; no reference assets were copied.

Matched camera/time comparisons:

| View | Previous | Final |
| --- | --- | --- |
| Day street | [Before](screenshots/neon-before-day.png) | [After](screenshots/neon-day.png) |
| Night street | [Before](screenshots/neon-before-night.png) | [After](screenshots/neon-night.png) |

Also inspected [banked golden turn](screenshots/neon-golden-turn.png), [portrait](screenshots/neon-portrait.png), [dawn](screenshots/neon-dawn.png), [raised courtyard/roof view](screenshots/neon-courtyards.png), and actual boosted [desktop](screenshots/neon-gameplay-desktop.png) / [portrait](screenshots/neon-gameplay-portrait.png) gameplay. The clean road exposed foundation interference on banks: three foundation strips now match the central road triangulation, and both road/foundation materials disable inherited facade decal polygon offset. Fresh captures show no stripes or dots, with directional shadows retained.

Assisted shooting now rejects rocks behind the ship, outside a 30-degree 3D cone, or more than 110 forward units away, and launches 1.7 units ahead of the hull. Brutal retains straight-forward fire. Unit coverage includes elevated valid targets, behind/off-cone/out-of-range threats and boosting. Ground regressions cover full width, recycling, bends/hills, period seams and the central foundation remaining below the asphalt at the maximum sampled bank.

Final local validation:

- All 51 unit tests pass; Svelte check reports zero errors/warnings; root Vercel production build succeeds.
- All six Chromium integration checks pass in 1.6 minutes: solo pause/resume, real two-peer UI/pause/departure, mobile controls/layout, camera framing, lighting/material/long-route rendering, and real transport closure/recovery under injected jitter/loss.
- The stable /tmp/neon-pending-after snapshot matches all 37 repository source/test/script/configuration files used by those checks. No changes to networking/protocol were needed.
- Native M4 Metal gameplay at 1440×900 and 402×874, including boost/climb/descent and pause/resume, had median and p95 animation-frame intervals of 16.7 ms, with no page/shader errors or horizontal overflow. Solo still shows unlimited hull.
- The refreshed root production preview serves HTTP 200 at http://localhost:5173.

Renderer budget comparison uses 240 frames per view (60 warmup, 180 measured) at 1280×800 / DPR1 on the same M4 Metal renderer. Each pair ran sequentially, with the second pair reversing before/after order. Medians show system variation; these are budget checks, not a claim of a speedup:

| View | Before median, pair 1 / 2 | Final median, pair 1 / 2 | Before → final draw calls |
| --- | --- | --- | --- |
| Day street | 3.3 / 2.8 ms | 3.2 / 2.5 ms | 89 → 88 |
| Night street | 3.1 / 2.6 ms | 2.9 / 2.4 ms | 89 → 88 |
| Boost through turn | 3.0 / 2.7 ms | 3.2 / 2.5 ms | 85 → 84 |
| Night skyline | 3.0 / 2.6 ms | 4.5 / 2.4 ms | 90 → 89 |

Texture count remains 16. The three-strip foundation adds 640 triangles, while removing guard instances produces a net reduction of 3,200 rendered triangles in these views and one fewer geometry/draw call. No extra lights or fullscreen passes. All sampled views remained bounded and free of page/shader errors. Physical phones, Safari/iOS GPU performance and real external VPNs remain untested.


## Lost Night Mail — November 9–10, 2026

Lost Night Mail makes the courier promise playable in a roughly 90-second solo/co-op route. Static Moths unfold and release bulbs/mail, the leading parcel seal starts a four-package domino, and an optional higher Sign Crab socket becomes a repair kit. The route alternates those phrases with recovery stretches and a Nightjar Radio arrival. Recovered mail fills a small rack; successful delivery lights the radio station’s sign and windows, unfolds its aerial and reveals an original postcard. Endless survival remains selectable. The Night Sorter, dedicated two-socket cooperation, new district progression and a persistent postcard book remain proposed in the [roadmap](gameplay-roadmap.md).

Observed corrections: the first real-flight moth was hidden behind a poster tower, so its approach now chooses a clear ray through the existing obstacle layout; the optional crab requires altitude alignment rather than being auto-solved from the floor. Nightjar’s opaque masses sit beyond the playable lane. Astra’s final review rejected the solid cross-road arrival beam as a false collision cue; the final marker uses roadside signage, separated ground chevrons and open brackets. Postcard results omit flight settings so replay/return remain easy to reach.

The current route is an authored first slice, not a persistent campaign. Scripted flights and deterministic tests establish behavior; they do not establish that players recognize every target on their first run or voluntarily replay. Physical phones, Safari/iOS GPU timing and real external VPNs remain untested.

Final validation:

- **62 unit tests pass**, including the unobstructed natural moth approach, tell-gated swept hits, parcel domino idempotence, low-pass/climbed crab repair, swept collection, either-survivor delivery, explicit failure and frozen results.
- **Svelte check: zero errors/warnings; root and identical local-snapshot Vercel production builds succeed.** Locked dependencies are unchanged.
- **Nine distinct Chromium integration checks pass across the combined and focused runs.** Six existing checks cover solo/pause, real two-peer UI/pause/departure, mobile touch/layout, camera projection, lighting/long views and transport recovery under jitter/loss. The new checks cover full delivery/postcard/replay, selectable survival, and real-peer canonical mail/repair/restoration across pause, transport closure/recovery and replay. The co-op route driver uses actual authoritative fixed steps and normal climb input; the native solo route runs for its complete wall-clock flight. Both pilots must reload for `neon-wing-city-v8`.
- The first co-op replay assertion incorrectly required observation within half a second; it now verifies exactly one Engine start per peer and cleared mission fields. Its climb controller was also corrected to reach the optional repair socket. The full-route test timed out under software WebGL at only 21 game seconds, already holding recovered mail; that file now uses native Metal on macOS and a smaller, longer software fallback elsewhere. These changes preserve the success/recovery/replay assertions. Six existing cases retain their software-rendering configuration.
- After the final visual-only arrival corrections, repeated source checks/builds and **two complete final-source native flights** pass. Desktop/day delivered two letters and two bulbs (C); portrait/night delivered three letters and three bulbs (B), including a boost/climb window. Both completed restoration, pause/resume and clean replay with no page/shader errors or horizontal overflow. These conservative scripted lines bypassed the optional crab; its deliberate-climb path is covered by the simulation and real-peer checks.
- Actual frame intervals over more than 5,400 samples per view were **16.7 ms median / 16.8 ms p95** on the native M4 Metal renderer, at 1440×900 and 402×874. These are measured animation-frame intervals, not the HUD's reported FPS. Physical phone/Safari results are not inferred.
- A separate compiled production-preview smoke run launches delivery, advances the HUD and pauses successfully, with no page/shader errors or overflow. The refreshed preview serves HTTP 200 at **http://localhost:5173**.

Matched **staged renderer fixtures** hold camera and course samples constant while changing restoration state:

| View | Dark station | Restored station |
| --- | --- | --- |
| Day | [Before](screenshots/mail-staged-shop-before-day.png) | [After](screenshots/mail-staged-shop-after-day.png) |
| Night | [Before](screenshots/mail-staged-shop-before-night.png) | [After](screenshots/mail-staged-shop-after-night.png) |

The staged [moth](screenshots/mail-staged-moth-portrait.png), [parcel train](screenshots/mail-staged-parcel-day.png) and [crab](screenshots/mail-staged-crab-portrait.png) establish shape/contrast. Separate [moth release](screenshots/mail-staged-moth-completion.png), [parcel opening](screenshots/mail-staged-parcel-completion.png) and [crab folding](screenshots/mail-staged-crab-completion.png) fixtures inspect completion geometry; these are authored state probes, not evidence of a human completing those encounters. Actual flight captures include the [clear moth approach](screenshots/mail-flight-moth-desktop.png), [parcel approach](screenshots/mail-flight-parcel-desktop.png), [portrait crab approach](screenshots/mail-flight-crab-portrait.png), [portrait boost](screenshots/mail-boost-portrait.png), [desktop restoration](screenshots/mail-arrival-desktop.png), and final [desktop](screenshots/mail-postcard-desktop.png) / [portrait](screenshots/mail-postcard-portrait.png) postcards. The final compact roadside fascia is fully visible and the cross-road beam is absent.

The isolated renderer comparison uses the previous city renderer from the preserved `neon-pending-after` snapshot versus the final source plus a staged delivery workload (moth, four parcels, crab or station, with a three-letter rack). Both use one courier ship, 1280×800 / DPR1, Apple M4 through ANGLE Metal, a GPU readback fence, 240 frames per view, 60 warmup and 180 measured. Runs are sequential with the second pair reversing order; no other browser/GPU test ran during them. System/GPU timing varies substantially, so lower numbers are **not a claimed speedup**.

| View / added encounter | Before median, pairs 1 / 2 | Delivery median, pairs 1 / 2 | Before → delivery draw calls |
| --- | --- | --- | --- |
| Day street / moth | 2.8 / 3.0 ms | 3.6 / 2.8 ms | 88 → 104 |
| Night street / four parcels | 5.4 / 5.5 ms | 3.7 / 3.8 ms | 88 → 119 |
| Golden boosted turn / crab | 5.6 / 7.8 ms | 2.8 / 6.1 ms | 84 → 105 |
| Night skyline / station | 5.3 / 7.0 ms | 2.8 / 3.6 ms | 89 → 113 |

These views add 209–573 visible triangles, at most one GPU texture (16 → 17), and at most 18 uploaded geometries (99 total in the longest sampled view). Delivery p95 renderer samples range from 3.2–9.5 ms; baseline samples range from 4.5–10.2 ms. No page/shader errors were reported. The kit uses shared/pool-owned geometry/materials, merged landmark details, a shared sign atlas and a six-release cap. It adds no lights, shadows or fullscreen passes; the city's batching, rolling buffers and resolution/shadow budgets remain intact. Native full-flight pacing is the practical desktop evidence; the isolated samples are bounded workload checks, not phone measurements.

Validation runs use `/tmp/neon-mail-validation` to avoid cloud watcher reloads, with all 44 runtime/test/script/config files checked against the repository. The renderer baseline remains `/tmp/neon-pending-after`. Raw native results are in the ignored `test-results/delivery-visual-report.json` in that final snapshot; `scripts/validate-delivery.mjs` reproduces full-route captures. Root cloud-placeholder dependencies were preserved in `.node_modules-cloud-backup-mail`; the working `node_modules` points to the matching locked `/tmp/neon-local-deps/node_modules`. Existing backups and the pre-existing unstaged September 24 log insertion were preserved.
