import { describe, expect, it } from 'vitest'
import { chooseRepresentativePrice, unconfiguredProvider } from '../../services/productSearch'
import { parseAppData, parseImport } from '../../store/persistence'
import { formatMoneyCompact, fromMajor } from '../../lib/money'
import type { PriceSource } from '../types'

function offer(retailer: string, major: number): PriceSource {
  return { retailer, amountMinor: fromMajor(major, 'INR'), currency: 'INR' }
}

describe('chooseRepresentativePrice', () => {
  it('returns null when there are no offers', () => {
    expect(chooseRepresentativePrice([])).toBeNull()
  })

  it('uses the only offer when there is one', () => {
    expect(chooseRepresentativePrice([offer('A', 49_999)])).toBe(fromMajor(49_999, 'INR'))
  })

  it('takes the median rather than the first or cheapest listing', () => {
    const price = chooseRepresentativePrice([
      offer('Retailer A', 49_999),
      offer('Retailer B', 50_490),
      offer('Retailer C', 48_999),
    ])
    expect(price).toBe(fromMajor(49_999, 'INR'))
  })

  it('discards an outlier listing that would drag the target down', () => {
    // A ₹999 accessory listing must not become the PS5 savings target.
    const price = chooseRepresentativePrice([
      offer('Accessory shop', 999),
      offer('Retailer A', 49_999),
      offer('Retailer B', 50_490),
      offer('Retailer C', 48_999),
    ])
    expect(price).toBeGreaterThan(fromMajor(45_000, 'INR'))
  })

  it('still returns a number when prices are wildly scattered', () => {
    const price = chooseRepresentativePrice([offer('A', 100), offer('B', 100_000)])
    expect(price).not.toBeNull()
    expect(Number.isSafeInteger(price)).toBe(true)
  })

  it('always returns a whole number of minor units', () => {
    const price = chooseRepresentativePrice([offer('A', 101), offer('B', 102)])
    expect(Number.isInteger(price)).toBe(true)
  })

  it('suggests a price a retailer actually charges', () => {
    // Averaging the two central listings would invent ₹49,744.50 — a figure
    // no shop quotes. The suggestion has to be one of the observed prices.
    const observed = [48_999, 49_490, 49_999, 50_490]
    const price = chooseRepresentativePrice(observed.map((p, i) => offer(`R${i}`, p)))
    expect(observed.map((p) => fromMajor(p, 'INR'))).toContain(price)
  })
})

describe('unconfiguredProvider', () => {
  it('reports itself as not configured', () => {
    expect(unconfiguredProvider.isConfigured()).toBe(false)
  })

  it('reports "unconfigured" rather than inventing results', async () => {
    const outcome = await unconfiguredProvider.search({ query: 'PS5', currency: 'INR' })
    expect(outcome.status).toBe('unconfigured')
    expect(outcome).not.toHaveProperty('results')
  })
})

describe('formatMoneyCompact', () => {
  it('never abbreviates INR thousands as "T"', () => {
    // CLDR en-IN renders 30,000 as "30T", which reads as trillions.
    expect(formatMoneyCompact(fromMajor(30_000, 'INR'), 'INR')).toBe('₹30,000')
  })

  it('uses lakh and crore above their thresholds', () => {
    expect(formatMoneyCompact(fromMajor(150_000, 'INR'), 'INR')).toBe('₹1.5L')
    expect(formatMoneyCompact(fromMajor(20_000_000, 'INR'), 'INR')).toBe('₹2Cr')
  })

  it('compacts other currencies conventionally', () => {
    expect(formatMoneyCompact(fromMajor(48_900, 'USD'), 'USD')).toContain('K')
  })
})

describe('parseAppData', () => {
  it('returns an empty document for junk input', () => {
    for (const junk of [null, undefined, 42, 'nope', []]) {
      const data = parseAppData(junk)
      expect(data.goals).toEqual([])
      expect(data.transactions).toEqual([])
    }
  })

  it('drops goals that cannot be salvaged rather than inventing fields', () => {
    const data = parseAppData({
      goals: [
        { id: 'a', name: 'Good', targetMinor: 1000, currency: 'INR' },
        { id: 'b', name: 'No target' },
        { id: 'c', targetMinor: 500 },
        { name: 'No id', targetMinor: 500 },
        { id: 'd', name: 'Negative', targetMinor: -5 },
      ],
    })
    expect(data.goals.map((g) => g.id)).toEqual(['a'])
  })

  it('drops transactions whose goal no longer exists', () => {
    const data = parseAppData({
      goals: [{ id: 'a', name: 'Good', targetMinor: 1000, currency: 'INR' }],
      transactions: [
        { id: 't1', goalId: 'a', amountMinor: 100, at: '2026-01-01T00:00:00.000Z', type: 'add' },
        { id: 't2', goalId: 'ghost', amountMinor: 100, at: '2026-01-01T00:00:00.000Z', type: 'add' },
      ],
    })
    expect(data.transactions.map((t) => t.id)).toEqual(['t1'])
  })

  it('drops duplicate ids', () => {
    const data = parseAppData({
      goals: [
        { id: 'a', name: 'One', targetMinor: 1000, currency: 'INR' },
        { id: 'a', name: 'Duplicate', targetMinor: 2000, currency: 'INR' },
      ],
    })
    expect(data.goals).toHaveLength(1)
    expect(data.goals[0].name).toBe('One')
  })

  it('falls back to safe defaults for unknown enum values', () => {
    const data = parseAppData({
      settings: { currency: 'XYZ', theme: 'neon', motion: 'wild', sound: 'yes' },
      goals: [
        { id: 'a', name: 'G', targetMinor: 100, currency: 'INR', accent: 'chartreuse', priority: 'urgent' },
      ],
    })
    expect(data.settings.currency).toBe('INR')
    expect(data.settings.theme).toBe('system')
    expect(data.settings.motion).toBe('system')
    expect(data.goals[0].accent).toBe('amber')
    expect(data.goals[0].priority).toBe('medium')
  })

  it('rejects transactions with an unparseable timestamp', () => {
    const data = parseAppData({
      goals: [{ id: 'a', name: 'G', targetMinor: 1000, currency: 'INR' }],
      transactions: [{ id: 't', goalId: 'a', amountMinor: 100, at: 'not-a-date', type: 'add' }],
    })
    expect(data.transactions).toEqual([])
  })
})

describe('parseImport', () => {
  it('explains malformed JSON in plain language', () => {
    const result = parseImport('{ not json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).not.toMatch(/SyntaxError|JSON\.parse|undefined/)
  })

  it('rejects a file that is valid JSON but not a backup', () => {
    expect(parseImport('{"hello":"world"}')).toMatchObject({ ok: false })
  })

  it('accepts a well-formed backup', () => {
    const backup = JSON.stringify({
      version: 1,
      settings: { currency: 'INR' },
      goals: [{ id: 'a', name: 'G', targetMinor: 100_000, currency: 'INR' }],
      transactions: [
        { id: 't', goalId: 'a', amountMinor: 5000, at: '2026-01-01T00:00:00.000Z', type: 'add' },
      ],
    })
    const result = parseImport(backup)
    expect(result).toMatchObject({ ok: true, goalCount: 1, transactionCount: 1 })
  })

  it('reports failure when no goal in the file could be read', () => {
    const result = parseImport(JSON.stringify({ goals: [{ nope: true }] }))
    expect(result.ok).toBe(false)
  })
})
