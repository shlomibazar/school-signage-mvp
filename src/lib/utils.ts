import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { FilterXSS } from 'xss'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toISOStringOrNull(d: Date | null | undefined): string | null {
  if (!d) return null
  try { return d instanceof Date ? d.toISOString() : new Date(d).toISOString() } catch { return null }
}

export function distributeWidths(count: number): number[] {
  if (count === 1) return [100]
  if (count === 2) return [50, 50]
  const base = Math.floor(100 / count)
  const rem  = 100 - base * count
  return Array.from({ length: count }, (_, i) => i === 0 ? base + rem : base)
}

// Text-content HTML is sanitized with an allowlist parser (js-xss), not regexes. It runs
// identically on the server and in the browser (no DOM), so SSR and hydration match.
// Allowed: basic formatting tags with `style`/`dir`/`align`. Everything else is removed;
// script/style/svg/iframe/etc. lose their content too. No links, images or classes.
const FORMAT_ATTRS = ['style', 'dir', 'align']
const TEXT_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'small', 'big', 'mark', 'sub', 'sup',
  'br', 'p', 'div', 'span', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'center']
// CSS values may not load resources or run expressions.
const safeCssValue = (value: string) => value.length <= 120 && !/url\s*\(|expression|javascript:|@import|behavior|-moz-binding|[\\<>]/i.test(value)
const CSS_PROPERTIES = ['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family',
  'text-align', 'text-decoration', 'line-height', 'letter-spacing', 'opacity', 'direction', 'unicode-bidi',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'padding', 'padding-top', 'padding-bottom',
  'display']
// Elements whose content is dropped along with the tag (never shown as text).
const DROP_WITH_BODY = new Set(['script', 'style', 'iframe', 'object', 'svg', 'math', 'noscript', 'template', 'textarea', 'select', 'button', 'form', 'title'])

export function sanitizeHTML(html: string): string {
  // Ranges of output to cut (content of DROP_WITH_BODY elements). Positions refer to the
  // filtered output; removed tags emit '' so the positions stay aligned.
  const cut: [number, number][] = []
  let bodyStart: number | false = false
  const filter = new FilterXSS({
    whiteList: Object.fromEntries(TEXT_TAGS.map(tag => [tag, tag === 'br' || tag === 'hr' ? [] : FORMAT_ATTRS])),
    allowCommentTag: false,
    css: { whiteList: Object.fromEntries(CSS_PROPERTIES.map(p => [p, safeCssValue])) },
    onTagAttr: (tag, name, value) => {
      if (name === 'dir') return /^(rtl|ltr|auto)$/i.test(value) ? `dir="${value.toLowerCase()}"` : ''
      if (name === 'align') return /^(right|left|center|justify)$/i.test(value) ? `align="${value.toLowerCase()}"` : ''
    },
    onIgnoreTag: (tag, raw, options) => {
      if (DROP_WITH_BODY.has(tag)) {
        const at = options.position ?? 0
        if (!options.isClosing) { if (bodyStart === false) bodyStart = at }
        else { cut.push([bodyStart === false ? at : bodyStart, at]); bodyStart = false }
        return ''
      }
      // Any other real element is removed; its text content is kept (escaped).
      if (/^[a-z][a-z0-9-]*$/i.test(tag)) return ''
      // Not a tag at all (e.g. "3 < 5", "<3", "<טקסט>"): keep it visible as text.
      return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    },
  })
  const out = filter.process(html)
  if (bodyStart !== false) cut.push([bodyStart, out.length]) // unclosed: drop to the end
  let result = '', last = 0
  for (const [start, end] of cut) { if (start >= last) { result += out.slice(last, start); last = end } }
  return result + out.slice(last)
}

/** Hebrew calendar date: 15 בסיוון התשפ"ה */
export function formatHebrewDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  } catch {
    return ''
  }
}

/** Gregorian date in Hebrew: יום שלישי, 15 ביוני 2025 */
export function formatGregorianDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  } catch {
    return date.toLocaleDateString('he-IL')
  }
}
