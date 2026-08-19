# Aurum price worker

The server half of Aurum's product search. Without it the app has no way to
look up prices, and says so rather than inventing them.

It exists because a browser can't do this job:

- **Retailers and SerpAPI don't send CORS headers**, so the request has to be
  made server-side.
- **The SerpAPI key is spendable.** It lives here as a Worker secret and never
  reaches the client bundle.

It speaks exactly the contract in `../../src/services/productSearch.ts`, so the
app needs no changes to use it.

---

## Deploy

```bash
cd server/price-worker
npm install
npm run setup
```

`setup` walks through the whole thing: Cloudflare login, saving the SerpAPI key
as a secret, deploying, and printing the exact command to build the app against
the result. Nothing is stored in a file, and the key never reaches the browser.

Doing it by hand instead:

```bash
npx wrangler login
npx wrangler secret put SERPAPI_KEY     # https://serpapi.com/manage-api-key
npx wrangler deploy
```

Wrangler prints a URL like `https://aurum-price-worker.<you>.workers.dev`.
Build the app against it:

```bash
cd ../..
VITE_PRODUCT_SEARCH_ENDPOINT=https://aurum-price-worker.<you>.workers.dev/search npm run build
```

That's it — the search box in "Create a savings goal" goes live.

---

## Protecting the key

Every search costs money, and an open worker URL is an open tap. Two controls,
both optional but strongly recommended:

**`ALLOWED_ORIGINS`** (in `wrangler.toml`) — a comma-separated list of sites
allowed to call the worker. Requests from anywhere else are rejected *before*
SerpAPI is contacted, so a blocked caller costs nothing.

```toml
ALLOWED_ORIGINS = "https://aurum.example.com"
```

Left as `"*"` the worker answers anyone. That's fine locally; set it before you
go live.

**`SHARED_TOKEN`** (a secret) — a bearer token the app must send:

```bash
npx wrangler secret put SHARED_TOKEN
```

```bash
VITE_PRODUCT_SEARCH_ENDPOINT=… VITE_PRODUCT_SEARCH_KEY=<same token> npm run build
```

Be clear-eyed about what this buys you: the token ships inside the client
bundle, so anyone can read it out. It raises the effort needed to abuse the
worker; it does not make it private. `ALLOWED_ORIGINS` is the control that
actually matters.

**Caching** is the third line of defence, and the most effective one in normal
use. Identical searches share one cached answer for `CACHE_TTL_SECONDS`
(6 hours by default), so repeat lookups of popular products cost nothing.

---

## Local development

Two terminals, no SerpAPI key and no billed searches:

```bash
# 1. A stub that mimics SerpAPI's response shape
node serpapi-stub.mjs

# 2. The worker, pointed at the stub
npx wrangler dev --port 8787 \
  --var SERPAPI_KEY:test-key \
  --var SERPAPI_BASE_URL:http://localhost:5175/search.json \
  --var ALLOWED_ORIGINS:'*'
```

```bash
curl "http://127.0.0.1:8787/search?q=playstation&currency=INR"
```

The stub returns the mess that makes this worker necessary: one console listed
under four different titles, an accessory whose name is nearly identical, and a
listing in the wrong currency.

To drive the whole chain from the real UI:

```bash
VITE_PRODUCT_SEARCH_ENDPOINT=http://127.0.0.1:8787/search npm run build
npm run preview -- --port 4175
node e2e/worker-integration.mjs
```

Note that `wrangler dev` persists its cache to `.wrangler/state` between
restarts. After changing the mapping logic, delete that directory or query a
different term — otherwise you'll be looking at the previous answer and
concluding your change didn't work.

---

## What the mapping actually does

SerpAPI returns a flat list of **listings** — one row per retailer per product.
The app wants **products**, each with several retailer offers behind it,
because comparing offers is how it reaches a defensible target price. Closing
that gap is the whole job of `src/serpapi.ts`, and it is mostly a set of
judgement calls about when to *refuse* to use data:

| Problem in the raw data | What the worker does |
|---|---|
| One console listed as "Sony PS5 Slim", "Buy PlayStation 5 Slim Online…", "PS5 Slim by Sony" | Clusters by shared `product_id`, else by token-set similarity ≥ 0.62 |
| A ₹1,299 dust cover named almost identically to a ₹50,000 console | Dropped — more than 2.5× from the cluster median is a different product, not an outlier price |
| The same shop listing a product five times | One offer per retailer, cheapest kept, so it can't dominate the median |
| A `$499` US import inside a rupee search | Dropped. `$` can't say *which* dollar, but it rules out rupees — and reading it as ₹499 would understate a target by ~80× |
| "Buy … Online at Best Price in India Free Delivery" as the product name | Title scored by noise words first, then length, so the clean name wins |
| A rejected bundle having the tidiest name | The name is chosen only from listings that survived price filtering |

The clustering threshold is deliberately strict. A missed grouping costs one
comparison point; a wrong grouping corrupts the suggested price, and neither
the worker nor the app has any way to notice.

---

## Failure behaviour

| Situation | Response | What the user sees |
|---|---|---|
| SerpAPI quota exhausted | `429` | "That search didn't work" with a retry |
| Bad key / upstream error | `502` | Same |
| Upstream timeout (12s) | `504` | Same |
| `SERPAPI_KEY` not set | `503` | Same |
| No matches | `200` with `results: []` | "Nothing found for …" and a prompt to set a target manually |
| Origin not allowed | `403` | Same as an error, and no SerpAPI call is made |

The app never shows a raw status code or upstream message — it has its own
copy for each case. Bodies returned here are for developers reading logs.

Empty result sets are deliberately **not** cached, so a transient upstream
problem doesn't get frozen into six hours of "no matches".

---

## Tests

Run from the repository root:

```bash
npm test        # includes 48 tests for this worker
```

`serpapi.test.ts` covers the clustering and currency logic; `index.test.ts`
drives the handler itself — routing, CORS, origin and token checks, caching
behaviour, and every upstream failure mode.

One thing the tests cannot cover: SerpAPI's real response shape. The fixtures
match the documented schema, but the first live query is still worth watching.
`npx wrangler tail` streams production logs.

---

## Costs

SerpAPI bills per search. Cache hits are free, and the worker only calls
upstream when a query is at least two characters, the origin is allowed, and
nothing is cached. On Cloudflare's free tier the worker itself is free at
100,000 requests/day.
