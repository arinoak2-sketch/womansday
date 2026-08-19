/**
 * Local persistence.
 *
 * The app is private by default: everything lives in this browser, with no
 * account and no server. That makes the stored payload the single source of
 * truth, so loading is defensive — a corrupt or hand-edited document degrades
 * to the valid parts rather than throwing a blank screen at the user.
 */

import type {
  AccentName,
  AppData,
  Priority,
  Product,
  SavingsGoal,
  Settings,
  Transaction,
  TransactionCategory,
  TransactionType,
} from '../domain/types'
import { isCurrencyCode } from '../lib/money'

export const STORAGE_KEY = 'aurum.savings.v1'
export const CURRENT_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  currency: 'INR',
  sound: true,
  celebrations: true,
  motion: 'system',
  theme: 'system',
}

export function emptyData(): AppData {
  return { version: CURRENT_VERSION, settings: { ...DEFAULT_SETTINGS }, goals: [], transactions: [] }
}

/* ------------------------------------------------------------------ */
/* Storage access                                                      */
/* ------------------------------------------------------------------ */

/**
 * Safari in private mode, and any browser with storage disabled, throws on
 * `localStorage` access rather than returning null. Probing once up front lets
 * the rest of the app treat storage as simply absent.
 */
function getStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage
    if (!storage) return null
    const probe = '__aurum_probe__'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

const storage = getStorage()

export const storageAvailable = storage !== null

export function loadData(): AppData {
  if (!storage) return emptyData()
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    return parseAppData(JSON.parse(raw))
  } catch {
    // Unparseable payload. Rather than wiping it, start fresh in memory and
    // leave the original bytes on disk so nothing is destroyed silently.
    return emptyData()
  }
}

let writeHandle: number | undefined

/**
 * Writes are coalesced to the next frame. Rapid interactions (holding a quick
 * amount button, dragging a slider) then cost one serialization instead of one
 * per keystroke.
 */
export function saveData(data: AppData): void {
  if (!storage) return
  if (writeHandle !== undefined) clearTimeout(writeHandle)
  writeHandle = setTimeout(() => {
    writeHandle = undefined
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Quota exceeded or storage revoked mid-session. The in-memory document
      // stays authoritative for this session; nothing user-visible breaks.
    }
  }, 0) as unknown as number
}

export function clearStorage(): void {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    /* nothing meaningful to do */
  }
}

/* ------------------------------------------------------------------ */
/* Parsing / validation                                                */
/* ------------------------------------------------------------------ */

const ACCENTS: AccentName[] = ['amber', 'jade', 'plum', 'indigo', 'clay', 'slate']
const PRIORITIES: Priority[] = ['low', 'medium', 'high']
const CATEGORIES: TransactionCategory[] = [
  'allowance',
  'gift',
  'work',
  'pocket',
  'savings',
  'refund',
  'purchase',
  'emergency',
  'other',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** Coerce to a non-negative safe integer, or undefined when impossible. */
function intMinor(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const truncated = Math.trunc(value)
  if (!Number.isSafeInteger(truncated) || truncated < 0) return undefined
  return truncated
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

/**
 * Turn an unknown payload into a valid `AppData`.
 *
 * Records that can't be salvaged are dropped rather than repaired with guessed
 * values — a goal with no target is not a goal, and inventing one would be
 * worse than losing it.
 */
export function parseAppData(input: unknown): AppData {
  if (!isRecord(input)) return emptyData()

  const settings = parseSettings(input.settings)
  const goals: SavingsGoal[] = []
  const goalIds = new Set<string>()

  if (Array.isArray(input.goals)) {
    for (const raw of input.goals) {
      const goal = parseGoal(raw, settings)
      if (goal && !goalIds.has(goal.id)) {
        goals.push(goal)
        goalIds.add(goal.id)
      }
    }
  }

  const transactions: Transaction[] = []
  const txIds = new Set<string>()
  if (Array.isArray(input.transactions)) {
    for (const raw of input.transactions) {
      const tx = parseTransaction(raw)
      // Transactions pointing at a goal that no longer exists would silently
      // inflate lifetime totals, so they're dropped with the goal.
      if (tx && goalIds.has(tx.goalId) && !txIds.has(tx.id)) {
        transactions.push(tx)
        txIds.add(tx.id)
      }
    }
  }

  return { version: CURRENT_VERSION, settings, goals, transactions }
}

function parseSettings(input: unknown): Settings {
  if (!isRecord(input)) return { ...DEFAULT_SETTINGS }
  return {
    currency: isCurrencyCode(input.currency) ? input.currency : DEFAULT_SETTINGS.currency,
    sound: typeof input.sound === 'boolean' ? input.sound : DEFAULT_SETTINGS.sound,
    celebrations:
      typeof input.celebrations === 'boolean' ? input.celebrations : DEFAULT_SETTINGS.celebrations,
    motion: oneOf(input.motion, ['system', 'reduced', 'full'] as const, 'system'),
    theme: oneOf(input.theme, ['system', 'light', 'dark'] as const, 'system'),
    displayName: str(input.displayName)?.slice(0, 40),
    onboardedAt: str(input.onboardedAt),
  }
}

function parseGoal(input: unknown, settings: Settings): SavingsGoal | null {
  if (!isRecord(input)) return null
  const id = str(input.id)
  const name = str(input.name)
  const targetMinor = intMinor(input.targetMinor)
  if (!id || !name || targetMinor === undefined || targetMinor <= 0) return null

  return {
    id,
    name: name.slice(0, 60),
    targetMinor,
    currency: isCurrencyCode(input.currency) ? input.currency : settings.currency,
    accent: oneOf(input.accent, ACCENTS, 'amber'),
    priority: oneOf(input.priority, PRIORITIES, 'medium'),
    createdAt: str(input.createdAt) ?? new Date().toISOString(),
    targetDate: str(input.targetDate),
    note: str(input.note)?.slice(0, 280),
    product: parseProduct(input.product),
    celebratedMilestoneIds: Array.isArray(input.celebratedMilestoneIds)
      ? input.celebratedMilestoneIds.filter((v): v is string => typeof v === 'string')
      : [],
    completedAt: str(input.completedAt),
    archivedAt: str(input.archivedAt),
  }
}

function parseProduct(input: unknown): Product | undefined {
  if (!isRecord(input)) return undefined
  const id = str(input.id)
  const title = str(input.title)
  if (!id || !title) return undefined

  const snapshots = Array.isArray(input.snapshots)
    ? input.snapshots.flatMap((raw) => {
        if (!isRecord(raw)) return []
        const snapshotId = str(raw.id)
        const amountMinor = intMinor(raw.amountMinor)
        const retrievedAt = str(raw.retrievedAt)
        if (!snapshotId || amountMinor === undefined || !retrievedAt) return []
        return [
          {
            id: snapshotId,
            amountMinor,
            retrievedAt,
            currency: isCurrencyCode(raw.currency) ? raw.currency : ('INR' as const),
            providerId: str(raw.providerId) ?? 'unknown',
            sources: Array.isArray(raw.sources)
              ? raw.sources.flatMap((s) => {
                  if (!isRecord(s)) return []
                  const retailer = str(s.retailer)
                  const sourceAmount = intMinor(s.amountMinor)
                  if (!retailer || sourceAmount === undefined) return []
                  return [
                    {
                      retailer,
                      amountMinor: sourceAmount,
                      currency: isCurrencyCode(s.currency) ? s.currency : ('INR' as const),
                      url: str(s.url),
                    },
                  ]
                })
              : [],
          },
        ]
      })
    : []

  return {
    id,
    title: title.slice(0, 140),
    imageUrl: str(input.imageUrl),
    brand: str(input.brand),
    description: str(input.description)?.slice(0, 500),
    url: str(input.url),
    variants: Array.isArray(input.variants)
      ? input.variants.filter((v): v is string => typeof v === 'string').slice(0, 12)
      : undefined,
    snapshots,
  }
}

function parseTransaction(input: unknown): Transaction | null {
  if (!isRecord(input)) return null
  const id = str(input.id)
  const goalId = str(input.goalId)
  const amountMinor = intMinor(input.amountMinor)
  const at = str(input.at)
  if (!id || !goalId || amountMinor === undefined || amountMinor <= 0 || !at) return null
  if (Number.isNaN(new Date(at).getTime())) return null

  return {
    id,
    goalId,
    amountMinor,
    at,
    type: oneOf<TransactionType>(input.type, ['add', 'spend'], 'add'),
    note: str(input.note)?.slice(0, 280),
    category: typeof input.category === 'string' && CATEGORIES.includes(input.category as TransactionCategory)
      ? (input.category as TransactionCategory)
      : undefined,
  }
}

/* ------------------------------------------------------------------ */
/* Export / import                                                     */
/* ------------------------------------------------------------------ */

export function serializeForExport(data: AppData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)
}

export type ImportResult =
  | { ok: true; data: AppData; goalCount: number; transactionCount: number }
  | { ok: false; message: string }

export function parseImport(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, message: "That file isn't valid JSON, so it can't be read." }
  }
  if (!isRecord(raw) || !Array.isArray(raw.goals)) {
    return { ok: false, message: "That file doesn't look like an Aurum backup." }
  }
  const data = parseAppData(raw)
  if (data.goals.length === 0 && (raw.goals as unknown[]).length > 0) {
    return { ok: false, message: 'None of the goals in that file could be read.' }
  }
  return {
    ok: true,
    data,
    goalCount: data.goals.length,
    transactionCount: data.transactions.length,
  }
}
