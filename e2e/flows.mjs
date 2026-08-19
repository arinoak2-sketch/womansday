import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = new URL('./screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const errors = []
const failures = []

function check(name, condition, detail = '') {
  if (condition) console.log(`  PASS  ${name}`)
  else {
    console.log(`  FAIL  ${name} ${detail}`)
    failures.push(`${name} ${detail}`)
  }
}

// CHROME_PATH lets a CI image point at a browser Playwright didn't download.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
})
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
}

// ── Onboarding ──────────────────────────────────────────────────────
console.log('\n== Onboarding ==')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
check('onboarding shown', await page.getByRole('heading', { name: /currency/i }).isVisible())
await shot('01-onboarding')

await page.getByRole('radio', { name: /INR/i }).first().click()
await page.getByRole('button', { name: /continue/i }).click()
await page.waitForTimeout(300)
check('step 2 shown', await page.getByRole('heading', { name: /what are you saving for/i }).isVisible())
await shot('02-onboarding-2')

await page.getByRole('button', { name: /i'll do this later/i }).click()
await page.waitForTimeout(500)

// ── First run ───────────────────────────────────────────────────────
console.log('\n== First run ==')
check('first-run shown', await page.getByRole('heading', { name: /what are you saving for/i }).isVisible())
await shot('03-first-run')

// ── Create a goal (custom) ──────────────────────────────────────────
console.log('\n== Create goal ==')
await page.getByRole('button', { name: /create your first goal/i }).click()
await page.waitForTimeout(400)
await shot('04-new-goal-search')

// With no search provider configured the app must not lead with a dead end:
// goal creation goes straight to entering a target, and the product-lookup
// choice is not offered at all.
check('no dead-end search step', await page.getByLabel('Goal name').isVisible())
check('product lookup not offered when unconfigured', (await page.getByRole('radio', { name: /look up a product/i }).count()) === 0)
check('no fabricated prices anywhere', (await page.getByText(/estimated/i).count()) === 0)

await page.getByLabel('Goal name').fill('PlayStation 5')
await page.getByLabel('Target amount').fill('50000')
await page.getByLabel(/starting amount/i).fill('18500')
await shot('05-new-goal-form')

await page.getByRole('button', { name: /create savings goal/i }).click()
await page.waitForTimeout(900)

check('navigated to goal detail', page.url().includes('/goal/'))
// 18500/50000 = 37%
const pct = await page.locator('.gd-hero__percent').textContent()
check('progress is 37%', pct?.trim() === '37%', `got ${pct}`)
await page.waitForTimeout(600)
await shot('06-goal-detail')

// A ₹18,500 start on a ₹50,000 goal clears the 25% milestone → celebration
const celebrating = await page.locator('.celebration').count()
check('celebration fired for starting amount', celebrating > 0)
if (celebrating > 0) {
  await shot('07-celebration')
  await page.locator('.celebration').getByRole('button').first().click()
  await page.waitForTimeout(400)
}

// ── Add money ───────────────────────────────────────────────────────
console.log('\n== Add money ==')
await page.getByRole('button', { name: /^add money$/i }).first().click()
await page.waitForTimeout(500)
await page.getByLabel(/how much did you save/i).fill('2000')
await page.waitForTimeout(300)
await shot('08-add-money')

const preview = await page.locator('.amount-sheet__preview').textContent()
check('preview shows new balance ₹20,500', preview?.includes('20,500'), `got: ${preview}`)

await page.getByRole('button', { name: /add to savings/i }).click()
await page.waitForTimeout(1200)
// dismiss any celebration
if (await page.locator('.celebration').count() > 0) {
  await page.locator('.celebration').getByRole('button').first().click()
  await page.waitForTimeout(400)
}
const pct2 = await page.locator('.gd-hero__percent').textContent()
check('progress now 41%', pct2?.trim() === '41%', `got ${pct2}`)

// ── Overspend guard ─────────────────────────────────────────────────
console.log('\n== Overspend guard ==')
await page.getByRole('button', { name: /^spend$/i }).first().click()
await page.waitForTimeout(500)
await page.getByLabel(/how much are you spending/i).fill('999999')
await page.getByRole('button', { name: /record spend/i }).click()
await page.waitForTimeout(400)
const errText = await page.locator('.field__error').textContent()
check('overspend blocked with the real balance', /20,500/.test(errText ?? ''), `got: ${errText}`)
await shot('09-overspend-error')

await page.getByLabel(/how much are you spending/i).fill('5000')
await page.getByRole('button', { name: /record spend/i }).click()
await page.waitForTimeout(900)
const pct3 = await page.locator('.gd-hero__percent').textContent()
check('progress back to 31% after spend', pct3?.trim() === '31%', `got ${pct3}`)

// ── Second goal ─────────────────────────────────────────────────────
console.log('\n== Second goal ==')
await page.goto(`${BASE}/new`, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.getByLabel('Goal name').fill('Vacation')
await page.getByLabel('Target amount').fill('60000')
await page.getByLabel(/starting amount/i).fill('15000')
// target date 6 months out
const future = new Date()
future.setMonth(future.getMonth() + 6)
await page.getByLabel(/target date/i).fill(future.toISOString().slice(0, 10))
await page.getByRole('button', { name: /create savings goal/i }).click()
await page.waitForTimeout(1000)
if (await page.locator('.celebration').count() > 0) {
  await page.locator('.celebration').getByRole('button').first().click()
  await page.waitForTimeout(400)
}
const paceVisible = await page.locator('.gd-pace').isVisible()
check('pace card shown for dated goal', paceVisible)
await shot('10-goal-with-pace')

// ── Dashboard ───────────────────────────────────────────────────────
console.log('\n== Dashboard ==')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const total = await page.locator('.dash__total').textContent()
// 15500 + 15000 = 30500
check('dashboard total is ₹30,500', total?.includes('30,500'), `got ${total}`)
check('two goal cards', (await page.locator('.goal-card').count()) === 2)
await shot('11-dashboard')

// ── Analytics ───────────────────────────────────────────────────────
console.log('\n== Analytics ==')
await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
check('savings curve rendered', (await page.locator('.chart__line').count()) > 0)
check('flow chart rendered', (await page.locator('.chart__bar').count()) > 0)
check('distribution rendered', (await page.locator('.dist__row').count()) === 2)
await shot('12-analytics')

// ── Achievements (empty) ────────────────────────────────────────────
await page.goto(`${BASE}/achievements`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
check('achievements empty state', await page.getByText(/nothing finished yet/i).isVisible())
await shot('13-achievements-empty')

// ── Settings + dark mode ────────────────────────────────────────────
console.log('\n== Settings / dark ==')
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await shot('14-settings-light')
await page.getByRole('radio', { name: 'Dark', exact: true }).click()
await page.waitForTimeout(500)
const theme = await page.evaluate(() => document.documentElement.dataset.theme)
check('dark theme applied', theme === 'dark')
await shot('15-settings-dark')

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await shot('16-dashboard-dark')

// ── Persistence across reload ───────────────────────────────────────
console.log('\n== Persistence ==')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const totalAfter = await page.locator('.dash__total').textContent()
check('data survives reload', totalAfter?.includes('30,500'), `got ${totalAfter}`)

// ── Not found ───────────────────────────────────────────────────────
await page.goto(`${BASE}/goal/does-not-exist`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
check('unknown goal shows not-found', await page.getByText(/that page isn't here/i).isVisible())

// ── Mobile ──────────────────────────────────────────────────────────
console.log('\n== Mobile ==')
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const mp = await mobile.newPage()
mp.on('pageerror', (err) => errors.push(`mobile pageerror: ${err.message}`))
await mp.goto(BASE, { waitUntil: 'networkidle' })
// seed the same data into this context
await mp.evaluate(() => localStorage.clear())
await mp.goto(BASE, { waitUntil: 'networkidle' })
await mp.waitForTimeout(400)
await mp.screenshot({ path: `${OUT}/17-mobile-onboarding.png`, fullPage: true })

const hScroll = await mp.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
)
check('no horizontal page scroll on mobile', !hScroll)

await mobile.close()

// ── Reduced motion ──────────────────────────────────────────────────
const rm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
const rp = await rm.newPage()
rp.on('pageerror', (err) => errors.push(`reduced-motion pageerror: ${err.message}`))
await rp.goto(BASE, { waitUntil: 'networkidle' })
await rp.waitForTimeout(500)
check('reduced-motion renders without error', await rp.locator('body').isVisible())
await rm.close()

console.log('\n== Console errors ==')
if (errors.length === 0) console.log('  none')
else errors.forEach((e) => console.log('  ' + e))

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`}`)
await browser.close()
process.exit(failures.length === 0 && errors.length === 0 ? 0 : 1)
