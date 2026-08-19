/**
 * Core data models.
 *
 * Money rule: every monetary value in this app is an integer count of the
 * currency's *minor units* (paise for INR, cents for USD, and so on). Floats
 * never touch a balance. See `lib/money.ts`.
 *
 * Derivation rule: a goal's saved balance is NEVER stored. It is always
 * recomputed from that goal's transactions, so editing or deleting a
 * transaction can't leave a stale total behind. See `domain/selectors.ts`.
 */

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'AED' | 'SGD'

export type Priority = 'low' | 'medium' | 'high'

export type TransactionType = 'add' | 'spend'

/** Where money came from (for `add`) or went (for `spend`). Free-form `other`. */
export type TransactionCategory =
  | 'allowance'
  | 'gift'
  | 'work'
  | 'pocket'
  | 'savings'
  | 'refund'
  | 'purchase'
  | 'emergency'
  | 'other'

/** One of six curated palettes; gives each goal its own visual identity. */
export type AccentName = 'amber' | 'jade' | 'plum' | 'indigo' | 'clay' | 'slate'

/** A price observed at a single retailer at a point in time. */
export interface PriceSource {
  /** Retailer / site name, e.g. "Amazon". */
  retailer: string
  amountMinor: number
  currency: CurrencyCode
  url?: string
}

/**
 * A dated record of what a product cost. Snapshots are append-only history:
 * we keep them so the UI can always say *when* a price was learned, and never
 * present a retrieved price as though it were current forever.
 */
export interface PriceSnapshot {
  id: string
  /** ISO-8601 timestamp of when this price was retrieved. */
  retrievedAt: string
  /** The representative price chosen across sources (usually the median). */
  amountMinor: number
  currency: CurrencyCode
  sources: PriceSource[]
  /** Identifier of the ProductSearchProvider that produced this snapshot. */
  providerId: string
}

/** Product metadata attached to a goal. Deliberately self-contained: a goal
 *  keeps working even if the retailer or the search provider disappears. */
export interface Product {
  id: string
  title: string
  /** Remote image URL. Always treated as optional and allowed to fail. */
  imageUrl?: string
  brand?: string
  description?: string
  /** Canonical product page, if the provider gave us one. */
  url?: string
  variants?: string[]
  snapshots: PriceSnapshot[]
}

export interface SavingsGoal {
  id: string
  name: string
  /** Target in minor units of `currency`. Always > 0. */
  targetMinor: number
  currency: CurrencyCode
  accent: AccentName
  priority: Priority
  /** ISO-8601 creation timestamp. */
  createdAt: string
  /** ISO-8601 date (YYYY-MM-DD) the user wants this by. Optional. */
  targetDate?: string
  note?: string
  product?: Product
  /**
   * Milestone ids we have already celebrated, so a milestone never fires
   * twice. Whether a milestone is *achieved* is derived from progress; this
   * list only records that the user has already seen the celebration.
   */
  celebratedMilestoneIds: string[]
  /** Set the first time the goal reaches 100%. Cleared if it drops back below. */
  completedAt?: string
  /** Archived goals stay readable but leave the active dashboard. */
  archivedAt?: string
}

export interface Transaction {
  id: string
  goalId: string
  type: TransactionType
  /** Always a positive integer; `type` carries the direction. */
  amountMinor: number
  /** ISO-8601 timestamp. Carries both date and time. */
  at: string
  note?: string
  category?: TransactionCategory
}

export type ThemePreference = 'system' | 'light' | 'dark'
export type MotionPreference = 'system' | 'reduced' | 'full'

export interface Settings {
  currency: CurrencyCode
  /** Master switch for the synthesized sound effects. */
  sound: boolean
  /** Confetti / celebration overlays. Independent of `motion`. */
  celebrations: boolean
  motion: MotionPreference
  theme: ThemePreference
  /** Name used in greetings. Optional — onboarding never forces it. */
  displayName?: string
  onboardedAt?: string
}

/** The whole persisted document. `version` drives migrations. */
export interface AppData {
  version: number
  settings: Settings
  goals: SavingsGoal[]
  transactions: Transaction[]
}

/* ------------------------------------------------------------------ */
/* Milestones                                                          */
/* ------------------------------------------------------------------ */

export type MilestoneKind = 'percent' | 'amount' | 'completion'

/**
 * Milestones are *generated* from a goal's shape rather than stored, so they
 * stay correct when a target is edited. Only `celebratedMilestoneIds` persists.
 */
export interface Milestone {
  /** Stable within a goal, e.g. `percent:50` or `amount:100000`. */
  id: string
  kind: MilestoneKind
  /** Minor-unit balance at which this milestone is reached. */
  thresholdMinor: number
  label: string
  blurb: string
}

export interface MilestoneState extends Milestone {
  achieved: boolean
  /** 0–1 progress toward this specific milestone. */
  progress: number
}
