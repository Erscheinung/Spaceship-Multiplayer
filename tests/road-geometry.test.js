import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoad, ROAD_SUPPORT } from '../src/lib/game/road.js';
import { courseFrame } from '../src/lib/game/course.js';

const vectorAt = (attribute, vertex) => ({
  x: attribute.getX(vertex), y: attribute.getY(vertex), z: attribute.getZ(vertex)
});
const close = (a, b, epsilon = 1e-4) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= epsilon;
function expectedPoint(frame, x, y) {
  return {
    x: frame.x + frame.right.x * x + frame.up.x * y,
    y: frame.y + frame.right.y * x + frame.up.y * y,
    z: frame.z + frame.right.z * x + frame.up.z * y
  };
}
function supportMesh(section) {
  const scene = { children: [], add(object) { this.children.push(object); } };
  const update = createRoad(scene);
  update(section);
  return scene.children.find(object => object.userData.roadSupport);
}

test('rolling foundation spans road, sidewalks and property frontage at route grade', () => {
  const section = 700, segment = section, slot = ((segment % 160) + 160) % 160;
  const distance = segment * 2 + 1, frame = courseFrame(distance);
  // The curb and sidewalk reach x=17.9; the widest property bases reach
  // x=27.8. Keep the ribbon underneath both as districts recycle.
  assert.ok(ROAD_SUPPORT.extent > 17.9, 'foundation must extend beneath the sidewalk');
  assert.ok(ROAD_SUPPORT.extent > 27.8, 'foundation must extend beneath the outer property footings');
  const support = supportMesh(section);
  const positions = support.geometry.getAttribute('position');
  const start = slot * 6;
  assert.ok(close(vectorAt(positions, start), expectedPoint(frame, -ROAD_SUPPORT.extent, ROAD_SUPPORT.height)));
  assert.ok(close(vectorAt(positions, start + 1), expectedPoint(frame, ROAD_SUPPORT.extent, ROAD_SUPPORT.height)));
  const normals = support.geometry.getAttribute('normal');
  for (let i = 0; i < 6; i++) {
    const normal = vectorAt(normals, start + i);
    assert.ok(normal.x * frame.up.x + normal.y * frame.up.y + normal.z * frame.up.z > 0.98);
  }
});

test('recycled foundation remains continuous through bends, hills, period seam and long boosts', () => {
  const scene = { children: [], add(object) { this.children.push(object); } };
  const update = createRoad(scene);
  const support = scene.children.find(object => object.userData.roadSupport);
  const positions = support.geometry.getAttribute('position');
  for (const section of [0, 421, 900, 1064, 12000]) {
    update(section);
    const firstSegment = section - 18, lastSegment = firstSegment + 160 - 1;
    const slot = segment => ((segment % 160) + 160) % 160;
    for (let segment = firstSegment; segment < lastSegment; segment++) {
      const current = slot(segment) * 6, next = slot(segment + 1) * 6;
      assert.ok(close(vectorAt(positions, current + 2), vectorAt(positions, next)));
      assert.ok(close(vectorAt(positions, current + 4), vectorAt(positions, next + 1)));
    }
    const uv = support.geometry.getAttribute('surfaceUv');
    assert.ok(uv.array.every(Number.isFinite));
  }
});

test('wide route foundation offsets stay ordered and forward-facing over the full course', () => {
  let maxGrade = 0, maxBank = 0, minForwardProgress = Infinity, minSideSeparation = Infinity;
  const offsetPoint = (distance, x) => {
    const frame = courseFrame(distance);
    return expectedPoint(frame, x, ROAD_SUPPORT.height);
  };
  for (let distance = 0; distance <= 3600; distance += 2) {
    const frame = courseFrame(distance);
    maxGrade = Math.max(maxGrade, Math.abs(frame.forward.y));
    maxBank = Math.max(maxBank, Math.abs(frame.bank));
    const left = offsetPoint(distance, -ROAD_SUPPORT.extent);
    const leftNext = offsetPoint(distance + 2, -ROAD_SUPPORT.extent);
    const right = offsetPoint(distance, ROAD_SUPPORT.extent);
    const forward = { x: leftNext.x - left.x, y: leftNext.y - left.y, z: leftNext.z - left.z };
    minForwardProgress = Math.min(minForwardProgress, forward.x * frame.forward.x + forward.y * frame.forward.y + forward.z * frame.forward.z);
    minSideSeparation = Math.min(minSideSeparation, (right.x - left.x) * frame.right.x + (right.y - left.y) * frame.right.y + (right.z - left.z) * frame.right.z);
  }
  assert.ok(maxGrade > 0.1 && maxBank > 0.3, 'samples should include steep, banked route sections');
  assert.ok(minForwardProgress > 0.5, 'offset strips must not reverse/fold along a turn');
  assert.ok(minSideSeparation > ROAD_SUPPORT.extent * 1.9, 'left/right foundation edges must stay ordered');
});
