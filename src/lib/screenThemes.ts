import { getDisplayThemeValue } from './displayTemplates'
import { unifiedPalette } from './unifiedPalette'

// Screen themes.
//
// - The six curated themes (design "v6") carry a full token set: surfaces, text, lines, status and
//   priority colours and a display typeface. They are the only ones offered in the editor.
// - The twelve earlier themes stay resolvable unchanged (legacy) so a screen saved with one keeps
//   its exact appearance until someone chooses a new theme. They are never remapped silently.

export type ThemeTokens = {
  surface2: string; muted: string; line: string; accentInk: string; accent2: string
  display: 'heebo' | 'suez' | 'rubik' | 'assistant'
  cancel: string; sub: string; room: string; move: string; exam: string; event: string
  info: string; warning: string; urgent: string
  /** Overlay at the bottom of gallery images (caption legibility). */
  galleryShade: string
  dark: boolean
}
type ThemeBase = { id: string; name: string; bg: string; panel: string; header: string; footer: string; text: string; accent: string; border: string; radius: string }
export type ScreenThemeDef = ThemeBase & { design?: 'v6'; legacy?: boolean; tokens?: ThemeTokens }

export const CURATED_THEMES: ScreenThemeDef[] = [
  { id:'midnight-gold', name:'חצות זהב', design:'v6', bg:'#0b1424', panel:'#111e34', header:'#0b1424', footer:'#08101d', text:'#f4efe5', accent:'#d9b26a', border:'#24344f', radius:'20px',
    tokens:{ surface2:'#17284a', muted:'#9aa7bb', line:'#22324d', accentInk:'#1b1407', accent2:'#f0d9a8', display:'heebo', cancel:'#ff8a7a', sub:'#f0c464', room:'#7cc4f2', move:'#b9a3f4', exam:'#6fd4aa', event:'#6fd4aa', info:'#7cc4f2', warning:'#f0c464', urgent:'#ff8a7a', galleryShade:'rgba(8,15,28,.86)', dark:true } },
  { id:'fresh-mint', name:'מנטה רעננה', design:'v6', bg:'#e4f3ed', panel:'#ffffff', header:'#0f5a46', footer:'#ffffff', text:'#0f2e27', accent:'#12a37a', border:'#cfe6dd', radius:'24px',
    tokens:{ surface2:'#eef8f4', muted:'#5b7a71', line:'#dcebe5', accentInk:'#ffffff', accent2:'#0f5a46', display:'suez', cancel:'#d9473f', sub:'#c27c00', room:'#1f78b4', move:'#7a52c7', exam:'#0f8f6a', event:'#0f8f6a', info:'#1f78b4', warning:'#c27c00', urgent:'#d9473f', galleryShade:'rgba(9,48,38,.82)', dark:false } },
  { id:'sunset-coral', name:'שקיעה אלמוגית', design:'v6', bg:'#fdeee4', panel:'#fffaf6', header:'#e65f4a', footer:'#2b1d1a', text:'#2b1d1a', accent:'#e65f4a', border:'#f1d5c6', radius:'28px',
    tokens:{ surface2:'#fdf1e9', muted:'#8b6b60', line:'#f2dfd4', accentInk:'#ffffff', accent2:'#f39a55', display:'rubik', cancel:'#c9372c', sub:'#b8730a', room:'#2f6fa8', move:'#8a4fb3', exam:'#2f8a5f', event:'#2f8a5f', info:'#2f6fa8', warning:'#b8730a', urgent:'#c9372c', galleryShade:'rgba(43,29,26,.80)', dark:false } },
  { id:'royal-purple', name:'סגול מלכותי', design:'v6', bg:'#1b1339', panel:'#251b4f', header:'#150e2e', footer:'#150e2e', text:'#f4f1ff', accent:'#c9b6ff', border:'#3a2e70', radius:'20px',
    tokens:{ surface2:'#2f2462', muted:'#b4a9d9', line:'#382c6b', accentInk:'#1b1339', accent2:'#f2b8d6', display:'suez', cancel:'#ff8fa3', sub:'#ffd27a', room:'#8fd0ff', move:'#d8c6ff', exam:'#8be3bd', event:'#8be3bd', info:'#8fd0ff', warning:'#ffd27a', urgent:'#ff8fa3', galleryShade:'rgba(21,14,46,.86)', dark:true } },
  { id:'ocean-blue', name:'כחול אוקיינוס', design:'v6', bg:'#edf4fb', panel:'#ffffff', header:'#1463d8', footer:'#0d2a4d', text:'#0d2a4d', accent:'#1463d8', border:'#d4e3f4', radius:'16px',
    tokens:{ surface2:'#f2f7fd', muted:'#5a7290', line:'#dfe9f5', accentInk:'#ffffff', accent2:'#0aa5c4', display:'assistant', cancel:'#d63c4a', sub:'#b97800', room:'#1463d8', move:'#6d4fc9', exam:'#13866a', event:'#13866a', info:'#1463d8', warning:'#b97800', urgent:'#d63c4a', galleryShade:'rgba(13,42,77,.82)', dark:false } },
  { id:'solar-yellow', name:'שמש צהובה', design:'v6', bg:'#faf2da', panel:'#fffdf5', header:'#ffc93c', footer:'#22201c', text:'#22201c', accent:'#f5b700', border:'#ecdcae', radius:'12px',
    tokens:{ surface2:'#fdf5dc', muted:'#6f6656', line:'#efe3bd', accentInk:'#22201c', accent2:'#22201c', display:'rubik', cancel:'#c5362b', sub:'#9a6400', room:'#24689e', move:'#7848ad', exam:'#2c7d4f', event:'#2c7d4f', info:'#24689e', warning:'#9a6400', urgent:'#c5362b', galleryShade:'rgba(34,32,28,.80)', dark:false } },
]

// Earlier themes: kept for screens that already use them (not offered for new choices).
const LEGACY_THEMES: ScreenThemeDef[] = [
  { id:'classic', name:'קלאסי כהה', bg:'#0a0f1e', panel:'#172c48', header:'#183452', footer:'#183452', text:'#edf5ff', accent:'#55d7ef', border:'#45617e', radius:'18px' },
  { id:'light', name:'מודרני בהיר', bg:'#edf2f8', panel:'#ffffff', header:'#dce8f7', footer:'#dce8f7', text:'#16263c', accent:'#2563eb', border:'#c5d3e4', radius:'14px' },
  { id:'playful', name:'צבעוני', bg:'#f5efff', panel:'#fffafa', header:'#ded1fa', footer:'#ded1fa', text:'#292144', accent:'#e05a88', border:'#e7c9ef', radius:'24px' },
  { id:'gold', name:'שחור וזהב', bg:'#11151b', panel:'#24262b', header:'#282725', footer:'#282725', text:'#fff3d2', accent:'#d8b65c', border:'#6b5b3e', radius:'8px' },
  { id:'rainbow', name:'קשת צבעונית', bg:'#fff5e7', panel:'#ffffff', header:'#6554d8', footer:'#f06d7b', text:'#29284b', accent:'#ffd45c', border:'#dfd2fa', radius:'22px' },
  { id:'sea', name:'ים וחופש', bg:'#d9f7f1', panel:'#ffffff', header:'#007c91', footer:'#ffcb59', text:'#14475b', accent:'#ff815d', border:'#8dd7d4', radius:'20px' },
  { id:'soft-pastel', name:'פסטל רך', bg:'#fdf0f6', panel:'#ffffff', header:'#c4a1e8', footer:'#a2dad2', text:'#51405d', accent:'#ffb6a6', border:'#e6cde7', radius:'26px' },
  { id:'party-neon', name:'ניאון מסיבה', bg:'#101425', panel:'#222345', header:'#7126d8', footer:'#00c8c8', text:'#ffffff', accent:'#d7ff39', border:'#6e65b7', radius:'16px' },
  { id:'orange-sun', name:'שמש כתומה', bg:'#fff0d5', panel:'#fff9f0', header:'#ff8640', footer:'#f5c84b', text:'#62391f', accent:'#159a92', border:'#eac99d', radius:'18px' },
  { id:'spring', name:'טבע אביבי', bg:'#f3f8df', panel:'#ffffff', header:'#38896a', footer:'#eab3cb', text:'#264b3a', accent:'#e8bc51', border:'#c3d9ae', radius:'22px' },
  { id:'space', name:'חלל עתידני', bg:'#0b1531', panel:'#182951', header:'#263c82', footer:'#39256b', text:'#ffffff', accent:'#48e5f0', border:'#5267a1', radius:'12px' },
  { id:'chalkboard', name:'לוח בית ספר', bg:'#153f34', panel:'#205343', header:'#245e4b', footer:'#b99157', text:'#f8f4e6', accent:'#f4df9c', border:'#608774', radius:'8px' },
].map(t => ({ ...t, legacy: true }))

/** Every resolvable theme (curated first). */
export const SCREEN_THEMES: ScreenThemeDef[] = [...CURATED_THEMES, ...LEGACY_THEMES]
export type ScreenThemeId = string

// Pick readable foreground colors independently for each surface.
export function contrastText(background: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(background)) return '#ffffff'
  const rgb = [1, 3, 5].map(i => {
    const v = parseInt(background.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
  return luminance > 0.179 ? '#142033' : '#ffffff'
}
// Stage background shared by the public screen and the editor preview. Broadcast templates
// replace it with the theme base color in CSS, which applies to both in the same way.
export function screenStageBackground(bgImageUrl:string|null|undefined, base:string):string {
  return bgImageUrl ? `url(${JSON.stringify(bgImageUrl)}) center/cover no-repeat` : base
}
export function resolveScreenTheme(value:string|null|undefined) {
  value = getDisplayThemeValue(value)
  const id=value?.startsWith('theme:')?value.slice(6):'classic'
  const selected=SCREEN_THEMES.find(t=>t.id===id)
  if(selected) return {...selected, headerText:contrastText(selected.header), panelText:selected.design==='v6'?selected.text:contrastText(selected.panel), footerText:contrastText(selected.footer), accentText:contrastText(selected.header)}
  // Old, removed theme IDs safely fall back to the first legacy theme.
  const color=/^#[0-9a-fA-F]{6}$/.test(value??'')?value!:'#0a0f1e'
  const base=LEGACY_THEMES[0]
  return {...base,bg:color,header:color,panel:color,footer:color,headerText:contrastText(color),panelText:contrastText(color),footerText:contrastText(color),accentText:contrastText(color)}
}
export type ResolvedTheme = ReturnType<typeof resolveScreenTheme>

/**
 * The footer's background and text colour as the screen paints them: one pair for every theme and
 * surface, shared by the public screen and the editor preview. Every footer text element inherits
 * the ink, so it is always the contrast colour of the background actually painted. Curated themes
 * keep their own footer colour; legacy themes on the unified surface paint the footer with the base.
 */
export function footerColors(t: ResolvedTheme, unified: boolean): { bg: string; ink: string } {
  if (t.design !== 'v6' && unified) return { bg: t.bg, ink: unifiedPalette(t.bg).ink }
  return { bg: t.footer, ink: contrastText(t.footer) }
}

const DISPLAY_FONTS: Record<ThemeTokens['display'], string> = {
  heebo: 'var(--font-heebo), Heebo, Arial, sans-serif',
  suez: 'var(--font-suez), "Suez One", Georgia, serif',
  rubik: 'var(--font-rubik), Rubik, Arial, sans-serif',
  assistant: 'var(--font-assistant), Assistant, Arial, sans-serif',
}

/**
 * CSS custom properties of a curated theme for the public screen and the editor preview (the
 * existing --tv-* variables are set elsewhere; these add the v6 tokens). Empty for legacy themes.
 */
/** A colour at 16% opacity (tag backgrounds). */
const soft = (hex: string) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},.16)`

export function themeDesignVars(t: ResolvedTheme): Record<string, string> {
  const k = t.tokens
  if (t.design !== 'v6' || !k) return {}
  return {
    '--v6-bg': t.bg, '--v6-surface': t.panel, '--v6-surface2': k.surface2, '--v6-ink': t.text, '--v6-muted': k.muted,
    '--v6-line': k.line, '--v6-accent': t.accent, '--v6-accent-ink': k.accentInk, '--v6-accent2': k.accent2,
    '--v6-header': t.header, '--v6-header-ink': t.headerText, '--v6-footer': t.footer, '--v6-footer-ink': t.footerText,
    '--v6-radius': t.radius, '--v6-display': DISPLAY_FONTS[k.display], '--v6-display-weight': k.display === 'suez' ? '400' : '800', '--v6-gallery-shade': k.galleryShade,
    '--tv-st-cancel': k.cancel, '--tv-st-sub': k.sub, '--tv-st-room': k.room, '--tv-st-move': k.move, '--tv-st-exam': k.exam, '--tv-st-event': k.event,
    '--tv-pri-info': k.info, '--tv-pri-warning': k.warning, '--tv-pri-urgent': k.urgent,
    '--tv-pri-urgent-bg': k.dark ? '#b8323a' : k.urgent, '--tv-pri-warning-bg': k.dark ? '#a3620a' : k.warning,
    '--tv-st-cancel-soft': soft(k.cancel), '--tv-st-sub-soft': soft(k.sub), '--tv-st-room-soft': soft(k.room), '--tv-st-exam-soft': soft(k.exam), '--tv-pri-info-soft': soft(k.info),
    '--tv-unified-card': k.surface2, '--tv-unified-stroke': k.line, '--tv-accent': t.accent,
  }
}
