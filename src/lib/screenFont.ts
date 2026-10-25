export const SCREEN_FONTS = ['Heebo','Assistant','Rubik','Arial'] as const
export function screenFont(name?:string|null):string {
  const font=SCREEN_FONTS.find(f=>f===name) || 'Heebo'
  return font==='Arial' ? 'Arial, sans-serif' : font==='Assistant' ? 'var(--font-assistant), Assistant, Arial, sans-serif' : font==='Rubik' ? 'var(--font-rubik), Rubik, Arial, sans-serif' : 'var(--font-heebo), Heebo, Arial, sans-serif'
}
