// Small original courier motifs. The music mute switch also silences these.
// No timers: suspension cancels pending tones on pause, blur and replay.
export class DeliveryAudio {
  constructor() { this.context = null; this.voices = new Set(); }
  unlock() {
    try {
      const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Context) return;
      this.context ??= new Context();
      void this.context.resume().catch(() => {});
    } catch { /* Audio is optional, including restricted mobile contexts. */ }
  }
  play(kind, variation = 0) {
    const context = this.context;
    if (!context || context.state !== 'running' || this.voices.size > 10) return;
    const notes = kind === 'delivery' ? [392, 494, 587, 784] : kind === 'collect' ? [587, 784] : [294, 392];
    const now = context.currentTime;
    for (const [index, note] of notes.entries()) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const start = now + index * .065, duration = kind === 'delivery' ? .24 : .14;
      oscillator.type = kind === 'release' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(note * (variation % 3 === 1 ? 1.125 : 1), start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.045, start + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(gain); gain.connect(context.destination);
      this.voices.add(oscillator);
      oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + duration + .01);
    }
  }
  stop() {
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } }
    this.voices.clear();
  }
  destroy() { this.stop(); void this.context?.close().catch(() => {}); this.context = null; }
}
