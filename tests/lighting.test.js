import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LIGHTING_PRESET_OPTIONS, localLighting, normalizeLightingPreset } from '../src/lib/game/atmosphere.js';
import { prepareSurfaceGeometry, SURFACE } from '../src/lib/game/surfaces.js';

const at = (hour, minute = 0) => new Date(2026, 6, 10, hour, minute);
test('local civil time gives readable noon, night and continuous dawn/dusk', () => {
  assert.equal(localLighting(at(12)).day, 1);
  assert.equal(localLighting(at(0)).night, 1);
  assert.ok(localLighting(at(6)).day > 0 && localLighting(at(6)).day < 1);
  for (const hour of [6, 18]) {
    const a = localLighting(at(hour - 1, 59)), b = localLighting(at(hour));
    assert.ok(Math.abs(a.day - b.day) < .04);
  }
  for (let hour = 0; hour < 24; hour++) {
    const light = localLighting(at(hour));
    assert.ok(light.direction.every(Number.isFinite));
    assert.equal(light.day + light.night, 1);
  }
});

test('lighting presets use fixed local civil hours and reject unknown storage values', () => {
  assert.deepEqual(LIGHTING_PRESET_OPTIONS.map(option => option.label), ['Auto', 'Dawn', 'Day', 'Golden hour', 'Night']);
  assert.equal(normalizeLightingPreset('not-a-preset'), 'auto');
  const morning = localLighting(at(2), 'dawn');
  const noon = localLighting(at(23, 45), 'day');
  const golden = localLighting(at(2), 'golden');
  const night = localLighting(at(13), 'night');
  assert.equal(morning.hour, 6);
  assert.equal(noon.hour, 12);
  assert.equal(golden.hour, 18);
  assert.equal(night.hour, 0);
  assert.equal(morning.preset, 'dawn');
  assert.equal(noon.preset, 'day');
  assert.equal(golden.preset, 'golden');
  assert.equal(night.preset, 'night');
  assert.equal(localLighting(at(12), 'not-a-preset').preset, 'auto');
});

test('surface face coordinates preserve physical dimensions through baking', () => {
  const geometry = prepareSurfaceGeometry(new THREE.BoxGeometry(8, 12, 24), SURFACE.brick, .7);
  const coords = Array.from(geometry.attributes.surfaceUv.array);
  assert.ok(Math.max(...coords) >= 12, 'long wall must repeat in physical units');
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationZ(.5));
  assert.deepEqual(Array.from(geometry.attributes.surfaceUv.array), coords);
  for (let i = 0; i < geometry.attributes.surfaceData.count; i++) {
    assert.equal(geometry.attributes.surfaceData.getX(i), SURFACE.brick);
    assert.ok(Math.abs(geometry.attributes.surfaceData.getY(i) - .7) < 1e-6);
  }
  geometry.dispose();
});
