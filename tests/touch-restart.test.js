import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual page handlers with a held finger surviving the old run.
const page = readFileSync(new URL('../src/routes/+page.svelte', import.meta.url), 'utf8');
const handler = name => {
  const start = page.indexOf(`  function ${name}(`);
  const rest = page.slice(start);
  const end = rest.slice(1).search(/\n  (?:async )?function /);
  return end < 0 ? rest : rest.slice(0, end + 1);
};

test('Play Again clears stale pointer ownership and accepts a new steering finger', () => {
  const context = vm.createContext({
    engine: { touch: { x: 1, z: 1 }, actions: { boost: true, lift: true }, start() {} },
    steeringPointer: 7, steeringBoost: true, boostHeld: true, liftHeld: true,
    stick: { x: 1, z: 1 }, paused: false, controlMode: 'drag', sensitivity: 1,
    host: true, solo: true, network: null, tilt: null, document: { hidden: false },
    clearDamageFeedback() {}
  });
  vm.runInContext(['releaseFlightControls', 'start', 'touchMove', 'releaseSteering'].map(handler).join('\n'), context);
  vm.runInContext('start({})', context);
  assert.equal(context.steeringPointer, null);
  assert.equal(context.engine.actions.boost, false);
  assert.equal(context.engine.actions.lift, false);
  const target = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 104, height: 104 }), setPointerCapture() {} };
  context.touchMove({ pointerId: 12, clientX: 140, clientY: 52, currentTarget: target, preventDefault() {} });
  assert.equal(context.steeringPointer, 12);
  assert.equal(context.engine.touch.x, 1);
  assert.equal(context.engine.actions.boost, true);
  context.releaseSteering({ pointerId: 7 }); // A late event from the previous run must not clear the new finger.
  assert.equal(context.steeringPointer, 12);
  context.releaseSteering({ pointerId: 12 });
  assert.equal(context.engine.touch.x, 0);
  assert.equal(context.engine.actions.boost, false);
});
