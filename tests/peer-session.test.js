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


test('browser suspension grants a recovery window, while a live dead connection times out', () => {
  const { session, fire, errors } = setup();
  session.connection = { open: true, send() {}, close() {} };
  session.lastSeen = Date.now() - 60000;
  session.heartbeatTime = Date.now() - 60000;
  fire(2000);
  assert.equal(session.closed, false);
  assert.ok(Date.now() - session.lastSeen < 1000);
  // The fake interval is consumed by fire; use a fresh session for the timeout.
  session.destroy();
  const other = setup();
  other.session.connection = { open: true, send() {}, close() {} };
  other.session.lastSeen = Date.now() - 31000;
  other.fire(2000);
  assert.equal(other.session.closed, true);
  assert.match(other.errors[0], /Connection lost/);
  assert.equal(errors.length, 0);
});

test('PeerJS backlog drops stale updates but still sends pause control', () => {
  const { session } = setup(); const sent = [];
  session.connection = { open: true, bufferSize: 1, dataChannel: { bufferedAmount: 0 }, send: m => sent.push(m), close() {} };
  session.send({ type: 'snapshot', state: { time: 1 } });
  session.send({ type: 'snapshot', state: { time: 2 } });
  session.send({ type: 'pause', flags: [true, false] });
  assert.equal(session.packetStats.dropped, 2);
  assert.equal(sent.length, 1); assert.equal(sent[0].type, 'pause');
  assert.equal(session.pendingStreams.snapshot.state.time, 2);
  session.connection.bufferSize = 0;
  session.flushPendingStreams();
  assert.equal(sent.length, 2); assert.equal(sent[1].type, 'snapshot'); assert.equal(sent[1].state.time, 2);
  session.destroy();
});

test('temporary ICE disconnect recovers without ending the run', () => {
  const { session, timers } = setup(); let changed;
  const pc = { iceConnectionState: 'connected', addEventListener: (_, fn) => { changed = fn; } };
  const c = new EventEmitter(); c.peerConnection = pc; c.close = () => c.emit('close');
  session.attach(c); c.open = true; c.emit('open');
  session.receive({ type: 'start', settings: {} });
  pc.iceConnectionState = 'disconnected'; changed();
  assert.ok([...timers.values()].some(t => t.delay === 20000));
  pc.iceConnectionState = 'connected'; changed();
  assert.equal([...timers.values()].some(t => t.delay === 20000), false);
  assert.equal(session.closed, false); session.destroy();
});

test('an established route enters bounded recovery instead of ending on close', () => {
  const { session, errors } = setup();
  const c = new EventEmitter(); c.open = true; c.close = () => c.emit('close');
  session.attach(c); c.emit('open'); session.receive({ type: 'start', settings: {} });
  session.transportLost(c, 'test recovery');
  assert.equal(session.recovering, true);
  assert.equal(session.closed, false);
  assert.equal(session.connection, null);
  assert.deepEqual(errors, []);
  session.destroy();
});

test('a fresh stream update supersedes a queued older one after pressure clears', () => {
  const { session } = setup(); const sent = [];
  session.connection = { open: true, bufferSize: 1, dataChannel: { bufferedAmount: 0 }, send: m => sent.push(m), close() {} };
  session.send({ type: 'input', input: { x: -1, z: 0 } });
  session.connection.bufferSize = 0;
  session.send({ type: 'input', input: { x: 1, z: 0 } });
  session.flushPendingStreams();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].input.x, 1);
  session.destroy();
});

test('an active run only accepts a replacement from its original peer', () => {
  const { session } = setup();
  session.host = true; session.started = true; session.guestPeerId = 'original';
  const old = new EventEmitter(); old.open = true; old.close = () => old.emit('close');
  session.connection = old;
  const stranger = new EventEmitter(); stranger.peer = 'stranger'; stranger.metadata = { game: 'neon-wing-city-v7' };
  session.acceptConnection(stranger);
  assert.equal(session.connection, old);
  const replacement = new EventEmitter(); replacement.peer = 'original'; replacement.metadata = { game: 'neon-wing-city-v7' }; replacement.close = () => {};
  session.acceptConnection(replacement);
  assert.equal(session.connection, replacement);
  assert.equal(session.recovering, true);
  session.destroy();
});

test('old-run state and pause cannot contaminate a replay', () => {
  const { session } = setup(); const snapshots = [], pauses = [];
  session.lastReplayId = 2;
  session.events.snapshot = state => snapshots.push(state);
  session.events.pause = flags => pauses.push(flags);
  session.receive({ type: 'snapshot', sequence: 5, streamSequence: 5, runId: 1, state: { players: [] } });
  session.receive({ type: 'pause', sequence: 6, runId: 1, flags: [true, true] });
  assert.equal(snapshots.length, 0); assert.equal(pauses.length, 0);
  session.receive({ type: 'snapshot', sequence: 7, streamSequence: 7, runId: 2, state: { players: [] } });
  assert.equal(snapshots.length, 1);
  session.destroy();
});

test('disposable streams use the non-retransmitted channel while controls stay reliable', () => {
  const { session } = setup(); const reliable = [], disposable = [];
  session.connection = { open: true, send: m => reliable.push(m), close() {} };
  session.streamChannel = { readyState: 'open', bufferedAmount: 0, send: data => disposable.push(JSON.parse(data)) };
  session.send({ type: 'input', input: { x: 0, z: 0 } });
  session.send({ type: 'pause', flags: [true, false] });
  session.send({ type: 'snapshot', state: { over: true } });
  assert.equal(disposable.length, 1); assert.equal(disposable[0].type, 'input');
  assert.deepEqual(reliable.map(m => m.type), ['pause', 'snapshot']);
  session.destroy();
});
