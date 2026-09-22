import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUTE_KEY, MusicController } from '../src/lib/audio/MusicController.js';

class FakeAudio {
  constructor(src) { this.src = src; this.loop = false; this.preload = ''; this.volume = 0; this.currentTime = 4; this.playCalls = 0; this.pauseCalls = 0; this.rejectPlay = false; }
  play() { this.playCalls += 1; return this.rejectPlay ? Promise.reject(new Error('autoplay blocked')) : Promise.resolve(); }
  pause() { this.pauseCalls += 1; }
  setAttribute() {}
  removeAttribute() {}
  load() {}
}

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function documentRef() {
  const listeners = new Map();
  return {
    hidden: false,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
    dispatch(name) { listeners.get(name)?.(); },
    listenerCount: name => listeners.has(name) ? 1 : 0
  };
}

test('music loops quietly, persists mute, and pauses with page visibility', async () => {
  const saved = storage();
  const doc = documentRef();
  let audio;
  const music = new MusicController({ storage: saved, documentRef: doc, volume: 0.27, audioFactory: src => (audio = new FakeAudio(src)) });

  assert.equal(music.muted, false);
  await music.play();
  assert.equal(audio.src, '/audio/in-search-of-something-more.ogg');
  assert.equal(audio.loop, true);
  assert.equal(audio.preload, 'auto');
  assert.equal(audio.volume, 0.27);
  assert.equal(music.running, true);
  assert.equal(doc.listenerCount('visibilitychange'), 1);

  doc.hidden = true;
  doc.dispatch('visibilitychange');
  assert.equal(music.running, false);
  assert.equal(audio.pauseCalls, 1);

  music.setMuted(true);
  assert.equal(saved.getItem(MUTE_KEY), 'true');
  assert.equal(new MusicController({ storage: saved, documentRef: documentRef() }).muted, true);
  music.destroy();
  assert.equal(doc.listenerCount('visibilitychange'), 0);
});

test('autoplay rejection is recoverable and does not escape as a game error', async () => {
  const doc = documentRef();
  let audio;
  const music = new MusicController({ documentRef: doc, audioFactory: src => (audio = new FakeAudio(src)) });
  assert.equal(await music.unlock(), true);
  assert.equal(music.running, false);
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.pauseCalls, 1);
  audio.rejectPlay = true;
  const failed = await music.play();
  assert.equal(failed, false);
  assert.equal(music.blocked, true);
  audio.rejectPlay = false;
  assert.equal(await music.play(), true);
  assert.equal(music.blocked, false);
  music.destroy();
});

test('hidden pages do not start music and delayed playback cannot outlive pause', async () => {
  const doc = documentRef();
  let settle;
  const audio = new FakeAudio('track');
  audio.play = () => new Promise(resolve => { settle = resolve; });
  const music = new MusicController({ documentRef: doc, audioFactory: () => audio });
  doc.hidden = true;
  assert.equal(await music.play(), false);
  assert.equal(music.audio, null);
  doc.hidden = false;
  const pending = music.play();
  music.pause();
  settle();
  assert.equal(await pending, false);
  assert.equal(music.running, false);
  assert.equal(audio.pauseCalls, 2);
  music.destroy();
});

test('unsupported Ogg selects the AAC copy and lobby unlock is silent', async () => {
  const audio = new FakeAudio('track');
  audio.canPlayType = () => '';
  let volumeAtPlay;
  audio.play = () => { volumeAtPlay = audio.volume; return Promise.resolve(); };
  const music = new MusicController({ documentRef: documentRef(), audioFactory: () => audio });
  await music.unlock();
  assert.equal(audio.src, '/audio/in-search-of-something-more.m4a');
  assert.equal(volumeAtPlay, 0);
  assert.equal(audio.pauseCalls, 1);
  await music.play();
  assert.equal(volumeAtPlay, 0.32);
  music.destroy();
});
