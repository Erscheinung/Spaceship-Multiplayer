import test from 'node:test';
import assert from 'node:assert/strict';
import { TiltInput } from '../src/lib/game/TiltInput.js';

test('tilt maps both landscape rotations and resets neutral after rotation', () => {
  const previous = globalThis.window;
  globalThis.window = { screen: { orientation: { angle: 90 } } };
  try {
    let value;
    const tilt = new TiltInput(v => value = v);
    tilt.enabled = true;
    tilt.onOrientation({ beta: 0, gamma: 45 });
    tilt.onOrientation({ beta: 20, gamma: 45 });
    assert.ok(value.x > 0);
    window.screen.orientation.angle = 270;
    tilt.onOrientation({ beta: 0, gamma: 45 });
    assert.equal(value.x, 0);
    tilt.onOrientation({ beta: 20, gamma: 45 });
    assert.ok(value.x < 0);
  } finally { globalThis.window = previous; }
});
