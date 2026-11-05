import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { checkExternalUrl, type ExternalUrlResult } from '@/lib/externalUrl'

// Server side of the "אתר חיצוני" URL check: the syntax rules (externalUrl.ts) plus where the host
// name resolves. A public-looking name that resolves to a loopback, private, link-local or other
// non-public address is rejected, so a region cannot point screens at their own network.
// Nothing is fetched: the TV's browser loads the page itself (no proxy, no server-side request).

/** True for addresses that are not on the public internet. */
export function isNonPublicAddress(address: string): boolean {
  const v = isIP(address)
  if (v === 4) {
    const [a, b] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 || // this network, private, loopback, multicast/reserved
      (a === 100 && b >= 64 && b <= 127) ||                 // carrier-grade NAT
      (a === 169 && b === 254) ||                           // link-local
      (a === 172 && b >= 16 && b <= 31) ||                  // private
      (a === 192 && b === 168) ||                           // private
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) // IETF / benchmarking
  }
  if (v === 6) {
    const x = address.toLowerCase()
    if (x === '::' || x === '::1') return true
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isNonPublicAddress(mapped[1])
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith('64:ff9b:') || x.startsWith('2001:db8:')
  }
  return true
}

type Resolver = (host: string) => Promise<{ address: string }[]>
const defaultResolver: Resolver = host => lookup(host, { all: true, verbatim: true })

/** Full check used by the content API. `ownHosts`: this app's host names. */
export async function validateExternalUrl(raw: unknown, ownHosts: string[], resolve: Resolver = defaultResolver): Promise<ExternalUrlResult> {
  const result = checkExternalUrl(raw, ownHosts)
  if (!result.ok) return result
  let addresses: { address: string }[]
  try {
    addresses = await Promise.race([
      resolve(result.host),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ])
  } catch {
    return { ok: false, error: 'לא ניתן לאתר את האתר. בדקו את הכתובת ונסו שוב.' }
  }
  if (!addresses.length || addresses.some(a => isNonPublicAddress(a.address)))
    return { ok: false, error: 'אי אפשר להציג כתובות של רשת פנימית' }
  return result
}

/** This app's host names, from the request (used to reject our own origin). */
export function requestHosts(headers: Headers): string[] {
  return [headers.get('host'), headers.get('x-forwarded-host'), process.env.NEXT_PUBLIC_APP_URL && (() => { try { return new URL(process.env.NEXT_PUBLIC_APP_URL!).host } catch { return null } })()]
    .flatMap(v => (v ?? '').split(','))
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
}
