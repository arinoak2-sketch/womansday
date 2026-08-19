#!/usr/bin/env node
/**
 * Guided setup for the price worker.
 *
 * Wraps the four wrangler steps into one command, checks the obvious things
 * that go wrong, and finishes by printing the exact line needed to build the
 * app against the deployed worker.
 *
 *   cd server/price-worker
 *   npm install
 *   npm run setup
 */

import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const bold = (s) => `[1m${s}[0m`
const dim = (s) => `[2m${s}[0m`
const green = (s) => `[32m${s}[0m`
const yellow = (s) => `[33m${s}[0m`

/** Run a command with the terminal attached, so wrangler can prompt. */
function run(command, args) {
  return spawnSync(command, args, { stdio: 'inherit', shell: false })
}

/** Run a command quietly and hand back its output. */
function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false })
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

function step(number, title) {
  console.log(`\n${bold(`Step ${number}`)} — ${title}`)
}

const rl = createInterface({ input: stdin, output: stdout })

console.log(bold('\nAurum price worker setup'))
console.log(
  dim(
    'This puts product price lookup online. It needs a SerpAPI account for the\n' +
      'price data and a Cloudflare account to run the worker. Both have free tiers.\n',
  ),
)

/* ---- 1. Cloudflare ------------------------------------------------- */

step(1, 'Cloudflare account')

const whoami = capture('npx', ['wrangler', 'whoami'])
if (whoami.ok && !/not authenticated/i.test(whoami.out)) {
  console.log(green('Already logged in to Cloudflare.'))
} else {
  console.log('A browser window will open for you to log in to Cloudflare.')
  await rl.question(dim('Press Enter to continue… '))
  const login = run('npx', ['wrangler', 'login'])
  if (login.status !== 0) {
    console.log(yellow('\nLogin did not complete. Run `npx wrangler login` and try again.'))
    rl.close()
    process.exit(1)
  }
}

/* ---- 2. SerpAPI key ------------------------------------------------ */

step(2, 'SerpAPI key')
console.log('Get a key from https://serpapi.com/manage-api-key (free trial, then paid).')
console.log(
  dim('The key is stored as a Cloudflare secret. It is never written to a file\nand never reaches the app in your browser.\n'),
)

await rl.question(dim('Press Enter, then paste the key when wrangler asks… '))
const secret = run('npx', ['wrangler', 'secret', 'put', 'SERPAPI_KEY'])
if (secret.status !== 0) {
  console.log(yellow('\nCould not save the key. Run `npx wrangler secret put SERPAPI_KEY` and try again.'))
  rl.close()
  process.exit(1)
}

/* ---- 3. Deploy ----------------------------------------------------- */

step(3, 'Deploy')
const deploy = capture('npx', ['wrangler', 'deploy'])
console.log(deploy.out.trim())

if (!deploy.ok) {
  console.log(yellow('\nDeploy failed. The output above says why.'))
  rl.close()
  process.exit(1)
}

// wrangler prints the live URL; pull it out so the user doesn't have to.
const url = deploy.out.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0]

/* ---- 4. Point the app at it ---------------------------------------- */

step(4, 'Connect the app')

if (url) {
  console.log(green(`\nWorker is live at ${url}`))
  console.log('\nBuild the app against it by running this from the project root:\n')
  console.log(bold(`  VITE_PRODUCT_SEARCH_ENDPOINT=${url}/search npm run build\n`))
} else {
  console.log(
    '\nDeployed. Copy the workers.dev URL from the output above and run, from the project root:\n',
  )
  console.log(bold('  VITE_PRODUCT_SEARCH_ENDPOINT=<that-url>/search npm run build\n'))
}

console.log(
  yellow('One more thing worth doing:') +
    '\n  Before putting this on a public site, set ALLOWED_ORIGINS in wrangler.toml to\n' +
    '  your own domain and deploy again. Otherwise anyone who finds the worker URL\n' +
    '  can spend your SerpAPI credits.\n',
)

rl.close()
