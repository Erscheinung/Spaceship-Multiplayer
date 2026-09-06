import Peer from 'peerjs';
import { env } from '$env/dynamic/public';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function roomCode() {
  return [...crypto.getRandomValues(new Uint8Array(4))].map(n => alphabet[n % alphabet.length]).join('');
}
const validInput = d => d && Number.isFinite(d.x) && Number.isFinite(d.z);

// Transport and protocol live here; clients can never submit hits or spawn entities.
export class PeerSession {
  constructor(events = {}) {
    this.events = events; this.host = false; this.connection = null; this.closed = false;
    this.pauseFlags = [false, false]; this.started = false; this.lastSeen = Date.now();
    this.heartbeat = setInterval(() => {
      if (!this.connection?.open) return;
      this.send({ type: 'ping' });
      if (Date.now() - this.lastSeen > 12000) this.fail('Connection lost. Return to the menu to reconnect.');
    }, 2000);
  }
  options() {
    const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    if (env.PUBLIC_TURN_URL) iceServers.push({ urls: env.PUBLIC_TURN_URL, username: env.PUBLIC_TURN_USERNAME, credential: env.PUBLIC_TURN_CREDENTIAL });
    return { debug: 0, ...(env.PUBLIC_PEER_HOST ? { host: env.PUBLIC_PEER_HOST, port: Number(env.PUBLIC_PEER_PORT || 443), path: env.PUBLIC_PEER_PATH || '/', secure: env.PUBLIC_PEER_SECURE !== 'false' } : {}), config: { iceServers } };
  }
  async openPeer(id) {
    const peer = id ? new Peer(id, this.options()) : new Peer(this.options());
    this.peer = peer;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { peer.destroy(); reject(new Error('Signaling timed out. Check your internet connection.')); }, 15000);
      peer.once('open', () => { clearTimeout(timer); resolve(); });
      peer.once('error', error => { clearTimeout(timer); peer.destroy(); reject(error); });
    });
    if (this.closed) { peer.destroy(); throw new Error('Cancelled'); }
    peer.on('error', e => this.fail(e.type === 'peer-unavailable' ? 'Room not found. Check the code and try again.' : `Network error: ${e.message}`));
    peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) peer.reconnect(); });
    peer.on('connection', c => {
      if (!this.host || this.connection || c.metadata?.game !== 'neon-wing-city-v2') {
        c.on('open', () => { c.send({ type: 'reject', reason: 'Room is full or incompatible.' }); setTimeout(() => c.close(), 300); });
        return;
      }
      this.attach(c);
    });
    return peer.id;
  }
  async create() {
    this.host = true;
    for (let attempt = 0; attempt < 8; attempt++) {
      try { this.code = await this.openPeer(roomCode()); this.events.room?.(this.code); return; }
      catch (e) { if (e.type !== 'unavailable-id' || attempt === 7 || this.closed) throw e; }
    }
  }
  async join(code) {
    this.host = false; this.code = code.toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(this.code)) throw new Error('Enter a four-character room code.');
    await this.openPeer();
    this.attach(this.peer.connect(this.code, { reliable: true, serialization: 'json', metadata: { game: 'neon-wing-city-v2' } }));
    this.connectTimeout = setTimeout(() => this.fail('Could not reach the host. Check the code or try another network.'), 18000);
  }
  attach(connection) {
    this.connection = connection;
    connection.on('open', () => { clearTimeout(this.connectTimeout); this.lastSeen = Date.now(); this.events.connected?.(); });
    connection.on('data', message => this.receive(message));
    connection.on('close', () => this.fail('Your wingmate disconnected. This run has ended.'));
    connection.on('error', () => this.fail('The peer connection failed. Try another network.'));
  }
  send(message) {
    if (!this.connection?.open || this.closed) return;
    // Drop disposable updates instead of accumulating seconds of stale state.
    if (['input', 'snapshot'].includes(message.type) && this.connection.dataChannel?.bufferedAmount > 128000) return;
    try { this.connection.send(message); } catch { this.fail('Could not send to your wingmate.'); }
  }
  receive(d) {
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
    this.lastSeen = Date.now();
    if (d.type === 'ping') { this.send({ type: 'pong' }); return; }
    if (d.type === 'reject') { this.fail(String(d.reason)); return; }
    if (this.host) {
      if (d.type === 'ready' && !this.started) { this.started = true; this.send({ type: 'start' }); this.events.start?.(); }
      if (d.type === 'input' && validInput(d.input)) this.events.input?.(d.input);
      if (d.type === 'pause-request' && typeof d.paused === 'boolean') { this.pauseFlags[1] = d.paused; this.publishPause(); }
    } else {
      if (d.type === 'start' && !this.started) { this.started = true; this.events.start?.(); }
      if (d.type === 'snapshot' && d.state && Array.isArray(d.state.players)) this.events.snapshot?.(d.state);
      if (d.type === 'pause' && Array.isArray(d.flags) && d.flags.length === 2 && d.flags.every(f => typeof f === 'boolean')) {
        this.pauseFlags = d.flags; this.events.pause?.([...d.flags]);
      }
    }
  }
  ready() { if (!this.host) this.send({ type: 'ready' }); }
  setPaused(paused) {
    this.pauseFlags[this.host ? 0 : 1] = paused;
    if (this.host) this.publishPause(); else this.send({ type: 'pause-request', paused });
  }
  publishPause() { this.send({ type: 'pause', flags: this.pauseFlags }); this.events.pause?.([...this.pauseFlags]); }
  fail(message) { if (this.closed) return; this.events.error?.(message); this.destroy(); }
  destroy() { this.closed = true; clearInterval(this.heartbeat); clearTimeout(this.connectTimeout); this.connection?.close(); this.peer?.destroy(); }
}
