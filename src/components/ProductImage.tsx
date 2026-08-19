import { useEffect, useState } from 'react'
import type { AccentName, Product } from '../domain/types'
import './ProductImage.css'

interface ProductImageProps {
  product?: Product
  /** Goal or product name — drives the monogram fallback. */
  name: string
  accent: AccentName
  size?: number
  className?: string
  /** Direct URL, for search results that aren't yet attached to a goal. */
  src?: string
}

/**
 * Product artwork with a designed fallback.
 *
 * Remote images fail routinely — hotlink protection, expired CDN URLs, offline
 * devices — so the fallback isn't an error state, it's the default appearance
 * for most goals. It's a monogram on the goal's own accent, which looks
 * deliberate rather than broken.
 */
export function ProductImage({
  product,
  name,
  accent,
  size = 56,
  className,
  src,
}: ProductImageProps) {
  const url = src ?? product?.imageUrl
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // A changed URL is a fresh attempt; without this reset a previously failed
  // image would keep the fallback forever after the goal is edited.
  useEffect(() => {
    setFailed(false)
    setLoaded(false)
  }, [url])

  const showImage = Boolean(url) && !failed

  return (
    <div
      className={['product-image', className].filter(Boolean).join(' ')}
      data-accent={accent}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      <span className="product-image__monogram" aria-hidden="true">
        {monogram(name)}
      </span>

      {showImage && (
        <img
          className={['product-image__img', loaded && 'product-image__img--loaded']
            .filter(Boolean)
            .join(' ')}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          // Product art is decorative here: the goal name is always adjacent as
          // real text, so alt text would only duplicate it.
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

/** Up to two initials from the goal name. */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
