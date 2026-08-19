/**
 * A stand-in for SerpAPI's Google Shopping engine, for developing the worker
 * without spending real searches.
 *
 * It returns the same shape SerpAPI does — a flat list of per-retailer
 * listings, with the messiness that makes the clustering in `serpapi.ts`
 * necessary: the same console listed under four different titles, an accessory
 * whose name looks almost identical, and one listing in the wrong currency.
 *
 *   node serpapi-stub.mjs
 *   npx wrangler dev --var SERPAPI_BASE_URL:http://localhost:5175/search.json
 */

import { createServer } from 'node:http'

const LISTINGS = [
  { position: 1, title: 'Sony PlayStation 5 Slim Console (Disc Edition)', source: 'Amazon.in', price: '₹49,999.00', extracted_price: 49999, product_link: 'https://example.test/a', thumbnail: 'https://example.test/ps5.jpg' },
  { position: 2, title: 'Buy PlayStation 5 Slim Sony Console Online at Best Price', source: 'Croma', price: '₹50,490.00', extracted_price: 50490, product_link: 'https://example.test/b' },
  { position: 3, title: 'PlayStation 5 Slim Console by Sony', source: 'Reliance Digital', price: '₹48,999.00', extracted_price: 48999, product_link: 'https://example.test/c' },
  { position: 4, title: 'Sony PlayStation 5 Slim Console Disc', source: 'Vijay Sales', price: '₹49,490.00', extracted_price: 49490, product_link: 'https://example.test/d' },
  // Same words, wildly different product — must not drag the console price down.
  { position: 5, title: 'Sony PlayStation 5 Slim Console Dust Cover', source: 'Marketplace', price: '₹1,299.00', extracted_price: 1299, product_link: 'https://example.test/e' },
  // A genuinely separate product.
  { position: 6, title: 'Sony DualSense Wireless Controller', source: 'Amazon.in', price: '₹5,999.00', extracted_price: 5999, product_link: 'https://example.test/f' },
  { position: 7, title: 'Sony DualSense Wireless Controller for PS5', source: 'Croma', price: '₹6,290.00', extracted_price: 6290, product_link: 'https://example.test/g' },
  // Wrong currency inside a localised search — must be dropped, not relabelled.
  { position: 8, title: 'Sony PlayStation 5 Slim Console', source: 'US Importer', price: '$499.00', extracted_price: 499, product_link: 'https://example.test/h' },
]

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const query = (url.searchParams.get('q') ?? '').toLowerCase()

  res.writeHead(200, { 'Content-Type': 'application/json' })

  if (query.includes('quota')) {
    res.end(JSON.stringify({ error: 'Your account has run out of searches.' }))
    return
  }

  const shopping_results = LISTINGS.filter((item) =>
    query.split(/\s+/).some((word) => word.length > 1 && item.title.toLowerCase().includes(word)),
  )

  res.end(JSON.stringify({ shopping_results }))
})

server.listen(5175, () => console.log('SerpAPI stub on http://localhost:5175/search.json'))
