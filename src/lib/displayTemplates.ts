import { distributeWidths } from './utils'

// Template selection is encoded in the existing bgColor field for backward compatibility.
// No database migration is required; legacy colors and themes remain unchanged.
export type DisplaySurface = 'separated' | 'unified'
export function getDisplaySurface(value:string|null|undefined):DisplaySurface {
  return /(?:^|\|)surface:unified\|/.test(value || '') ? 'unified' : 'separated'
}
export function withDisplaySurface(value:string|null|undefined,surface:DisplaySurface):string|null {
  const clean=(value || '').replace(/surface:unified\|/g,'')
  const template=getDisplayTemplate(clean)
  const theme=getDisplayThemeValue(clean)
  if(template==='classic') return `${surface==='unified'?'surface:unified|':''}${theme || 'theme:classic'}`
  return `layout:${template}|${surface==='unified'?'surface:unified|':''}${theme || 'theme:classic'}`
}
export type DisplayTemplate = 'classic' | 'information' | 'visual'
export const DISPLAY_TEMPLATES: {id:DisplayTemplate;name:string;description:string}[] = [
  {id:'classic',name:'קלאסית',description:'הפריסה המקורית — ללא שינוי'},
  {id:'information',name:'חלוקה לשניים · 70/30',description:'שני אזורי תוכן — רחב וצר'},
  {id:'visual',name:'מרכז רחב · 20/60/20',description:'שלושה אזורים — מרכז גדול ושני צדדים'},
]
export function getDisplayTemplate(value:string|null|undefined):DisplayTemplate {
  const match = /^layout:(information|visual)\|/.exec(value || '')
  return (match?.[1] as DisplayTemplate) || 'classic'
}
export function getDisplayThemeValue(value:string|null|undefined):string|null {
  return (value || '').replace(/^layout:(information|visual)\|/, '').replace(/^surface:unified\|/, '') || null
}
export function withDisplayTemplate(value:string|null|undefined,template:DisplayTemplate):string|null {
  const theme = getDisplayThemeValue(value)
  const surface = getDisplaySurface(value)
  return template === 'classic' ? `${surface==='unified'?'surface:unified|':''}${theme || 'theme:classic'}` : `layout:${template}|${surface==='unified'?'surface:unified|':''}${theme || 'theme:classic'}`
}
export function withDisplayTheme(value:string|null|undefined,theme:string):string {
  const template = getDisplayTemplate(value)
  const next=withDisplayTemplate(theme,template) || theme
  return withDisplaySurface(next,getDisplaySurface(value)) || next
}
export function getTemplateWidths(template:DisplayTemplate,count:number):number[] {
  if(template === 'classic') return distributeWidths(count)
  if(template === 'information') return count===2 ? [70,30] : distributeWidths(count)
  return count===3 ? [20,60,20] : distributeWidths(count)
}
