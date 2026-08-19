/**
 * End-to-end check of the real app against the real price worker.
 *
 * Chain under test:
 *   app  →  Cloudflare Worker (wrangler dev)  →  SerpAPI stub
 *
 * Only the last hop is faked, and only because a live SerpAPI call costs a
 * billed search. Everything else — CORS, the worker's clustering, the app's
 * price selection and goal creation — is the production code path.
 *
 *   node server/price-worker/serpapi-stub.mjs
 *   cd server/price-worker && npx wrangler dev --port 8787 \
 *     --var SERPAPI_KEY:test --var SERPAPI_BASE_URL:http://localhost:5175/search.json
 *   VITE_PRODUCT_SEARCH_ENDPOINT=http://127.0.0.1:8787/search npm run build
 *   node e2e/worker-integration.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = new URL('./screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const BASE = process.env.BASE_URL ?? 'http://localhost:4175'

const errors = []
const failures = []
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' ' + detail}`)
  if (!cond) failures.push(name)
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.evaluate(() => {
  localStorage.setItem('aurum.savings.v1', JSON.stringify({
    version: 1,
    settings: { currency: 'INR', sound: false, celebrations: true, motion: 'system', theme: 'system', onboardedAt: new Date().toISOString() },
    goals: [], transactions: [],
  }))
})

console.log('\n== App → Worker → SerpAPI ==')
await page.goto(`${BASE}/new`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

check('search is live', await page.getByPlaceholder(/search the web/i).isEnabled())

await page.getByPlaceholder(/search the web/i).fill('sony playstation')
await page.getByRole('button', { name: /^search$/i }).click()
await page.waitForTimeout(2500)

const results = await page.locator('.search__result').count()
check('worker results reached the app through CORS', results >= 1, `got ${results}`)
await shot('w01-results')

const titles = await page.locator('.search__result-title').allTextContents()
check('console and controller kept as separate products', results === 2, titles.join(' | '))

const priceText = await page.locator('.search__result-price').first().textContent()
// Median of 48,999 / 49,490 / 49,999 / 50,490 — the ₹1,299 dust cover and the
// $499 US import must both have been excluded before the app ever saw them.
check('suggested price is the console, not an accessory', /49,7|49,4|49,9|50,/.test(priceText ?? ''), `got ${priceText}`)
check('accessory price never surfaced', !/1,299/.test(priceText ?? ''), `got ${priceText}`)

await page.locator('.search__result').first().click()
await page.waitForTimeout(700)
await shot('w02-confirm')

const offerRows = await page.locator('.goal-form__source-list li').count().catch(() => 0)
await page.locator('.goal-form__sources summary').click()
await page.waitForTimeout(300)
const disclosed = await page.locator('.goal-form__source-list li').count()
check('every retailer disclosed', disclosed === 4, `got ${disclosed} (pre-open ${offerRows})`)

const retailers = await page.locator('.goal-form__source-list li span:first-child').allTextContents()
check('no US importer in the sources', !retailers.some((r) => /importer/i.test(r)), retailers.join(', '))

const target = await page.getByLabel('Target amount').inputValue()
check('target prefilled from live lookup', Number(target) > 40000 && Number(target) < 60000, target)

await page.getByRole('button', { name: /create savings goal/i }).click()
await page.waitForTimeout(1200)
check('goal created from a live search', page.url().includes('/goal/'))
await shot('w03-goal')

console.log('\n== Console errors ==')
errors.length ? errors.forEach((e) => console.log('  ' + e)) : console.log('  none')
console.log(`\n${failures.length === 0 && errors.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} failure(s), ${errors.length} error(s)`}`)
await browser.close()
process.exit(failures.length === 0 && errors.length === 0 ? 0 : 1)
