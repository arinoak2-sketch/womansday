/**
 * Turning SerpAPI's Google Shopping results into the app's product contract.
 *
 * The shapes don't line up, and the gap is the interesting part. SerpAPI
 * returns a flat list of *listings* — one row per retailer per product, with
 * "PlayStation 5 Slim Console" from Amazon and "Sony PS5 Slim (Disc)" from
 * Croma appearing as two unrelated rows. The app wants *products*, each with
 * several retailer offers behind it, because comparing offers is how it
 * arrives at a defensible target price.
 *
 * So the job here is clustering: group listings that are plainly the same
 * product, and keep the groups conservative. Over-grouping is the dangerous
 * failure — folding a ₹2,000 controller in with a ₹50,000 console would drag
 * the suggested target down and the app would have no way to know.
 *
 * Kept free of Worker globals so it can be unit-tested directly.
 */

export type CurrencyCode =
  | 'INR' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'AED' | 'SGD'

/** The subset of a SerpAPI shopping result this code relies on. */
export interface SerpShoppingResult {
  position?: number
  title?: string
  link?: string
  product_link?: string
  product_id?: string
  source?: string
  price?: string
  extracted_price?: number
  thumbnail?: string
}

export interface SerpResponse {
  shopping_results?: SerpShoppingResult[]
  error?: string
}

export interface Offer {
  retailer: string
  price: number
  currency: CurrencyCode
  url?: string
}

export interface ProductResult {
  id: string
  title: string
  brand?: string
  imageUrl?: string
  url?: string
  offers: Offer[]
}

/* ------------------------------------------------------------------ */
/* Locale                                                              */
/* ------------------------------------------------------------------ */

/** Country code to search in, so prices come back in the right currency. */
const COUNTRY_BY_CURRENCY: Record<CurrencyCode, string> = {
  INR: 'in',
  USD: 'us',
  EUR: 'de',
  GBP: 'uk',
  JPY: 'jp',
  AUD: 'au',
  CAD: 'ca',
  AED: 'ae',
  SGD: 'sg',
}

export function countryForCurrency(currency: CurrencyCode): string {
  return COUNTRY_BY_CURRENCY[currency] ?? 'us'
}

/** Symbols that identify exactly one currency. */
const UNAMBIGUOUS_SYMBOLS: { pattern: RegExp; currency: CurrencyCode }[] = [
  { pattern: /₹|Rs\.?\s|INR/i, currency: 'INR' },
  { pattern: /£|GBP/i, currency: 'GBP' },
  { pattern: /€|EUR/i, currency: 'EUR' },
  { pattern: /¥|JPY/i, currency: 'JPY' },
  { pattern: /AED|د\.إ/i, currency: 'AED' },
]

/**
 * Currencies that write themselves with a bare `$`. Seeing `$` narrows a price
 * to this set — which is not nothing, even though it doesn't pick one.
 */
const DOLLAR_CURRENCIES = new Set<CurrencyCode>(['USD', 'AUD', 'CAD', 'SGD'])

/**
 * Decide what currency a price string is in.
 *
 * Returns null when the string contradicts the requested currency, so the
 * caller can drop the listing rather than mislabel it. Google does sometimes
 * return a foreign-currency listing inside a localised search, and quietly
 * treating $499 as ₹499 would understate a savings target by 80×.
 *
 * `$` can't identify a single currency, but it still rules several out: a `$`
 * price in a rupee search is definitely wrong, even though a `$` price in an
 * Australian dollar search is fine.
 */
export function reconcileCurrency(
  priceText: string | undefined,
  requested: CurrencyCode,
): CurrencyCode | null {
  if (!priceText) return requested

  for (const { pattern, currency } of UNAMBIGUOUS_SYMBOLS) {
    if (pattern.test(priceText)) {
      return currency === requested ? requested : null
    }
  }

  if (priceText.includes('$')) {
    return DOLLAR_CURRENCIES.has(requested) ? requested : null
  }

  // No symbol to go on; the search locale is the best evidence available.
  return requested
}

/* ------------------------------------------------------------------ */
/* Clustering                                                          */
/* ------------------------------------------------------------------ */

/** Words that carry no product identity and only dilute the comparison. */
const NOISE_WORDS = new Set([
  'buy', 'online', 'best', 'price', 'in', 'india', 'the', 'a', 'an', 'and', 'with',
  'for', 'new', 'latest', 'official', 'genuine', 'original', 'free', 'shipping',
  'delivery', 'offer', 'sale', 'deal', 'discount', 'store', 'shop', 'at', 'of',
  'edition', 'model', 'version', 'inch', 'cm',
])

/** Lowercase, strip punctuation, drop noise, keep order. */
export function significantTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NOISE_WORDS.has(token))
}

/**
 * Is `candidate` a better product name than `current`?
 *
 * Retailers pad titles with marketing — "Buy … Online at Best Price in India".
 * Counting *significant* tokens is the wrong test, because stripping the noise
 * makes the padded title score well; "Buy PlayStation 5 Slim Sony Console
 * Online at Best Price" reduces to five significant tokens and would beat the
 * cleaner "Sony PlayStation 5 Slim Console (Disc Edition)" at six.
 *
 * So judge the title as it will actually be displayed: fewest noise words
 * first, then shortest overall.
 */
export function isCleanerTitle(candidate: string, current: string): boolean {
  const candidateNoise = countNoiseWords(candidate)
  const currentNoise = countNoiseWords(current)
  if (candidateNoise !== currentNoise) return candidateNoise < currentNoise

  const candidateWords = candidate.trim().split(/\s+/).length
  const currentWords = current.trim().split(/\s+/).length
  return candidateWords < currentWords
}

function countNoiseWords(title: string): number {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => NOISE_WORDS.has(word)).length
}

/**
 * How alike two titles are, 0–1, by Jaccard overlap of their significant
 * tokens. Token *sets* rather than sequences, because retailers reorder the
 * same words freely ("Sony PS5 Slim" / "PS5 Slim by Sony").
 */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(significantTokens(a))
  const right = new Set(significantTokens(b))
  if (left.size === 0 || right.size === 0) return 0

  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1

  const union = left.size + right.size - shared
  return union === 0 ? 0 : shared / union
}

/**
 * Similarity at or above this counts as the same product.
 *
 * Set high on purpose. A missed grouping costs one comparison point; a wrong
 * grouping corrupts the suggested price, and the app can't detect that.
 */
const SAME_PRODUCT_THRESHOLD = 0.62

/**
 * A listing more than this far from its cluster's median is a different
 * product wearing a similar name — a controller, a game bundle, a case.
 */
const PRICE_SANITY_RATIO = 2.5

/**
 * A listing kept together with the offer it produced, so the product name can
 * be chosen from the listings that *survive* price filtering. Picking a title
 * during clustering risks naming the product after a bundle whose price is
 * then rejected.
 */
interface Entry {
  offer: Offer
  title: string
  imageUrl?: string
}

interface Cluster {
  id: string
  /** Representative title, used only for similarity matching while grouping. */
  title: string
  tokens: string[]
  url?: string
  entries: Entry[]
  bestPosition: number
}

/**
 * Map a SerpAPI response onto the app's contract.
 *
 * `requestedCurrency` is what the app asked for; listings that can be shown to
 * be in a different currency are dropped rather than relabelled.
 */
export function mapSerpResponse(
  payload: SerpResponse,
  requestedCurrency: CurrencyCode,
  options: { maxProducts?: number } = {},
): ProductResult[] {
  const { maxProducts = 8 } = options
  const listings = Array.isArray(payload.shopping_results) ? payload.shopping_results : []

  const clusters: Cluster[] = []

  for (const listing of listings) {
    const title = typeof listing.title === 'string' ? listing.title.trim() : ''
    const price = typeof listing.extracted_price === 'number' ? listing.extracted_price : Number.NaN
    const retailer = typeof listing.source === 'string' ? listing.source.trim() : ''

    if (!title || !retailer) continue
    if (!Number.isFinite(price) || price <= 0) continue

    const currency = reconcileCurrency(listing.price, requestedCurrency)
    if (currency === null) continue

    const tokens = significantTokens(title)
    if (tokens.length === 0) continue

    const offer: Offer = {
      retailer,
      price,
      currency,
      url: httpUrl(listing.product_link) ?? httpUrl(listing.link),
    }

    // A shared product_id is authoritative; otherwise fall back to title
    // similarity against clusters already seen.
    const existing =
      clusters.find((cluster) => listing.product_id && cluster.id === listing.product_id) ??
      clusters.find((cluster) => titleSimilarity(cluster.title, title) >= SAME_PRODUCT_THRESHOLD)

    const entry: Entry = { offer, title, imageUrl: httpUrl(listing.thumbnail) }

    if (existing) {
      existing.entries.push(entry)
      if (isCleanerTitle(title, existing.title)) {
        existing.title = title
        existing.tokens = tokens
      }
      existing.url ??= offer.url
      existing.bestPosition = Math.min(existing.bestPosition, listing.position ?? 999)
    } else {
      clusters.push({
        id: listing.product_id ?? '',
        title,
        tokens,
        url: offer.url,
        entries: [entry],
        bestPosition: listing.position ?? 999,
      })
    }
  }

  return clusters
    .map(finalizeCluster)
    .filter((product): product is ProductResult => product !== null)
    .sort((a, b) => b.offers.length - a.offers.length)
    .slice(0, maxProducts)
}

function finalizeCluster(cluster: Cluster): ProductResult | null {
  // One entry per retailer, keeping the cheapest — the same shop often lists a
  // product several times and would otherwise dominate the median.
  const byRetailer = new Map<string, Entry>()
  for (const entry of cluster.entries) {
    const key = entry.offer.retailer.toLowerCase()
    const current = byRetailer.get(key)
    if (!current || entry.offer.price < current.offer.price) byRetailer.set(key, entry)
  }

  let entries = [...byRetailer.values()]
  if (entries.length === 0) return null

  // Drop listings whose price says they can't be the same product. The app
  // does its own outlier trimming, but it can only work with what it's given —
  // and a bundle listed under the product's name is not an outlier price, it's
  // a different product.
  if (entries.length >= 3) {
    const sanityMedian = median(entries.map((entry) => entry.offer.price))
    entries = entries.filter(
      (entry) =>
        entry.offer.price <= sanityMedian * PRICE_SANITY_RATIO &&
        entry.offer.price >= sanityMedian / PRICE_SANITY_RATIO,
    )
  }
  if (entries.length === 0) return null

  // Name the product from the listings that survived, so a rejected bundle
  // can't leave its name on a product it isn't.
  let title = entries[0].title
  for (const entry of entries) {
    if (isCleanerTitle(entry.title, title)) title = entry.title
  }

  const offers = entries.map((entry) => entry.offer).sort((a, b) => a.price - b.price)

  return {
    id: cluster.id || slug(title),
    title,
    brand: guessBrand(title),
    imageUrl: entries.find((entry) => entry.imageUrl)?.imageUrl,
    url: cluster.url,
    offers,
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The leading word of a title, when it looks like a brand name.
 *
 * A guess, and treated as one — brand is optional in the contract and the app
 * shows it as a subtitle only. Noise words are skipped, because a title
 * beginning "Buy …" would otherwise present "Buy" as the manufacturer.
 */
function guessBrand(title: string): string | undefined {
  for (const word of title.trim().split(/\s+/)) {
    const cleaned = word.replace(/[^\p{L}\p{N}.'-]/gu, '')
    if (!cleaned) continue
    if (NOISE_WORDS.has(cleaned.toLowerCase())) continue
    if (cleaned.length < 2 || cleaned.length > 20) return undefined
    if (!/^\p{L}[\p{L}\p{N}.'-]*$/u.test(cleaned)) return undefined
    return cleaned
  }
  return undefined
}

/** Only http(s) survives, so a payload can't smuggle in a javascript: URL. */
function httpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
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
