/**
 * Exercises the product-search flow against the mock backend.
 * Requires a build made with VITE_PRODUCT_SEARCH_ENDPOINT set, served on :4174.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = new URL('./screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const BASE = process.env.BASE_URL ?? 'http://localhost:4174'

const errors = []
const failures = []
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' ' + detail}`)
  if (!cond) failures.push(name)
}

// CHROME_PATH lets a CI image point at a browser Playwright didn't download.
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

// ── Search ─────────────────────────────────────────────────────────
console.log('\n== Product search ==')
await page.goto(`${BASE}/new`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
check('search is enabled when a provider is configured', await page.getByPlaceholder(/search the web/i).isEnabled())

await page.getByPlaceholder(/search the web/i).fill('ps5')
await page.getByRole('button', { name: /^search$/i }).click()
await page.waitForTimeout(1200)

const resultCount = await page.locator('.search__result').count()
check('results returned', resultCount === 2, `got ${resultCount}`)
await shot('01-search-results')

const priceText = await page.locator('.search__result-price').first().textContent()
// Median of 49999 / 50490 / 48999, with the ₹1,299 accessory listing rejected.
check('outlier listing excluded from the suggested price', priceText?.includes('49,999'), `got ${priceText}`)

// ── Currency mismatch is stated, not converted ─────────────────────
console.log('\n== Currency mismatch ==')
await page.getByPlaceholder(/search the web/i).fill('camera')
await page.getByRole('button', { name: /^search$/i }).click()
await page.waitForTimeout(1000)
const noPrice = await page.locator('.search__result-noprice').first().textContent()
check('mismatch named rather than converted', /USD/.test(noPrice ?? ''), `got ${noPrice}`)
await shot('02-currency-mismatch')

// ── Failure path ───────────────────────────────────────────────────
console.log('\n== Provider failure ==')
await page.getByPlaceholder(/search the web/i).fill('boom')
await page.getByRole('button', { name: /^search$/i }).click()
await page.waitForTimeout(1200)
check('server error handled gracefully', await page.getByText(/that search didn't work/i).isVisible())
const errCopy = await page.locator('.empty__message').textContent()
check('no raw technical detail leaked', !/503|fetch|undefined|Error:/.test(errCopy ?? ''), errCopy ?? '')
await shot('03-search-error')

// ── No matches ─────────────────────────────────────────────────────
await page.getByPlaceholder(/search the web/i).fill('zzzznothing')
await page.getByRole('button', { name: /^search$/i }).click()
await page.waitForTimeout(1000)
check('empty result set explained', await page.getByText(/nothing found for/i).isVisible())

// ── Select a product and create the goal ───────────────────────────
console.log('\n== Product-based goal ==')
await page.getByPlaceholder(/search the web/i).fill('ps5')
await page.getByRole('button', { name: /^search$/i }).click()
await page.waitForTimeout(1200)
await page.locator('.search__result').first().click()
await page.waitForTimeout(600)

check('confirmation screen shown', await page.getByText(/you're saving for/i).isVisible())
const nameValue = await page.getByLabel('Goal name').inputValue()
check('name prefilled from the product', /PlayStation 5 Slim/.test(nameValue), nameValue)
const targetValue = await page.getByLabel('Target amount').inputValue()
check('target prefilled with the suggested price', targetValue === '49999', targetValue)
await shot('04-confirm-product')

// Sources disclosure
await page.locator('.goal-form__sources summary').click()
await page.waitForTimeout(300)
const sources = await page.locator('.goal-form__source-list li').count()
check('all source listings disclosed', sources === 4, `got ${sources}`)
const retrieved = await page.locator('.goal-form__retrieved').textContent()
check('retrieval time shown', /Retrieved/.test(retrieved ?? ''))
check('price presented as changeable', /change/i.test(retrieved ?? ''), retrieved ?? '')
await shot('05-sources')

// The user must always be able to override the price.
await page.getByLabel('Target amount').fill('45000')
await page.getByRole('button', { name: /create savings goal/i }).click()
await page.waitForTimeout(1200)

check('goal created from product', page.url().includes('/goal/'))
const target = await page.locator('.gd-hero__target').textContent()
check('user override respected', /45,000/.test(target ?? ''), target ?? '')
check('product panel attached to the goal', await page.getByRole('heading', { name: 'Product' }).isVisible())
const snapshot = await page.locator('.gd-product__snapshot').textContent()
check('snapshot states it is not a live price', /isn't a live price/i.test(snapshot ?? ''), snapshot ?? '')
await shot('06-goal-with-product')

console.log('\n== Console errors ==')
errors.length ? errors.forEach((e) => console.log('  ' + e)) : console.log('  none')
console.log(`\n${failures.length === 0 && errors.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} failure(s), ${errors.length} error(s)`}`)
await browser.close()
process.exit(failures.length === 0 && errors.length === 0 ? 0 : 1)
