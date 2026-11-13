import { cityObstacles, FLIGHT_SPEED, hitsBuilding, worldPosition, courseFrame } from './course.js';

export const DELIVERY_DEADLINE = 90;
const TARGET_LINGER = 0.7;
const RELEASE_LINGER = 0.7;
const RELEASE_LIFE = 16;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function relativeSweep(startA, endA, startB, endB, radii) {
  const start = {
    x: (startA.x - startB.x) / radii.x,
    y: ((startA.y ?? 0) - (startB.y ?? 0)) / radii.y,
    z: (startA.z - startB.z) / radii.z
  };
  const end = {
    x: (endA.x - endB.x) / radii.x,
    y: ((endA.y ?? 0) - (endB.y ?? 0)) / radii.y,
    z: (endA.z - endB.z) / radii.z
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const t = clamp(-(start.x * dx + start.y * dy + start.z * dz) / Math.max(1e-8, dx * dx + dy * dy + dz * dz), 0, 1);
  return Math.hypot(start.x + dx * t, start.y + dy * t, start.z + dz * t) <= 1;
}

const livePilots = players => players.filter(pilot => pilot.active && pilot.hp > 0);

function leadPilot(players) {
  return livePilots(players).reduce((lead, pilot) => !lead || pilot.z < lead.z ? pilot : lead, null) ?? players[0];
}

const courseProgress = (pilot, time) => time * FLIGHT_SPEED - pilot.z;

function routePosition(routeDistance, time) {
  return time * FLIGHT_SPEED - routeDistance;
}

export function deliverySightlineClear(start, end, obstacles, padding = .45) {
  if (![start.x, start.y ?? 0, start.z, end.x, end.y ?? 0, end.z, padding].every(Number.isFinite)) return false;
  const length = Math.hypot(end.x - start.x, (end.y ?? 0) - (start.y ?? 0), end.z - start.z);
  const steps = Math.max(1, Math.ceil(length));
  for (let index = 1; index <= steps; index++) {
    const amount = index / steps;
    const point = {
      x: start.x + (end.x - start.x) * amount,
      y: (start.y ?? 0) + ((end.y ?? 0) - (start.y ?? 0)) * amount,
      z: start.z + (end.z - start.z) * amount
    };
    if (obstacles.some(obstacle => hitsBuilding(point, obstacle, padding))) return false;
  }
  return true;
}

// Check the rendered, banked route too: a target around a bend must not
// acquire the weapon merely because its route-space z is in front.
export function forwardSightlineClear(start, end, obstacles, time, padding = .45) {
  const a = worldPosition(start.x, start.y ?? 0, start.z, time);
  const b = worldPosition(end.x, end.y ?? 0, end.z, time);
  const frame = courseFrame(time * FLIGHT_SPEED - start.z);
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  if ((dx * frame.forward.x + dy * frame.forward.y + dz * frame.forward.z) / Math.max(.001, Math.hypot(dx, dy, dz)) < Math.cos(Math.PI / 5)) return false;
  if (!deliverySightlineClear(start, end, obstacles, padding)) return false;
  // Slab intersection of the actual world-space sight ray and each banked
  // obstacle box; no per-frame mesh raycasts or allocations of Three objects.
  for (const obstacle of obstacles) {
    const f = courseFrame(time * FLIGHT_SPEED - obstacle.z);
    const low = obstacle.kind === 'gate' ? obstacle.y - obstacle.height / 2 : -4;
    const high = obstacle.kind === 'gate' ? obstacle.y + obstacle.height / 2 : obstacle.height - 4;
    const center = worldPosition(obstacle.x, (low + high) / 2, obstacle.z, time);
    let near = 0, far = 1;
    for (const [axis, extent] of [[f.right, obstacle.width / 2], [f.up, (high - low) / 2], [f.forward, obstacle.depth / 2]]) {
      const origin = (a.x - center.x) * axis.x + (a.y - center.y) * axis.y + (a.z - center.z) * axis.z;
      const delta = dx * axis.x + dy * axis.y + dz * axis.z;
      const radius = extent + padding;
      if (Math.abs(delta) < 1e-8) { if (Math.abs(origin) > radius) { far = -1; break; } }
      else {
        const t1 = (-radius - origin) / delta, t2 = (radius - origin) / delta;
        near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
      }
      if (near > far) break;
    }
    if (near <= far) return false;
  }
  return true;
}

// Encounter routes are chosen against the same deterministic collision kit
// used by host and guest. Testing the whole approach ray (plus the target's
// small authored sway) prevents a readable silhouette from being staged
// behind a poster tower even when its final point itself is in open space.
export function clearEncounterAnchor(pilot, time, approach, preferredX, preferredY, { sway = 0, verticalSway = 0, depth = 0, padding = 1, warning = 0 } = {}) {
  const obstacles = cityObstacles(time, [pilot]);
  const xChoices = [...new Set([clamp(preferredX, -10.5, 10.5), clamp(pilot.x, -10.5, 10.5), -10.5, -7, -3.5, 0, 3.5, 7, 10.5])]
    .sort((a, b) => Math.abs(a - preferredX) - Math.abs(b - preferredX));
  const yChoices = [...new Set([clamp(preferredY, 2, 24), clamp((pilot.y ?? 0) + 4, 2, 24), 4, 8, 12, 18, 24])]
    .sort((a, b) => Math.abs(a - preferredY) - Math.abs(b - preferredY));
  // Forecast the short unsteered approach, not just the spawn frame. The
  // route's outward drift can otherwise put a tower across the tell a few
  // frames later. Intentional steering remains the pilot's responsibility.
  const forecasts = [{ pilot: { ...pilot }, time, obstacles }];
  if (warning > 0) {
    const predicted = { ...pilot, vx: pilot.vx ?? 0, boost: pilot.boost ?? 0 };
    const step = 1 / 30;
    for (let elapsed = step; elapsed <= warning + step / 2; elapsed += step) {
      const futureTime = time + elapsed;
      const curve = courseFrame(futureTime * FLIGHT_SPEED - predicted.z).curvature;
      const drift = -curve * (FLIGHT_SPEED + predicted.boost) ** 2 * .16;
      predicted.vx += (drift - predicted.vx) * (1 - Math.exp(-step * 10));
      predicted.x = clamp(predicted.x + predicted.vx * step, -12.85, 12.85);
      predicted.z -= predicted.boost * step;
      // Cover descent during a tell; an already-climbing pilot can still
      // choose the high lane, but is never required to keep climbing.
      predicted.y = Math.max(0, (pilot.y ?? 0) - Math.max(0, -(pilot.vy ?? 0)) * elapsed);
      if (Math.round(elapsed / step) % 6 === 0 || elapsed + step > warning) {
        forecasts.push({ pilot: { ...predicted }, time: futureTime, obstacles: cityObstacles(futureTime, [predicted]) });
      }
    }
  }
  for (const distance of [...new Set([approach, approach - 15, approach - 30, 55, 40])]) {
    if (warning && distance < (FLIGHT_SPEED + (pilot.boost ?? 0)) * warning + 12) continue;
    for (const y of yChoices) {
      for (const x of xChoices) {
        let clear = true;
        for (const forecast of forecasts) {
          for (const xOffset of new Set([-sway, 0, sway])) {
            for (const yOffset of new Set([-verticalSway, verticalSway])) {
              for (const zOffset of new Set([0, depth])) {
                const end = { x: clamp(x + xOffset, -11, 11), y: clamp(y + yOffset, 1.5, 24), z: pilot.z - distance - zOffset + (forecast.time - time) * FLIGHT_SPEED };
                if (!forwardSightlineClear(forecast.pilot, end, forecast.obstacles, forecast.time, padding)) { clear = false; break; }
              }
              if (!clear) break;
            }
            if (!clear) break;
          }
          if (!clear) break;
        }
        if (clear) return { approach: distance, x, y };
      }
    }
  }
  // Keep the city intact; defer an encounter if this bend has no clear lane.
  return null;
}

export function createDeliveryState(endless = false) {
  return {
    phase: 'intro',
    endless, nextEncounter: 5, encounterSerial: 0, bag: [], event: 'LASERS AUTO-FIRE · break amber orbs · collect diamond upgrades', district: 0, postcards: [], deliveries: 0,
    elapsed: 0,
    deadline: DELIVERY_DEADLINE,
    recovered: 0,
    bulbs: 0,
    repaired: 0,
    delivered: 0,
    restored: false,
    grade: null,
    completed: false,
    success: null,
    completedAt: null,
    result: null,
    rack: [{ letters: 0, bulbs: 0 }, { letters: 0, bulbs: 0 }],
    targets: [],
    releases: [],
    destination: null,
    milestones: { moths: [false, false, false], parcels: false, crab: false, destination: false }
  };
}

function targetBase(id, kind, encounter, pilot, time, approach, xOffset, yOffset, radius) {
  const routeDistance = courseProgress(pilot, time) + approach;
  const baseX = clamp(pilot.x + xOffset, -10.5, 10.5);
  const baseY = clamp((pilot.y ?? 0) + yOffset, 2, 23);
  return {
    id,
    kind,
    encounter,
    x: baseX,
    y: baseY,
    z: routePosition(routeDistance, time),
    r: radius,
    hp: 1,
    maxHp: 1,
    routeDistance,
    spawnedAt: time,
    stage: kind === 'moth' ? 'folded' : kind === 'parcel' ? 'sealed' : 'guarded',
    open: false,
    vulnerable: false,
    tell: 0,
    completedAt: null,
    baseX,
    baseY
  };
}

function spawnMoth(delivery, players, time, index) {
  const pilot = leadPilot(players);
  const offsets = [-2, 2, 0];
  const heights = [0, 1, 0];
  // Fast pilots need more warning distance; ordinary cruise uses the nearer
  // clear block gap so the first moth appears before, rather than behind, the
  // market poster tower that previously swallowed its entire tell.
  const approach = pilot.boost > 40 ? 105 : 90;
  const anchor = clearEncounterAnchor(pilot, time, approach, pilot.x + offsets[index], (pilot.y ?? 0) + heights[index], { sway: .7, verticalSway: .75, warning: pilot.boost > 40 ? 1.1 : 1.8 });
  if (!anchor) return;
  const target = targetBase(`mail-moth-${index + 1}`, 'moth', `moth-${index + 1}`, pilot, time, anchor.approach, anchor.x - pilot.x, anchor.y - (pilot.y ?? 0), 2.45);
  target.swoop = index % 2 ? -1 : 1;
  target.tellRate = pilot.boost > 40 ? 1.9 : 1;
  delivery.targets.push(target);
  delivery.milestones.moths[index] = true;
}

function spawnParcels(delivery, players, time) {
  const pilot = leadPilot(players);
  const chainLength = 4;
  const preferredX = pilot.x * .65;
  const anchor = clearEncounterAnchor(pilot, time, 100, preferredX, (pilot.y ?? 0) + 1, { sway: 3.5, verticalSway: 1.55, depth: (chainLength - 1) * 7, warning: 1.3 });
  if (!anchor) return;
  const base = targetBase('mail-parcel-1', 'parcel', 'parcel-train', pilot, time, anchor.approach, anchor.x - pilot.x, anchor.y - (pilot.y ?? 0), 1.5);
  for (let index = 0; index < chainLength; index++) {
    const target = {
      ...base,
      id: `mail-parcel-${index + 1}`,
      routeDistance: base.routeDistance + index * 7,
      z: routePosition(base.routeDistance + index * 7, time),
      baseX: clamp(base.baseX + Math.sin(index * 1.7) * 2.8, -10.5, 10.5),
      baseY: clamp(base.baseY + Math.cos(index * 1.4) * 1.2, 2, 23),
      chainIndex: index,
      chainLength,
      triggerAt: null
    };
    target.x = target.baseX;
    target.y = target.baseY;
    delivery.targets.push(target);
  }
  delivery.milestones.parcels = true;
}

function spawnCrab(delivery, players, time) {
  const pilot = leadPilot(players);
  const preferredX = pilot.x + (pilot.x > 0 ? -5 : 5);
  const anchor = clearEncounterAnchor(pilot, time, pilot.boost > 40 ? 165 : 110, preferredX, (pilot.y ?? 0) + 2, { warning: 2 });
  if (!anchor) return;
  const target = targetBase('mail-crab-1', 'crab', 'sign-crab', pilot, time, anchor.approach, anchor.x - pilot.x, anchor.y - (pilot.y ?? 0), 2.1);
  target.repairAt = null;
  delivery.targets.push(target);
  delivery.milestones.crab = true;
}

function spawnDestination(delivery, players, time) {
  const pilot = leadPilot(players);
  // Normal play always cruises. At the combined route/cruise closing speed,
  // this places the shop about twelve seconds away while still letting boost
  // produce an earlier, earned arrival.
  const routeDistance = courseProgress(pilot, time) + (FLIGHT_SPEED + 25) * 12;
  delivery.destination = {
    id: 'mail-destination',
    shop: 'nightjar-radio',
    x: clamp(pilot.x * .25, -4, 4),
    y: clamp((pilot.y ?? 0) * .35 + 3, 3, 10),
    z: routePosition(routeDistance, time),
    r: 12,
    routeDistance,
    spawnedAt: time,
    open: true,
    deliveredAt: null,
    failedAt: null
  };
  delivery.milestones.destination = true;
}

function addRelease(delivery, target, kind, suffix, time, xOffset = 0, yOffset = 0) {
  const id = `${target.id}-${suffix}`;
  if (delivery.releases.some(release => release.id === id)) return;
  delivery.releases.push({
    id,
    kind,
    sourceId: target.id,
    x: target.x + xOffset,
    y: target.y + yOffset,
    z: target.z,
    r: kind === 'bulb' ? 1.05 : 0.85,
    life: RELEASE_LIFE,
    routeDistance: time * FLIGHT_SPEED - target.z,
    spawnedAt: time,
    collectedAt: null,
    collectedBy: null
  });
}

function updateMoth(target, time) {
  if (target.completedAt !== null) {
    target.stage = 'released';
    target.open = true;
    target.vulnerable = false;
    target.tell = 1;
    return;
  }
  const age = time - target.spawnedAt;
  const tellAge = age * (target.tellRate ?? 1);
  target.x = clamp(target.baseX + Math.sin(age * 1.6) * .65 * target.swoop, -11, 11);
  target.y = clamp(target.baseY + Math.sin(age * 2.2) * .75, 1.5, 24);
  if (tellAge < .65) {
    target.stage = 'folded'; target.open = false; target.vulnerable = false; target.tell = clamp(tellAge / .65, 0, 1);
  } else if (tellAge < 1.45) {
    target.stage = 'opening'; target.open = true; target.vulnerable = false; target.tell = clamp((tellAge - .65) / .8, 0, 1);
  } else {
    target.stage = 'exposed'; target.open = true; target.vulnerable = true; target.tell = 1;
  }
}

function updateParcel(delivery, target, time, callbacks) {
  target.x = clamp(target.baseX + Math.sin((time - target.spawnedAt) * .8 + target.chainIndex * .7) * .7, -11, 11);
  target.y = clamp(target.baseY + Math.sin((time - target.spawnedAt) * 1.4 + target.chainIndex) * .35, 1.5, 24);
  if (target.completedAt !== null) {
    target.stage = 'released'; target.open = true; target.vulnerable = false; target.tell = 1;
    return;
  }
  if (target.triggerAt !== null) {
    target.stage = 'opening'; target.open = true; target.vulnerable = false;
    target.tell = clamp(1 - (target.triggerAt - time) / .18, 0, 1);
    if (time >= target.triggerAt) {
      target.hp = 0;
      target.completedAt = time;
      target.stage = 'released';
      target.tell = 1;
      addRelease(delivery, target, 'letter', 'letter', time, (target.chainIndex % 2 ? 1 : -1) * .55, .35);
      callbacks.score?.(75);
      callbacks.effect?.(target.x, target.z, 'coral', target.y);
    }
    return;
  }
  const age = time - target.spawnedAt;
  const lead = target.chainIndex === 0;
  target.stage = lead && age < .9 ? 'opening' : 'sealed';
  target.open = lead;
  target.vulnerable = lead && age >= .9;
  target.tell = lead ? clamp(age / .9, 0, 1) : 0;
}

function updateCrab(target, time, callbacks, delivery) {
  if (target.completedAt !== null) {
    target.stage = 'repaired'; target.open = true; target.vulnerable = false; target.tell = 1;
    return;
  }
  if (target.repairAt !== null) {
    target.stage = 'repairing'; target.open = true; target.vulnerable = false;
    target.tell = clamp(1 - (target.repairAt - time) / .55, 0, 1);
    if (time >= target.repairAt) {
      target.hp = 0;
      target.completedAt = time;
      target.stage = 'repaired';
      delivery.repaired++;
      if (delivery.endless) delivery.event = 'SIGN REPAIRED · +250 · collect the released bulb';
      addRelease(delivery, target, 'bulb', 'repair-bulb', time, 0, -.5);
      callbacks.score?.(250);
      callbacks.effect?.(target.x, target.z, 'cyan', target.y);
    }
    return;
  }
  const age = time - target.spawnedAt;
  if (age < .9) {
    target.stage = 'guarded'; target.open = false; target.vulnerable = false; target.tell = clamp(age / .9, 0, 1);
  } else if (age < 1.75) {
    target.stage = 'opening'; target.open = true; target.vulnerable = false; target.tell = clamp((age - .9) / .85, 0, 1);
  } else {
    target.stage = 'exposed'; target.open = true; target.vulnerable = true; target.tell = 1;
  }
}

function timelinePhase(delivery, time) {
  if (delivery.completed) return delivery.success ? 'complete' : 'failed';
  if ((delivery.destination && (delivery.destination.deliveredAt !== null || delivery.destination.failedAt !== null)) || time >= 75) return 'arrival';
  if (time < 8) return 'intro';
  if (time < 26) return 'moths';
  if (time < 34 || (time >= 52 && time < 60)) return 'recovery';
  if (time < 52) return 'parcels';
  return 'crab';
}

// Advances authored positions and tells before weapons are selected. The
// returned starts let later contact checks sweep both moving participants.
export function advanceDelivery(delivery, { time, dt, players, callbacks = {} }) {
  delivery.elapsed = time;
  const releaseStarts = new Map(delivery.releases.map(release => [release.id, { x: release.x, y: release.y, z: release.z }]));
  const targetStarts = new Map(delivery.targets.map(target => [target.id, { x: target.x, y: target.y, z: target.z }]));
  const destinationStart = delivery.destination ? { x: delivery.destination.x, y: delivery.destination.y, z: delivery.destination.z } : null;

  if (delivery.endless) {
    const lead = leadPilot(players);
    delivery.targets = delivery.targets.filter(target => target.z < lead.z + 28);
    delivery.releases = delivery.releases.filter(release => release.z < lead.z + 28);
    if (time >= delivery.nextEncounter) spawnRoamingEncounter(delivery, players, time, callbacks.random ?? Math.random);
    if (delivery.destination && time - delivery.destination.spawnedAt > 20) {
      delivery.destination = null; delivery.restored = false;
    }
  } else {
  if (time >= (delivery.nextPlacement ?? 0)) {
  delivery.nextPlacement = time + .25;
  const mothTimes = [8, 15, 22];
  for (let index = 0; index < mothTimes.length; index++) {
    if (!delivery.milestones.moths[index] && time >= mothTimes[index]) spawnMoth(delivery, players, time, index);
  }
  if (!delivery.milestones.parcels && time >= 34) spawnParcels(delivery, players, time);
  if (!delivery.milestones.crab && time >= 60) spawnCrab(delivery, players, time);
  if (!delivery.milestones.destination && time >= 75) spawnDestination(delivery, players, time);
  }

  }

  for (const target of delivery.targets) {
    if (target.kind === 'sorter' && target.completedAt === null) target.routeDistance += dt * 18;
    target.z = routePosition(target.routeDistance, time);
    if (target.kind === 'moth') updateMoth(target, time);
    else if (target.kind === 'parcel') updateParcel(delivery, target, time, callbacks);
    else if (target.kind === 'sorter') updateSorter(delivery, target, time, callbacks);
    else updateCrab(target, time, callbacks, delivery);
  }
  for (const release of delivery.releases) {
    if (release.collectedAt !== null) continue;
    release.z = routePosition(release.routeDistance, time);
    release.life -= dt;
  }
  if (delivery.destination) delivery.destination.z = routePosition(delivery.destination.routeDistance, time);
  delivery.phase = delivery.endless ? 'roaming' : timelinePhase(delivery, time);
  return { releaseStarts, targetStarts, destinationStart };
}

export function deliveryAimTargets(delivery, pilot = null) {
  return delivery?.targets.filter(target => target.vulnerable && target.completedAt === null && target.hp > 0
    // The sign crab is an optional high-line repair. Its socket remains a
    // normal physical hit target, but assisted fire only acquires it after the
    // courier genuinely climbs into the generous vertical work lane.
    && (target.kind !== 'crab' || !pilot || Math.abs((target.y ?? 0) - (pilot.y ?? 0)) <= 4)) ?? [];
}

function releaseMoth(delivery, target, time, callbacks) {
  target.hp = 0;
  target.completedAt = time;
  target.stage = 'released';
  target.vulnerable = false;
  addRelease(delivery, target, 'letter', 'letter', time, -.55, .25);
  addRelease(delivery, target, 'bulb', 'bulb', time, .65, -.1);
  callbacks.score?.(100);
  callbacks.effect?.(target.x, target.z, 'gold', target.y);
}

function triggerParcelTrain(delivery, target, time, callbacks) {
  const encounter = target.encounter;
  for (const parcel of delivery.targets.filter(target => target.kind === 'parcel' && target.encounter === encounter && target.completedAt === null)) {
    parcel.triggerAt = time + parcel.chainIndex * .18;
    parcel.stage = 'opening';
    parcel.open = true;
    parcel.vulnerable = false;
  }
  callbacks.effect?.(delivery.targets.find(target => target.kind === 'parcel' && target.chainIndex === 0)?.x ?? 0,
    delivery.targets.find(target => target.kind === 'parcel' && target.chainIndex === 0)?.z ?? 0, 'coral',
    delivery.targets.find(target => target.kind === 'parcel' && target.chainIndex === 0)?.y ?? 0);
}

// Shots use a relative sweep against the moving target, rather than testing
// only the end positions. A single shot can trigger at most one interaction.
export function hitDeliveryTargets(delivery, { bullets, bulletStarts, targetStarts, time, callbacks = {} }) {
  const targets = deliveryAimTargets(delivery);
  for (const bullet of bullets) {
    if (bullet.life <= 0) continue;
    const bulletStart = bulletStarts.get(bullet.id) ?? bullet;
    for (const target of targets) {
      if (!target.vulnerable || target.completedAt !== null) continue;
      const targetStart = targetStarts.get(target.id) ?? target;
      const radius = target.r + .25;
      if (!relativeSweep(bulletStart, bullet, targetStart, target, { x: radius, y: radius, z: radius })) continue;
      bullet.life = 0;
      if (target.kind === 'moth') releaseMoth(delivery, target, time, callbacks);
      else if (target.kind === 'parcel') triggerParcelTrain(delivery, target, time, callbacks);
      else if (target.kind === 'sorter') {
        target.drawers++;
        target.vulnerable = false; target.nextDrawer = time + .4;
        addRelease(delivery, target, 'letter', `drawer-${target.drawers}`, time);
        callbacks.score?.(150); callbacks.effect?.(target.x, target.z, 'gold', target.y);
        if (target.drawers >= 3) { target.completedAt = time; target.stage = 'stamped'; delivery.repaired++; }
      } else {
        target.repairAt = time + .55;
        target.stage = 'repairing';
        target.vulnerable = false;
        target.tell = 0;
      }
      break;
    }
  }
}

function collectRelease(delivery, release, pilot, time, callbacks) {
  if (release.collectedAt !== null) return;
  release.collectedAt = time;
  release.collectedBy = pilot.id;
  if (release.kind === 'letter') {
    delivery.recovered++;
    delivery.rack[pilot.id].letters++;
  } else {
    delivery.bulbs++;
    delivery.rack[pilot.id].bulbs++;
  }
  callbacks.score?.(release.kind === 'letter' ? 50 : 35);
  callbacks.effect?.(release.x, release.z, release.kind === 'letter' ? 'coral' : 'gold', release.y);
}

function gradeFor(delivery) {
  if (delivery.recovered >= 7 && delivery.bulbs >= 3 && delivery.repaired >= 1) return 'S';
  if (delivery.recovered >= 5 && delivery.bulbs >= 2) return 'A';
  if (delivery.recovered >= 3) return 'B';
  return 'C';
}

// Collection and arrival are swept in relative space, so boost, altitude
// changes and a moving route object cannot tunnel through a one-tick overlap.
export function collectDelivery(delivery, { players, playerStarts, releaseStarts, destinationStart, time, dt, callbacks = {} }) {
  for (const release of delivery.releases) {
    if (release.collectedAt !== null || release.life <= 0) continue;
    for (const pilot of livePilots(players)) {
      const pilotStart = playerStarts[pilot.id] ?? pilot;
      const releaseStart = releaseStarts.get(release.id) ?? release;
      const radius = release.r + 1.8;
      const crossed = relativeSweep(pilotStart, pilot, releaseStart, release, { x: radius, y: radius, z: radius });
      const nearby = Math.hypot(pilot.x - release.x, (pilot.y ?? 0) - release.y, pilot.z - release.z) < 7;
      if (nearby && !crossed) {
        const pull = 1 - Math.exp(-dt * 5);
        release.x += (pilot.x - release.x) * pull;
        release.y += ((pilot.y ?? 0) - release.y) * pull;
        release.z += (pilot.z - release.z) * pull;
        release.routeDistance = time * FLIGHT_SPEED - release.z;
      }
      if (crossed || Math.hypot(pilot.x - release.x, (pilot.y ?? 0) - release.y, pilot.z - release.z) <= radius) {
        collectRelease(delivery, release, pilot, time, callbacks);
        break;
      }
    }
  }

  const destination = delivery.destination;
  if (!destination || destination.deliveredAt !== null || destination.failedAt !== null) return;
  const start = destinationStart ?? destination;
  for (const pilot of livePilots(players)) {
    const pilotStart = playerStarts[pilot.id] ?? pilot;
    if (!relativeSweep(pilotStart, pilot, start, destination, { x: 12, y: 14, z: delivery.endless ? 55 : 13 })) continue;
    if ((delivery.endless ? delivery.rack.reduce((sum, rack) => sum + rack.letters, 0) : delivery.recovered) > 0) {
      destination.deliveredAt = time;
      delivery.delivered = delivery.endless ? delivery.delivered + delivery.rack.reduce((sum, rack) => sum + rack.letters, 0) : delivery.recovered;
      delivery.restored = true;
      delivery.grade = gradeFor(delivery);
      delivery.success = true;
      if (delivery.endless) {
        delivery.deliveries++;
        const card = ['Nightjar Radio', 'Comet Coffee', 'Moss & Moon'][delivery.district];
        if (!delivery.postcards.includes(card)) delivery.postcards.push(card);
        delivery.event = `${card} restored · postcard collected`;
        delivery.nextEncounter = Math.max(delivery.nextEncounter, time + 7);
      }
      delivery.rack.forEach(rack => { rack.letters = 0; rack.bulbs = 0; });
      callbacks.score?.(500 + delivery.delivered * 100);
      callbacks.effect?.(destination.x, destination.z, 'cyan', destination.y);
    } else {
      destination.failedAt = time;
      delivery.success = false;
    }
    delivery.phase = 'arrival';
    break;
  }
}

function finish(delivery, time, success, reason) {
  delivery.success = success;
  delivery.completed = true;
  delivery.completedAt = time;
  delivery.phase = success ? 'complete' : 'failed';
  delivery.result = {
    success,
    reason,
    recovered: delivery.recovered,
    bulbs: delivery.bulbs,
    repaired: delivery.repaired,
    delivered: delivery.delivered,
    grade: delivery.grade
  };
}

export function finishDelivery(delivery, { time, allPilotsLost = false }) {
  delivery.targets = delivery.targets.filter(target => target.completedAt === null
    ? target.z < 45
    : time - target.completedAt <= (target.kind === 'crab' || target.kind === 'sorter' ? 2.5 : TARGET_LINGER));
  delivery.releases = delivery.releases.filter(release => release.collectedAt === null
    ? release.life > 0 && release.z < 45
    : time - release.collectedAt <= RELEASE_LINGER);

  if (delivery.endless) return allPilotsLost;
  if (delivery.completed) return true;
  if (allPilotsLost) {
    finish(delivery, time, false, 'lost');
    return true;
  }
  if (delivery.success) {
    if (time >= Math.max(DELIVERY_DEADLINE, (delivery.destination?.deliveredAt ?? time) + 3)) {
      finish(delivery, time, true, 'delivered');
      return true;
    }
    return false;
  }
  if (time >= DELIVERY_DEADLINE) {
    finish(delivery, time, false, delivery.destination?.failedAt !== null ? 'no-mail' : 'deadline');
    return true;
  }
  return false;
}

// A shuffled bag guarantees every phrase while varying order and quiet spacing.
// Only the host samples randomness; snapshots carry all stable encounter IDs.
function spawnRoamingEncounter(delivery, players, time, random) {
  if (!delivery.bag.length) {
    delivery.bag = ['moth', 'parcel', 'crab', 'sorter'];
    for (let i = delivery.bag.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(random() * (i + 1)));
      [delivery.bag[i], delivery.bag[j]] = [delivery.bag[j], delivery.bag[i]];
    }
  }
  const kind = delivery.bag.pop();
  const before = delivery.targets.length;
  if (kind === 'moth') spawnMoth(delivery, players, time, delivery.encounterSerial % 3);
  if (kind === 'parcel') spawnParcels(delivery, players, time);
  if (kind === 'crab') spawnCrab(delivery, players, time);
  if (kind === 'sorter') {
    const pilot = leadPilot(players);
    const anchor = clearEncounterAnchor(pilot, time, pilot.boost > 40 ? 165 : 110, pilot.x, (pilot.y ?? 0) + 1, { sway: .8, warning: 2 });
    if (!anchor) { delivery.bag.push(kind); delivery.nextEncounter = time + 2; return; }
    const target = targetBase('sorter', 'sorter', 'night-sorter', pilot, time, anchor.approach, anchor.x - pilot.x, anchor.y - (pilot.y ?? 0), 3.4);
    target.drawers = 0; target.nextDrawer = time + 1; delivery.targets.push(target);
  }
  if (delivery.targets.length === before) { delivery.bag.push(kind); delivery.nextEncounter = time + 2; return; }
  delivery.encounterSerial++;
  for (const target of delivery.targets.slice(before)) {
    target.id += `-event-${delivery.encounterSerial}`;
    target.encounter += `-event-${delivery.encounterSerial}`;
  }
  delivery.event = { moth: 'STATIC MOTH · align with the glowing chest', parcel: 'PARCEL TRAIN · aim at the first seal', crab: 'SIGN CRAB · climb to its cyan socket · laser repairs the sign', sorter: 'NIGHT SORTER · open three glowing drawers' }[kind];
  delivery.nextEncounter = time + 15 + random() * 5;
  if (delivery.encounterSerial % 4 === 0 && !delivery.destination) {
    delivery.district = Math.floor(delivery.encounterSerial / 4 - 1) % 3;
    spawnDestination(delivery, players, time);
    delivery.destination.shop = ['nightjar-radio', 'comet-coffee', 'moss-moon'][delivery.district];
    delivery.restored = false; delivery.success = null;
  }
}
function updateSorter(delivery, target, time, callbacks) {
  if (target.completedAt !== null) { target.stage = 'stamped'; target.vulnerable = false; return; }
  target.x = target.baseX + Math.sin((time - target.spawnedAt) * .65) * .8;
  target.open = true; target.tell = 1;
  target.vulnerable = time >= target.nextDrawer;
  target.stage = target.vulnerable ? 'sorting' : 'opening';
}
