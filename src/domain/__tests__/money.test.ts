import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  formatMoneyCompact,
  fromMajor,
  MAX_MAJOR_UNITS,
  parseAmount,
  roundUpToNice,
} from '../../lib/money'

describe('parseAmount', () => {
  it('parses plain whole numbers into minor units', () => {
    expect(parseAmount('2000', 'INR')).toEqual({ ok: true, minor: 200_000 })
  })

  it('parses decimals exactly, without float drift', () => {
    expect(parseAmount('19.99', 'USD')).toEqual({ ok: true, minor: 1999 })
    expect(parseAmount('0.07', 'USD')).toEqual({ ok: true, minor: 7 })
    // 1.1 * 100 is 110.00000000000001 in float maths; string parsing is exact.
    expect(parseAmount('1.10', 'USD')).toEqual({ ok: true, minor: 110 })
  })

  it('accepts grouping separators, including Indian grouping', () => {
    expect(parseAmount('1,00,000', 'INR')).toEqual({ ok: true, minor: 10_000_000 })
    expect(parseAmount('50,000', 'INR')).toEqual({ ok: true, minor: 5_000_000 })
  })

  it('accepts currency symbols and stray whitespace', () => {
    expect(parseAmount(' ₹ 2,500 ', 'INR')).toEqual({ ok: true, minor: 250_000 })
    expect(parseAmount('$12.50', 'USD')).toEqual({ ok: true, minor: 1250 })
  })

  it('handles a leading decimal point', () => {
    expect(parseAmount('.5', 'USD')).toEqual({ ok: true, minor: 50 })
  })

  it('ignores trailing zeros beyond currency precision', () => {
    expect(parseAmount('10.500', 'USD')).toEqual({ ok: true, minor: 1050 })
  })

  it('rejects precision the currency cannot hold', () => {
    expect(parseAmount('10.555', 'USD')).toMatchObject({ ok: false, error: 'too-precise' })
    expect(parseAmount('100.5', 'JPY')).toMatchObject({ ok: false, error: 'too-precise' })
  })

  it('handles zero-decimal currencies', () => {
    expect(parseAmount('5000', 'JPY')).toEqual({ ok: true, minor: 5000 })
  })

  it('rejects empty, negative, zero, and non-numeric input', () => {
    expect(parseAmount('', 'INR')).toMatchObject({ ok: false, error: 'empty' })
    expect(parseAmount('   ', 'INR')).toMatchObject({ ok: false, error: 'empty' })
    expect(parseAmount('-50', 'INR')).toMatchObject({ ok: false, error: 'negative' })
    expect(parseAmount('0', 'INR')).toMatchObject({ ok: false, error: 'zero' })
    expect(parseAmount('abc', 'INR')).toMatchObject({ ok: false, error: 'not-a-number' })
    expect(parseAmount('1.2.3', 'INR')).toMatchObject({ ok: false, error: 'not-a-number' })
    expect(parseAmount('1e5', 'INR')).toMatchObject({ ok: false, error: 'not-a-number' })
  })

  it('allows zero when explicitly permitted (starting balances)', () => {
    expect(parseAmount('0', 'INR', { allowZero: true })).toEqual({ ok: true, minor: 0 })
  })

  it('rejects amounts beyond the safe-integer ceiling', () => {
    expect(parseAmount(String(MAX_MAJOR_UNITS), 'INR')).toMatchObject({
      ok: false,
      error: 'too-large',
    })
  })

  it('round-trips every parsed value back through the formatter', () => {
    for (const raw of ['1', '999', '1234.56', '0.01', '87654321']) {
      const parsed = parseAmount(raw, 'USD')
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      const reparsed = parseAmount(formatMoney(parsed.minor, 'USD', { omitSymbol: false }), 'USD')
      expect(reparsed).toEqual({ ok: true, minor: parsed.minor })
    }
  })
})

describe('formatMoney', () => {
  it('drops the fraction when the amount is whole', () => {
    expect(formatMoney(1_850_000, 'INR')).toBe('₹18,500')
    expect(formatMoney(5_000_000, 'INR')).toBe('₹50,000')
    // Indian grouping only kicks in past a lakh.
    expect(formatMoney(10_000_000, 'INR')).toBe('₹1,00,000')
  })

  it('keeps the fraction when there is one', () => {
    expect(formatMoney(1999, 'USD')).toBe('$19.99')
  })

  it('renders negatives with a true minus sign', () => {
    expect(formatMoney(-2500, 'USD')).toBe('−$25')
  })

  it('supports explicit signs for transaction rows', () => {
    expect(formatMoney(200_000, 'INR', { signed: true })).toBe('+₹2,000')
    expect(formatMoney(-200_000, 'INR', { signed: true })).toBe('−₹2,000')
  })

  it('handles zero-decimal currencies', () => {
    expect(formatMoney(5000, 'JPY')).toBe('￥5,000')
  })

  it('never throws on non-finite input', () => {
    expect(formatMoney(Number.NaN, 'INR')).toBe('₹0')
    expect(formatMoney(Number.POSITIVE_INFINITY, 'INR')).toBe('₹0')
  })

  it('compacts only large amounts', () => {
    expect(formatMoneyCompact(250_000, 'INR')).toBe('₹2,500')
    expect(formatMoneyCompact(100_000_000, 'INR')).toContain('L')
  })
})

describe('roundUpToNice', () => {
  it('rounds up so a suggested pace never undershoots', () => {
    expect(roundUpToNice(148_700, 'INR')).toBe(150_000)
    expect(roundUpToNice(fromMajor(1487, 'INR'), 'INR')).toBe(fromMajor(1500, 'INR'))
  })

  it('leaves already-round numbers alone', () => {
    expect(roundUpToNice(fromMajor(1500, 'INR'), 'INR')).toBe(fromMajor(1500, 'INR'))
  })

  it('returns zero for non-positive input', () => {
    expect(roundUpToNice(0, 'INR')).toBe(0)
    expect(roundUpToNice(-10, 'INR')).toBe(0)
  })
})
