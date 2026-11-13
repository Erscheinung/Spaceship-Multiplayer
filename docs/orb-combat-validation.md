# Restored orb combat and stable road obstacles — November 13, 2026

Astra Low implemented the repair; the primary Sol session performed all validation, test updates, captures and the commit. Astra ran no tests, builds or browser checks.

## Behavior

- Continuous forward lasers return in courier and survival play, with a 0.3-second base interval and upgrades down to 0.11 seconds. Amber spherical enemies have dark orbit bands, a bright core, hit feedback, authoritative kills, score and possible upgrade drops. The cyan laser silhouette is elongated and distinct from diamond pickups.
- Assisted fire first considers an open, visible courier target, then a visible orb. Otherwise the ship continues firing forward. Brutal stays unassisted. Route-space range/cone checks, curved-world visibility and obstacle intersections constrain assisted locks; swept contacts stop shots at intervening structures.
- Courier orb spawn attempts occur every 0.5 seconds on Normal/Brutal and 0.845 seconds on Scenic. Blocked placements can skip an attempt; this is not a guarantee of a visible orb each interval. Live orbs remain capped at 60 and courier orb speed progression is capped at wave 12. Survival retains its original escalating spawn cadence.
- Encounters no longer delete road towers, poles or gates. The obstacle state remains exactly the deterministic `cityObstacles` kit. Encounter placement checks the curved-world view and a short forecast of the unsteered cruise/drift approach, including target sway. Unsafe placements defer and retry; a deferred roaming kind stays in its shuffled bag. Visibility cannot be guaranteed after arbitrary pilot steering.
- Sign Crab repair has clearer instructions/completion feedback and releases a collectible bulb. Parcel dominoes trigger only their own encounter. A swept-hit bug discovered during validation is repaired: omitted orb altitude defaults to zero, and nonfinite coordinates cannot falsely register distant hits.

## Checks completed by the primary

- **71 unit tests pass**, including continuous courier firing/spawning, actual orb kill/score/drop, courier target priority, straight Brutal fire, missing-altitude hit rejection, deterministic obstacle equality on every tick across encounter onset, and six minutes of boosted all-four encounter reachability with bounded live objects. Existing zero-shot assertions now verify straight fallback fire rather than requiring silence; tell tests allow safe delayed placement.
- **Svelte check: zero errors/warnings. Production Vercel build: succeeds**, retaining the existing chunk advisory. Validation ran in `/tmp/neon-orb-validation` with matching source and locked dependencies, avoiding the repository's cloud-backed dependency/watcher problems.
- **Seven Chromium scenarios pass** using native Mac Metal: solo flight/pause/return; two-peer join/snapshots/independent pause/departure; phone terminal/touch input; desktop/portrait/landscape camera; a real solo run past 94 seconds observing all four encounter kinds and recovered mail; survival selection/pause; and canonical two-peer delivery/recovery/completion/replay. The first replay run caught a harness race reading guest state immediately after `Engine.start`; the test now waits for the first new-run snapshot and then checks zeroed mail state. Its isolated rerun passes. No production networking change was needed.
- Final actual-flight capture runs verify that every obstacle in the current state still has a visible, nonzero rendered object, including across the first encounter. Both desktop and portrait runs see orb targets, laser traffic, positive score, continued flight and working pause/resume, without page/shader errors or control overlap.
- Additional HUD/header/control rectangle checks at 320×568, 667×375 and 320×480 report **no overlaps and no horizontal overflow**. The existing 393×705 portrait check also passes.

## Before/after measurements

Same native Metal browser, viewport, lighting, deterministic random source, centering input and brief boost interval; sequential real-flight samples of roughly twenty seconds. Counts are unique IDs observed at 100 ms intervals, so very short-lived shots can be missed. Timing measurements are animation-frame intervals, not GPU timer queries.

| View | Previous observed orbs / shots | Repaired observed orbs / shots | Previous median / p95 | Repaired median / p95 |
| --- | --- | --- | --- | --- |
| 1440×900 day | 0 / 3 | 38 / 52 | 16.7 / 16.7 ms | 16.7 / 16.7 ms |
| 393×705 night | 0 / 3 | 37 / 53 | 16.7 / 16.7 ms | 16.7 / 16.7 ms |

Both repaired runs ended with 800 points, at most seven simultaneous orbs and four/six observed simultaneous laser shots. Resident textures were unchanged at 23 desktop / 21 portrait. Live geometries were 125 / 112 versus 115 / 104 in the baseline, reflecting the extra active combat objects; these counts are not a long-duration memory-leak proof. No significant frame-pacing regression appeared in these samples. Physical iPhone/Safari, thermal throttling and hostile real-world networks remain untested.

Raw results: `orb-combat-validation.json`, `orb-combat-baseline.json` and `orb-layout-validation.json`. Inspected captures: `screenshots/orb-combat-{desktop,portrait}.png`, `orb-boost-{desktop,portrait}.png` and `orb-layout-320x568.png`.
