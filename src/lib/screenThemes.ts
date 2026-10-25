import { getDisplayThemeValue } from './displayTemplates'
// Each theme owns its full screen palette, including an independent footer color.
export const SCREEN_THEMES = [
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
] as const
export type ScreenThemeId = typeof SCREEN_THEMES[number]['id']
// Pick readable foreground colors independently for each surface.
function contrastText(background: string): string {
  const rgb = [1, 3, 5].map(i => {
    const v = parseInt(background.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
  return luminance > 0.179 ? '#142033' : '#ffffff'
}
export function resolveScreenTheme(value:string|null|undefined) {
  value = getDisplayThemeValue(value)
  const id=value?.startsWith('theme:')?value.slice(6):'classic'
  const selected=SCREEN_THEMES.find(t=>t.id===id)
  if(selected) return {...selected, headerText:contrastText(selected.header), panelText:contrastText(selected.panel), footerText:contrastText(selected.footer), accentText:contrastText(selected.header)}
  // Old, removed theme IDs safely fall back to the first retained theme.
  const color=/^#[0-9a-fA-F]{6}$/.test(value??'')?value!:'#0a0f1e'
  return {...SCREEN_THEMES[0],bg:color,header:color,panel:color,footer:color,headerText:contrastText(color),panelText:contrastText(color),footerText:contrastText(color),accentText:contrastText(color)}
}
