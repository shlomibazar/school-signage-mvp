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
export type DisplayTemplate = 'classic' | 'information' | 'visual' | 'split'
export const DISPLAY_TEMPLATES: {id:DisplayTemplate;name:string;description:string}[] = [
  {id:'classic',name:'קלאסית',description:'1–3 אזורים ברוחב שווה, אזור 1 מימין'},
  {id:'information',name:'חלוקה לשניים · 30/70',description:'אזור 1 רחב מימין, אזור 2 צר משמאל'},
  {id:'visual',name:'מרכז רחב · 20/60/20',description:'אזור 2 רחב במרכז, אזור 1 מימין ואזור 3 משמאל'},
  {id:'split',name:'פיצול 30/70',description:'אזור 1 רחב מימין, אזורים 2 ו־3 זה מעל זה משמאל'},
]
/** Regions each template shows (classic: 1–3, chosen in the editor). */
export const TEMPLATE_SECTION_COUNT: Record<Exclude<DisplayTemplate,'classic'>, 2|3> = { information:2, visual:3, split:3 }
export function getDisplayTemplate(value:string|null|undefined):DisplayTemplate {
  const match = /^layout:(information|visual|split)\|/.exec(value || '')
  return (match?.[1] as DisplayTemplate) || 'classic'
}
export function getDisplayThemeValue(value:string|null|undefined):string|null {
  return (value || '').replace(/^layout:(information|visual|split)\|/, '').replace(/^surface:unified\|/, '') || null
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
// Sections sit side by side on landscape screens and stack top-to-bottom on portrait screens.
// Template weights (70/30, 20/60/20, equal) apply along this axis: widths or heights.
export function isStackedLayout(orientation:string|null|undefined):boolean {
  return orientation === 'PORTRAIT'
}
export function getTemplateWidths(template:DisplayTemplate,count:number):number[] {
  if(template === 'classic') return distributeWidths(count)
  if(template === 'information') return count===2 ? [70,30] : distributeWidths(count)
  if(template === 'split') return count===3 ? [70,30,30] : distributeWidths(count)
  return count===3 ? [20,60,20] : distributeWidths(count)
}

/**
 * Two-dimensional placement for templates that are not a single row (split 70/30): the grid of the
 * region container and the cell of each region. Null = the regular flex row/column.
 * Split: R1 on the start side (right in RTL) for the full height; R2 above R3 in the 30% column.
 * Portrait: R1 on top (70% of the height), R2 and R3 side by side below it.
 */
export function regionGrid(template:DisplayTemplate,count:number,stacked:boolean):{container:Record<string,string>;cell:(i:number)=>Record<string,string>}|null {
  if(template !== 'split' || count !== 3) return null
  return stacked
    ? { container:{ display:'grid', gridTemplateColumns:'1fr 1fr', gridTemplateRows:'70fr 30fr' }, cell:(i):Record<string,string> => i === 0 ? { gridColumn:'1 / span 2', minHeight:'0', minWidth:'0' } : { minHeight:'0', minWidth:'0' } }
    : { container:{ display:'grid', gridTemplateColumns:'70fr 30fr', gridTemplateRows:'1fr 1fr' }, cell:(i):Record<string,string> => i === 0 ? { gridRow:'1 / span 2', minHeight:'0', minWidth:'0' } : { minHeight:'0', minWidth:'0' } }
}

/**
 * Where each region physically sits on the screen, for the editor's layout diagrams: rectangles in a
 * left-to-right coordinate system (x from the physical left edge), in % of the content area. It
 * mirrors the renderer: the page is RTL, so a row of regions starts at the physical RIGHT (region 1
 * on the right); stacked (portrait) screens go top to bottom; split uses its grid (region 1 spans
 * both rows of the right column, or the full top row on portrait).
 */
export function regionRects(template:DisplayTemplate,count:number,stacked:boolean):{n:number;x:number;y:number;w:number;h:number}[] {
  if(template === 'split' && count === 3) return stacked
    ? [{n:1,x:0,y:0,w:100,h:70},{n:2,x:50,y:70,w:50,h:30},{n:3,x:0,y:70,w:50,h:30}]
    : [{n:1,x:30,y:0,w:70,h:100},{n:2,x:0,y:0,w:30,h:50},{n:3,x:0,y:50,w:30,h:50}]
  const sizes = getTemplateWidths(template,count)
  const total = sizes.reduce((a,b)=>a+b,0) || 1
  let used = 0
  return sizes.map((size,i)=>{
    const part = size/total*100, start = used; used += part
    return stacked ? {n:i+1,x:0,y:start,w:100,h:part} : {n:i+1,x:100-start-part,y:0,w:part,h:100}
  })
}
