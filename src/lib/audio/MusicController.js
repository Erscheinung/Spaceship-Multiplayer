const DEFAULT_SRC = '/audio/in-search-of-something-more.ogg';
const FALLBACK_SRC = '/audio/in-search-of-something-more.m4a';
const MUTE_KEY = 'neon-wing:music-muted';

function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function readMuted(storage) {
  try { return storage?.getItem(MUTE_KEY) === 'true'; } catch { return false; }
}

function writeMuted(storage, muted) {
  try { storage?.setItem(MUTE_KEY, String(muted)); } catch { /* private browsing */ }
}

/**
 * Small lifecycle wrapper for the game's one looping soundtrack. It never
 * throws for a missing codec, blocked autoplay, or unavailable localStorage;
 * those conditions should leave the game playable without music.
 */
export class MusicController {
  constructor({
    src = DEFAULT_SRC,
    volume = 0.32,
    storage = browserStorage(),
    documentRef = typeof document !== 'undefined' ? document : null,
    audioFactory = value => new Audio(value)
  } = {}) {
    this.src = src;
    this.volume = volume;
    this.storage = storage;
    this.documentRef = documentRef;
    this.audioFactory = audioFactory;
    this.audio = null;
    this.running = false;
    this.blocked = false;
    this.destroyed = false;
    this.muted = readMuted(storage);
    this.onVisibility = () => {
      if (this.documentRef?.hidden) this.pause();
    };
    this.documentRef?.addEventListener?.('visibilitychange', this.onVisibility);
  }

  ensureAudio() {
    if (this.audio || this.destroyed) return this.audio;
    try {
      const audio = this.audioFactory(this.src);
      if (this.src === DEFAULT_SRC && audio.canPlayType?.('audio/ogg; codecs=vorbis') === '') audio.src = FALLBACK_SRC;
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = this.volume;
      audio.setAttribute?.('aria-hidden', 'true');
      this.audio = audio;
    } catch {
      this.blocked = true;
    }
    return this.audio;
  }

  /**
   * Spend an explicit menu gesture unlocking future playback. The element is
   * immediately paused, so music does not start while the lobby is waiting.
   */
  unlock() {
    if (this.muted || this.destroyed || this.documentRef?.hidden) return Promise.resolve(false);
    const audio = this.ensureAudio();
    if (!audio) return Promise.resolve(false);
    audio.volume = this.running ? this.volume : 0;
    let result;
    try { result = audio.play?.(); } catch { result = Promise.reject(new Error('playback unavailable')); }
    return Promise.resolve(result).then(() => {
      // A very fast connection can launch before this gesture's play promise
      // settles; in that case the real game playback must remain active.
      if (!this.running || this.muted || this.destroyed || this.documentRef?.hidden) audio.pause?.();
      audio.volume = this.volume;
      this.blocked = false;
      return true;
    }).catch(() => {
      this.blocked = true;
      return false;
    });
  }

  play() {
    if (this.destroyed || this.documentRef?.hidden) return Promise.resolve(false);
    this.running = true;
    if (this.muted) return Promise.resolve(false);
    const audio = this.ensureAudio();
    if (!audio) return Promise.resolve(false);
    audio.volume = this.volume;
    let result;
    try { result = audio.play?.(); } catch { result = Promise.reject(new Error('playback unavailable')); }
    return Promise.resolve(result).then(() => {
      if (!this.running || this.muted || this.destroyed || this.documentRef?.hidden) { audio.pause?.(); return false; }
      this.blocked = false;
      return true;
    }).catch(() => {
      // Autoplay policy and codecs are outside the game's control. Keep the
      // requested running state so a later user gesture can retry playback.
      this.blocked = true;
      return false;
    });
  }

  pause() {
    this.running = false;
    try { this.audio?.pause?.(); } catch { /* a broken media element is harmless */ }
  }

  stop() {
    this.pause();
    try {
      if (this.audio) this.audio.currentTime = 0;
    } catch { /* media may not have loaded metadata yet */ }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    writeMuted(this.storage, this.muted);
    if (this.muted) this.pause();
    else if (this.running) void this.play();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.documentRef?.removeEventListener?.('visibilitychange', this.onVisibility);
    try {
      if (this.audio) {
        this.audio.removeAttribute?.('src');
        this.audio.load?.();
      }
    } catch { /* cleanup should remain best effort */ }
    this.audio = null;
  }
}

export { DEFAULT_SRC, FALLBACK_SRC, MUTE_KEY };
