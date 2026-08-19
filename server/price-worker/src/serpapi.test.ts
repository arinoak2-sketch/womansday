import { describe, expect, it } from 'vitest'
import {
  countryForCurrency,
  mapSerpResponse,
  reconcileCurrency,
  significantTokens,
  titleSimilarity,
  type SerpShoppingResult,
} from './serpapi'

function listing(over: Partial<SerpShoppingResult>): SerpShoppingResult {
  return {
    position: 1,
    title: 'Product',
    source: 'Shop',
    price: '₹1,000.00',
    extracted_price: 1000,
    link: 'https://example.test/p',
    thumbnail: 'https://example.test/i.jpg',
    ...over,
  }
}

describe('reconcileCurrency', () => {
  it('accepts a matching unambiguous symbol', () => {
    expect(reconcileCurrency('₹49,999.00', 'INR')).toBe('INR')
    expect(reconcileCurrency('£399.00', 'GBP')).toBe('GBP')
  })

  it('rejects a listing that is clearly in another currency', () => {
    // Google sometimes returns a foreign listing inside a localised search.
    // Treating $499 as ₹499 would be a serious error, so it's dropped.
    expect(reconcileCurrency('£399.00', 'INR')).toBeNull()
    expect(reconcileCurrency('€429.00', 'GBP')).toBeNull()
  })

  it('accepts a bare $ for any dollar currency', () => {
    // $ is shared by USD, AUD, CAD and SGD, so it can't pick between them.
    expect(reconcileCurrency('$499.00', 'AUD')).toBe('AUD')
    expect(reconcileCurrency('$499.00', 'USD')).toBe('USD')
    expect(reconcileCurrency('$499.00', 'SGD')).toBe('SGD')
  })

  it('rejects a $ price in a non-dollar search', () => {
    // $ can't say *which* dollar, but it rules out rupees — and treating
    // $499 as ₹499 would understate a savings target by roughly 80×.
    expect(reconcileCurrency('$499.00', 'INR')).toBeNull()
    expect(reconcileCurrency('$499.00', 'JPY')).toBeNull()
  })

  it('trusts the locale when there is no price text at all', () => {
    expect(reconcileCurrency(undefined, 'INR')).toBe('INR')
    expect(reconcileCurrency('', 'USD')).toBe('USD')
  })

  it('recognises rupees written as Rs', () => {
    expect(reconcileCurrency('Rs. 49,999', 'INR')).toBe('INR')
  })
})

describe('countryForCurrency', () => {
  it('maps currencies to search countries', () => {
    expect(countryForCurrency('INR')).toBe('in')
    expect(countryForCurrency('GBP')).toBe('uk')
  })
})

describe('significantTokens / titleSimilarity', () => {
  it('strips retailer noise words', () => {
    const tokens = significantTokens('Buy Sony PlayStation 5 Online at Best Price in India')
    expect(tokens).toEqual(['sony', 'playstation', '5'])
  })

  it('treats reordered titles as the same product', () => {
    expect(titleSimilarity('Sony PS5 Slim', 'PS5 Slim by Sony')).toBeGreaterThan(0.62)
  })

  it('keeps genuinely different products apart', () => {
    expect(
      titleSimilarity('Sony PlayStation 5 Console', 'Sony DualSense Wireless Controller'),
    ).toBeLessThan(0.62)
  })

  it('handles empty and punctuation-only titles without dividing by zero', () => {
    expect(titleSimilarity('', 'anything')).toBe(0)
    expect(titleSimilarity('!!! ---', 'anything')).toBe(0)
  })
})

describe('mapSerpResponse', () => {
  it('groups listings for one product into a single result with several offers', () => {
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ title: 'Sony PlayStation 5 Slim Console', source: 'Amazon.in', extracted_price: 49999, price: '₹49,999' }),
          listing({ title: 'PlayStation 5 Slim Sony Console', source: 'Croma', extracted_price: 50490, price: '₹50,490' }),
          listing({ title: 'Buy Sony PlayStation 5 Slim Console Online', source: 'Reliance Digital', extracted_price: 48999, price: '₹48,999' }),
        ],
      },
      'INR',
    )

    expect(results).toHaveLength(1)
    expect(results[0].offers).toHaveLength(3)
    // Cheapest first, so the app can show a range.
    expect(results[0].offers[0].price).toBe(48999)
    expect(results[0].offers.map((o) => o.retailer)).toContain('Croma')
  })

  it('picks the cleanest title in a cluster', () => {
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ title: 'Buy Sony PlayStation 5 Slim Console Online at Best Price in India Free Delivery', source: 'A', extracted_price: 49999 }),
          listing({ title: 'Sony PlayStation 5 Slim', source: 'B', extracted_price: 50000 }),
        ],
      },
      'INR',
    )
    expect(results[0].title).toBe('Sony PlayStation 5 Slim')
  })

  it('prefers a longer clean title over a shorter marketing one', () => {
    // The marketing title has FEWER significant tokens once noise is stripped,
    // so counting those would pick exactly the wrong one.
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ title: 'Buy PlayStation 5 Slim Sony Console Online at Best Price', source: 'A', extracted_price: 49999 }),
          listing({ title: 'Sony PlayStation 5 Slim Console (Disc Edition)', source: 'B', extracted_price: 50490 }),
        ],
      },
      'INR',
    )
    expect(results[0].title).toBe('Sony PlayStation 5 Slim Console (Disc Edition)')
  })

  it('does not name the product after a listing whose price was rejected', () => {
    // The bundle has the cleanest title but is plainly a different product.
    // Naming the console after it would be worse than a clumsy title.
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ title: 'Buy Sony PlayStation 5 Slim Console Online at Best Price', source: 'A', extracted_price: 49999 }),
          listing({ title: 'Sony PlayStation 5 Slim Console Bundle', source: 'B', extracted_price: 1299 }),
          listing({ title: 'Sony PlayStation 5 Slim Console Disc Version', source: 'C', extracted_price: 50490 }),
          listing({ title: 'Sony PlayStation 5 Slim Console Disc Pack', source: 'D', extracted_price: 48999 }),
        ],
      },
      'INR',
    )
    expect(results[0].offers.map((o) => o.price)).not.toContain(1299)
    expect(results[0].title).not.toBe('Sony PlayStation 5 Slim Console Bundle')
  })

  it('does not report a marketing word as the brand', () => {
    const results = mapSerpResponse(
      { shopping_results: [listing({ title: 'Buy Sony Alpha Camera', source: 'A', extracted_price: 100 })] },
      'INR',
    )
    expect(results[0].brand).toBe('Sony')
  })

  it('keeps different products separate', () => {
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ title: 'Sony PlayStation 5 Slim Console', source: 'A', extracted_price: 49999 }),
          listing({ title: 'Sony DualSense Wireless Controller', source: 'A', extracted_price: 5999 }),
        ],
      },
      'INR',
    )
    expect(results).toHaveLength(2)
  })

  it('groups by product_id even when titles differ wildly', () => {
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ product_id: 'p1', title: 'Console Bundle Alpha', source: 'A', extracted_price: 49999 }),
          listing({ product_id: 'p1', title: 'Totally Different Words Here', source: 'B', extracted_price: 50499 }),
        ],
      },
      'INR',
    )
    expect(results).toHaveLength(1)
    expect(results[0].offers).toHaveLength(2)
  })

  it('keeps only the cheapest listing per retailer', () => {
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ title: 'Sony PlayStation 5 Slim', source: 'Amazon.in', extracted_price: 52000 }),
          listing({ title: 'Sony PlayStation 5 Slim', source: 'amazon.in', extracted_price: 49999 }),
          listing({ title: 'Sony PlayStation 5 Slim', source: 'Croma', extracted_price: 50490 }),
        ],
      },
      'INR',
    )
    expect(results[0].offers).toHaveLength(2)
    expect(results[0].offers.find((o) => /amazon/i.test(o.retailer))?.price).toBe(49999)
  })

  it('drops an accessory that slipped into a console cluster', () => {
    // A ₹1,299 listing among ₹50,000 consoles is a different product, and the
    // app has no way to tell — so it must not reach it.
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ title: 'Sony PlayStation 5 Slim', source: 'A', extracted_price: 49999 }),
          listing({ title: 'Sony PlayStation 5 Slim', source: 'B', extracted_price: 50490 }),
          listing({ title: 'Sony PlayStation 5 Slim', source: 'C', extracted_price: 48999 }),
          listing({ title: 'Sony PlayStation 5 Slim', source: 'D', extracted_price: 1299 }),
        ],
      },
      'INR',
    )
    const prices = results[0].offers.map((o) => o.price)
    expect(prices).not.toContain(1299)
    expect(prices).toHaveLength(3)
  })

  it('drops listings in a currency the caller did not ask for', () => {
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ title: 'Widget', source: 'A', extracted_price: 100, price: '₹100' }),
          listing({ title: 'Widget', source: 'B', extracted_price: 100, price: '£100' }),
        ],
      },
      'INR',
    )
    expect(results[0].offers).toHaveLength(1)
    expect(results[0].offers[0].retailer).toBe('A')
  })

  it('discards listings with no price, no retailer, or no title', () => {
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ title: 'Good', source: 'A', extracted_price: 100 }),
          listing({ title: 'No price', source: 'B', extracted_price: undefined }),
          listing({ title: 'Zero', source: 'C', extracted_price: 0 }),
          listing({ title: 'Negative', source: 'D', extracted_price: -5 }),
          listing({ title: '', source: 'E', extracted_price: 100 }),
          listing({ title: 'No retailer', source: '', extracted_price: 100 }),
        ],
      },
      'INR',
    )
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Good')
  })

  it('rejects non-http URLs from the payload', () => {
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({
            title: 'Sketchy',
            source: 'A',
            extracted_price: 100,
            link: 'javascript:alert(1)',
            product_link: 'data:text/html,<script>',
            thumbnail: 'javascript:alert(2)',
          }),
        ],
      },
      'INR',
    )
    expect(results[0].url).toBeUndefined()
    expect(results[0].imageUrl).toBeUndefined()
  })

  it('returns an empty list for an empty or malformed payload', () => {
    expect(mapSerpResponse({}, 'INR')).toEqual([])
    expect(mapSerpResponse({ shopping_results: [] }, 'INR')).toEqual([])
    expect(mapSerpResponse({ shopping_results: null as never }, 'INR')).toEqual([])
  })

  it('orders products by how many retailers back them', () => {
    const results = mapSerpResponse(
      {
        shopping_results: [
          listing({ title: 'Lonely Gadget Thing', source: 'A', extracted_price: 100 }),
          listing({ title: 'Popular Widget Device', source: 'B', extracted_price: 200 }),
          listing({ title: 'Popular Widget Device', source: 'C', extracted_price: 210 }),
        ],
      },
      'INR',
    )
    expect(results[0].title).toBe('Popular Widget Device')
  })

  it('caps how many products it returns', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      listing({ title: `Distinct Gadget Number ${i} Alpha`, source: `Shop${i}`, extracted_price: 100 + i }),
    )
    expect(mapSerpResponse({ shopping_results: many }, 'INR').length).toBeLessThanOrEqual(8)
  })

  it('emits the contract shape the app parses', () => {
    const [product] = mapSerpResponse(
      { shopping_results: [listing({ title: 'Sony Camera Alpha', source: 'A', extracted_price: 100 })] },
      'INR',
    )
    expect(product).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      offers: [{ retailer: 'A', price: 100, currency: 'INR' }],
    })
  })
})
