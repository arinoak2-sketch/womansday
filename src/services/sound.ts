/**
 * Synthesized sound design.
 *
 * Every cue is generated with the Web Audio API rather than shipped as audio
 * files: no network requests, no decode latency, and the whole language stays
 * tunable from one table. Sound is a garnish — if the browser blocks audio,
 * has no Web Audio, or the context refuses to start, every call here becomes a
 * silent no-op and the app behaves identically.
 */

export type SoundName =
  | 'tap'
  | 'add'
  | 'spend'
  | 'milestone'
  | 'complete'
  | 'error'
  | 'success'
  | 'open'

interface Note {
  /** Frequency in Hz. */
  freq: number
  /** Seconds from the start of the cue. */
  at: number
  /** Seconds. */
  duration: number
  /** Relative loudness, 0–1. */
  gain: number
  type?: OscillatorType
}

/**
 * A restrained palette: mostly triangle waves around a C-major arpeggio, so
 * cues feel related. The two "negative" cues sit lower and use a softer sine
 * to read as informative rather than punitive.
 */
const CUES: Record<SoundName, Note[]> = {
  tap: [{ freq: 1046.5, at: 0, duration: 0.035, gain: 0.16, type: 'sine' }],
  open: [{ freq: 784, at: 0, duration: 0.05, gain: 0.14, type: 'sine' }],
  add: [
    { freq: 659.25, at: 0, duration: 0.09, gain: 0.3 },
    { freq: 987.77, at: 0.055, duration: 0.16, gain: 0.26 },
  ],
  spend: [
    { freq: 587.33, at: 0, duration: 0.09, gain: 0.24, type: 'sine' },
    { freq: 440, at: 0.06, duration: 0.16, gain: 0.2, type: 'sine' },
  ],
  success: [
    { freq: 880, at: 0, duration: 0.1, gain: 0.24 },
    { freq: 1318.5, at: 0.06, duration: 0.2, gain: 0.18 },
  ],
  milestone: [
    { freq: 523.25, at: 0, duration: 0.14, gain: 0.28 },
    { freq: 659.25, at: 0.075, duration: 0.14, gain: 0.28 },
    { freq: 783.99, at: 0.15, duration: 0.16, gain: 0.28 },
    { freq: 1046.5, at: 0.225, duration: 0.5, gain: 0.3 },
    { freq: 1567.98, at: 0.24, duration: 0.6, gain: 0.1, type: 'sine' },
  ],
  complete: [
    { freq: 523.25, at: 0, duration: 0.16, gain: 0.3 },
    { freq: 659.25, at: 0.09, duration: 0.16, gain: 0.3 },
    { freq: 783.99, at: 0.18, duration: 0.16, gain: 0.3 },
    { freq: 1046.5, at: 0.27, duration: 0.22, gain: 0.32 },
    { freq: 1318.5, at: 0.38, duration: 0.9, gain: 0.28 },
    { freq: 1567.98, at: 0.4, duration: 1.0, gain: 0.14, type: 'sine' },
    { freq: 2093, at: 0.42, duration: 1.1, gain: 0.07, type: 'sine' },
  ],
  error: [
    { freq: 311.13, at: 0, duration: 0.1, gain: 0.22, type: 'sine' },
    { freq: 233.08, at: 0.08, duration: 0.18, gain: 0.2, type: 'sine' },
  ],
}

/** Overall ceiling. Cues are designed to sit under the UI, not over it. */
const MASTER_GAIN = 0.22

type AudioContextCtor = typeof AudioContext

let context: AudioContext | null = null
let master: GainNode | null = null
let unavailable = false
let enabled = true

function getContextCtor(): AudioContextCtor | null {
  const w = globalThis as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function ensureContext(): AudioContext | null {
  if (unavailable) return null
  if (context) return context
  const Ctor = getContextCtor()
  if (!Ctor) {
    unavailable = true
    return null
  }
  try {
    context = new Ctor()
    master = context.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(context.destination)
    return context
  } catch {
    unavailable = true
    return null
  }
}

/**
 * Browsers only allow audio to start inside a user gesture. Call this from a
 * real interaction (a click, a key press) to unlock the context; it is safe to
 * call repeatedly and does nothing if audio isn't available.
 */
export function primeAudio(): void {
  const ctx = ensureContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
}

export function setSoundEnabled(value: boolean): void {
  enabled = value
}

export function isSoundAvailable(): boolean {
  return !unavailable && getContextCtor() !== null
}

/** Play a cue. Never throws, never blocks, and is a no-op when muted. */
export function playSound(name: SoundName): void {
  if (!enabled) return
  const ctx = ensureContext()
  if (!ctx || !master) return

  // A context that is still suspended (no gesture yet) would schedule notes
  // that all fire at once when it resumes. Skipping is the honest behaviour.
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined)
    if (ctx.state === 'suspended') return
  }

  const notes = CUES[name]
  if (!notes) return

  const start = ctx.currentTime + 0.005
  try {
    for (const note of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = note.type ?? 'triangle'
      osc.frequency.setValueAtTime(note.freq, start + note.at)

      // Short attack, exponential decay. Exponential ramps can't reach zero,
      // hence the tiny floor before the hard stop.
      const noteStart = start + note.at
      const noteEnd = noteStart + note.duration
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd)

      osc.connect(gain)
      gain.connect(master)
      osc.start(noteStart)
      osc.stop(noteEnd + 0.02)
      osc.onended = () => {
        osc.disconnect()
        gain.disconnect()
      }
    }
  } catch {
    // A failed cue must never interrupt the interaction that triggered it.
  }
}
