// Converts clipboard HTML from Word/Excel (or any page) into announcement HTML, in the browser.
// The result is still passed through cleanAnnouncementHtml (allowlist) before it is inserted, and
// again on save and on display. Excel puts cell colors in <style> class rules, so those are inlined
// first; formulas arrive as their displayed values (Excel copies values into the cells).

import { cleanAnnouncementHtml } from './announcementRichText'

export type PasteMode = 'adapt' | 'original' | 'plain'

export const PASTE_MODES: { id: PasteMode; label: string; hint: string }[] = [
  { id: 'adapt', label: 'מותאם למסך', hint: 'שומר צבעים, טבלאות והדגשות, וגודל הטקסט מותאם למסך' },
  { id: 'original', label: 'עיצוב מקורי', hint: 'שומר גם את גדלי הטקסט המקוריים' },
  { id: 'plain', label: 'טקסט בלבד', hint: 'בלי עיצוב, רק הטקסט והפסקאות' },
]

const HEBREW = /[֐-׿]/
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain text → paragraphs and line breaks. */
export function plainTextToHtml(text: string): string {
  return text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<div>${esc(p).replace(/\n/g, '<br>')}</div>`).join('')
}

/** Class rules from Office <style> blocks (".xl65 {...}", "td.xl70 {...}", "p.MsoNormal {...}"). */
function classRules(doc: Document): Map<string, string> {
  const rules = new Map<string, string>()
  for (const style of doc.querySelectorAll('style')) {
    const css = (style.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--|-->/g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      for (const sel of m[1].split(',')) {
        const cls = /^\s*[a-z0-9]*\.([\w-]+)\s*$/i.exec(sel)
        if (cls) rules.set(cls[1], (rules.get(cls[1]) ?? '') + ';' + m[2])
      }
    }
  }
  return rules
}

/** Turn Word's list paragraphs (style "mso-list") into real lists, removing the typed marker. */
function wordLists(doc: Document) {
  const items = [...doc.body.querySelectorAll('p')].filter(p => /mso-list\s*:\s*l\d/i.test(p.getAttribute('style') ?? ''))
  let list: HTMLElement | null = null
  for (const p of items) {
    const markerEl = [...p.querySelectorAll('span')].find(s => /mso-list\s*:\s*ignore/i.test(s.getAttribute('style') ?? ''))
    const marker = (markerEl?.textContent ?? '').replace(/ /g, ' ').trim()
    markerEl?.remove()
    const ordered = /^[\dא-ת]+[.)]$/i.test(marker)
    if (!list || list.nextElementSibling !== p || (list.tagName === 'OL') !== ordered) {
      list = doc.createElement(ordered ? 'ol' : 'ul')
      p.before(list)
    }
    const li = doc.createElement('li')
    li.innerHTML = p.innerHTML
    if (p.getAttribute('dir')) li.setAttribute('dir', p.getAttribute('dir')!)
    list.appendChild(li)
    p.remove()
  }
}

export type PasteResult = { html: string; warnings: string[] }

export function convertPaste(html: string, text: string, mode: PasteMode): PasteResult {
  if (mode === 'plain' || !html.trim()) return { html: plainTextToHtml(text), warnings: [] }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rules = classRules(doc)
  const warnings: string[] = []

  // Inline class styles (Excel cell colors and borders), under the element's own style.
  for (const el of doc.body.querySelectorAll<HTMLElement>('[class]')) {
    const css = [...el.classList].map(c => rules.get(c) ?? '').join(';')
    if (css) el.setAttribute('style', `${css};${el.getAttribute('style') ?? ''}`)
  }
  // Headings → bold paragraphs (keeps them readable without the browser's heading sizes).
  for (const h of doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const p = doc.createElement('p')
    p.innerHTML = `<b>${h.innerHTML}</b>`
    if (h.getAttribute('dir')) p.setAttribute('dir', h.getAttribute('dir')!)
    if (h.getAttribute('style')) p.setAttribute('style', h.getAttribute('style')!)
    h.replaceWith(p)
  }
  wordLists(doc)
  // Office HTML wraps lines in the source: collapse whitespace like the browser would.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const empty: Text[] = []
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    n.data = n.data.replace(/[\r\n\t ]+/g, ' ')
    if (!n.data.trim() && n.parentElement && /^(TABLE|TBODY|THEAD|TFOOT|TR|COLGROUP|UL|OL)$/.test(n.parentElement.tagName)) empty.push(n)
  }
  empty.forEach(n => n.remove())

  // Font sizes: "adapt" makes them relative to the most common size (so the TV region decides the
  // actual size); "original" keeps them as they were.
  const sized = [...doc.body.querySelectorAll<HTMLElement>('[style*="font-size"]')]
  const px = (el: HTMLElement) => {
    const m = /font-size\s*:\s*([\d.]+)\s*(pt|px)/i.exec(el.getAttribute('style') ?? '')
    return m ? (m[2].toLowerCase() === 'pt' ? Number(m[1]) * 4 / 3 : Number(m[1])) : null
  }
  const counts = new Map<number, number>()
  for (const el of sized) { const s = px(el); if (s) counts.set(Math.round(s), (counts.get(Math.round(s)) ?? 0) + (el.textContent?.length ?? 0)) }
  const base = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 15
  for (const el of sized) {
    const s = px(el)
    if (!s) continue
    const style = el.getAttribute('style') ?? ''
    const ratio = s / base
    const next = mode === 'adapt'
      ? (Math.abs(ratio - 1) < 0.08 ? '' : `font-size:${Math.max(0.75, Math.min(2.2, ratio)).toFixed(2)}em`)
      : `font-size:${Math.round(s)}px`
    el.setAttribute('style', style.replace(/font-size\s*:[^;]*/gi, '') + (next ? `;${next}` : ''))
  }
  if (mode === 'original' && base < 18) warnings.push('גודל הטקסט המקורי קטן, וייתכן שיהיה קשה לקרוא אותו בטלוויזיה. מומלץ לבדוק בתצוגה המקדימה.')

  // Tables: direction from the content (a Hebrew sheet reads right to left; an English one left to right).
  for (const table of doc.body.querySelectorAll('table')) {
    if (!table.getAttribute('dir')) table.setAttribute('dir', HEBREW.test(table.textContent ?? '') ? 'rtl' : 'ltr')
    const cols = Math.max(0, ...[...table.rows].map(r => [...r.cells].reduce((n, c) => n + (c.colSpan || 1), 0)))
    if (cols > 6) warnings.push(`טבלה עם ${cols} עמודות: באזור צר הטקסט שבה יוקטן או יישבר לשורות. מומלץ לבדוק בתצוגה המקדימה.`)
  }
  // Word writes RTL paragraphs as align="right" with a contradicting text-align:left: keep the start alignment.
  for (const el of doc.body.querySelectorAll<HTMLElement>('[dir="rtl" i],[style*="rtl" i]')) {
    const rtl = /^rtl$/i.test(el.getAttribute('dir') ?? '') || /direction\s*:\s*rtl/i.test(el.getAttribute('style') ?? '')
    if (rtl && (el.getAttribute('align') ?? '').toLowerCase() !== 'left') el.setAttribute('style', (el.getAttribute('style') ?? '').replace(/text-align\s*:\s*left\s*;?/gi, ''))
  }
  // Paragraphs without a direction follow their own text (Hebrew right to left, English left to right).
  for (const el of doc.body.querySelectorAll('p,div,li')) if (!el.getAttribute('dir')) el.setAttribute('dir', 'auto')

  const out = cleanAnnouncementHtml(doc.body.innerHTML).replace(/<(p|div|span)[^>]*>\s*<\/\1>/g, '')
  return { html: out, warnings: [...new Set(warnings)] }
}
