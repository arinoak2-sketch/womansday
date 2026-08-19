/**
 * A stand-in product-search backend, used to exercise the search UI end to end.
 *
 * It implements exactly the contract documented in
 * `src/services/productSearch.ts`, so it doubles as a worked example of what a
 * real provider has to return.
 *
 *   node mock-search-server.mjs
 *   VITE_PRODUCT_SEARCH_ENDPOINT=http://localhost:5174/search npm run build
 */

import { createServer } from 'node:http'

const CATALOGUE = [
  {
    id: 'ps5-slim',
    title: 'PlayStation 5 Slim (Disc Edition)',
    brand: 'Sony',
    description: 'Console with an Ultra HD Blu-ray drive, 1TB SSD and DualSense controller.',
    url: 'https://example.test/ps5-slim',
    variants: ['Disc Edition', 'Digital Edition'],
    keywords: ['ps5', 'playstation', 'playstation 5', 'console', 'sony'],
    offers: [
      { retailer: 'Retailer A', price: 49999, currency: 'INR', url: 'https://example.test/a' },
      { retailer: 'Retailer B', price: 50490, currency: 'INR', url: 'https://example.test/b' },
      { retailer: 'Retailer C', price: 48999, currency: 'INR', url: 'https://example.test/c' },
      // A deliberately mispriced accessory listing — the median must reject it.
      { retailer: 'Marketplace seller', price: 1299, currency: 'INR' },
    ],
  },
  {
    id: 'ps5-digital',
    title: 'PlayStation 5 Digital Edition',
    brand: 'Sony',
    keywords: ['ps5', 'playstation', 'digital'],
    offers: [
      { retailer: 'Retailer A', price: 44990, currency: 'INR' },
      { retailer: 'Retailer B', price: 45499, currency: 'INR' },
    ],
  },
  {
    id: 'import-camera',
    title: 'Rangefinder Camera (import)',
    brand: 'Example',
    keywords: ['camera'],
    // Priced only in USD — the UI must say so rather than convert.
    offers: [{ retailer: 'US Shop', price: 1499, currency: 'USD' }],
  },
]

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Accept')

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  if (url.pathname !== '/search') {
    res.writeHead(404).end()
    return
  }

  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase()

  if (query === 'boom') {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'upstream unavailable' }))
    return
  }

  const results = CATALOGUE.filter(
    (item) =>
      item.title.toLowerCase().includes(query) ||
      item.keywords.some((keyword) => keyword.includes(query) || query.includes(keyword)),
  ).map(({ keywords: _keywords, ...item }) => item)

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ results }))
})

server.listen(5174, () => console.log('mock product search on http://localhost:5174/search'))
