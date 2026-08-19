/**
 * Price lookup worker.
 *
 * Sits between Aurum and SerpAPI's Google Shopping engine, and exists for two
 * reasons a browser can't work around:
 *
 *   1. Retailers and SerpAPI don't send CORS headers the app could use, so the
 *      request has to be made server-side.
 *   2. The SerpAPI key must never reach the client bundle. It lives here as a
 *      Worker secret and never leaves.
 *
 * It speaks exactly the contract documented in `src/services/productSearch.ts`,
 * so the app needs no changes to use it.
 *
 *     GET /search?q=playstation+5&currency=INR
 *     → { "results": [ { title, offers: [{ retailer, price, currency }] } ] }
 */

import { countryForCurrency, mapSerpResponse, type CurrencyCode } from './serpapi'

export interface Env {
  /** SerpAPI key. Set with: wrangler secret put SERPAPI_KEY */
  SERPAPI_KEY: string
  /**
   * Comma-separated origins allowed to call this worker. The key is spendable,
   * so leaving this unset in production lets anyone burn your credits.
   * Use "*" only for local development.
   */
  ALLOWED_ORIGINS?: string
  /** Optional shared token the app sends as a bearer. See the README. */
  SHARED_TOKEN?: string
  /** Cache lifetime in seconds. Defaults to 6 hours. */
  CACHE_TTL_SECONDS?: string
  /**
   * Upstream base URL. Only set this to point at a stub during testing —
   * it defaults to the real SerpAPI endpoint.
   */
  SERPAPI_BASE_URL?: string
}

const SUPPORTED_CURRENCIES: CurrencyCode[] = [
  'INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'AED', 'SGD',
]

const DEFAULT_CACHE_TTL = 6 * 60 * 60
/** SerpAPI is normally well under a second; this is a backstop. */
const UPSTREAM_TIMEOUT_MS = 12_000
const MAX_QUERY_LENGTH = 120

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin')
    const cors = corsHeaders(origin, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, cors)
    }

    const url = new URL(request.url)
    if (url.pathname !== '/search') {
      return json({ error: 'Not found' }, 404, cors)
    }

    // An origin we don't recognise gets no CORS headers, which the browser
    // enforces — but rejecting outright also saves the SerpAPI call.
    if (!isOriginAllowed(origin, env)) {
      return json({ error: 'Origin not allowed' }, 403, cors)
    }
    if (env.SHARED_TOKEN) {
      const provided = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
      if (provided !== env.SHARED_TOKEN) {
        return json({ error: 'Unauthorized' }, 401, cors)
      }
    }

    const query = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH)
    if (query.length < 2) {
      return json({ results: [] }, 200, cors)
    }

    const requested = (url.searchParams.get('currency') ?? 'INR').toUpperCase()
    if (!SUPPORTED_CURRENCIES.includes(requested as CurrencyCode)) {
      return json({ error: 'Unsupported currency' }, 400, cors)
    }
    const currency = requested as CurrencyCode

    if (!env.SERPAPI_KEY) {
      // Configuration is missing, which is a server fault, not a user error —
      // and the app already knows how to present an unavailable provider.
      return json({ error: 'Search is not configured' }, 503, cors)
    }

    /*
     * Cache aggressively. Every miss is a billed SerpAPI search, and product
     * prices don't move minute to minute. The key deliberately excludes the
     * caller's origin and token so all users share one cached entry.
     */
    const cache = caches.default
    const cacheKey = new Request(
      `https://price-worker.internal/search?q=${encodeURIComponent(query.toLowerCase())}&currency=${currency}`,
      { method: 'GET' },
    )

    const cached = await cache.match(cacheKey)
    if (cached) {
      const body = await cached.text()
      return new Response(body, {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      })
    }

    let payload: unknown
    try {
      payload = await fetchSerpApi(query, currency, env.SERPAPI_KEY, env.SERPAPI_BASE_URL)
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError'
      // The message the app shows comes from its own copy; this body is only
      // ever read by developers.
      return json(
        { error: timedOut ? 'Upstream timed out' : 'Upstream request failed' },
        timedOut ? 504 : 502,
        cors,
      )
    }

    const serp = payload as { error?: string }
    if (serp?.error) {
      // SerpAPI reports quota exhaustion and bad keys as 200 + an error field.
      const exhausted = /run out|exceeded|limit/i.test(serp.error)
      return json({ error: serp.error }, exhausted ? 429 : 502, cors)
    }

    const results = mapSerpResponse(payload as never, currency)
    const body = JSON.stringify({ results })

    const ttl = Number(env.CACHE_TTL_SECONDS ?? DEFAULT_CACHE_TTL) || DEFAULT_CACHE_TTL
    // Only cache useful answers — caching an empty result set for six hours
    // would hide a transient upstream problem behind a wall of "no matches".
    if (results.length > 0) {
      ctx.waitUntil(
        cache.put(
          cacheKey,
          new Response(body, {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}` },
          }),
        ),
      )
    }

    return new Response(body, {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    })
  },
}

async function fetchSerpApi(
  query: string,
  currency: CurrencyCode,
  apiKey: string,
  baseUrl = 'https://serpapi.com/search.json',
): Promise<unknown> {
  const url = new URL(baseUrl)
  url.searchParams.set('engine', 'google_shopping')
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', apiKey)
  // Country drives which retailers and which currency come back.
  url.searchParams.set('gl', countryForCurrency(currency))
  url.searchParams.set('hl', 'en')
  url.searchParams.set('num', '40')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`SerpAPI responded ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

/* ------------------------------------------------------------------ */
/* CORS                                                                */
/* ------------------------------------------------------------------ */

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function isOriginAllowed(origin: string | null, env: Env): boolean {
  const allowed = allowedOrigins(env)
  // Unset means "not locked down yet" — permitted so a first deploy works,
  // and called out in the README as something to set before going live.
  if (allowed.length === 0 || allowed.includes('*')) return true
  // A same-origin or non-browser caller sends no Origin header.
  if (!origin) return true
  return allowed.includes(origin)
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = allowedOrigins(env)
  const wildcard = allowed.length === 0 || allowed.includes('*')
  const allowOrigin = wildcard ? '*' : origin && allowed.includes(origin) ? origin : allowed[0]

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
    // Responses differ by origin, so shared caches must not mix them up.
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
