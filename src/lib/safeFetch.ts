// SSRF-safe HTTPS GET for user-configured URLs (RSS feeds).
//
// - Only https: on port 443, no embedded credentials.
// - Every address a hostname resolves to must be public. The check runs inside the
//   socket's own `lookup`, so the connection uses exactly the addresses that were
//   validated (no second DNS query, which blocks DNS rebinding).
// - IP literals are validated before connecting (Node skips `lookup` for them).
// - Redirects are not followed automatically; each hop is validated again.
// - Total time and response size (after decompression) are capped.
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { lookup as dnsLookup } from 'node:dns'
import zlib from 'node:zlib'

export class SafeFetchError extends Error {
  // 'blocked' = the URL or its destination is not allowed; 'failed' = the remote fetch failed.
  constructor(public readonly kind: 'blocked' | 'failed', message: string) { super(message) }
}

const blocked = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
  ['2001:db8::', 32], ['100::', 64], ['2001::', 32], ['2002::', 16], ['64:ff9b::', 96], ['64:ff9b:1::', 48],
] as const) blocked.addSubnet(net, prefix, 'ipv6')

// IPv4 embedded in IPv6 (::ffff:a.b.c.d mapped, ::a.b.c.d compatible), in dotted or hex form.
function embeddedIPv4(ip: string): string | null {
  const m = /^::(?:ffff:)?(?:(\d{1,3}(?:\.\d{1,3}){3})|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(ip)
  if (!m) return null
  if (m[1]) return m[1]
  const hi = parseInt(m[2], 16), lo = parseInt(m[3], 16)
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')
}

export function isPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase()
  const family = isIP(ip)
  if (family === 4) return !blocked.check(ip, 'ipv4')
  if (family === 6) {
    const v4 = embeddedIPv4(ip)
    if (v4) return isIP(v4) === 4 && !blocked.check(v4, 'ipv4')
    // Only global unicast (2000::/3) is reachable on the public internet.
    if (!/^[23][0-9a-f]{0,3}:/.test(ip)) return false
    return !blocked.check(ip, 'ipv6')
  }
  return false
}

/** Parses and validates a user-supplied URL; throws SafeFetchError('blocked') if not allowed. */
export function validatePublicHttpsUrl(raw: string, base?: URL): URL {
  let url: URL
  try { url = new URL(raw, base) } catch { throw new SafeFetchError('blocked', 'Invalid URL') }
  if (url.protocol !== 'https:') throw new SafeFetchError('blocked', 'Only https is allowed')
  if (url.username || url.password) throw new SafeFetchError('blocked', 'Credentials are not allowed')
  if (url.port && url.port !== '443') throw new SafeFetchError('blocked', 'Port not allowed')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    throw new SafeFetchError('blocked', 'Host not allowed')
  if (isIP(host) && !isPublicAddress(host)) throw new SafeFetchError('blocked', 'Address not allowed')
  return url
}

// Resolves all addresses and refuses the connection if any of them is not public.
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, '', 4)
    const list = addresses as { address: string; family: number }[]
    if (!list.length || list.some(a => !isPublicAddress(a.address)))
      return callback(Object.assign(new Error('Destination not allowed'), { code: 'EBLOCKED' }), '', 4)
    const wanted = options.family === 4 || options.family === 6 ? list.filter(a => a.family === options.family) : list
    if (!wanted.length) return callback(Object.assign(new Error('No usable address'), { code: 'ENOTFOUND' }), '', 4)
    // Node may ask for all addresses (autoSelectFamily) or for a single one.
    if (options.all) return (callback as unknown as (e: null, a: typeof wanted) => void)(null, wanted)
    callback(null, wanted[0].address, wanted[0].family)
  })
}

function requestOnce(url: URL, deadline: number, maxBytes: number): Promise<{ status: number; location?: string; body?: Buffer }> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return reject(new SafeFetchError('failed', 'Timeout'))
    const req = https.request({
      protocol: 'https:', hostname: url.hostname.replace(/^\[|\]$/g, ''), servername: isIP(url.hostname.replace(/^\[|\]$/g, '')) ? undefined : url.hostname,
      port: 443, path: url.pathname + url.search, method: 'GET', lookup: safeLookup, agent: false,
      headers: { 'User-Agent': 'SchoolScreen/1.0', Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5', 'Accept-Encoding': 'gzip, deflate, br' },
    }, res => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, location: res.headers.location }) }
      if (status < 200 || status >= 300) { res.resume(); return reject(new SafeFetchError('failed', 'Upstream status ' + status)) }
      if (Number(res.headers['content-length'] ?? 0) > maxBytes) { res.destroy(); return reject(new SafeFetchError('failed', 'Too large')) }
      const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase()
      const stream = encoding === 'gzip' ? res.pipe(zlib.createGunzip()) : encoding === 'deflate' ? res.pipe(zlib.createInflate())
        : encoding === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res
      const chunks: Buffer[] = []
      let size = 0
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length
        // Limit applies to decompressed bytes as well (compression bombs).
        if (size > maxBytes) { res.destroy(); stream.destroy(); reject(new SafeFetchError('failed', 'Too large')) }
        else chunks.push(chunk)
      })
      stream.on('end', () => resolve({ status, body: Buffer.concat(chunks) }))
      stream.on('error', () => reject(new SafeFetchError('failed', 'Read error')))
    })
    const timer = setTimeout(() => req.destroy(new SafeFetchError('failed', 'Timeout')), remaining)
    req.on('close', () => clearTimeout(timer))
    req.on('error', (e: NodeJS.ErrnoException) => reject(e instanceof SafeFetchError ? e : new SafeFetchError(e.code === 'EBLOCKED' ? 'blocked' : 'failed', 'Request failed')))
    req.end()
  })
}

/** GETs a public https URL with SSRF protection, manual redirect validation, a deadline and a size cap. */
export async function safeHttpsGet(raw: string, { timeoutMs = 8000, maxBytes = 2 * 1024 * 1024, maxRedirects = 3 } = {}): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs
  let url = validatePublicHttpsUrl(raw)
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await requestOnce(url, deadline, maxBytes)
    if (res.body) return res.body
    if (!res.location) throw new SafeFetchError('failed', 'Redirect without location')
    url = validatePublicHttpsUrl(res.location, url)
  }
  throw new SafeFetchError('failed', 'Too many redirects')
}
