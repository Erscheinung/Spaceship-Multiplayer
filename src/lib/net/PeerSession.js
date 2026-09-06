import { flightSettings, SHIP_COLORS } from '../game/settings.js';
import Peer from 'peerjs';
import { env } from '$env/dynamic/public';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function roomCode() {
  return [...crypto.getRandomValues(new Uint8Array(4))].map(n => alphabet[n % alphabet.length]).join('');
}
const validInput = d => d && Number.isFinite(d.x) && Number.isFinite(d.z);

// Transport and protocol live here; clients can never submit hits or spawn entities.
export class PeerSession {
  constructor(events = {}, settings = {}) {
    this.settings = flightSettings(settings);this.attempt = 0;this.hasRelay = false;
    this.events = events; this.host = false; this.connection = null; this.closed = false;
    this.pauseFlags = [false, false]; this.started = false; this.lastSeen = Date.now();
    this.heartbeat = setInterval(() => {
      if (!this.connection?.open) return;
      this.send({ type: 'ping' });
      if (Date.now() - this.lastSeen > 12000) this.fail('Connection lost. Return to the menu to reconnect.');
    }, 2000);
  }
  async options() {
    const iceServers = [{ urls: ['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302'] }];
    try {
      const response = await fetch('/api/ice', { signal: AbortSignal.timeout(4000) });
      const data = await response.json();
      if (Array.isArray(data.iceServers)) iceServers.push(...data.iceServers);
    } catch { /* Direct ICE and explicitly configured relays remain usable. */ }
    if (env.PUBLIC_TURN_URL) iceServers.push({ urls: env.PUBLIC_TURN_URL.split(',').map(s=>s.trim()), username: env.PUBLIC_TURN_USERNAME, credential: env.PUBLIC_TURN_CREDENTIAL });
    this.hasRelay = iceServers.some(s => [s.urls].flat().some(u => /^turns?:/.test(u)));
    return { debug: 0, ...(env.PUBLIC_PEER_HOST ? { host: env.PUBLIC_PEER_HOST, port: Number(env.PUBLIC_PEER_PORT || 443), path: env.PUBLIC_PEER_PATH || '/', secure: env.PUBLIC_PEER_SECURE !== 'false' } : {}), config: { iceServers, iceCandidatePoolSize: 4 } };
  }
  async openPeer(id) {
    const options = await this.options();
    if (this.closed) throw new Error('Cancelled');
    const peer = id ? new Peer(id, options) : new Peer(options);
    this.peer = peer;
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); peer.off('open', opened); peer.off('error', failed); };
      const opened = () => { cleanup(); resolve(); };
      const failed = error => { cleanup(); peer.destroy(); reject(error); };
      const timer = setTimeout(() => failed(new Error('Signaling timed out. Check your internet connection.')), 15000);
      peer.once('open', opened);
      peer.once('error', failed);
    });
    if (this.closed) { peer.destroy(); throw new Error('Cancelled'); }
    peer.on('error', e => { if (e.type === 'webrtc') this.connectionFailed(this.connection); else this.fail(e.type === 'peer-unavailable' ? 'Room not found. Check the code and try again.' : `Network error: ${e.message}`); });
    peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) peer.reconnect(); });
    peer.on('connection', c => {
      if (!this.host || this.connection || c.metadata?.game !== 'neon-wing-flight-v3') {
        c.on('open', () => { c.send({ type: 'reject', reason: 'Room is full or incompatible.' }); setTimeout(() => c.close(), 300); });
        return;
      }
      this.settings.colors[1] = Object.hasOwn(SHIP_COLORS,c.metadata?.color) ? c.metadata.color : 'coral';
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
    this.connectGuest();
  }
  connectGuest() {
    if(this.closed) return;
    this.attempt++;
    this.events.status?.(`Connecting pilots (${this.attempt}/3)…`);
    this.attach(this.peer.connect(this.code, { reliable:true, serialization:'json', metadata:{game:'neon-wing-flight-v3',color:this.settings.colors[0]} }));
    this.connectTimeout=setTimeout(()=>this.connectionFailed(this.connection),22000);
  }
  connectionFailed(connection) {
    if(this.closed || !connection || connection !== this.connection) return;
    clearTimeout(this.connectTimeout); this.connection=null;connection.close();
    if (!this.started) {
      if(this.host) { this.events.status?.('Connection interrupted. Waiting for your wingmate to retry…'); return; }
      if(this.attempt<3) { this.retryTimer=setTimeout(()=>this.connectGuest(),800);return; }
    }
    this.fail(this.hasRelay
      ? 'The direct and relay connection could not be established. Check that the TURN relay credentials and UDP/TCP ports are valid, then reconnect.'
      : 'No route between devices. A TURN relay is not configured; restrictive Wi-Fi or mobile networks may block direct connections. Try the same Wi-Fi, or configure the relay described in the README.');
  }
  attach(connection) {
    this.connection=connection;
    connection.on('open',()=>{if(connection!==this.connection)return;clearTimeout(this.connectTimeout);this.lastSeen=Date.now();this.events.connected?.();});
    connection.on('data',message=>{if(connection===this.connection)this.receive(message);});
    connection.on('close',()=>{if(connection!==this.connection||this.closed)return;if(this.started)this.fail('Your wingmate disconnected. This run has ended.');else this.connectionFailed(connection);});
    connection.on('error',()=>this.connectionFailed(connection));
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
      if (d.type === 'ready' && !this.started) { this.started = true; this.send({ type: 'start', settings:this.settings }); this.events.start?.(this.settings); }
      if (d.type === 'input' && validInput(d.input)) this.events.input?.(d.input);
      if (d.type === 'pause-request' && typeof d.paused === 'boolean') { this.pauseFlags[1] = d.paused; this.publishPause(); }
    } else {
      if (d.type === 'start' && !this.started) { this.started = true; this.settings=flightSettings(d.settings);this.events.start?.(this.settings); }
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
  destroy() { this.closed = true; clearInterval(this.heartbeat); clearTimeout(this.retryTimer); clearTimeout(this.connectTimeout); this.connection?.close(); this.peer?.destroy(); }
}
