// Readable colors for pasted announcement content on the TV (browser only, on the rendered body).
// The TV announcement sets its own text color (usually light on a dark background) and pasted
// content inherits it. Office leaves the text color out where it is the default (black), so a light
// cell background would get light text. This pass:
//  - gives an element with its own background but no own text color a text color that reads on that
//    background (dark on light, white on dark);
//  - keeps an explicit pasted text color unless it is unreadable on its effective background (the
//    nearest own background, or the TV background), and only then replaces it.
// Plain text without colors is untouched. Safe to run again (marked elements are skipped).

const DARK = '#111827', LIGHT = '#ffffff'

function parse(rgb: string): [number, number, number, number] | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i.exec(rgb)
  if (!m) return null
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
  return [Number(m[1]), Number(m[2]), Number(m[3]), a]
}
function luminance([r, g, b]: [number, number, number, number]): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const readableOn = (bgLum: number) => (contrast(bgLum, 0) >= contrast(bgLum, 1) ? DARK : LIGHT)

export function applyReadableColors(root: HTMLElement) {
  // The region's own text color tells whether the TV background is dark (light text) or light.
  const ink = parse(getComputedStyle(root).color)
  const tvBgLum = ink && luminance(ink) > 0.4 ? 0.02 : 1

  const ownBg = (el: HTMLElement): number | null => {
    if (!el.style.backgroundColor) return null
    const c = parse(getComputedStyle(el).backgroundColor)
    return c && c[3] > 0.5 ? luminance(c) : null
  }
  // Effective background of an element: its own, or the nearest ancestor's inside the body, or the TV's.
  const effectiveBg = (el: HTMLElement): number => {
    for (let n: HTMLElement | null = el; n && n !== root; n = n.parentElement) {
      const l = ownBg(n)
      if (l !== null) return l
    }
    return tvBgLum
  }

  const styled = [...root.querySelectorAll<HTMLElement>('[style]')]
  // 1) Own background, no own text color: pick a readable one. ("currentcolor" counts as none.)
  for (const el of styled) {
    if (el.dataset.ink) continue
    if (/currentcolor/i.test(el.style.color)) el.style.color = ''
    const bg = ownBg(el)
    if (bg !== null && !el.style.color) { el.style.color = readableOn(bg); el.dataset.ink = 'auto' }
  }
  // 2) Explicit text colors: keep them when readable on their background, otherwise replace.
  for (const el of styled) {
    if (el.dataset.ink || !el.style.color) continue
    el.dataset.ink = 'own'
    const c = parse(getComputedStyle(el).color)
    if (!c) continue
    const bg = effectiveBg(el)
    if (contrast(luminance(c), bg) < 3) el.style.color = readableOn(bg) // 3:1, the usual minimum for large text
  }
}

/**
 * Pasted (Word/Excel) content on the TV:
 *  - font sizes in px were document sizes (16px = normal text); they become relative to the TV text
 *    size, so headings stay larger and body text stays readable (relative to the nearest sized parent);
 *  - Word writes RTL paragraphs as align="right" with a contradicting "text-align:left"; the left
 *    alignment is dropped so the paragraph starts at the right, as in Word.
 * Only for the rich layout; toolbar-made announcements keep their sizes. Safe to run again.
 */
export function normalizePastedContent(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>('[style]')) {
    if (el.dataset.norm) continue
    el.dataset.norm = '1'
    const m = /^([\d.]+)px$/.exec(el.style.fontSize)
    if (m) {
      el.dataset.px = m[1]
      let parentPx = 16
      for (let n = el.parentElement; n && n !== root; n = n.parentElement) if (n.dataset.px) { parentPx = Number(n.dataset.px); break }
      const em = Math.max(0.6, Math.min(2.5, Number(m[1]) / parentPx))
      el.style.fontSize = `${em.toFixed(3)}em`
    }
    const align = el.getAttribute('align')?.toLowerCase()
    const rtl = el.getAttribute('dir') === 'rtl' || el.style.direction === 'rtl'
    if (rtl && el.style.textAlign === 'left' && align !== 'left') el.style.textAlign = ''
  }
}
