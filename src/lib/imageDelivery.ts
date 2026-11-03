// Display-size image delivery for Cloudinary uploads.
//
// The TV used to download original uploads (often 1–7 MB PNG/JPEG, e.g. 1838×2577 PDF
// pages) for every slide. Requesting a Cloudinary delivery transformation sized to the
// box the image is shown in cuts the bytes by an order of magnitude, and the small files
// stay in the browser cache across slide changes.
//
// - c_limit: scale down to fit w×h, keep the aspect ratio, never upscale small images.
// - q_auto / f_auto: Cloudinary picks quality and a modern format (WebP/AVIF) per browser.
// - Sizes are rounded up to fixed buckets so URLs are stable (cacheable) across resizes.
// - Only https://res.cloudinary.com/<cloud>/image/upload/ URLs are rewritten. Local
//   /uploads files, videos and any other URL are returned unchanged.
// - Originals in Cloudinary are never modified; transformations are derived on delivery.

const BUCKETS = [160, 320, 480, 640, 960, 1280, 1600, 1920, 2560]
const CLOUDINARY_IMAGE = /^(https:\/\/res\.cloudinary\.com\/[^/?#]+\/image\/upload\/)([^?#]+)$/

export function sizeBucket(px: number): number {
  const target = Number.isFinite(px) && px > 0 ? px : BUCKETS[0]
  return BUCKETS.find(b => b >= target) ?? BUCKETS[BUCKETS.length - 1]
}

type Options = { quality?: 'auto' | 'auto:good' | 'auto:eco' | 'auto:low'; dpr?: number }

/** URL for showing `url` inside a box of boxWidth×boxHeight CSS pixels. */
export function displayImageUrl(url: string, boxWidth: number, boxHeight: number, { quality = 'auto', dpr = 1 }: Options = {}): string {
  const match = CLOUDINARY_IMAGE.exec(url)
  if (!match) return url
  const scale = Math.min(2, Math.max(1, dpr))
  const w = sizeBucket(boxWidth * scale), h = sizeBucket(boxHeight * scale)
  return `${match[1]}c_limit,w_${w},h_${h},q_${quality},f_auto/${match[2]}`
}

/** Tiny version for the blurred backdrop behind contained images (CSS applies the blur). */
export function backdropImageUrl(url: string): string {
  return displayImageUrl(url, 160, 160, { quality: 'auto:low' })
}

/** Admin thumbnails/cards: never download the original for a small preview. */
export function thumbnailImageUrl(url: string): string {
  return displayImageUrl(url, 320, 320, { quality: 'auto:eco' })
}

/** Device pixel ratio for client-only rendering (1 on the server). */
export function clientDpr(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
}

/** Warm the browser cache for the next slide so the transition has no empty frame.
 *  Only Cloudinary URLs (served with long immutable caching): local /uploads files are
 *  served no-store, so preloading them would just download them twice. */
export function preloadImages(urls: string[]): void {
  if (typeof window === 'undefined') return
  for (const src of urls) {
    if (!src.startsWith('https://res.cloudinary.com/')) continue
    const img = new Image(); img.decoding = 'async'; img.src = src
  }
}
