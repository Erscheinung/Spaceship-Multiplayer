import { flightSettings, SHIP_COLORS } from '../game/settings.js';
import Peer from 'peerjs';
import { env } from '$env/dynamic/public';

const PROTOCOL = 'neon-wing-skyway-v5';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STREAM_TYPES = new Set(['input', 'snapshot']);
export function roomCode() {
  return [...crypto.getRandomValues(new Uint8Array(4))].map(n => alphabet[n % alphabet.length]).join('');
}
const validInput = d => d && Number.isFinite(d.x) && Number.isFinite(d.z);

// Transport and protocol live here; clients can never submit hits or spawn entities.
export class PeerSession {
  constructor(events = {}, settings = {}) {
    this.sequence = 0; this.receivedSequences = {}; this.streamSequences = { input: 0, snapshot: 0 }; this.receivedStreams = {}; this.replayId = 0; this.lastReplayId = 0; this.replayTimer = null; this.replayRequestId = 0; this.lastReplayRequestId = 0; this.replayRequestTimer = null;
    this.packetStats = { received: 0, lost: 0, dropped: 0 };
    this.settings = flightSettings(settings);this.attempt = 0;this.hasRelay = false;
    this.events = events; this.host = false; this.connection = null; this.closed = false;
    this.signalingReady = false; this.waitingForSignal = false;
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
    if (!this.hasRelay) this.relayWarning ||= 'This deployment has no TURN relay configured. Set METERED_DOMAIN and METERED_API_KEY in Vercel and redeploy.';
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
    this.signalingReady = true;
    peer.on('error', e => {
      if (this.closed || peer !== this.peer) return;
      // Peer-level WebRTC errors are not scoped to a connection: a stale attempt
      // must never tear down its replacement. The connection owns that lifecycle.
      if (e.type === 'webrtc') return;
      if (e.type === 'peer-unavailable') {
        if (!this.host && !this.started) this.connectionFailed(this.connection);
        return;
      }
      if (e.type === 'network' || e.type === 'disconnected') {
        this.signalingReady = false;
        this.events.status?.('Reconnecting to the room directory…');
        if (!this.host && !this.started && this.connection && !this.connection.open) this.connectionFailed(this.connection);
        return;
      }
      this.fail(`Network error: ${e.message}`);
    });
    peer.on('open', () => {
      if (this.closed || peer !== this.peer) return;
      this.signalingReady = true;
      if (this.waitingForSignal && !this.closed && !this.host && !this.started) {
        this.waitingForSignal = false;
        clearTimeout(this.retryTimer); this.retryTimer = null;
        this.connectGuest();
      }
    });
    peer.on('disconnected', () => {
      this.signalingReady = false;
      if (!this.closed && !peer.destroyed) {
        try { peer.reconnect(); } catch { /* A concurrent reconnect/open event owns recovery. */ }
      }
    });
    peer.on('connection', c => {
      if (this.closed || !this.host || c.metadata?.game !== PROTOCOL) {
        c.on('open', () => { c.send({ type: 'reject', reason: 'Room is full or incompatible.' }); setTimeout(() => c.close(), 300); });
        return;
      }
      // A guest may retry while the host's previous ICE negotiation is still
      // pending. Release that unusable slot so the replacement can be adopted.
      if (this.connection) {
        if (this.started || this.connection.open) {
          c.on('open', () => { c.send({ type: 'reject', reason: 'Room is full or incompatible.' }); setTimeout(() => c.close(), 300); });
          return;
        }
        this.connectionFailed(this.connection);
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
    // Covers signaling recovery and the application handshake as well as ICE.
    // Per-attempt timers alone cannot bound waits without a live connection.
    this.joinTimeout = setTimeout(() => this.fail(`Joining timed out. ${this.relayWarning || 'Keep the host lobby open and try again.'}`), 85000);
    this.connectGuest();
  }
  connectGuest() {
    if(this.closed || this.host || this.started || !this.peer || this.peer.destroyed) return;
    if (this.connection?.open) return;
    if(this.peer.disconnected || !this.peer.open || !this.signalingReady) {
      this.waitingForSignal = true;
      this.events.status?.('Waiting for the room directory to reconnect…');
      if (this.peer.disconnected) {
        try { this.peer.reconnect(); } catch { /* The disconnected event already scheduled recovery. */ }
      }
      return;
    }
    this.waitingForSignal = false;
    this.attempt++;
    if (this.attempt === 3 && this.hasRelay) this.peer.options.config.iceTransportPolicy = 'relay';
    this.events.status?.(this.attempt === 3 && this.hasRelay ? 'Trying a dedicated relay route…' : `Connecting · attempt ${this.attempt}/3${this.hasRelay ? '' : ' · relay unavailable; direct connection only'}…`);
    this.attach(this.peer.connect(this.code, { reliable:false, serialization:'binary', metadata:{game:PROTOCOL,color:this.settings.colors[0]} }));

  }
  connectionFailed(connection) {
    if(this.closed || !connection || connection !== this.connection) return;
    clearTimeout(this.connectTimeout); clearTimeout(this.disconnectTimer); clearInterval(this.readyTimer); this.connection=null;connection.close();
    if (!this.started) {
      if(this.host) { this.events.status?.('Connection interrupted. Waiting for your wingmate to retry…'); return; }
      if(this.attempt<3) {
        this.events.status?.('Route unavailable. Retrying automatically…');
        clearTimeout(this.retryTimer);
        this.retryTimer=setTimeout(()=>{ this.retryTimer=null; this.connectGuest(); },800);
        return;
      }
    }
    this.fail(this.hasRelay
      ? 'The direct and relay connection could not be established. Check that the TURN relay credentials and UDP/TCP ports are valid, then reconnect.'
      : `Room unavailable or no route between devices. Check the code and keep the host's lobby open. ${this.relayWarning}`);
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
    connection.on('open',()=>{
      if(connection!==this.connection || this.closed)return;
      clearTimeout(this.connectTimeout);
      this.connectTimeout=setTimeout(()=>this.connectionFailed(connection),10000);
      this.lastSeen=Date.now();this.events.status?.('Route established · synchronizing launch…');this.events.connected?.();
    });
    connection.on('data',message=>{if(connection===this.connection)this.receive(message);});
    connection.on('close',()=>{if(connection!==this.connection||this.closed)return;if(this.started)this.fail('Your wingmate disconnected. This run has ended.');else this.connectionFailed(connection);});
    connection.on('error',()=>this.connectionFailed(connection));
  }
  send(message) {
    if (!this.connection?.open || this.closed) return;
    const outgoing = { ...message };
    if (STREAM_TYPES.has(outgoing.type)) outgoing.streamSequence = ++this.streamSequences[outgoing.type];
    // Drop disposable updates instead of accumulating seconds of stale state.
    if (STREAM_TYPES.has(outgoing.type) && !outgoing.state?.over && this.connection.dataChannel?.bufferedAmount > 16000) { this.packetStats.dropped++; this.events.telemetry?.(this.telemetry()); return; }
    try { this.connection.send({ ...outgoing, sequence: ++this.sequence }); } catch { this.fail('Could not send to your wingmate.'); }
  }
  receive(d) {
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
    this.lastSeen = Date.now();
    if (['input', 'snapshot', 'pause', 'pause-request', 'replay', 'replay-request'].includes(d.type)) {
      if (!Number.isSafeInteger(d.sequence) || d.sequence <= (this.receivedSequences[d.type] ?? -1)) return;
      this.receivedSequences[d.type] = d.sequence;
    }
    if (STREAM_TYPES.has(d.type) && Number.isSafeInteger(d.streamSequence)) {
      const previous = this.receivedStreams[d.type] ?? 0;
      if (d.streamSequence <= previous) return;
      this.packetStats.lost += Math.max(0, d.streamSequence - previous - 1);
      this.receivedStreams[d.type] = d.streamSequence;
      this.packetStats.received++;
      this.events.telemetry?.(this.telemetry());
    }
    if (d.type === 'ping') { this.send({ type: 'pong', sent: d.sent }); return; }
    if (d.type === 'pong') { if (Number.isFinite(d.sent)) this.rtt = Math.max(0, Date.now() - d.sent); return; }
    if (d.type === 'reject') { this.fail(String(d.reason)); return; }
    if (this.host) {
      if (d.type === 'ready') { clearTimeout(this.connectTimeout); this.send({ type: 'start', settings:this.settings }); if (!this.started) { this.started = true; this.events.start?.(this.settings); } this.publishPause(); }
      if (d.type === 'input' && validInput(d.input)) this.events.input?.(d.input);
      if (d.type === 'pause-request' && typeof d.paused === 'boolean') { this.pauseFlags[1] = d.paused; this.publishPause(); }
      if (d.type === 'replay-request' && this.started && Number.isSafeInteger(d.requestId) && d.requestId > this.lastReplayRequestId) { this.lastReplayRequestId = d.requestId; this.events.replayRequest?.(); }
    } else {
      if (d.type === 'start' && !this.started) { this.started = true; clearTimeout(this.joinTimeout); clearTimeout(this.connectTimeout); clearInterval(this.readyTimer); this.settings=flightSettings(d.settings);this.events.start?.(this.settings); this.events.pause?.([...this.pauseFlags]); }
      if (d.type === 'snapshot' && d.state && Array.isArray(d.state.players)) this.events.snapshot?.(d.state);
      if (d.type === 'pause' && Array.isArray(d.flags) && d.flags.length === 2 && d.flags.every(f => typeof f === 'boolean')) {
        this.pauseFlags = d.flags; this.events.pause?.([...d.flags]);
      }
      if (d.type === 'replay' && d.settings && Number.isSafeInteger(d.replayId) && d.replayId > this.lastReplayId) { this.lastReplayId = d.replayId; this.settings = flightSettings(d.settings); this.pauseFlags = [false, false]; this.events.replay?.(this.settings); }
    }
  }
  ready() { if (this.host) return; this.send({ type: 'ready' }); clearInterval(this.readyTimer); this.readyTimer = setInterval(() => { if (!this.started) this.send({ type: 'ready' }); }, 600); }
  setPaused(paused) {
    this.pauseFlags[this.host ? 0 : 1] = paused;
    if (this.host) this.publishPause(); else this.send({ type: 'pause-request', paused });
  }
  replay(settings = this.settings) {
    if (!this.host || this.closed) return;
    this.settings = flightSettings(settings);
    this.pauseFlags = [false, false];
    clearTimeout(this.replayTimer);
    const replayId = ++this.replayId; let attempts = 0;
    const announce = () => {
      if (this.closed || attempts++ >= 5) return;
      this.send({ type: 'replay', replayId, settings: this.settings });
      this.replayTimer = setTimeout(announce, 350);
    };
    announce();
    this.events.replay?.(this.settings);
  }
  requestReplay() {
    if (this.closed) return;
    if (this.host) this.replay();
    else {
      clearTimeout(this.replayRequestTimer);
      const requestId = ++this.replayRequestId; let attempts = 0;
      const announce = () => {
        if (this.closed || attempts++ >= 4) return;
        this.send({ type: 'replay-request', requestId });
        this.replayRequestTimer = setTimeout(announce, 350);
      };
      announce();
    }
  }
  publishPause() { this.send({ type: 'pause', flags: this.pauseFlags }); this.events.pause?.([...this.pauseFlags]); }
  telemetry() {
    const total = this.packetStats.received + this.packetStats.lost + this.packetStats.dropped;
    return { packetLoss: total ? (this.packetStats.lost + this.packetStats.dropped) / total : null, rtt: Number.isFinite(this.rtt) ? this.rtt : null, received: this.packetStats.received, lost: this.packetStats.lost, dropped: this.packetStats.dropped };
  }
  fail(message) { if (this.closed) return; this.events.error?.(message); this.destroy(); }
  destroy() { this.closed = true; clearTimeout(this.joinTimeout); clearInterval(this.heartbeat); clearInterval(this.readyTimer); clearTimeout(this.disconnectTimer); clearTimeout(this.retryTimer); clearTimeout(this.connectTimeout); clearTimeout(this.replayTimer); clearTimeout(this.replayRequestTimer); this.connection?.close(); this.peer?.destroy(); }
}
