// "אתר חיצוני" (IFRAME content): which URLs may be shown in a screen region.
//
// Shared by the editor (immediate feedback), the content API (the authority) and the TV renderer
// (a last guard). Syntax only, no network access; the API additionally checks where the host
// resolves (externalUrlServer.ts).
//
// Policy:
// - https only; no user name or password in the URL; at most 2048 characters;
// - a public DNS host name: no IP literals, no single-label names, no local/internal suffixes;
// - default port only (443);
// - not this application's own host (an embedded page from our origin with allow-scripts and
//   allow-same-origin could remove its own sandbox);
// - no query parameters that look like credentials (the URL is visible on the public screen).

export const MAX_EXTERNAL_URL_LENGTH = 2048

const BLOCKED_SUFFIXES = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'home.arpa', 'corp', 'private', 'test', 'example', 'invalid', 'localdomain', 'onion']
const SENSITIVE_PARAMS = new Set(['password', 'passwd', 'pwd', 'pass', 'secret', 'token', 'access_token', 'id_token', 'refresh_token', 'auth', 'authorization', 'apikey', 'api_key', 'session', 'sessionid', 'session_id', 'jwt', 'ss_token'])

export type ExternalUrlResult = { ok: true; url: string; host: string } | { ok: false; error: string }

const fail = (error: string): ExternalUrlResult => ({ ok: false, error })

/** Validates and normalizes an external page URL. `ownHosts`: this app's host names (rejected). */
export function checkExternalUrl(raw: unknown, ownHosts: string[] = []): ExternalUrlResult {
  if (typeof raw !== 'string' || !raw.trim()) return fail('יש להזין כתובת אתר')
  const value = raw.trim()
  if (value.length > MAX_EXTERNAL_URL_LENGTH) return fail('הכתובת ארוכה מדי')
  // Control characters and whitespace inside the URL are never valid here.
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return fail('הכתובת מכילה תווים לא חוקיים')
  let url: URL
  try { url = new URL(value) } catch { return fail('הכתובת אינה תקינה') }
  if (url.protocol !== 'https:') return fail('יש להזין כתובת מאובטחת שמתחילה ב־https://')
  if (url.username || url.password) return fail('אין לכלול שם משתמש או סיסמה בכתובת')
  if (url.port && url.port !== '443') return fail('אפשר להשתמש רק בפורט הרגיל של https')

  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return fail('הכתובת אינה תקינה')
  // IPv6 literals keep their brackets in `hostname`; dotted (or numeric, normalized by URL) IPv4 too.
  if (host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return fail('יש להזין שם אתר ולא כתובת IP')
  const labels = host.split('.')
  if (labels.length < 2) return fail('יש להזין כתובת אתר מלאה (למשל https://www.example.org)')
  if (!labels.every(l => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(l) || /^xn--[a-z0-9-]{1,59}$/.test(l))) return fail('שם האתר אינו תקין')
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(labels[labels.length - 1])) return fail('שם האתר אינו תקין')
  if (BLOCKED_SUFFIXES.some(s => host === s || host.endsWith(`.${s}`))) return fail('אי אפשר להציג כתובות של רשת פנימית')
  const own = ownHosts.map(h => h.toLowerCase().replace(/:\d+$/, '')).filter(Boolean)
  if (own.includes(host)) return fail('אי אפשר להציג דפים של המערכת עצמה')

  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_PARAMS.has(key.toLowerCase())) return fail('הכתובת נראית כמכילה סיסמה או מפתח גישה. הכתובת גלויה במסך הציבורי — השתמשו בקישור ציבורי.')
  }
  url.hostname = host
  return { ok: true, url: url.href, host }
}

/** The stored settings of an IFRAME region: only the URL. */
export type IframeSettings = { url: string }

/**
 * The attributes every embedded page gets, in the editor preview and on the TV:
 * - sandbox: scripts and the site's own origin (most sites need both to render); no forms, popups,
 *   top-level navigation, downloads, modals or pointer lock. The URL is never our own origin
 *   (checked here and in the renderer), so allow-same-origin does not reach our pages.
 * - allow: powerful features off; no fullscreen.
 * - referrerPolicy no-referrer: the site does not learn the screen's address.
 */
export const IFRAME_SANDBOX = 'allow-scripts allow-same-origin'
export const IFRAME_ALLOW = "camera 'none'; microphone 'none'; geolocation 'none'; fullscreen 'none'; payment 'none'; usb 'none'; serial 'none'; hid 'none'; bluetooth 'none'; display-capture 'none'; clipboard-read 'none'; clipboard-write 'none'; publickey-credentials-get 'none'; screen-wake-lock 'none'; xr-spatial-tracking 'none'"
