# NEON WING — future play and visual direction

Status: proposed backlog, recorded at the user's request. None of these features is implemented or a commitment to start work. The current tested renderer/combat repair is already on main. Start with the small playable slice below, then judge the ideas by play rather than adding the entire list.

The promise: **a little courier ship brings a strange neon city back to life.** Bank through its streets, untangle stolen messages, and watch the neighborhood answer. Flight, targets, rewards, music and the city should express that same idea. A different enemy model alone will not make the current loop interesting.

## First playable slice — the lost night mail

A 90-second authored route for Afterlight Post and Nightjar Radio: a calm introduction, two short encounters with a recovery stretch, one satisfying chain release, and a delivery arrival. Use the existing guided road and climb/boost controls. Give the player a destination and a visible bag of recovered letters, rather than only an endless timer and score.

- [ ] **P0 — Replace sphere targets with three original, readable encounters.** Prototype each separately before mixing them. Retain simple forward-cone auto-fire: positioning, height and flight path should decide what the courier can hit. Never make the ship shoot backward to solve an encounter.

  | Target | Readable behavior and player choice | Satisfying result |
  | --- | --- | --- |
  | **Static moth** | A little folded-metal creature carries a stolen neon bulb between broad triangular wings. A generous wing-opening animation exposes its chest; align with its shallow swoop, or take the safer line past it. | Wings unfold into a paper fan; the freed bulb joins a short luminous trail behind the ship. On delivery it slots into a dark shop sign. |
  | **Runaway parcel train** | Three to five hovering parcels follow a visible ribbon. The leading wax seal is vulnerable; releasing it exposes the next seal. Follow the train's gentle curve instead of chasing arbitrary lateral targets. | A short domino sequence pops seals, opens flaps, and releases illustrated letters. Wrapping paper becomes a brief ribbon curl, then clears the view. |
  | **Clockwork sign crab** | A small maintenance automaton grips an overhead sign. Its shutter and moving antenna announce an exposed repair socket. Choose a low safe pass or climb toward the socket for a better delivery reward. | It folds into a compact repair kit rather than exploding. The sign flickers, resolves into its proper lettering, and its shutters bow like a thank-you. |

  Acceptance: distinct silhouettes and approach rhythms at portrait resolution; readable without color or audio; early versions cannot collide before their tells are visible. Every target has an approach, a response to a hit, and a recognizable completion. A player can explain the difference between encounters after one run. Retire the old generic spheres only when these actual interactions work.

- [ ] **P0 — Make each successful interaction feel tangible.** Design anticipation → contact → release → collection. Use a brief local squash/recoil, a clear seal-breaking silhouette, a crisp synthesized impact, and a warmer collection chime. Let recovered letters curve into a visible mail rack, with a restrained count tick. Vary pitch within an authored musical palette. Keep the route and next hazard visible; avoid fullscreen flashes, long confetti showers and mandatory camera shake. Any contact accent is presentation-only: never freeze the shared simulation or network heartbeat. Respect mute and reduced motion.

- [ ] **P0 — Give the encounter a meaningful payoff.** Recovered letters belong to a named shop. Approaching the delivery point draws a readable route ribbon; passing its generous delivery volume sends the letters to a mailbox, restores that shop's neon pictogram and reveals a tiny original postcard. The first run should answer “what am I doing, where am I going, and what changed because of me?” Scenic stays forgiving and solo hull remains unlimited; better lines earn elegant delivery grades rather than making relaxed play a failure.

Slice acceptance: actually fly it on desktop and phone; compare to the current sphere loop. Check target recognition, aiming reliability, clarity of collection/delivery, whether players notice the shop changing, and whether they voluntarily replay for a cleaner route. Record observations rather than assuming an effect increases retention. Defer persistent progression and the boss until this slice feels good.

## Give the flight room to breathe

- [ ] **P1 — Author encounter phrases instead of uniform spawning.** Alternate setup, playful challenge, release and quiet views. Introduce one behavior at a time; later combine familiar patterns. Make boost a choice between catching a moving mail train and preserving a clean delivery line. Add a broad low street path and a higher rooftop reward path inside the existing corridor; actual road forks would be a separate course/camera project. Define fair sight distances at maximum speed and in portrait before increasing density. Do not let auto-target selection steal shots from an exposed target directly ahead.

- [ ] **P1 — Build one memorable set piece: The Night Sorter.** A runaway sorting carriage with bellows, envelope drawers and a huge destination board crosses a landmark plaza. Its three short phases reuse the taught moth, parcel-chain and repair-socket interactions. Open stuck drawers and free the letters; avoid an undifferentiated health bar or a giant sphere with a face. Finish with the machine stamping a comically oversized “DELIVERED” postcard and reopening the street. Prototype the silhouette and safe path before animation polish. Keep a shorter, gentler Scenic version.

- [ ] **P1 — Make co-op feel like two couriers helping.** Two independently reachable repair sockets let pilots open a parcel carriage together; recovering each other's spilled mail earns a shared flourish. Use a generous cooperation window, not frame-perfect timing. A solo courier can complete every required objective, and a disconnected pilot cannot strand a mission. Host owns encounter state, completion and rewards; synchronized events have stable IDs to avoid duplicate deliveries after replay/recovery. Introduce a protocol version change when adding this state.

## A city worth remembering

- [ ] **P1 — Give districts a silhouette, material rhythm and story.** Prototype a teal ceramic night market, an indigo radio quarter with copper aerials, and a rose/ivory rooftop garden route. Each gets one recognizable landmark, its own shop activity and a quiet approach that frames it. Vary street widths, vertical accents and frontage rhythms through authored combinations, not random texture swaps. Preserve the existing smooth surfaces; neon belongs to readable signs, windows and interactive paths. Compare day/night/portrait captures against the same composition before accepting a district.

- [ ] **P1 — Add small responses to the courier.** A café awning lifts as mail arrives; a balcony light comes on; a rooftop laundry line flutters in the ship's wake; Nightjar Radio's aerial unfolds after a repair. A distant tram or paper-bird flock can cross an intentionally staged vista without entering the collision lane. Use a few meaningful, reusable animations with distance limits, not hundreds of busy props. Ambient objects must never look like targets or hazards unless they actually are.

- [ ] **P2 — Let delivery progress compose a neighborhood scene.** Restored shop signs, lit windows and a few original musical layers create an arrival tableau. Give successful deliveries an individual response: Comet Coffee draws a steam-shaped constellation; Moss & Moon opens a mechanical flower; Nightjar Radio broadcasts the courier's short call sign. Plan these as low-cost mesh/emissive animations and original synthesized motifs. Validate compatibility with the existing credited soundtrack; do not force input onto a beat grid or assume a track has a constant tempo. Provide a quiet version when muted/reduced motion is enabled.

## Reasons to return

- [ ] **P2 — Build a postcard route book.** Three-minute delivery routes award an illustrated local postcard and a concise note from the recipient. Offer optional mastery marks for clean lines, recovered mail and elegant landings, plus ship paint or a small courier charm. Favor memorable routes and skill improvement over larger damage numbers. Store an initial collection locally with safe failure handling; account sync, cross-device persistence and shared progression require separate scope. No login streaks, expiring rewards or compulsory daily chores.

- [ ] **P2 — Add replayable route variations with an authored structure.** A seed selects tested encounter phrases, destinations and a city event such as a rooftop lantern evening or morning market setup. Let players freely replay a favorite seed and compare personal bests. Add an optional local ghost only after controls and course timing are stable; it must not occlude real hazards. Content variety should change choices and destinations, not simply multiply enemy health. Any public leaderboard/backend is a separate decision.

## Implementation and acceptance constraints

Build and validate one small slice at a time. Reuse the host-authoritative simulation, bounded object pools, merged district geometry, shared atlases, rolling road buffers and current resolution/shadow budgets. Prefer a small procedural silhouette and a few animated parts over expensive rigs or transparent particle layers. New behaviors need swept hit tests and meaningful forward aim; the visible interactive region must match the collision region.

Keep phone controls simple. Every target should telegraph through silhouette/motion as well as color; aim assistance should make flight enjoyable without solving every route choice. Provide reduced effects and non-audio tells. Distinguish scenery, collectibles, threats and delivery points at a glance. No new individual street/window lights or fullscreen effects without measured need.

Before each implementation is committed: run proportionate simulation checks, inspect actual gameplay plus matched desktop/portrait/day/night screenshots, and measure a paired renderer baseline and sustained boost/encounter frame pacing. Exercise co-op when shared state changes. Physical phone/Safari performance is a required follow-up for release confidence; desktop portrait is not a substitute.

## Reference principles, not copied assets

These are proposed design interpretations, not claims that borrowing a feature guarantees engagement:

- [Splatoon — Nintendo](https://www.nintendo.com/store/products/splatoon-3-switch/): ink visibly changes the play space. Our proposed lesson is that each successful interaction should leave an understandable mark on the city.
- [Hi-Fi RUSH — official site](https://hifirush.krafton.com/): its world and action move with the music. Our proposed lesson is coordinated visual/audio responses, with our own timing and accessibility needs.
- [Flower — thatgamecompany](https://thatgamecompany.com/flower/): an expressive, accessible experience informs the desired emotional tone. Our proposed lesson is care and transformation alongside mechanical skill.
- [Messenger — Abeto](https://messenger.abeto.co/): the user's supplied street reference informs cohesive shading, expressive silhouettes and everyday neighborhood detail. Create original targets, characters, signs, music and animation language.
