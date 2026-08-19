/**
 * Money is stored as an integer number of minor units (paise, cents, …).
 *
 * Nothing in this module multiplies a user-supplied decimal by 100. Parsing
 * works on the *digit strings* either side of the decimal separator, so
 * `19.99` becomes exactly `1999` rather than `1998.9999999999998`.
 */

import type { CurrencyCode } from '../domain/types'

interface CurrencyMeta {
  code: CurrencyCode
  name: string
  symbol: string
  /** Number of decimal digits in the minor unit. JPY has none. */
  digits: number
  /** Locale used for grouping, so INR gets 1,00,000 rather than 100,000. */
  locale: string
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', digits: 2, locale: 'en-IN' },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', digits: 2, locale: 'en-US' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', digits: 2, locale: 'en-IE' },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', digits: 2, locale: 'en-GB' },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', digits: 0, locale: 'ja-JP' },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: '$', digits: 2, locale: 'en-AU' },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: '$', digits: 2, locale: 'en-CA' },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', digits: 2, locale: 'en-AE' },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: '$', digits: 2, locale: 'en-SG' },
}

export const CURRENCY_LIST = Object.values(CURRENCIES)

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES
}

export function currencyMeta(currency: CurrencyCode): CurrencyMeta {
  return CURRENCIES[currency] ?? CURRENCIES.INR
}

/** 10 ** digits, e.g. 100 for INR, 1 for JPY. */
export function minorUnitScale(currency: CurrencyCode): number {
  return 10 ** currencyMeta(currency).digits
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export type ParseAmountError =
  | 'empty'
  | 'not-a-number'
  | 'negative'
  | 'too-precise'
  | 'too-large'
  | 'zero'

export type ParseAmountResult =
  | { ok: true; minor: number }
  | { ok: false; error: ParseAmountError; message: string }

/**
 * Largest balance we accept: 1 trillion major units. Well inside
 * Number.MAX_SAFE_INTEGER even at 2 decimal digits, so integer arithmetic on
 * minor units is always exact.
 */
export const MAX_MAJOR_UNITS = 1_000_000_000_000

const PARSE_MESSAGES: Record<ParseAmountError, string> = {
  empty: 'Enter an amount.',
  'not-a-number': "That doesn't look like an amount. Try a number like 2000.",
  negative: 'Enter a positive amount.',
  'too-precise': 'That has more decimal places than this currency uses.',
  'too-large': 'That amount is larger than this app can track.',
  zero: 'Enter an amount greater than zero.',
}

function fail(error: ParseAmountError): ParseAmountResult {
  return { ok: false, error, message: PARSE_MESSAGES[error] }
}

/**
 * Parse a human-typed amount into minor units.
 *
 * Accepts currency symbols, spaces, and comma grouping (including the Indian
 * 1,00,000 style). Rejects anything ambiguous rather than guessing.
 */
export function parseAmount(
  input: string,
  currency: CurrencyCode,
  opts: { allowZero?: boolean } = {},
): ParseAmountResult {
  const raw = (input ?? '').trim()
  if (raw === '') return fail('empty')

  // Strip currency symbols, spaces, and grouping separators. Keep digits, a
  // single decimal point, and a leading sign so we can reject negatives loudly.
  const cleaned = raw
    .replace(/[\s  ]/g, '')
    .replace(/[₹$€£¥]|د\.إ/g, '')
    .replace(/,/g, '')

  if (cleaned === '') return fail('empty')
  if (cleaned.startsWith('-')) return fail('negative')

  if (!/^\+?\d*(\.\d*)?$/.test(cleaned)) return fail('not-a-number')

  const unsigned = cleaned.replace(/^\+/, '')
  const [wholeRaw = '', fractionRaw = ''] = unsigned.split('.')
  if (wholeRaw === '' && fractionRaw === '') return fail('not-a-number')

  const digits = currencyMeta(currency).digits
  // Trailing zeros beyond the currency's precision are harmless (`10.500`),
  // but a real digit there means the user asked for precision we can't hold.
  const significantFraction = fractionRaw.replace(/0+$/, '')
  if (significantFraction.length > digits) return fail('too-precise')

  const whole = wholeRaw === '' ? '0' : wholeRaw
  if (Number(whole) >= MAX_MAJOR_UNITS) return fail('too-large')

  const fraction = fractionRaw.slice(0, digits).padEnd(digits, '0')
  const minor = Number(whole) * 10 ** digits + Number(fraction || '0')

  if (!Number.isSafeInteger(minor)) return fail('too-large')
  if (minor === 0 && !opts.allowZero) return fail('zero')

  return { ok: true, minor }
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const formatterCache = new Map<string, Intl.NumberFormat>()

function getFormatter(key: string, build: () => Intl.NumberFormat): Intl.NumberFormat {
  let cached = formatterCache.get(key)
  if (!cached) {
    cached = build()
    formatterCache.set(key, cached)
  }
  return cached
}

export interface FormatMoneyOptions {
  /** Drop `.00` when the amount is a whole major unit. Default true. */
  trimZeroFraction?: boolean
  /** Render without the currency symbol. */
  omitSymbol?: boolean
  /** Always show a leading + or −. */
  signed?: boolean
}

/** Format minor units for display, e.g. `1850000` INR → `₹18,500`. */
export function formatMoney(
  minor: number,
  currency: CurrencyCode,
  options: FormatMoneyOptions = {},
): string {
  const { trimZeroFraction = true, omitSymbol = false, signed = false } = options
  const meta = currencyMeta(currency)
  const safeMinor = Number.isFinite(minor) ? Math.trunc(minor) : 0
  const absMinor = Math.abs(safeMinor)
  const scale = 10 ** meta.digits
  const value = absMinor / scale

  const hasFraction = meta.digits > 0 && absMinor % scale !== 0
  const fractionDigits = trimZeroFraction && !hasFraction ? 0 : meta.digits

  const key = `${meta.locale}:${currency}:${fractionDigits}:${omitSymbol}`
  const formatter = getFormatter(key, () =>
    new Intl.NumberFormat(meta.locale, {
      style: omitSymbol ? 'decimal' : 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }),
  )

  const body = formatter.format(value)
  if (signed) return `${safeMinor < 0 ? '−' : '+'}${body}`
  return safeMinor < 0 ? `−${body}` : body
}

/**
 * Short form for dense UI such as chart axis ticks: `₹1.2L`, `$48.9K`.
 *
 * INR is handled explicitly rather than via `Intl`'s compact notation. CLDR's
 * `en-IN` compact data abbreviates a thousand as "T" — so ₹30,000 renders as
 * "₹30T", which reads as *trillions* to almost everyone. Indian numbering has
 * no common short form below a lakh, so amounts under that are simply printed
 * in full and lakh/crore are used above it.
 */
export function formatMoneyCompact(minor: number, currency: CurrencyCode): string {
  const meta = currencyMeta(currency)
  const value = Math.abs(minor) / 10 ** meta.digits
  const sign = minor < 0 ? '−' : ''
  const symbol = meta.symbol

  if (currency === 'INR') {
    const LAKH = 100_000
    const CRORE = 10_000_000
    if (value < LAKH) return formatMoney(minor, currency)
    if (value < CRORE) return `${sign}${symbol}${trimTrailingZero(value / LAKH)}L`
    return `${sign}${symbol}${trimTrailingZero(value / CRORE)}Cr`
  }

  // Below the threshold the exact number is short enough to just show.
  if (value < 10_000) return formatMoney(minor, currency)

  const key = `compact:${meta.locale}:${currency}`
  const formatter = getFormatter(key, () =>
    new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: 'compact',
      maximumFractionDigits: 1,
    }),
  )
  return `${sign}${formatter.format(value)}`
}

/** `1.0` → `1`, `1.25` → `1.3`. Keeps axis ticks to one decimal at most. */
function trimTrailingZero(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** The symbol alone, for input prefixes. */
export function currencySymbol(currency: CurrencyCode): string {
  return currencyMeta(currency).symbol
}

/** Minor units → a plain number of major units. For charts and maths only. */
export function toMajorNumber(minor: number, currency: CurrencyCode): number {
  return minor / minorUnitScale(currency)
}

/** Major units → minor units. For seeding fixed amounts in code. */
export function fromMajor(major: number, currency: CurrencyCode): number {
  return Math.round(major * minorUnitScale(currency))
}

/**
 * Round minor units to a "nice" figure for suggested amounts — 1,500 rather
 * than 1,487. Rounds up so a suggested pace never undershoots the goal.
 */
export function roundUpToNice(minor: number, currency: CurrencyCode): number {
  if (minor <= 0) return 0
  const scale = minorUnitScale(currency)
  const major = minor / scale
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(major)) - 1)
  const step = Math.max(1, magnitude)
  return Math.ceil(major / step) * step * scale
}
