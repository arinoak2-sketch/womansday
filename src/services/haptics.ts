/**
 * Haptic feedback, where the device supports it.
 *
 * `navigator.vibrate` is Android/Chrome only — iOS Safari has no web haptics
 * API at all. This is strictly an enhancement: the patterns are short, and
 * everything degrades to nothing on devices that can't buzz.
 */

export type HapticPattern = 'tap' | 'confirm' | 'warn' | 'celebrate'

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  confirm: [10, 40, 16],
  warn: [24, 60, 24],
  celebrate: [12, 40, 12, 40, 28],
}

export function vibrate(pattern: HapticPattern): void {
  try {
    const nav = globalThis.navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }
    nav?.vibrate?.(PATTERNS[pattern])
  } catch {
    // Some browsers throw when vibration is blocked by a permissions policy.
  }
}
