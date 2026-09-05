/**
 * Tiny synthesised sound engine.
 *
 * There are no audio files: every cue is built from an oscillator plus a gain
 * envelope on a single shared `AudioContext`. Browsers block audio before a
 * user gesture, so the context is created lazily and `resume()`d on demand —
 * and every path is wrapped so a failure is silent and never fatal.
 *
 * Peak gain is deliberately low (see `PEAK_GAIN`) so the cues stay unobtrusive
 * even for users who ask for reduced motion.
 */

export type SoundName = 'trade-open' | 'trade-win' | 'trade-loss' | 'trade-draw' | 'tick';

const STORAGE_KEY = 'cd:sound-enabled';

/** Kept low on purpose: audible, never jarring. */
const PEAK_GAIN = 0.06;
const TICK_GAIN = 0.025;

interface Note {
  /** Hz. */
  freq: number;
  /** Seconds from the start of the cue. */
  at: number;
  /** Seconds. */
  duration: number;
  type: OscillatorType;
  gain: number;
}

const note = (
  freq: number,
  at: number,
  duration: number,
  gain = PEAK_GAIN,
  type: OscillatorType = 'sine',
): Note => ({ freq, at, duration, gain, type });

const CUES: Record<SoundName, Note[]> = {
  // Short rising two-note blip.
  'trade-open': [note(523.25, 0, 0.09), note(783.99, 0.09, 0.13)],
  // Bright ascending three-note arpeggio.
  'trade-win': [
    note(659.25, 0, 0.1, PEAK_GAIN, 'triangle'),
    note(830.61, 0.1, 0.1, PEAK_GAIN, 'triangle'),
    note(1046.5, 0.2, 0.22, PEAK_GAIN, 'triangle'),
  ],
  // Low descending two-note tone.
  'trade-loss': [
    note(311.13, 0, 0.14, PEAK_GAIN, 'sine'),
    note(196.0, 0.14, 0.26, PEAK_GAIN, 'sine'),
  ],
  // Single neutral tone.
  'trade-draw': [note(440, 0, 0.2)],
  // Very short quiet click for the final seconds.
  tick: [note(1200, 0, 0.035, TICK_GAIN, 'square')],
};

type AudioContextCtor = new () => AudioContext;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  try {
    const w = window as Window & { webkitAudioContext?: AudioContextCtor };
    const Ctor: AudioContextCtor | undefined = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

/** Whether the user has sound cues switched on. Defaults to on. */
export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* storage unavailable (private mode) — the preference simply does not persist. */
  }
}

/** True when the user asked the OS for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function scheduleNote(ctx: AudioContext, item: Note, startAt: number, scale: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const begin = startAt + item.at;
  const end = begin + item.duration;
  const peak = item.gain * scale;

  oscillator.type = item.type;
  oscillator.frequency.setValueAtTime(item.freq, begin);

  // Tiny attack/decay ramps avoid the click a hard gate would produce.
  gain.gain.setValueAtTime(0.0001, begin);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), begin + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  // Nodes are disposed as soon as they finish so nothing accumulates.
  oscillator.onended = () => {
    try {
      oscillator.disconnect();
      gain.disconnect();
    } catch {
      /* already torn down */
    }
  };

  oscillator.start(begin);
  oscillator.stop(end + 0.02);
}

/**
 * Play a cue. Never throws, never blocks — if audio is unavailable or the
 * context cannot be resumed, the call is simply a no-op.
 */
export function playSound(name: SoundName): void {
  if (typeof window === 'undefined') return;
  if (!isSoundEnabled()) return;

  const ctx = getContext();
  if (!ctx) return;

  const emit = () => {
    try {
      if (ctx.state !== 'running') return;
      // Reduced motion keeps things gentler still.
      const scale = prefersReducedMotion() ? 0.7 : 1;
      const startAt = ctx.currentTime + 0.01;
      for (const item of CUES[name]) scheduleNote(ctx, item, startAt, scale);
    } catch {
      /* audio is a nicety — never let it break the UI */
    }
  };

  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().then(emit, () => undefined);
      return;
    }
    emit();
  } catch {
    /* ignored */
  }
}

/** Best-effort unlock, safe to call from any user gesture. */
export function primeSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  } catch {
    /* ignored */
  }
}
