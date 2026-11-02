/**
 * Typewriter sounds played from the real MP3 recordings (Click/Delete/Enter/
 * Space) shipped in /public/audio. If an MP3 can't load (offline, very first
 * keystroke before the asset arrives), playback falls back to the Web Audio
 * synth so the editor never feels dead.
 *
 * Sound is on by default (opt-out via the editor toggle or admin Settings);
 * the preference persists per device via localStorage.
 */

let ctx: AudioContext | null = null;

const KEY = "scribo:typewriter-sfx";

/**
 * Sound is ON by default (opt-out via the editor toggle or admin Settings);
 * the preference persists per device via localStorage. Read synchronously at
 * module load so the very first render is already correct — no on/off flash.
 */
let sfxEnabled = (() => {
  try {
    return typeof window === "undefined" || localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
})();

/* Observable store so components can subscribe without setState-in-effect. */
type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange() {
  for (const l of listeners) l();
}

export function subscribeTypewriterSfx(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTypewriterSfxEnabled(): boolean {
  return sfxEnabled;
}

/** Turn the typewriter sound on/off (persisted per device). */
export function setTypewriterSfx(enabled: boolean): void {
  sfxEnabled = enabled;
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable — keep in-memory state */
  }
  emitChange();
}

/** Call once in a client effect to restore the saved preference (on unless explicitly disabled). */
export function initTypewriterSfx(): void {
  try {
    sfxEnabled = localStorage.getItem(KEY) !== "0";
  } catch {
    sfxEnabled = true;
  }
  emitChange();
}

/* --------------------------- MP3 playback --------------------------- */

type SoundName = "click" | "delete" | "enter" | "space";

const SOUND_URLS: Record<SoundName, string> = {
  click: "/audio/click.mp3",
  delete: "/audio/delete.mp3",
  enter: "/audio/enter.mp3",
  space: "/audio/space.mp3",
};

const audioCache: Partial<Record<SoundName, HTMLAudioElement | null>> = {};

function getAudio(name: SoundName): HTMLAudioElement | null {
  if (audioCache[name] === undefined) {
    try {
      const el = new Audio(SOUND_URLS[name]);
      el.preload = "auto";
      audioCache[name] = el;
    } catch {
      audioCache[name] = null;
    }
  }
  return audioCache[name] ?? null;
}

/**
 * Play an MP3, restarting from the start on every call so fast typing
 * re-triggers cleanly instead of overlapping. Falls back to the synth on
 * failure so the editor still makes a sound offline.
 */
function playSound(name: SoundName, fallback: () => void): void {
  if (!sfxEnabled) return;
  const el = getAudio(name);
  if (!el) {
    fallback();
    return;
  }
  try {
    el.currentTime = 0;
    const p = el.play();
    if (p) p.catch(() => fallback());
  } catch {
    fallback();
  }
}

/* ----------------------- Web Audio synth fallbacks ----------------------- */

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/** Short mechanical "clack" — used for keys, space and delete fallbacks. */
function synthTypeKey(): void {
  const audio = getCtx();
  if (!audio) return;

  const t = audio.currentTime;
  const duration = 0.045;

  const noiseLength = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, noiseLength, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLength);
  }
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const bp = audio.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1900;
  bp.Q.value = 0.8;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(bp).connect(gain).connect(audio.destination);
  src.start(t);

  const osc = audio.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.03);
  const oGain = audio.createGain();
  oGain.gain.setValueAtTime(0.35, t);
  oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  osc.connect(oGain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.04);
}

/** Classic carriage-return bell — used for the Enter fallback. */
function synthTypeReturn(): void {
  const audio = getCtx();
  if (!audio) return;

  const t = audio.currentTime;
  const strike = (freq: number, at: number, peak: number, decay: number) => {
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  };

  strike(1318, t, 0.25, 0.55); // E6
  strike(1975, t + 0.002, 0.18, 0.45); // B6
  strike(2637, t + 0.004, 0.12, 0.35); // E7
  strike(3951, t + 0.006, 0.05, 0.25); // B7

  const thump = audio.createOscillator();
  thump.type = "triangle";
  thump.frequency.setValueAtTime(120, t + 0.05);
  thump.frequency.exponentialRampToValueAtTime(60, t + 0.1);
  const tg = audio.createGain();
  tg.gain.setValueAtTime(0.18, t + 0.05);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  thump.connect(tg).connect(audio.destination);
  thump.start(t + 0.05);
  thump.stop(t + 0.13);
}

export const typewriterSfx = {
  playTypeKey: () => playSound("click", synthTypeKey),
  playTypeDelete: () => playSound("delete", synthTypeKey),
  playTypeReturn: () => playSound("enter", synthTypeReturn),
  playTypeSpace: () => playSound("space", synthTypeKey),
};
