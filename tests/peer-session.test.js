import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { flightSettings, SHIP_COLORS } from '../src/lib/game/settings.js';

const source = readFileSync(new URL('../src/lib/net/PeerSession.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function', 'function')
  .replace('export class PeerSession', 'globalThis.PeerSession = class PeerSession');

function setup() {
  const timers = new Map(); let id = 0;
  const schedule = (fn, delay) => { timers.set(++id, { fn, delay }); return id; };
  const context = vm.createContext({ flightSettings, SHIP_COLORS, env: {},
    AbortSignal, Date, crypto, setTimeout: schedule, setInterval: schedule,
    clearTimeout: n => timers.delete(n), clearInterval: n => timers.delete(n),
    fetch: async () => ({ ok: true, json: async () => ({ iceServers: [] }) })
  });
  vm.runInContext(source, context);
  const errors = [];
  const session = new context.PeerSession({ error: e => errors.push(e) });
  const fire = delay => {
    const entry = [...timers].find(([, t]) => t.delay === delay);
    assert.ok(entry, `expected ${delay}ms deadline`);
    timers.delete(entry[0]); entry[1].fn();
  };
  return { session, errors, timers, fire };
}

test('missing deployed TURN configuration is explained, including legacy empty responses', async () => {
  const { session } = setup();
  await session.options();
  assert.equal(session.hasRelay, false);
  assert.match(session.relayWarning, /METERED_DOMAIN and METERED_API_KEY/);
  session.destroy();
});

test('a guest waiting for signaling recovery cannot hang indefinitely', async () => {
  const { session, errors, timers, fire } = setup();
  session.openPeer = async () => { session.peer = { open: false, destroyed: false, destroy() {} }; };
  await session.join('ABCD');
  assert.equal(session.waitingForSignal, true);
  fire(85000);
  assert.match(errors[0], /Joining timed out/);
  assert.equal(session.closed, true);
  assert.equal(timers.size, 0);
});

test('an open data channel without launch synchronization releases the host slot', () => {
  const { session, fire } = setup();
  session.host = true;
  const c = new EventEmitter(); c.close = () => c.emit('close');
  session.attach(c); c.open = true; c.emit('open');
  fire(10000);
  assert.equal(session.connection, null);
  assert.equal(session.closed, false);
  session.destroy();
});

test('successful guest launch clears all connection deadlines', async () => {
  const { session, timers } = setup();
  session.openPeer = async () => {};
  session.connectGuest = () => {};
  await session.join('ABCD');
  const c = new EventEmitter(); c.close = () => c.emit('close');
  session.attach(c); c.open = true; c.emit('open');
  session.receive({ type: 'start', settings: {} });
  assert.equal(session.started, true);
  assert.deepEqual([...timers.values()].map(t => t.delay), [2000]);
  session.destroy();
});

test('stream telemetry counts sequence gaps and replay messages are idempotent', () => {
  const { session } = setup(); const sent = []; let requests = 0;
  session.host = true; session.started = true;
  session.connection = { open: true, dataChannel: { bufferedAmount: 0 }, send: message => sent.push(message), close() {} };
  session.events.replayRequest = () => requests++;
  session.receive({ type: 'input', sequence: 1, streamSequence: 1, input: { x: 0, z: 0 } });
  session.receive({ type: 'input', sequence: 2, streamSequence: 3, input: { x: 0, z: 0 } });
  assert.equal(session.telemetry().lost, 1);
  assert.equal(session.telemetry().packetLoss, 1 / 3);
  session.receive({ type: 'replay-request', sequence: 3, requestId: 8 });
  session.receive({ type: 'replay-request', sequence: 4, requestId: 8 });
  assert.equal(requests, 1);
  session.replay();
  assert.equal(sent[0].type, 'replay'); assert.ok(Number.isSafeInteger(sent[0].replayId));
  session.destroy();

  const guestEvents = []; const guest = setup().session;
  guest.events.replay = settings => guestEvents.push(settings);
  guest.receive({ type: 'replay', sequence: 1, replayId: 4, settings: { difficulty: 'easy' } });
  guest.receive({ type: 'replay', sequence: 2, replayId: 4, settings: { difficulty: 'easy' } });
  assert.equal(guestEvents.length, 1); assert.equal(guestEvents[0].difficulty, 'easy');
  guest.destroy();
});
