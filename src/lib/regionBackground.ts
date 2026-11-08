// Per-region background (stored in ScreenSection.background). Client-safe.
//
// - mode "theme": the theme's own region surface (default; nothing stored is the same).
// - mode "color": a solid colour; text colour follows its contrast.
// - mode "image": an image of the school's media library (URL checked on save), positioned and
//   covering or contained, under a dark or light overlay whose opacity (0–90%) affects only the
//   overlay — never the text. Content components become transparent so the background shows.

export type RegionBackground = {
  mode: 'theme' | 'color' | 'image'
  color: string | null
  imageUrl: string | null
  position: 'center' | 'top' | 'bottom' | 'right' | 'left'
  fit: 'cover' | 'contain'
  overlay: 'dark' | 'light'
  opacity: number
}
export const DEFAULT_REGION_BACKGROUND: RegionBackground = { mode: 'theme', color: null, imageUrl: null, position: 'center', fit: 'cover', overlay: 'dark', opacity: 55 }
const POSITIONS = ['center', 'top', 'bottom', 'right', 'left'] as const
const HEX = /^#[0-9a-fA-F]{6}$/

/** Only same-site paths and https URLs (the server also checks the URL belongs to the school's media). */
export function safeImageUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2048) return null
  if (/^\/(?!\/)[^\s"'()\\]+$/.test(v)) return v
  try { const u = new URL(v); return u.protocol === 'https:' && !/["'()\\\s]/.test(v) ? u.toString() : null } catch { return null }
}

export function normalizeRegionBackground(raw: unknown): RegionBackground | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const mode = s.mode === 'color' || s.mode === 'image' ? s.mode : 'theme'
  const bg: RegionBackground = {
    mode,
    color: typeof s.color === 'string' && HEX.test(s.color) ? s.color : null,
    imageUrl: safeImageUrl(s.imageUrl),
    position: POSITIONS.includes(s.position as RegionBackground['position']) ? s.position as RegionBackground['position'] : 'center',
    fit: s.fit === 'contain' ? 'contain' : 'cover',
    overlay: s.overlay === 'light' ? 'light' : 'dark',
    opacity: Math.max(0, Math.min(90, Math.round(Number(s.opacity) || 0))),
  }
  if (bg.mode === 'color' && !bg.color) return null
  if (bg.mode === 'image' && !bg.imageUrl) return null
  return bg.mode === 'theme' ? null : bg
}

function inkFor(hex: string): string {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#142033' : '#ffffff'
}

/**
 * Styles of a region frame: its own background, the overlay layer, and CSS variables that make the
 * content transparent and pick a readable text colour. Null when the theme default applies.
 */
export function regionBackgroundStyles(raw: unknown): { frame: Record<string, string>; overlay: Record<string, string> | null } | null {
  const bg = normalizeRegionBackground(raw)
  if (!bg) return null
  const transparent = { '--tv-panel': 'transparent', '--v6-surface': 'transparent', '--v6-surface2': 'rgba(127,127,127,.14)', '--tv-unified-card': 'rgba(127,127,127,.16)' }
  if (bg.mode === 'color') {
    const ink = inkFor(bg.color!)
    return { frame: { ...transparent, background: bg.color!, '--tv-ink': ink, '--tv-panel-ink': ink, '--v6-ink': ink, '--v6-muted': ink === '#ffffff' ? 'rgba(255,255,255,.72)' : 'rgba(20,32,51,.66)', color: ink }, overlay: null }
  }
  const light = bg.overlay === 'light'
  const ink = light ? '#142033' : '#ffffff'
  return {
    frame: { ...transparent, backgroundImage: `url(${JSON.stringify(bg.imageUrl)})`, backgroundSize: bg.fit, backgroundPosition: bg.position, backgroundRepeat: 'no-repeat', backgroundColor: light ? '#f4f4f2' : '#0d1117',
      '--tv-ink': ink, '--tv-panel-ink': ink, '--v6-ink': ink, '--v6-muted': light ? 'rgba(20,32,51,.7)' : 'rgba(255,255,255,.78)', '--v6-line': light ? 'rgba(20,32,51,.16)' : 'rgba(255,255,255,.2)', color: ink },
    overlay: { background: light ? '#ffffff' : '#000000', opacity: String(bg.opacity / 100) },
  }
}
