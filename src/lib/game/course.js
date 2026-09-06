// Shared, deterministic city geometry. Coordinates stay in the host's flight frame.
export const FLIGHT_SPEED = 14;
export const roadCenter = distance => Math.sin(distance / 105) * 13 + Math.sin(distance / 237) * 9;
export const worldX = (x, z, time) => x + roadCenter(time * FLIGHT_SPEED - z);
export function cityObstacles(time) {
  const distance = time * FLIGHT_SPEED;
  const first = Math.max(0, Math.floor((distance - 100) / 64));
  const result = [];
  for (let id = first; id < first + 6; id++) {
    const z = distance - 68 - id * 64;
    if (z < -240 || z > 32) continue;
    result.push({ id, x: [0, -7, 7, -3, 6][id % 5], z, width: id % 2 ? 6 : 7, depth: 7, height: 11 + id % 3 * 3 });
  }
  return result;
}
export function hitsBuilding(player, building, padding = 0.65) {
  return Math.abs(player.x - building.x) < building.width / 2 + padding && Math.abs(player.z - building.z) < building.depth / 2 + padding;
}
