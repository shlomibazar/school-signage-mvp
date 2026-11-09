// Public TV pages: is our server answering right now?
//
// A Next.js data refresh (router.refresh) or a page reload that gets an unexpected answer (a 502 /
// 503 page from a proxy while the server restarts, e.g. an IIS application pool recycle) replaces
// the TV page with that error page, which has none of our code and never retries. So a refresh or a
// reload is attempted only after our own light endpoint (no database, no auth) answered OK. This
// narrows the window a lot; it cannot rule out a failure that starts right after the check.
export const PROBE_URL = '/api/public/connection'
/** A successful check counts as current for this long (the TV's own probe runs every 30 s). */
export const HEALTH_FRESH_MS = 35_000

export async function probeServer(timeoutMs = 8_000): Promise<boolean> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = setTimeout(() => controller?.abort(), timeoutMs)
  try {
    const response = await fetch(`${PROBE_URL}?ts=${Date.now()}`, { cache: 'no-store', signal: controller?.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
