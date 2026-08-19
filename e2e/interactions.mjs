import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = new URL('./screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const BASE = process.env.BASE_URL ?? 'http://localhost:4173'

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
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })

// Seed a scenario through storage, then reload so the app picks it up.
// The wait matters: the store persists on mount, so writing before the app
// has mounted would be immediately overwritten with the empty document.
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.evaluate(() => {
  const now = new Date()
  const iso = (daysAgo) => {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString()
  }
  localStorage.setItem(
    'aurum.savings.v1',
    JSON.stringify({
      version: 1,
      settings: { currency: 'INR', sound: false, celebrations: true, motion: 'system', theme: 'system', onboardedAt: iso(60) },
      goals: [
        {
          id: 'g1', name: 'Sneakers', targetMinor: 1200000, currency: 'INR',
          accent: 'clay', priority: 'high', createdAt: iso(45), celebratedMilestoneIds: [],
        },
        {
          id: 'g2', name: 'Camera', targetMinor: 8000000, currency: 'INR',
          accent: 'indigo', priority: 'low', createdAt: iso(50), celebratedMilestoneIds: [],
          note: 'For the trip in spring.',
        },
      ],
      transactions: [
        { id: 't1', goalId: 'g1', type: 'add', amountMinor: 500000, at: iso(40), category: 'gift', note: 'Birthday money' },
        { id: 't2', goalId: 'g1', type: 'add', amountMinor: 600000, at: iso(20), category: 'work' },
        { id: 't3', goalId: 'g2', type: 'add', amountMinor: 2000000, at: iso(35), category: 'work' },
        { id: 't4', goalId: 'g2', type: 'spend', amountMinor: 300000, at: iso(10), note: 'Lens cap and strap' },
        { id: 't5', goalId: 'g2', type: 'add', amountMinor: 1500000, at: iso(3), category: 'allowance' },
      ],
    }),
  )
})

// ── Complete a goal ────────────────────────────────────────────────
console.log('\n== Goal completion ==')
await page.goto(`${BASE}/goal/g1`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
check('sneakers at 91%', (await page.locator('.gd-hero__percent').textContent())?.trim() === '91%')

await page.getByRole('button', { name: /^add money$/i }).first().click()
await page.waitForTimeout(500)
// "Finish it" chip should complete the goal exactly
await page.getByRole('button', { name: /finish it/i }).click()
await page.waitForTimeout(200)
await shot('01-finish-it')
await page.getByRole('button', { name: /add to savings/i }).click()
await page.waitForTimeout(1000)

const celebration = page.locator('.celebration')
check('completion celebration shown', (await celebration.count()) > 0)
if (await celebration.count()) {
  const title = await celebration.locator('.celebration__title').textContent()
  check('celebration says goal achieved', /goal achieved/i.test(title ?? ''), `got ${title}`)
  await shot('02-goal-achieved')
  await celebration.getByRole('button', { name: /wonderful/i }).click()
  await page.waitForTimeout(500)
}

check('progress is 100%', (await page.locator('.gd-hero__percent').textContent())?.trim() === '100%')
check('archive action appears', await page.getByRole('button', { name: /archive/i }).isVisible())
await shot('03-completed-goal')

// ── Achievements ───────────────────────────────────────────────────
console.log('\n== Achievements ==')
await page.goto(`${BASE}/achievements`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
check('completed goal listed', (await page.locator('.achievement').count()) === 1)
await shot('04-achievements')

// ── Edit a transaction ─────────────────────────────────────────────
console.log('\n== Edit transaction ==')
await page.goto(`${BASE}/goal/g2`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const before = await page.locator('.gd-hero__percent').textContent()
check('camera at 40%', before?.trim() === '40%', `got ${before}`)

await page.locator('.tx__action').first().click()
await page.waitForTimeout(500)
await page.getByLabel('Amount', { exact: true }).fill('5000')
await shot('05-edit-transaction')
await page.getByRole('button', { name: /save changes/i }).click()
await page.waitForTimeout(900)
const after = await page.locator('.gd-hero__percent').textContent()
// 20000 - 3000 + 15000 = 32000 → edit the 15000 (most recent) to 5000 → 22000/80000 = 27%
check('balance recalculated after edit', after?.trim() !== before?.trim(), `still ${after}`)

// ── Delete a transaction ───────────────────────────────────────────
console.log('\n== Delete transaction ==')
const rowsBefore = await page.locator('.tx__row').count()
await page.locator('.tx__action--danger').first().click()
await page.waitForTimeout(500)
check('delete confirmation shown', await page.getByText(/delete this entry/i).isVisible())
await shot('06-delete-confirm')
await page.getByRole('button', { name: /delete entry/i }).click()
await page.waitForTimeout(800)
check('row removed', (await page.locator('.tx__row').count()) === rowsBefore - 1)

// ── Transaction filters ────────────────────────────────────────────
console.log('\n== Filters ==')
await page.getByRole('radio', { name: 'Spent', exact: true }).click()
await page.waitForTimeout(400)
const spendRows = await page.locator('.tx__amount--spend').count()
const addRows = await page.locator('.tx__amount--add').count()
check('spent filter shows only spends', spendRows > 0 && addRows === 0, `add=${addRows} spend=${spendRows}`)
await page.getByRole('radio', { name: 'All', exact: true }).click()
await page.waitForTimeout(300)

// ── Row height sanity (the grid-column bug) ────────────────────────
const rowBox = await page.locator('.tx__row').first().boundingBox()
check('transaction rows are compact', rowBox.height < 80, `height ${rowBox?.height}`)

// ── Keyboard: reach and open Add money ─────────────────────────────
console.log('\n== Keyboard ==')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.keyboard.press('Tab')
const firstFocus = await page.evaluate(() => document.activeElement?.className ?? '')
check('first tab reaches skip link', firstFocus.includes('skip-link'), `got "${firstFocus}"`)

// Tab to the Add button on a goal card and activate it
await page.goto(`${BASE}/goal/g2`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const addBtn = page.getByRole('button', { name: /^add money$/i }).first()
await addBtn.focus()
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
check('dialog opened by keyboard', await page.locator('dialog[open]').isVisible())
// Focus should be inside the dialog
const inDialog = await page.evaluate(() => !!document.activeElement?.closest('dialog'))
check('focus moved into the dialog', inDialog)
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
check('Escape closes the dialog', (await page.locator('dialog[open]').count()) === 0)

// ── Closed dialogs must not block clicks ───────────────────────────
const blocked = await page.evaluate(() => {
  const el = document.elementFromPoint(window.innerWidth / 2, 300)
  return el?.closest('dialog') !== null && el?.closest('dialog') !== undefined
})
check('no invisible dialog intercepting clicks', !blocked)

// ── Analytics charts ───────────────────────────────────────────────
console.log('\n== Charts ==')
await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const ticks = await page.locator('.chart__tick').allTextContents()
check('no misleading "T" thousands abbreviation', !ticks.some((t) => /^₹[\d.]+T$/.test(t)), ticks.join(','))
check('flow chart has both directions', (await page.locator('.chart__bar--in').count()) > 0 && (await page.locator('.chart__bar--out').count()) > 0)
await shot('07-analytics')

// Hover tooltip on the curve
await page.locator('.chart__svg').first().hover({ position: { x: 400, y: 100 } })
await page.waitForTimeout(300)
check('crosshair tooltip appears', await page.locator('.chart__tooltip').first().isVisible())
await shot('08-chart-tooltip')

// Table view
await page.locator('.chart-table summary').first().click()
await page.waitForTimeout(300)
check('table view available', await page.locator('.chart-table table').first().isVisible())

// ── Export ─────────────────────────────────────────────────────────
console.log('\n== Export ==')
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
const download = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
await page.getByRole('button', { name: /download backup/i }).click()
const file = await download
check('backup downloads', file !== null, 'no download event')
if (file) check('backup filename is sensible', /aurum-backup-\d{4}-\d{2}-\d{2}\.json/.test(file.suggestedFilename()), file.suggestedFilename())

// ── Mobile bottom sheet ────────────────────────────────────────────
console.log('\n== Mobile sheet ==')
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const mp = await mobile.newPage()
mp.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`))
await mp.goto(BASE, { waitUntil: 'networkidle' })
await mp.waitForTimeout(500)
await mp.evaluate(() => {
  // A fresh context has no data, and the app has already written an empty
  // document by now — so seed unconditionally rather than testing for null.
  localStorage.setItem('aurum.savings.v1', JSON.stringify({
    version: 1,
    settings: { currency: 'INR', sound: false, celebrations: true, motion: 'system', theme: 'system', onboardedAt: new Date().toISOString() },
    goals: [{ id: 'm1', name: 'New phone', targetMinor: 8000000, currency: 'INR', accent: 'jade', priority: 'medium', createdAt: new Date().toISOString(), celebratedMilestoneIds: [] }],
    transactions: [{ id: 'mt1', goalId: 'm1', type: 'add', amountMinor: 3200000, at: new Date().toISOString() }],
  }))
})
await mp.goto(BASE, { waitUntil: 'networkidle' })
await mp.waitForTimeout(600)
await mp.screenshot({ path: `${OUT}/09-mobile-dashboard.png`, fullPage: true })

await mp.locator('.goal-card__add').first().click()
await mp.waitForTimeout(700)
await mp.screenshot({ path: `${OUT}/10-mobile-sheet.png` })
const sheetBox = await mp.locator('dialog[open] .dialog__panel').boundingBox()
check('sheet anchored to the bottom of the viewport', sheetBox && sheetBox.y + sheetBox.height >= 840, JSON.stringify(sheetBox))
check('grip handle present on touch', await mp.locator('dialog[open] .dialog__grip').isVisible())

const mHScroll = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
check('no horizontal scroll with a sheet open', !mHScroll)
await mobile.close()

console.log('\n== Console errors ==')
errors.length ? errors.forEach((e) => console.log('  ' + e)) : console.log('  none')
console.log(`\n${failures.length === 0 && errors.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} failure(s), ${errors.length} error(s)`}`)
await browser.close()
process.exit(failures.length === 0 && errors.length === 0 ? 0 : 1)
