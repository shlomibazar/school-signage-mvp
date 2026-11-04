// Browser-side capture of the editor's screen preview (the real TV renderer, ScreenPreview +
// ContentRenderer) as a JPEG, for the screens list ("עדכן צילום"). Runs only on that click: no
// iframe, no server-side browser, no background jobs. modern-screenshot is loaded on demand.

export const SNAPSHOT_LONG_SIDE = 1280
export const SNAPSHOT_MAX_BYTES = 480 * 1024 // the server accepts up to 500 KB
const QUALITIES = [0.82, 0.72, 0.6]
const IMAGE_WAIT_MS = 8000

/** Output size for a stage of w×h: the long side becomes SNAPSHOT_LONG_SIDE, aspect ratio kept. */
export function snapshotSize(width: number, height: number): { width: number; height: number; scale: number } {
  const scale = SNAPSHOT_LONG_SIDE / Math.max(width, height, 1)
  return { width: Math.round(width * scale), height: Math.round(height * scale), scale }
}

/** Waits for web fonts and for every image inside the stage (each image at most IMAGE_WAIT_MS). */
async function ready(stage: HTMLElement) {
  await document.fonts?.ready
  const pending = [...stage.querySelectorAll('img')].filter(img => !img.complete)
  await Promise.all(pending.map(img => new Promise<void>(resolve => {
    const done = () => resolve()
    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
    setTimeout(done, IMAGE_WAIT_MS)
  })))
}

export type Capture = { blob: Blob; width: number; height: number; quality: number; ms: number }

/** Captures the unscaled preview stage (.tv-screen-stage, 1920×1080 or 1080×1920) as a JPEG. */
export async function captureScreenStage(stage: HTMLElement): Promise<Capture> {
  const started = performance.now()
  await ready(stage)
  const { domToBlob } = await import('modern-screenshot')
  const w = stage.offsetWidth, h = stage.offsetHeight
  const size = snapshotSize(w, h)
  for (const quality of QUALITIES) {
    const blob = await domToBlob(stage, {
      width: w, height: h, scale: size.scale, quality, type: 'image/jpeg',
      // The editor shows the stage scaled down with a frame; the snapshot is the screen itself.
      style: { transform: 'none', boxShadow: 'none', borderRadius: '0', border: 'none' },
    })
    if (blob.size <= SNAPSHOT_MAX_BYTES || quality === QUALITIES[QUALITIES.length - 1]) {
      return { blob, width: size.width, height: size.height, quality, ms: Math.round(performance.now() - started) }
    }
  }
  throw new Error('unreachable')
}
