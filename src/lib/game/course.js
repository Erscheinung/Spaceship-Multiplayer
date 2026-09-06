// Route-space physics stays independent of Three.js. A sampled, repeating skyway
// has real world-space hairpins, climbing crests and banked descending turns.
export const FLIGHT_SPEED = 14;
const PERIOD = 1800, SPACING = 2, COUNT = PERIOD / SPACING;
const heading = s => 2.05 * Math.sin(s * Math.PI * 2 / PERIOD) + .65 * Math.sin(s * Math.PI * 6 / PERIOD);
const elevation = s => 48 + 24 * Math.sin(s * Math.PI * 4 / PERIOD) + 12 * Math.sin(s * Math.PI * 10 / PERIOD);
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
  const pitch = Math.atan(slope), curvature = (heading(s + .5) - heading(s - .5));
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
export function cityObstacles(time, players = [{ z: 0 }]) {
  const distance = time * FLIGHT_SPEED, result = [], seen = new Set();
  for (const player of players) {
    const first = Math.max(0, Math.floor((distance - player.z - 40) / 48));
    for (let section = first; section < first + 7; section++) {
      if (seen.has(section)) continue;
      seen.add(section);
      const z = distance - 68 - section * 48;
      result.push({ id: section * 4, kind: section % 3 === 0 ? 'tower' : 'pole', x: [0, -7, 7, -3, 6][section % 5], z, width: section % 3 === 0 ? 6 : 1.6, depth: section % 3 === 0 ? 7 : 1.6, height: section % 3 === 0 ? 13 : 23 });
      // Solid overhead gates alternate the required clearance: fly below or above.
      if (section % 3 === 2) result.push({ id: section * 4 + 1, kind: 'gate', x: 0, z: z - 18, y: 7 + section % 2 * 7, width: 27, depth: 1.5, height: 2 });
      for (const side of [-1, 1]) result.push({ id: section * 4 + (side < 0 ? 2 : 3), kind: 'pole', x: side * 13.8, z: z - 18, width: 1, depth: 1, height: 29 });
    }
  }
  return result;
}
export function hitsBuilding(player, building, padding = .65) {
  const low = building.kind === 'gate' ? building.y - building.height / 2 : -4;
  const high = building.kind === 'gate' ? building.y + building.height / 2 : building.height - 4;
  return (player.y ?? 0) - padding < high && (player.y ?? 0) + padding > low && Math.abs(player.x - building.x) < building.width / 2 + padding && Math.abs(player.z - building.z) < building.depth / 2 + padding;
}
