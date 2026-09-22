// Route-space physics stays independent of Three.js.  The skyway is a long,
// repeating boulevard that folds through several districts: broad sweepers,
// short hairpins and gentle crests are mixed so a pilot can read the next
// opening before committing to a turn.
export const FLIGHT_SPEED = 14;
const PERIOD = 1800;
const SPACING = 2;
const COUNT = PERIOD / SPACING;
const TAU = Math.PI * 2;
const heading = s => 1.8 * Math.sin(s * TAU / PERIOD) + .48 * Math.sin(s * TAU * 3 / PERIOD + .45) + .2 * Math.sin(s * TAU * 9 / PERIOD - .7);
// Keep the road near the city floor while giving the camera visible crests,
// dips and a few roller-coaster-like transitions.
const elevation = s => 14 + 7 * Math.sin(s * TAU * 2 / PERIOD + .3) + 4 * Math.sin(s * TAU * 5 / PERIOD - .6) + 2.1 * Math.sin(s * TAU * 13 / PERIOD);
const samples = [{ x: 0, z: 0 }];
for (let i = 1; i <= COUNT; i++) {
  const h = heading((i - .5) * SPACING), previous = samples[i - 1];
  samples.push({ x: previous.x + Math.sin(h) * SPACING, z: previous.z - Math.cos(h) * SPACING });
}
export function courseFrame(distance) {
  const cycle = Math.floor(distance / PERIOD), s = distance - cycle * PERIOD;
  const index = Math.min(COUNT - 1, Math.floor(s / SPACING)), t = s / SPACING - index;
  const a = samples[index], b = samples[index + 1], h = heading(s);
  const slope = (elevation(s + .5) - elevation(s - .5));
  const pitch = Math.atan(slope), curvature = heading(s + .5) - heading(s - .5);
  const bank = Math.max(-.65, Math.min(.65, -curvature * 30));
  const forward = { x: Math.sin(h) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(h) * Math.cos(pitch) };
  const r = { x: Math.cos(h), y: 0, z: Math.sin(h) };
  const u = { x: -Math.sin(h) * Math.sin(pitch), y: Math.cos(pitch), z: Math.cos(h) * Math.sin(pitch) };
  const right = { x: r.x * Math.cos(bank) + u.x * Math.sin(bank), y: u.y * Math.sin(bank), z: r.z * Math.cos(bank) + u.z * Math.sin(bank) };
  const up = { x: u.x * Math.cos(bank) - r.x * Math.sin(bank), y: u.y * Math.cos(bank), z: u.z * Math.cos(bank) - r.z * Math.sin(bank) };
  return { x: a.x + (b.x - a.x) * t + cycle * samples[COUNT].x, y: elevation(s), z: a.z + (b.z - a.z) * t + cycle * samples[COUNT].z, right, up, forward, curvature, bank };
}
export function worldPosition(x, y, z, time) {
  const f = courseFrame(time * FLIGHT_SPEED - z);
  return { x: f.x + f.right.x * x + f.up.x * y, y: f.y + f.right.y * x + f.up.y * y, z: f.z + f.right.z * x + f.up.z * y };
}
// Kept for existing integrations; scene code uses the complete route frame.
export const roadCenter = distance => courseFrame(distance).x;
export const worldX = (x, z, time) => worldPosition(x, 0, z, time).x;
// Collision pieces are deliberately sparse and leave a readable lane on each
// side. The procedural city can be dense between these pieces without making
// the game a trial-and-error obstacle course.
export function cityObstacles(time, players = [{ z: 0 }]) {
  const distance = time * FLIGHT_SPEED, result = [], seen = new Set();
  for (const player of players) {
    const first = Math.max(0, Math.floor((distance - player.z - 40) / 48));
    for (let section = first; section < first + 7; section++) {
      if (seen.has(section)) continue;
      seen.add(section);
      // Keep this anchor stable: it is the first visible building at launch.
      const z = distance - 68 - section * 48;
      const phase = ((section % 6) + 6) % 6;
      const id = section * 10;
      if (phase === 0) {
        result.push({ id, kind: 'tower', x: 0, z, width: 6, depth: 7, height: 13, district: 'old-town' });
      } else if (phase === 1) {
        // A side facade makes the pilot thread a close gap while the opposite
        // curb remains open and visible.
        result.push({ id, kind: 'tower', x: -8.5, z, width: 7, depth: 8, height: 16, district: 'market' });
      } else if (phase === 2) {
        result.push({ id, kind: 'tower', x: 8.5, z, width: 7, depth: 8, height: 20, district: 'terrace' });
      } else if (phase === 3) {
        // An overhead skybridge leaves the low lane completely clear. Climbers
        // can take the dramatic upper route, while Scenic pilots stay below.
        result.push({ id, kind: 'gate', x: 0, z: z - 10, y: 13, width: 22, depth: 1.4, height: 3, district: 'highline' });
      } else if (phase === 4) {
        // A low cross-street beam rewards a lift, but has generous headroom and
        // can always be passed by holding the route centre.
        result.push({ id, kind: 'gate', x: 0, z: z - 4, y: 4.5, width: 24, depth: 1.2, height: 2.4, district: 'canal' });
      } else {
        result.push({ id, kind: 'tower', x: section % 2 ? -5.5 : 5.5, z, width: 5, depth: 6, height: 11, district: 'garden' });
      }
      // Corner posts frame every block and are intentionally outside the
      // playable lane. They make turns legible without becoming surprise hits.
      for (const side of [-1, 1]) result.push({ id: id + (side < 0 ? 1 : 2), kind: 'pole', x: side * 14.8, z: z - 18, width: 1, depth: 1, height: 25, district: 'street' });
    }
  }
  return result;
}
export function hitsBuilding(player, building, padding = .65) {
  const low = building.kind === 'gate' ? building.y - building.height / 2 : -4;
  const high = building.kind === 'gate' ? building.y + building.height / 2 : building.height - 4;
  return (player.y ?? 0) - padding < high && (player.y ?? 0) + padding > low && Math.abs(player.x - building.x) < building.width / 2 + padding && Math.abs(player.z - building.z) < building.depth / 2 + padding;
}
