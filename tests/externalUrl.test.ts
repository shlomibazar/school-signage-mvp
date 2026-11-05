import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkExternalUrl, IFRAME_SANDBOX, IFRAME_ALLOW } from '@/lib/externalUrl'
import { isNonPublicAddress, validateExternalUrl } from '@/lib/externalUrlServer'

const OWN = ['school-signage-mvp.onrender.com', 'localhost:3001']
const ok = (u: string) => { const r = checkExternalUrl(u, OWN); assert.ok(r.ok, `${u}: ${!r.ok ? r.error : ''}`); return r }
const bad = (u: unknown) => assert.equal(checkExternalUrl(u, OWN).ok, false, String(u))

test('valid public https pages are accepted and normalized', () => {
  assert.equal(ok('https://www.wikipedia.org').ok && ok('https://www.wikipedia.org').url, 'https://www.wikipedia.org/')
  ok('https://docs.google.com/presentation/d/e/abc/embed?start=true&loop=true')
  ok('  https://Example.ORG./path?x=1#top  ')
  const r = checkExternalUrl('https://WWW.Example.org.', OWN)
  assert.ok(r.ok && r.url === 'https://www.example.org/')
  ok('https://xn--4dbrk0ce.xn--4dbrk0ce/') // IDN (punycode) host
})

test('only https, no other schemes', () => {
  for (const u of ['http://example.org', 'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd',
    'ftp://example.org', 'blob:https://example.org/x', 'about:blank', 'vbscript:x', '//example.org', 'example.org', 'JaVaScRiPt:alert(1)'])
    bad(u)
})

test('malformed, empty, oversized or control-character URLs are rejected', () => {
  for (const u of ['', '   ', null, undefined, 42, {}, 'https://', 'https://exa mple.org', 'https://example.org/\u0000x', 'https://example.org/\nx',
    `https://example.org/${'a'.repeat(2100)}`, 'https://-bad-.org', 'https://example.123', 'https://exa_mple.org'])
    bad(u)
})

test('credentials in the URL and credential-like query parameters are rejected', () => {
  bad('https://user:pass@example.org/')
  bad('https://user@example.org/')
  for (const p of ['token', 'access_token', 'password', 'apikey', 'API_KEY', 'session', 'ss_token', 'jwt']) bad(`https://example.org/?${p}=x`)
})

test('local, private and internal destinations are rejected by name', () => {
  for (const u of ['https://localhost', 'https://localhost:443', 'https://127.0.0.1', 'https://2130706433', 'https://0x7f000001', 'https://10.0.0.1',
    'https://192.168.1.1', 'https://169.254.169.254/latest/meta-data', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://8.8.8.8',
    'https://intranet', 'https://router.local', 'https://srv.internal', 'https://app.localhost', 'https://x.home.arpa', 'https://a.corp', 'https://foo.test'])
    bad(u)
})

test('non-default ports and this application itself are rejected', () => {
  bad('https://example.org:8443/')
  ok('https://example.org:443/')
  bad('https://school-signage-mvp.onrender.com/admin/settings')
  bad('https://SCHOOL-SIGNAGE-MVP.onrender.com/screen/main-lobby')
  bad('https://localhost:3001/') // also blocked as localhost
})

test('the iframe is sandboxed: scripts and its own origin only; no forms, popups, top navigation or fullscreen', () => {
  const flags = IFRAME_SANDBOX.split(/\s+/)
  assert.deepEqual(flags.sort(), ['allow-same-origin', 'allow-scripts'])
  for (const f of ['allow-top-navigation', 'allow-popups', 'allow-forms', 'allow-modals', 'allow-downloads', 'allow-top-navigation-by-user-activation', 'allow-popups-to-escape-sandbox'])
    assert.ok(!IFRAME_SANDBOX.includes(f), f)
  for (const feature of ['camera', 'microphone', 'geolocation', 'fullscreen', 'payment', 'display-capture'])
    assert.match(IFRAME_ALLOW, new RegExp(`${feature} 'none'`))
})

test('non-public addresses', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:10.0.0.1', 'not-an-ip'])
    assert.ok(isNonPublicAddress(a), a)
  for (const a of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111']) assert.ok(!isNonPublicAddress(a), a)
})

test('server check: a public name that resolves to a private or loopback address is rejected', async () => {
  const resolveTo = (...addresses: string[]) => async () => addresses.map(address => ({ address }))
  assert.ok((await validateExternalUrl('https://www.example.org', OWN, resolveTo('93.184.215.14'))).ok)
  assert.equal((await validateExternalUrl('https://evil.example.org', OWN, resolveTo('127.0.0.1'))).ok, false)
  assert.equal((await validateExternalUrl('https://evil.example.org', OWN, resolveTo('93.184.215.14', '10.0.0.5'))).ok, false)
  assert.equal((await validateExternalUrl('https://evil.example.org', OWN, resolveTo('::ffff:192.168.1.1'))).ok, false)
  assert.equal((await validateExternalUrl('https://none.example.org', OWN, resolveTo())).ok, false)
  assert.equal((await validateExternalUrl('https://down.example.org', OWN, async () => { throw new Error('ENOTFOUND') })).ok, false)
  // The syntax rules run first: nothing is resolved for a rejected URL.
  let called = false
  assert.equal((await validateExternalUrl('http://example.org', OWN, async () => { called = true; return [] })).ok, false)
  assert.equal(called, false)
})
