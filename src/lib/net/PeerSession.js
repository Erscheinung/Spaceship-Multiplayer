import { flightSettings, SHIP_COLORS } from '../game/settings.js';
import Peer from 'peerjs';
import { env } from '$env/dynamic/public';

const PROTOCOL = 'neon-wing-city-v7';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STREAM_TYPES = new Set(['input', 'snapshot']);
const STREAM_BUFFER_LIMIT = 16 * 1024;
const RECOVERY_GRACE = 45000;
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
    this.pendingStreams = {}; this.pendingDrainTimer = null;
    this.streamChannel = null; this.guestPeerId = null;
    this.recovering = false; this.recoveryAttempt = 0; this.recoveryDeadline = 0; this.recoveryTimer = null;
    this.heartbeatTime = Date.now();
    this.heartbeat = setInterval(() => {
      const now = Date.now();
      // Give queued packets time to arrive after browser suspension or a long frame.
      if (now - this.heartbeatTime > 6000) this.lastSeen = now;
      this.heartbeatTime = now;
      if (this.recovering && now >= this.recoveryDeadline) {
        this.fail('The route could not be restored. Return to the menu and reconnect.'); return;
      }
      if (!this.connection?.open) {
        if (this.recovering && now >= this.recoveryDeadline) this.fail('The route could not be restored. Return to the menu and reconnect.');
        return;
      }
      this.send({ type: 'ping', sent: Date.now() });
      if (now - this.lastSeen > 30000) {
        if (this.started) this.transportLost(this.connection, 'Heartbeat missed · rebuilding the route…');
        else this.fail('Connection lost. Return to the menu to reconnect.');
      }
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
    return { debug: 0, ...(env.PUBLIC_PEER_HOST ? { host: env.PUBLIC_PEER_HOST, port: Number(env.PUBLIC_PEER_PORT || 443), path: env.PUBLIC_PEER_PATH || '/', secure: env.PUBLIC_PEER_SECURE !== 'false' } : {}), config: { iceServers, iceCandidatePoolSize: 4, iceTransportPolicy: 'all' } };
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
        if (!this.host && this.connection && !this.connection.open) this.connectionFailed(this.connection);
        return;
      }
      if (e.type === 'network' || e.type === 'disconnected' || e.type === 'socket-error' || e.type === 'socket-closed') {
        this.signalingReady = false;
        this.events.status?.(this.started ? 'Room directory interrupted · keeping the flight alive…' : 'Reconnecting to the room directory…');
        if (!this.host && !this.started && this.connection && !this.connection.open) this.connectionFailed(this.connection);
        return;
      }
      this.fail(`Network error: ${e.message}`);
    });
    peer.on('open', () => {
      if (this.closed || peer !== this.peer) return;
      this.signalingReady = true;
      if (this.waitingForSignal && !this.closed && !this.host && (!this.started || this.recovering)) {
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
    peer.on('connection', c => this.acceptConnection(c));
    return peer.id;
  }
  acceptConnection(c) {
      if (this.closed || !this.host || c.metadata?.game !== PROTOCOL) {
        c.on('open', () => { c.send({ type: 'reject', reason: 'Room is full or incompatible.' }); setTimeout(() => c.close(), 300); });
        return;
      }
      // Only the original peer may replace a route for an active run. A new
      // tab or another player must never inherit the disconnected pilot.
      if (this.started && c.peer !== this.guestPeerId) {
        c.on('open', () => { c.send({ type: 'reject', reason: 'This run belongs to another wingmate.' }); setTimeout(() => c.close(), 300); });
        return;
      }
      // A guest may retry while the host's previous ICE negotiation is still
      // pending. Release that unusable slot so the replacement can be adopted.
      if (this.connection) {
        if (!this.started && this.connection.open) {
          c.on('open', () => { c.send({ type: 'reject', reason: 'Room is full or incompatible.' }); setTimeout(() => c.close(), 300); });
          return;
        }
        if (this.started) this.transportLost(this.connection);
        else this.connectionFailed(this.connection);
      }
      this.guestPeerId = c.peer;
      if (!this.started) this.settings.colors[1] = Object.hasOwn(SHIP_COLORS,c.metadata?.color) ? c.metadata.color : 'coral';
      this.attach(c);
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
    if(this.closed || this.host || (!this.recovering && this.started) || !this.peer || this.peer.destroyed) return;
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
    const attempt = this.recovering ? ++this.recoveryAttempt : ++this.attempt;
    if (attempt >= (this.recovering ? 2 : 3) && this.hasRelay) this.peer.options.config.iceTransportPolicy = 'relay';
    this.events.status?.(attempt === 3 && this.hasRelay ? 'Trying a dedicated relay route…' : `${this.recovering ? 'Restoring route' : 'Connecting'} · attempt ${attempt}/3${this.hasRelay ? '' : ' · relay unavailable; direct connection only'}…`);
    this.attach(this.peer.connect(this.code, { reliable:false, serialization:'binary', metadata:{game:PROTOCOL,color:this.settings.colors[0]} }));

  }
  connectionFailed(connection) {
    if(this.closed || !connection || connection !== this.connection) return;
    if (this.started) { this.transportLost(connection, 'Route negotiation interrupted · restoring the link…'); return; }
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
    clearTimeout(this.connectTimeout); clearInterval(this.readyTimer);
    this.connection=connection;
    if (this.host) this.events.status?.('Wingmate found · negotiating direct / relay routes…');
    this.connectTimeout=setTimeout(()=>this.connectionFailed(connection),22000);
    const pc = connection.peerConnection;
    if (this.host) this.setupStreamChannel(connection);
    const iceStateChanged = () => {
      if (connection !== this.connection || this.closed) return;
      clearTimeout(this.disconnectTimer);
      const state = connection.peerConnection?.iceConnectionState;
      if (state === 'disconnected') {
        this.events.status?.('Signal interrupted · recovering the route…');
        this.disconnectTimer = setTimeout(() => this.transportLost(connection, 'Signal interrupted · restoring the link…'), 20000);
      }
      if (state === 'failed') this.transportLost(connection, 'ICE route failed · trying another path…');
    };
    pc?.addEventListener('iceconnectionstatechange', iceStateChanged);
    connection.on?.('iceStateChanged', iceStateChanged);
    if (connection.dataChannel) {
      connection.dataChannel.bufferedAmountLowThreshold = STREAM_BUFFER_LIMIT / 2;
      connection.dataChannel.addEventListener?.('bufferedamountlow', () => this.flushPendingStreams());
    }
    connection.on('open',()=>{
      if(connection!==this.connection || this.closed)return;
      clearTimeout(this.connectTimeout);
      this.connectTimeout=setTimeout(()=>this.connectionFailed(connection),10000);
      this.setupStreamChannel(connection);
      this.lastSeen=Date.now();this.events.status?.('Route established · synchronizing launch…');this.events.connected?.();
    });
    connection.on('data',message=>{if(connection===this.connection)this.receive(message);});
    connection.on('close',()=>{if(connection!==this.connection||this.closed)return;if(this.started)this.transportLost(connection, 'The route closed · restoring the link…');else this.connectionFailed(connection);});
    connection.on('error',()=>{if (this.started) this.transportLost(connection, 'The route reported an error · restoring the link…'); else this.connectionFailed(connection);});
  }
  send(message) {
    if (!this.connection?.open || this.closed) return;
    if (STREAM_TYPES.has(message.type)) delete this.pendingStreams[message.type];
    if (STREAM_TYPES.has(message.type) && !message.state?.over && this.isBackpressured()) {
      // Keep one current update per stream. Queuing every snapshot turns a
      // slow VPN into seconds of stale state and eventually trips PeerJS's
      // own 8 MiB queue; control packets continue through immediately.
      this.pendingStreams[message.type] = { ...message };
      this.packetStats.dropped++;
      this.schedulePendingDrain();
      return false;
    }
    return this.transmit(message);
  }
  transmit(message) {
    const outgoing = { ...message };
    if (STREAM_TYPES.has(outgoing.type)) outgoing.streamSequence = ++this.streamSequences[outgoing.type];
    outgoing.sequence = ++this.sequence;
    outgoing.runId = this.host ? this.replayId : this.lastReplayId;
    try {
      if (STREAM_TYPES.has(message.type) && !message.state?.over && this.streamChannel?.readyState === 'open') {
        const payload = JSON.stringify(outgoing);
        // Stay below common SCTP message limits. Very large/final states use
        // PeerJS's chunked reliable channel; routine state may expire in flight.
        if (payload.length < 48000) { this.streamChannel.send(payload); return true; }
      }
      this.connection.send(outgoing); return true;
    }
    catch { if (this.started) this.transportLost(this.connection, 'Could not send to your wingmate · restoring the link…'); else this.fail('Could not send to your wingmate.'); return false; }
  }
  isBackpressured() {
    const channel = this.streamChannel?.readyState === 'open' ? this.streamChannel : this.connection?.dataChannel;
    return Number(channel?.bufferedAmount) > STREAM_BUFFER_LIMIT || Number(this.connection?.bufferSize) > 0;
  }
  setupStreamChannel(connection) {
    const pc = connection.peerConnection;
    if (!pc?.createDataChannel || connection.streamSetup) return;
    connection.streamSetup = true;
    const adopt = channel => {
      if (channel.label !== 'neon-wing-state' || connection !== this.connection || this.closed) return;
      this.streamChannel = channel;
      channel.bufferedAmountLowThreshold = STREAM_BUFFER_LIMIT / 2;
      channel.addEventListener('bufferedamountlow', () => { if (connection === this.connection) this.flushPendingStreams(); });
      channel.addEventListener('message', event => {
        if (connection !== this.connection || this.closed || typeof event.data !== 'string' || event.data.length > 48000) return;
        try { const message = JSON.parse(event.data); if (STREAM_TYPES.has(message.type)) this.receive(message); } catch { /* Discard malformed disposable state. */ }
      });
      channel.addEventListener('close', () => { if (this.streamChannel === channel) this.streamChannel = null; });
    };
    // PeerJS treats every incoming channel as its own primary channel. Route
    // our extra channel before that handler so control serialization is kept.
    const peerDataChannel = pc.ondatachannel;
    pc.ondatachannel = event => {
      if (event.channel.label === 'neon-wing-state') adopt(event.channel);
      else peerDataChannel?.call(pc, event);
    };
    if (!this.host) {
      try { adopt(pc.createDataChannel('neon-wing-state', { ordered: false, maxRetransmits: 0 })); }
      catch { /* The reliable connection remains available. */ }
    }
  }
  schedulePendingDrain() {
    if (this.pendingDrainTimer || this.closed) return;
    this.pendingDrainTimer = setTimeout(() => { this.pendingDrainTimer = null; this.flushPendingStreams(); }, 75);
  }
  flushPendingStreams() {
    if (this.closed || !this.connection?.open) return;
    for (const type of ['snapshot', 'input']) {
      const message = this.pendingStreams[type];
      if (!message) continue;
      if (this.isBackpressured()) { this.schedulePendingDrain(); return; }
      delete this.pendingStreams[type];
      this.transmit(message);
    }
  }
  transportLost(connection, reason = 'Route interrupted · restoring the link…') {
    if (this.closed || !connection || connection !== this.connection) return;
    if (!this.started) { this.connectionFailed(connection); return; }
    if (this.recovering) {
      clearTimeout(this.connectTimeout); clearTimeout(this.disconnectTimer);
      const old = this.connection;
      this.connection = null;
      try { old.close(); } catch { /* The route is already closed. */ }
      this.scheduleRecoveryAttempt();
      return;
    }
    this.recovering = true;
    this.recoveryAttempt = 0;
    this.recoveryDeadline = Date.now() + RECOVERY_GRACE;
    this.streamChannel = null;
    this.events.recovery?.(true);
    clearTimeout(this.connectTimeout); clearTimeout(this.disconnectTimer);
    clearTimeout(this.pendingDrainTimer); this.pendingDrainTimer = null; this.pendingStreams = {};
    const old = this.connection;
    this.connection = null;
    try { old.close(); } catch { /* The route is already closed. */ }
    this.events.status?.(reason);
    this.scheduleRecoveryAttempt(0);
  }
  scheduleRecoveryAttempt(delay = Math.min(5000, 800 + this.recoveryAttempt * 700)) {
    clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (this.closed || !this.recovering) return;
      if (this.host) return;
      if (Date.now() >= this.recoveryDeadline) { this.fail('The route could not be restored. Return to the menu and reconnect.'); return; }
      this.connectGuest();
    }, delay);
  }
  finishRecovery() {
    if (!this.recovering) return;
    this.recovering = false;
    this.recoveryAttempt = 0;
    this.recoveryDeadline = 0;
    clearTimeout(this.recoveryTimer); this.recoveryTimer = null;
    this.events.status?.('Route restored · synchronizing the flight…');
    this.events.recovery?.(false);
  }
  receive(d) {
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
    if (d.type === 'leave') { this.fail('Your wingmate left the flight. Return to the terminal to reconnect.'); return; }
    if (['input', 'snapshot', 'pause', 'pause-request', 'replay-request'].includes(d.type) && Number.isSafeInteger(d.runId) && d.runId !== (this.host ? this.replayId : this.lastReplayId)) return;
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
    }
    if (d.type === 'ping') { this.send({ type: 'pong', sent: d.sent }); return; }
    if (d.type === 'pong') { if (Number.isFinite(d.sent)) this.rtt = Math.max(0, Date.now() - d.sent); return; }
    if (d.type === 'reject') { this.fail(String(d.reason)); return; }
    if (this.host) {
      if (d.type === 'ready') {
        clearTimeout(this.connectTimeout);
        this.send({ type: 'start', settings:this.settings, replayId: this.replayId, flags: this.pauseFlags });
        if (!this.started) { this.started = true; this.events.start?.(this.settings); }
        else this.finishRecovery();
        this.publishPause();
      }
      if (d.type === 'input' && validInput(d.input)) this.events.input?.(d.input);
      if (d.type === 'pause-request' && typeof d.paused === 'boolean') { this.pauseFlags[1] = d.paused; this.publishPause(); }
      if (d.type === 'replay-request' && this.started && Number.isSafeInteger(d.requestId) && d.requestId > this.lastReplayRequestId) { this.lastReplayRequestId = d.requestId; this.events.replayRequest?.(); }
    } else {
      if (d.type === 'start') {
        clearTimeout(this.joinTimeout); clearTimeout(this.connectTimeout); clearInterval(this.readyTimer);
        this.settings=flightSettings(d.settings);
        if (Number.isSafeInteger(d.replayId) && d.replayId > this.lastReplayId) {
          this.lastReplayId = d.replayId; this.events.replay?.(this.settings);
        }
        if (Array.isArray(d.flags) && d.flags.length === 2 && d.flags.every(f => typeof f === 'boolean')) this.pauseFlags = d.flags;
        if (!this.started) { this.started = true; this.events.start?.(this.settings); this.events.pause?.([...this.pauseFlags]); }
        else { this.events.pause?.([...this.pauseFlags]); this.finishRecovery(); }
      }
      if (d.type === 'snapshot' && d.state && Array.isArray(d.state.players)) this.events.snapshot?.(d.state);
      if (d.type === 'pause' && Array.isArray(d.flags) && d.flags.length === 2 && d.flags.every(f => typeof f === 'boolean')) {
        this.pauseFlags = d.flags; this.events.pause?.([...d.flags]);
      }
      if (d.type === 'replay' && d.settings && Number.isSafeInteger(d.replayId) && d.replayId > this.lastReplayId) { this.lastReplayId = d.replayId; this.settings = flightSettings(d.settings); this.pauseFlags = [false, false]; this.events.replay?.(this.settings); }
    }
  }
  ready() { if (this.host) return; this.send({ type: 'ready' }); clearInterval(this.readyTimer); this.readyTimer = setInterval(() => { if (!this.started || this.recovering) this.send({ type: 'ready' }); }, 600); }
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
  fail(message) { if (this.closed) return; this.events.error?.(message); this.destroy(false); }
  destroy(notify = true) { if (this.closed) return; if (notify && this.connection?.open) { try { this.connection.send({ type: 'leave' }); } catch { /* Best-effort explicit departure. */ } } this.closed = true; clearTimeout(this.joinTimeout); clearInterval(this.heartbeat); clearInterval(this.readyTimer); clearTimeout(this.disconnectTimer); clearTimeout(this.retryTimer); clearTimeout(this.connectTimeout); clearTimeout(this.replayTimer); clearTimeout(this.replayRequestTimer); clearTimeout(this.pendingDrainTimer); clearTimeout(this.recoveryTimer); this.pendingStreams = {}; this.connection?.close(); this.peer?.destroy(); }
}
