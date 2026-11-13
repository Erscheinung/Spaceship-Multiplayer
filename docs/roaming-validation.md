# Recurring city encounters — November 13, 2026

Historical validation for `1ecc4a6`. Combat and obstacle-clearing behavior are superseded by [the orb combat repair](orb-combat-validation.md).

Solo City encounters replaces the fixed ending with shuffled four-encounter bags and 15–20 second spacing. Static Moths unfold, Parcel Trains release a four-seal domino, Sign Crabs accept a socket repair, and the moving Night Sorter opens three drawers. Each has a distinct silhouette and release animation. The old ship-following cargo rack is removed. Normal assisted fire remains forward-only; Brutal still requires alignment.

Every fourth event introduces a neighborhood delivery. Nightjar Radio, Comet Coffee and Moss & Moon have named fascias and aerial/cup/flower roof emblems, warm restored windows, and individual locally stored postcards. Solo delivery begins during the approach so the sign changes before the ship passes. Shops remain at their route location instead of following the camera. These are three delivery landmark identities within the existing architecture kit; full new district street kits and simultaneous two-socket co-op puzzles remain future expansion work. Co-op retains its existing finite shared route.

Visual checks found poster towers could obscure encounters on curved approaches despite a clear route-space sightline. Solo encounters now reserve bounded, rolling clear stretches in the poster/gate collision kit, including delivery approaches. The road, surrounding city and boundary flight rules remain. Completed objects, releases and clearing records retire as the courier passes. Six minutes of boosted simulation exercises bounded live targets and releases.

## Verification

- Final locked-dependency snapshot: Svelte check has zero errors/warnings; 66 unit tests pass; Vercel production build succeeds with the existing chunk advisory.
- A real-time solo browser run exceeded 94 seconds, observed all four randomly ordered encounter kinds, recovered mail and continued without an ending. Survival selection, solo pause/resume, mobile terminal/touch controls and camera checks passed. This run preceded the final approach-clearance and visual refinements; the final refinements have focused unit and rendered harness coverage.
- Two isolated real-peer Chromium checks pass: canonical delivery/pause/recovery/replay and general join/snapshots/independent pause/departure. Earlier combined runs included a source-reload failure while validation files were changing and a peer-launch timeout. Both affected checks subsequently passed in isolated runs; no production networking changes were made.
- Final render harness passes at 1440×900 day, 393×705 night and 844×390 golden hour. It checks every encounter, all three restored destinations, pause, postcard persistence after reload, panel viewport bounds, overflow, control overlap and page/shader errors. Encounter close-ups use normal movement with firing held back to expose the complete silhouettes. Destination checks stage the arrival state; they do not claim three full naturally flown delivery cycles.
- Additional 320×568, 667×375 and 320×480 checks compare all HUD/header/control rectangles. These found and fixed a six-pixel instrument/encounter-strip overlap and a short-landscape header conflict. Final checks report zero pairwise overlaps and no horizontal overflow. The postcard panel scrolls internally on short screens.
- Final source snapshot `/tmp/neon-roaming-final` matches repository implementation/configuration/test files. Clean locked dependencies were installed there because root dependency executables were missing. An initial root unit invocation could not load Three.js-dependent tests; successful checks above use the matching snapshot.

## Performance and limits

Native Mac Metal Chromium: boosted 300-frame samples have 16.7 ms median and p95 animation-frame intervals at all three viewports. A fixed-camera, warmed paired rendering probe hides/enables the encounter layer with one Sorter plus restored destination. Median CPU render-submission times (hidden/enabled) were 1.4/1.3 ms desktop, 1.3/1.3 ms portrait and 1.0/1.1 ms landscape. Differences are within timing noise; these CPU measurements are not GPU timer queries or a historical renderer benchmark. The staged layer has 37 visible drawables and 1,117 triangles, one shared texture, 19 owned geometries and 15 materials. No additional light or fullscreen pass was introduced. Composer `renderer.info.render` resets per pass; its final one-triangle pass is not a whole-frame draw-call count.

This is desktop GPU evidence, including desktop mobile emulation. Physical iPhone/Safari, thermal throttling, subjective engagement and long-term replay interest remain unverified. Raw final measurements are in `roaming-validation.json`; small-screen rectangle checks are in `roaming-layout-validation.json`.

## Inspected captures

Compare the supplied phone screenshot's large lower-left mission card and floating rear rack with `screenshots/roaming-phone-sorter.png` and `screenshots/roaming-layout-320x568.png`: guidance now occupies a compact strip below the instruments, while the lower flight/control region remains clear. Moth/parcel/crab/Sorter portrait close-ups, a desktop Sorter, a restored flower-emblem shop, the postcard panel and narrow layouts are archived under `screenshots/roaming-*.png`.
