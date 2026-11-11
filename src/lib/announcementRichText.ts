import { FilterXSS } from 'xss'

// Announcement body HTML: one allowlist, applied when saving (announcementSchema) and again when
// rendering (TV display, editor load). It runs the same on the server and in the browser (js-xss, no
// DOM). Allowed: basic text formatting, lists and tables (from Word/Excel paste), with a small set of
// inline styles (colors, sizes, alignment, direction, borders). Anything else is removed; scripts,
// styles and other embedded content lose their content too. No links, images, classes or event handlers.

const esc = (s: string) => s.replace(/&(?!(?:amp|lt|gt|quot|nbsp|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'div', 'p', 'br', 'ul', 'ol', 'li', 'span',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']
const DROP_WITH_BODY = ['script', 'style', 'xml', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript', 'template', 'textarea', 'select', 'button', 'form', 'title', 'head']
const BLOCK_DIR = new Set(['p', 'div', 'li', 'ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'])
const HAS_FORMATTING = /<\/?(?:div|p|span|b|strong|i|em|u|s|strike|ul|ol|li|br|table|tr|td|th)\b/i

const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/i
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const num = (n: number) => String(Math.round(n * 100) / 100)

function color(v: string): string | null {
  const c = v.trim().toLowerCase()
  if (c === 'windowtext' || c === 'auto') return 'currentColor'
  return COLOR.test(c) && !/^(?:inherit|initial|unset|expression)$/.test(c) ? c : null
}

function fontSize(v: string): string | null {
  const m = /^([\d.]+)\s*(px|pt|em)$/i.exec(v.trim())
  if (!m) return null
  const n = Number(m[1]), unit = m[2].toLowerCase()
  if (!Number.isFinite(n) || n <= 0) return null
  if (unit === 'em') return `${num(clamp(n, 0.5, 3))}em`
  return `${Math.round(clamp(unit === 'pt' ? n * 4 / 3 : n, 10, 72))}px`
}

/** "1px solid #000", ".5pt solid windowtext", "none" → a safe border value. */
function border(v: string): string | null {
  const t = v.trim().toLowerCase()
  if (t === 'none' || t === '0') return 'none'
  let width = '1px', style = 'solid', col = 'currentColor'
  for (const part of t.split(/\s+/)) {
    const w = /^([\d.]+)(px|pt)$/.exec(part)
    if (w) { const px = w[2] === 'pt' ? Number(w[1]) * 4 / 3 : Number(w[1]); width = `${num(clamp(px, 0.5, 4))}px`; continue }
    if (/^(?:solid|dashed|dotted|double|none)$/.test(part)) { style = part; continue }
    const c = color(part)
    if (!c) return null
    col = c
  }
  return style === 'none' ? 'none' : `${width} ${style} ${col}`
}

const ENUMS: Record<string, RegExp> = {
  'font-weight': /^(?:bold|bolder|normal|[1-9]00)$/,
  'font-style': /^(?:italic|normal)$/,
  'text-decoration': /^(?:none|underline|line-through)(?:\s+(?:underline|line-through))*$/,
  'text-decoration-line': /^(?:none|underline|line-through)(?:\s+(?:underline|line-through))*$/,
  'text-align': /^(?:right|left|center|justify|start|end)$/,
  direction: /^(?:rtl|ltr)$/,
  'vertical-align': /^(?:top|middle|bottom)$/,
}

/** Keep only the supported declarations, with normalized values. */
export function cleanStyle(style: string): string {
  const out: string[] = []
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const value = decl.slice(i + 1).replace(/!important/i, '').trim()
    if (!value || value.length > 80 || /url\s*\(|expression|javascript:|@import|[\\<>"'{}]/i.test(value)) continue
    let v: string | null = null, p = prop
    // Office's "windowtext"/"auto" text color means "the default color": leave it out (the TV picks a
    // readable one); as a border color it stays "currentColor".
    if (prop === 'color') v = /^(?:windowtext|auto)$/i.test(value) ? null : color(value)
    else if (prop === 'background-color' || prop === 'background') { p = 'background-color'; v = color(value) }
    else if (prop === 'font-size') v = fontSize(value)
    else if (/^border(?:-(?:top|right|bottom|left))?$/.test(prop)) v = border(value)
    else if (ENUMS[prop]) v = ENUMS[prop].test(value.toLowerCase()) ? value.toLowerCase() : null
    if (v) out.push(`${p}:${v}`)
  }
  return out.join(';')
}

const filter = new FilterXSS({
  whiteList: Object.fromEntries(TAGS.map(tag => [tag, tag === 'br' ? [] : ['style', 'dir', 'align', 'colspan', 'rowspan']])),
  allowCommentTag: false,
  stripIgnoreTagBody: DROP_WITH_BODY,
  onTagAttr: (tag, name, value) => {
    if (name === 'style') { const css = cleanStyle(value); return css ? `style="${esc(css)}"` : '' }
    // Direction on blocks only. Word marks inline runs dir="ltr" even in Hebrew text, which scrambles
    // the word order; inline text follows the Unicode bidi rules of its paragraph instead.
    if (name === 'dir') return BLOCK_DIR.has(tag) && /^(rtl|ltr|auto)$/i.test(value) ? `dir="${value.toLowerCase()}"` : ''
    if (name === 'align') return /^(right|left|center|justify)$/i.test(value) ? `align="${value.toLowerCase()}"` : ''
    if (name === 'colspan' || name === 'rowspan') {
      const n = Number(value)
      return (tag === 'td' || tag === 'th') && Number.isInteger(n) && n > 1 && n <= 100 ? `${name}="${n}"` : ''
    }
    return ''
  },
  onIgnoreTag: (tag, raw) => {
    // Any other real element (font, o:p, a, img, h1...) is removed; its text content is kept.
    if (/^[a-z][a-z0-9:-]*$/i.test(tag)) return ''
    // Not a tag at all (e.g. "3 < 5"): keep it visible as text.
    return esc(raw)
  },
})

/** Restrict saved announcement HTML to the formatting allowlist. Plain text keeps its line breaks. */
export function cleanAnnouncementHtml(input: string): string {
  if (!HAS_FORMATTING.test(input)) return esc(input).replace(/\n/g, '<br>')
  return filter.process(input.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[[\s\S]*?\]>/g, ''))
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Readable plain text of an announcement body (never interpreted as HTML): paragraphs, list items
 *  and table rows become lines, table cells are separated by " | ". */
export function announcementPlainText(html: string): string {
  if (!HAS_FORMATTING.test(html)) return html.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => decodeEntity(m, e))
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|xml|svg|iframe|object|noscript|template|title|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)\s*>\s*(?=<(td|th)\b)/gi, ' | ')
    .replace(/<\/(p|div|li|tr|table|ul|ol|h[1-6])\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => decodeEntity(m, e))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
function decodeEntity(match: string, e: string): string {
  if (e[0] === '#') {
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
  }
  return ENTITIES[e.toLowerCase()] ?? match
}

/** Length used for layout decisions: plain-text bodies keep their stored length (unchanged
 *  behavior); formatted bodies count their visible text, not the HTML markup. */
export function announcementTextLength(body: string): number {
  return HAS_FORMATTING.test(body) ? announcementPlainText(body).length : body.length
}
