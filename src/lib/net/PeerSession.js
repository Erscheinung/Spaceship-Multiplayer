import { flightSettings, SHIP_COLORS } from '../game/settings.js';
import Peer from 'peerjs';
import { env } from '$env/dynamic/public';

const PROTOCOL = 'neon-wing-skyway-v4';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function roomCode() {
  return [...crypto.getRandomValues(new Uint8Array(4))].map(n => alphabet[n % alphabet.length]).join('');
}
const validInput = d => d && Number.isFinite(d.x) && Number.isFinite(d.z);

// Transport and protocol live here; clients can never submit hits or spawn entities.
export class PeerSession {
  constructor(events = {}, settings = {}) {
    this.sequence = 0; this.receivedSequences = {};
    this.settings = flightSettings(settings);this.attempt = 0;this.hasRelay = false;
    this.events = events; this.host = false; this.connection = null; this.closed = false;
    this.pauseFlags = [false, false]; this.started = false; this.lastSeen = Date.now();
    this.heartbeat = setInterval(() => {
      if (!this.connection?.open) return;
      this.send({ type: 'ping', sent: Date.now() });
      if (Date.now() - this.lastSeen > 12000) this.fail('Connection lost. Return to the menu to reconnect.');
    }, 2000);
  }
  async options() {
    this.events.status?.('Securing relay credentials…');
    const iceServers = [{ urls: ['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302'] }];
    try {
      const response = await fetch('/api/ice', { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!response.ok) this.relayWarning = data.error || 'Relay service unavailable';
      if (Array.isArray(data.iceServers)) iceServers.push(...data.iceServers);
    } catch { this.relayWarning = 'Relay credential request timed out'; }
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
    peer.on('error', e => {
      // Peer-level WebRTC errors are not scoped to a connection: a stale attempt
      // must never tear down its replacement. The connection owns that lifecycle.
      if (e.type === 'webrtc') return;
      if (e.type === 'peer-unavailable') { if (!this.host && !this.started) this.connectionFailed(this.connection); return; }
      if (e.type === 'network' || e.type === 'disconnected') { this.events.status?.('Reconnecting to the room directory…'); return; }
      this.fail(`Network error: ${e.message}`);
    });
    peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) peer.reconnect(); });
    peer.on('connection', c => {
      if (!this.host || this.connection || c.metadata?.game !== PROTOCOL) {
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
    if (this.attempt === 3 && this.hasRelay) this.peer.options.config.iceTransportPolicy = 'relay';
    this.events.status?.(this.attempt === 3 && this.hasRelay ? 'Trying a dedicated relay route…' : `Finding the fastest route · attempt ${this.attempt}/3…`);
    this.attach(this.peer.connect(this.code, { reliable:false, serialization:'binary', metadata:{game:PROTOCOL,color:this.settings.colors[0]} }));

  }
  connectionFailed(connection) {
    if(this.closed || !connection || connection !== this.connection) return;
    clearTimeout(this.connectTimeout); clearTimeout(this.disconnectTimer); clearInterval(this.readyTimer); this.connection=null;connection.close();
    if (!this.started) {
      if(this.host) { this.events.status?.('Connection interrupted. Waiting for your wingmate to retry…'); return; }
      if(this.attempt<3) { this.events.status?.('Route unavailable. Retrying automatically…'); this.retryTimer=setTimeout(()=>this.connectGuest(),800);return; }
    }
    this.fail(this.hasRelay
      ? 'The direct and relay connection could not be established. Check that the TURN relay credentials and UDP/TCP ports are valid, then reconnect.'
      : `Room unavailable or no route between devices. Check the code and keep the host's lobby open. ${this.relayWarning || 'Configure TURN for restrictive networks.'}`);
  }
  attach(connection) {
    this.connection=connection;
    if (this.host) this.events.status?.('Wingmate found · negotiating direct / relay routes…');
    this.connectTimeout=setTimeout(()=>this.connectionFailed(connection),22000);
    const pc = connection.peerConnection;
    pc?.addEventListener('iceconnectionstatechange', () => {
      if (connection !== this.connection || this.closed) return;
      clearTimeout(this.disconnectTimer);
      if (pc.iceConnectionState === 'disconnected') {
        this.events.status?.('Signal interrupted · recovering the route…');
        this.disconnectTimer = setTimeout(() => this.connectionFailed(connection), 10000);
      }
      if (pc.iceConnectionState === 'failed') this.connectionFailed(connection);
    });
    connection.on('open',()=>{if(connection!==this.connection)return;clearTimeout(this.connectTimeout);this.lastSeen=Date.now();this.events.status?.('Route established · synchronizing launch…');this.events.connected?.();});
    connection.on('data',message=>{if(connection===this.connection)this.receive(message);});
    connection.on('close',()=>{if(connection!==this.connection||this.closed)return;if(this.started)this.fail('Your wingmate disconnected. This run has ended.');else this.connectionFailed(connection);});
    connection.on('error',()=>this.connectionFailed(connection));
  }
  send(message) {
    if (!this.connection?.open || this.closed) return;
    // Drop disposable updates instead of accumulating seconds of stale state.
    if (['input', 'snapshot'].includes(message.type) && !message.state?.over && this.connection.dataChannel?.bufferedAmount > 16000) return;
    try { this.connection.send({ ...message, sequence: ++this.sequence }); } catch { this.fail('Could not send to your wingmate.'); }
  }
  receive(d) {
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
    this.lastSeen = Date.now();
    if (['input', 'snapshot', 'pause', 'pause-request'].includes(d.type)) {
      if (!Number.isSafeInteger(d.sequence) || d.sequence <= (this.receivedSequences[d.type] ?? -1)) return;
      this.receivedSequences[d.type] = d.sequence;
    }
    if (d.type === 'ping') { this.send({ type: 'pong', sent: d.sent }); return; }
    if (d.type === 'pong') { if (Number.isFinite(d.sent)) this.rtt = Math.max(0, Date.now() - d.sent); return; }
    if (d.type === 'reject') { this.fail(String(d.reason)); return; }
    if (this.host) {
      if (d.type === 'ready') { this.send({ type: 'start', settings:this.settings }); if (!this.started) { this.started = true; this.events.start?.(this.settings); } this.publishPause(); }
      if (d.type === 'input' && validInput(d.input)) this.events.input?.(d.input);
      if (d.type === 'pause-request' && typeof d.paused === 'boolean') { this.pauseFlags[1] = d.paused; this.publishPause(); }
    } else {
      if (d.type === 'start' && !this.started) { this.started = true; clearInterval(this.readyTimer); this.settings=flightSettings(d.settings);this.events.start?.(this.settings); this.events.pause?.([...this.pauseFlags]); }
      if (d.type === 'snapshot' && d.state && Array.isArray(d.state.players)) this.events.snapshot?.(d.state);
      if (d.type === 'pause' && Array.isArray(d.flags) && d.flags.length === 2 && d.flags.every(f => typeof f === 'boolean')) {
        this.pauseFlags = d.flags; this.events.pause?.([...d.flags]);
      }
    }
  }
  ready() { if (this.host) return; this.send({ type: 'ready' }); clearInterval(this.readyTimer); this.readyTimer = setInterval(() => { if (!this.started) this.send({ type: 'ready' }); }, 600); }
  setPaused(paused) {
    this.pauseFlags[this.host ? 0 : 1] = paused;
    if (this.host) this.publishPause(); else this.send({ type: 'pause-request', paused });
  }
  publishPause() { this.send({ type: 'pause', flags: this.pauseFlags }); this.events.pause?.([...this.pauseFlags]); }
  fail(message) { if (this.closed) return; this.events.error?.(message); this.destroy(); }
  destroy() { this.closed = true; clearInterval(this.heartbeat); clearInterval(this.readyTimer); clearTimeout(this.disconnectTimer); clearTimeout(this.retryTimer); clearTimeout(this.connectTimeout); this.connection?.close(); this.peer?.destroy(); }
}
