import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index'

/** Minimal stand-in for the Workers cache API. */
function stubCaches() {
  const store = new Map<string, string>()
  const cache = {
    async match(key: Request) {
      const body = store.get(key.url)
      return body === undefined ? undefined : new Response(body)
    },
    async put(key: Request, response: Response) {
      store.set(key.url, await response.text())
    },
  }
  vi.stubGlobal('caches', { default: cache })
  return store
}

/**
 * `waitUntil` keeps the invocation alive until the promise settles, so the
 * cache write completes before the platform tears the request down. A stub
 * that merely discards the promise would misreport every cache hit as a miss.
 */
const pending: Promise<unknown>[] = []
const ctx = {
  waitUntil: (p: Promise<unknown>) => pending.push(p),
  passThroughOnException: () => {},
} as unknown as ExecutionContext

/** Drain background work the way the platform would before the next request. */
async function settleBackgroundWork() {
  await Promise.all(pending.splice(0))
}

function env(over: Partial<Env> = {}): Env {
  return {
    SERPAPI_KEY: 'test-key',
    SERPAPI_BASE_URL: 'https://serpapi.test/search.json',
    ALLOWED_ORIGINS: '*',
    ...over,
  }
}

const SHOPPING = {
  shopping_results: [
    { position: 1, title: 'Sony PlayStation 5 Slim', source: 'Amazon.in', price: '₹49,999', extracted_price: 49999, link: 'https://a.test/p' },
    { position: 2, title: 'Sony PlayStation 5 Slim Console', source: 'Croma', price: '₹50,490', extracted_price: 50490, link: 'https://b.test/p' },
    { position: 3, title: 'PlayStation 5 Slim by Sony', source: 'Reliance', price: '₹48,999', extracted_price: 48999, link: 'https://c.test/p' },
  ],
}

function mockUpstream(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers })

beforeEach(() => stubCaches())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('routing', () => {
  it('answers CORS preflight without calling upstream', async () => {
    const fetchMock = mockUpstream(SHOPPING)
    const res = await worker.fetch(
      new Request('https://w.test/search', { method: 'OPTIONS' }),
      env(),
      ctx,
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects non-GET methods', async () => {
    mockUpstream(SHOPPING)
    const res = await worker.fetch(
      new Request('https://w.test/search', { method: 'POST' }),
      env(),
      ctx,
    )
    expect(res.status).toBe(405)
  })

  it('404s unknown paths', async () => {
    mockUpstream(SHOPPING)
    expect((await worker.fetch(req('https://w.test/other'), env(), ctx)).status).toBe(404)
  })
})

describe('search', () => {
  it('returns the app contract shape', async () => {
    mockUpstream(SHOPPING)
    const res = await worker.fetch(req('https://w.test/search?q=ps5&currency=INR'), env(), ctx)
    expect(res.status).toBe(200)

    const body = (await res.json()) as { results: { title: string; offers: unknown[] }[] }
    expect(body.results).toHaveLength(1)
    expect(body.results[0].offers).toHaveLength(3)
  })

  it('passes the query and the right country to SerpAPI', async () => {
    const fetchMock = mockUpstream(SHOPPING)
    await worker.fetch(req('https://w.test/search?q=ps5&currency=GBP'), env(), ctx)

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('q')).toBe('ps5')
    expect(url.searchParams.get('engine')).toBe('google_shopping')
    expect(url.searchParams.get('gl')).toBe('uk')
    expect(url.searchParams.get('api_key')).toBe('test-key')
  })

  it('never leaks the API key to the client', async () => {
    mockUpstream(SHOPPING)
    const res = await worker.fetch(req('https://w.test/search?q=ps5'), env(), ctx)
    expect(await res.text()).not.toContain('test-key')
  })

  it('returns empty for a too-short query without spending a search', async () => {
    const fetchMock = mockUpstream(SHOPPING)
    const res = await worker.fetch(req('https://w.test/search?q=a'), env(), ctx)
    expect((await res.json() as { results: unknown[] }).results).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an unsupported currency', async () => {
    mockUpstream(SHOPPING)
    const res = await worker.fetch(req('https://w.test/search?q=ps5&currency=XYZ'), env(), ctx)
    expect(res.status).toBe(400)
  })

  it('reports a missing key as a server fault, not a user error', async () => {
    mockUpstream(SHOPPING)
    const res = await worker.fetch(
      req('https://w.test/search?q=ps5'),
      env({ SERPAPI_KEY: '' }),
      ctx,
    )
    expect(res.status).toBe(503)
  })
})

describe('caching', () => {
  it('serves a repeat search from cache without spending another SerpAPI call', async () => {
    const fetchMock = mockUpstream(SHOPPING)

    const first = await worker.fetch(req('https://w.test/search?q=ps5&currency=INR'), env(), ctx)
    expect(first.headers.get('X-Cache')).toBe('MISS')
    await settleBackgroundWork()

    const second = await worker.fetch(req('https://w.test/search?q=ps5&currency=INR'), env(), ctx)
    expect(second.headers.get('X-Cache')).toBe('HIT')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await second.json() as { results: unknown[] }).results).toHaveLength(1)
  })

  it('treats queries case-insensitively for caching', async () => {
    const fetchMock = mockUpstream(SHOPPING)
    await worker.fetch(req('https://w.test/search?q=PS5&currency=INR'), env(), ctx)
    await settleBackgroundWork()
    await worker.fetch(req('https://w.test/search?q=ps5&currency=INR'), env(), ctx)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps currencies in separate cache entries', async () => {
    const fetchMock = mockUpstream(SHOPPING)
    await worker.fetch(req('https://w.test/search?q=ps5&currency=INR'), env(), ctx)
    await settleBackgroundWork()
    await worker.fetch(req('https://w.test/search?q=ps5&currency=USD'), env(), ctx)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache an empty result set', async () => {
    // Caching "no matches" for six hours would hide a transient upstream
    // problem behind a wall of empty searches.
    const fetchMock = mockUpstream({ shopping_results: [] })
    await worker.fetch(req('https://w.test/search?q=zzz&currency=INR'), env(), ctx)
    await settleBackgroundWork()
    await worker.fetch(req('https://w.test/search?q=zzz&currency=INR'), env(), ctx)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('upstream failures', () => {
  it('maps a SerpAPI quota error to 429', async () => {
    mockUpstream({ error: 'Your account has run out of searches.' })
    const res = await worker.fetch(req('https://w.test/search?q=ps5'), env(), ctx)
    expect(res.status).toBe(429)
  })

  it('maps other SerpAPI errors to 502', async () => {
    mockUpstream({ error: 'Invalid API key' })
    const res = await worker.fetch(req('https://w.test/search?q=ps5'), env(), ctx)
    expect(res.status).toBe(502)
  })

  it('maps a non-2xx upstream response to 502', async () => {
    mockUpstream({}, { ok: false, status: 500 })
    const res = await worker.fetch(req('https://w.test/search?q=ps5'), env(), ctx)
    expect(res.status).toBe(502)
  })

  it('maps a network failure to 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    const res = await worker.fetch(req('https://w.test/search?q=ps5'), env(), ctx)
    expect(res.status).toBe(502)
  })

  it('maps an abort to 504', async () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
    const res = await worker.fetch(req('https://w.test/search?q=ps5'), env(), ctx)
    expect(res.status).toBe(504)
  })
})

describe('access control', () => {
  it('allows a listed origin and echoes it back', async () => {
    mockUpstream(SHOPPING)
    const res = await worker.fetch(
      req('https://w.test/search?q=ps5', { Origin: 'https://aurum.example' }),
      env({ ALLOWED_ORIGINS: 'https://aurum.example' }),
      ctx,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://aurum.example')
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it('blocks an unlisted origin before spending a search', async () => {
    const fetchMock = mockUpstream(SHOPPING)
    const res = await worker.fetch(
      req('https://w.test/search?q=ps5', { Origin: 'https://evil.example' }),
      env({ ALLOWED_ORIGINS: 'https://aurum.example' }),
      ctx,
    )
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('enforces the shared token when one is set', async () => {
    mockUpstream(SHOPPING)
    const withToken = env({ SHARED_TOKEN: 's3cret' })

    expect((await worker.fetch(req('https://w.test/search?q=ps5'), withToken, ctx)).status).toBe(401)
    expect(
      (
        await worker.fetch(
          req('https://w.test/search?q=ps5', { Authorization: 'Bearer s3cret' }),
          withToken,
          ctx,
        )
      ).status,
    ).toBe(200)
  })
})
