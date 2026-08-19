import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpProductSearchProvider } from '../../services/productSearch'
import { fromMajor } from '../../lib/money'

const provider = createHttpProductSearchProvider({
  endpoint: 'https://example.test/search',
  apiKey: 'secret',
})

function mockJson(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const PS5 = {
  results: [
    {
      id: 'ps5',
      title: 'PlayStation 5 Slim',
      brand: 'Sony',
      imageUrl: 'https://cdn.example.test/ps5.jpg',
      url: 'https://example.test/ps5',
      offers: [
        { retailer: 'Retailer A', price: 49999, currency: 'INR', url: 'https://a.test' },
        { retailer: 'Retailer B', price: 50490, currency: 'INR' },
        { retailer: 'Retailer C', price: 48999, currency: 'INR' },
      ],
    },
  ],
}

describe('http product search provider', () => {
  it('reports itself as configured', () => {
    expect(provider.isConfigured()).toBe(true)
  })

  it('sends the query, currency and bearer token', async () => {
    const fetchMock = mockJson(PS5)
    await provider.search({ query: 'PS5', currency: 'INR' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('q=PS5')
    expect(url).toContain('currency=INR')
    expect(init.headers.Authorization).toBe('Bearer secret')
  })

  it('normalizes results and picks a defensible price', async () => {
    mockJson(PS5)
    const outcome = await provider.search({ query: 'PS5', currency: 'INR' })

    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return

    const [candidate] = outcome.results
    expect(candidate.title).toBe('PlayStation 5 Slim')
    expect(candidate.brand).toBe('Sony')
    // Median of the three listings, converted to minor units.
    expect(candidate.suggestedMinor).toBe(fromMajor(49_999, 'INR'))
    expect(candidate.offers).toHaveLength(3)
    // Offers arrive cheapest-first for display.
    expect(candidate.offers[0].amountMinor).toBe(fromMajor(48_999, 'INR'))
    expect(candidate.retrievedAt).toBeTruthy()
  })

  it('drops malformed offers instead of guessing at them', async () => {
    mockJson({
      results: [
        {
          title: 'Thing',
          offers: [
            { retailer: 'Good', price: 1000, currency: 'INR' },
            { retailer: 'No price', currency: 'INR' },
            { retailer: 'Bad currency', price: 1000, currency: 'XXX' },
            { price: 1000, currency: 'INR' },
            { retailer: 'Negative', price: -50, currency: 'INR' },
            'not an object',
          ],
        },
      ],
    })

    const outcome = await provider.search({ query: 'thing', currency: 'INR' })
    if (outcome.status !== 'ok') throw new Error('expected ok')
    expect(outcome.results[0].offers).toHaveLength(1)
    expect(outcome.results[0].offers[0].retailer).toBe('Good')
  })

  it('flags a currency mismatch rather than converting at an invented rate', async () => {
    mockJson({
      results: [
        { title: 'Import only', offers: [{ retailer: 'US Shop', price: 499, currency: 'USD' }] },
      ],
    })

    const outcome = await provider.search({ query: 'x', currency: 'INR' })
    if (outcome.status !== 'ok') throw new Error('expected ok')
    const [candidate] = outcome.results
    expect(candidate.suggestedMinor).toBe(0)
    expect(candidate.currencyMismatch?.found).toEqual(['USD'])
  })

  it('rejects non-http image and product URLs', async () => {
    mockJson({
      results: [
        {
          title: 'Sketchy',
          imageUrl: 'javascript:alert(1)',
          url: 'data:text/html,<script>',
          offers: [{ retailer: 'A', price: 10, currency: 'INR' }],
        },
      ],
    })

    const outcome = await provider.search({ query: 'x', currency: 'INR' })
    if (outcome.status !== 'ok') throw new Error('expected ok')
    expect(outcome.results[0].imageUrl).toBeUndefined()
    expect(outcome.results[0].url).toBeUndefined()
  })

  it('drops results with no usable title', async () => {
    mockJson({ results: [{ offers: [{ retailer: 'A', price: 10, currency: 'INR' }] }, { title: '  ' }] })
    const outcome = await provider.search({ query: 'x', currency: 'INR' })
    expect(outcome.status).toBe('empty')
  })

  it('reports an empty result set as empty, not as an error', async () => {
    mockJson({ results: [] })
    expect((await provider.search({ query: 'x', currency: 'INR' })).status).toBe('empty')
  })

  it('turns a server error into a human message', async () => {
    mockJson({}, { ok: false, status: 503 })
    const outcome = await provider.search({ query: 'x', currency: 'INR' })
    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') return
    expect(outcome.message).not.toMatch(/503|fetch|undefined/)
  })

  it('turns a network failure into a human message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const outcome = await provider.search({ query: 'x', currency: 'INR' })
    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') return
    expect(outcome.message).toMatch(/connection/i)
    expect(outcome.message).not.toMatch(/TypeError|Failed to fetch/)
  })

  it('survives a payload that is not JSON-shaped at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token')
        },
      }),
    )
    const outcome = await provider.search({ query: 'x', currency: 'INR' })
    expect(outcome.status).toBe('error')
  })

  it('accepts a bare array as well as a { results } envelope', async () => {
    mockJson([{ title: 'Bare', offers: [{ retailer: 'A', price: 100, currency: 'INR' }] }])
    const outcome = await provider.search({ query: 'x', currency: 'INR' })
    if (outcome.status !== 'ok') throw new Error('expected ok')
    expect(outcome.results[0].title).toBe('Bare')
  })
})
