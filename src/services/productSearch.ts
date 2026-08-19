/**
 * Product search + price estimation.
 *
 * This app never invents a price. It talks to a *provider*, and if no provider
 * is configured it says so plainly and routes the user to entering a target by
 * hand. That is the whole reason this file is an interface with adapters rather
 * than a hard-coded API client: a real search backend can be dropped in
 * without any UI changing.
 *
 * ── Wiring a real provider ────────────────────────────────────────────────
 * Set `VITE_PRODUCT_SEARCH_ENDPOINT` (and optionally `VITE_PRODUCT_SEARCH_KEY`)
 * at build time. The endpoint receives:
 *
 *     GET <endpoint>?q=<query>&currency=<ISO-4217>
 *     Authorization: Bearer <key>          (only when a key is configured)
 *
 * and must answer with JSON:
 *
 *     {
 *       "results": [{
 *         "id": "ps5-slim",
 *         "title": "PlayStation 5 Slim",
 *         "brand": "Sony",                             // optional
 *         "description": "…",                          // optional
 *         "imageUrl": "https://…",                     // optional
 *         "url": "https://…",                          // optional
 *         "variants": ["Digital Edition"],             // optional
 *         "offers": [
 *           { "retailer": "Amazon", "price": 49999.00, "currency": "INR",
 *             "url": "https://…" }
 *         ]
 *       }]
 *     }
 *
 * `price` is in MAJOR units (rupees, dollars) as a JSON number; it is converted
 * to minor units here. Anything malformed is discarded rather than guessed at.
 */

import type { CurrencyCode, PriceSource } from '../domain/types'
import { isCurrencyCode, minorUnitScale } from '../lib/money'

export interface ProductSearchQuery {
  query: string
  currency: CurrencyCode
  signal?: AbortSignal
}

/** A product plus the offers behind its suggested price. */
export interface ProductCandidate {
  id: string
  title: string
  brand?: string
  description?: string
  imageUrl?: string
  url?: string
  variants?: string[]
  /** Offers in the requested currency, cheapest first. */
  offers: PriceSource[]
  /** The representative price this app suggests, in minor units. */
  suggestedMinor: number
  currency: CurrencyCode
  /** ISO timestamp of retrieval — surfaced in the UI, never hidden. */
  retrievedAt: string
  providerId: string
  /**
   * Set when the provider returned prices, but none in the requested currency.
   * The UI tells the user rather than silently converting at a made-up rate.
   */
  currencyMismatch?: { found: CurrencyCode[] }
}

export type ProductSearchOutcome =
  | { status: 'ok'; results: ProductCandidate[] }
  | { status: 'empty' }
  /** No provider wired up. Not an error — a known, explainable state. */
  | { status: 'unconfigured'; reason: string }
  | { status: 'error'; message: string }

export interface ProductSearchProvider {
  readonly id: string
  readonly label: string
  isConfigured(): boolean
  search(query: ProductSearchQuery): Promise<ProductSearchOutcome>
}

/* ------------------------------------------------------------------ */
/* Price selection                                                     */
/* ------------------------------------------------------------------ */

/** Offers this far from the median are treated as bundles or accessories. */
const OUTLIER_TOLERANCE = 0.45

/**
 * Pick a representative price from a set of offers.
 *
 * Deliberately not "the first result" and not "the cheapest": listings are
 * noisy, and a single mispriced accessory listing shouldn't set someone's
 * savings target. The median resists that, and offers far from it are dropped
 * before the median is taken again over what's left.
 */
export function chooseRepresentativePrice(offers: readonly PriceSource[]): number | null {
  const prices = offers.map((offer) => offer.amountMinor).filter((p) => p > 0)
  if (prices.length === 0) return null
  if (prices.length === 1) return prices[0]

  const firstPass = median(prices)
  const trimmed = prices.filter((p) => Math.abs(p - firstPass) / firstPass <= OUTLIER_TOLERANCE)
  // If trimming removed everything (widely scattered prices), the untrimmed
  // median is still the most defensible single number available.
  return trimmed.length > 0 ? median(trimmed) : firstPass
}

/**
 * The middle price — but always a price a retailer is actually charging.
 *
 * With an even number of offers the textbook median averages the two central
 * values, which invents a figure nobody quoted: four listings at ₹48,999 /
 * ₹49,490 / ₹49,999 / ₹50,490 average out to ₹49,744.50, a price that exists
 * nowhere. Taking the upper of the two central listings instead keeps the
 * suggestion real, and errs slightly high — the safer direction for a savings
 * target, since the cost of over-saving is much lower than falling short.
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/* ------------------------------------------------------------------ */
/* HTTP adapter                                                        */
/* ------------------------------------------------------------------ */

const REQUEST_TIMEOUT_MS = 12_000

export function createHttpProductSearchProvider(config: {
  endpoint: string
  apiKey?: string
  id?: string
  label?: string
}): ProductSearchProvider {
  const id = config.id ?? 'http'
  return {
    id,
    label: config.label ?? 'Web product search',
    isConfigured: () => Boolean(config.endpoint),

    async search({ query, currency, signal }): Promise<ProductSearchOutcome> {
      if (!config.endpoint) {
        return { status: 'unconfigured', reason: 'No product search endpoint is configured.' }
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      const onAbort = () => controller.abort()
      signal?.addEventListener('abort', onAbort)

      try {
        const url = new URL(config.endpoint, globalThis.location?.origin ?? 'http://localhost')
        url.searchParams.set('q', query)
        url.searchParams.set('currency', currency)

        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
        })

        if (!response.ok) {
          return {
            status: 'error',
            message:
              response.status >= 500
                ? "The product search service isn't responding right now."
                : "The product search couldn't be completed.",
          }
        }

        const payload: unknown = await response.json()
        const results = normalizeResults(payload, currency, id)
        return results.length === 0 ? { status: 'empty' } : { status: 'ok', results }
      } catch (error) {
        if (signal?.aborted) return { status: 'empty' }
        const aborted = error instanceof DOMException && error.name === 'AbortError'
        return {
          status: 'error',
          message: aborted
            ? 'The search took too long to respond.'
            : "Couldn't reach the product search. Check your connection and try again.",
        }
      } finally {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}

/**
 * Convert a provider payload into candidates.
 *
 * Every field is checked. A result with no usable offer in the requested
 * currency is still returned — with `currencyMismatch` set and no suggested
 * price — so the user learns *why* there is no number instead of seeing the
 * product vanish.
 */
function normalizeResults(
  payload: unknown,
  currency: CurrencyCode,
  providerId: string,
): ProductCandidate[] {
  const root = payload as { results?: unknown } | null
  const rawResults = Array.isArray(root?.results) ? root.results : Array.isArray(payload) ? payload : []
  const retrievedAt = new Date().toISOString()
  const candidates: ProductCandidate[] = []

  for (const raw of rawResults.slice(0, 12)) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as Record<string, unknown>

    const title = typeof item.title === 'string' ? item.title.trim() : ''
    if (!title) continue

    const allOffers = normalizeOffers(item.offers)
    const offers = allOffers
      .filter((offer) => offer.currency === currency)
      .sort((a, b) => a.amountMinor - b.amountMinor)

    const otherCurrencies = [...new Set(allOffers.map((o) => o.currency))].filter(
      (c) => c !== currency,
    )

    const suggestedMinor = chooseRepresentativePrice(offers)

    candidates.push({
      id: typeof item.id === 'string' && item.id ? item.id : slug(title),
      title: title.slice(0, 140),
      brand: optionalString(item.brand, 60),
      description: optionalString(item.description, 500),
      imageUrl: optionalUrl(item.imageUrl),
      url: optionalUrl(item.url),
      variants: Array.isArray(item.variants)
        ? item.variants.filter((v): v is string => typeof v === 'string').slice(0, 12)
        : undefined,
      offers,
      suggestedMinor: suggestedMinor ?? 0,
      currency,
      retrievedAt,
      providerId,
      currencyMismatch:
        offers.length === 0 && otherCurrencies.length > 0
          ? { found: otherCurrencies }
          : undefined,
    })
  }

  return candidates
}

function normalizeOffers(raw: unknown): PriceSource[] {
  if (!Array.isArray(raw)) return []
  const offers: PriceSource[] = []
  for (const entry of raw.slice(0, 20)) {
    if (typeof entry !== 'object' || entry === null) continue
    const offer = entry as Record<string, unknown>

    const retailer = typeof offer.retailer === 'string' ? offer.retailer.trim() : ''
    const price = typeof offer.price === 'number' ? offer.price : Number.NaN
    const offerCurrency = offer.currency

    if (!retailer) continue
    if (!Number.isFinite(price) || price <= 0) continue
    if (!isCurrencyCode(offerCurrency)) continue

    const amountMinor = Math.round(price * minorUnitScale(offerCurrency))
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) continue

    offers.push({
      retailer: retailer.slice(0, 60),
      amountMinor,
      currency: offerCurrency,
      url: optionalUrl(offer.url),
    })
  }
  return offers
}

function optionalString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed.slice(0, max)
}

/** Only http(s) URLs are accepted, so a payload can't inject a javascript: URL. */
function optionalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

/* ------------------------------------------------------------------ */
/* Null adapter                                                        */
/* ------------------------------------------------------------------ */

/**
 * Used when no endpoint is configured. It reports `unconfigured` rather than
 * pretending to search, which is what keeps the app honest about the fact that
 * it has no live web access in this deployment.
 */
export const unconfiguredProvider: ProductSearchProvider = {
  id: 'unconfigured',
  label: 'Not connected',
  isConfigured: () => false,
  async search() {
    return {
      status: 'unconfigured',
      reason: 'Live product search is not connected in this build.',
    }
  },
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

const env = import.meta.env as unknown as Record<string, string | undefined>

let activeProvider: ProductSearchProvider = (() => {
  const endpoint = env.VITE_PRODUCT_SEARCH_ENDPOINT
  if (!endpoint) return unconfiguredProvider
  return createHttpProductSearchProvider({
    endpoint,
    apiKey: env.VITE_PRODUCT_SEARCH_KEY,
    label: 'Web product search',
  })
})()

export function getProductSearchProvider(): ProductSearchProvider {
  return activeProvider
}

/** Swap the provider at runtime. Exists for tests and future host wiring. */
export function setProductSearchProvider(provider: ProductSearchProvider): void {
  activeProvider = provider
}

export function isProductSearchAvailable(): boolean {
  return activeProvider.isConfigured()
}
