const allowed = /^(?:b|strong|i|em|u|s|strike|div|p|br|ul|ol|li|span)$/
const esc=(s:string)=>s.replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/gi,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
/** Restrict saved announcement HTML to a small formatting allowlist. */
export function cleanAnnouncementHtml(input:string):string {
  if(!/<\/?(?:div|p|span|b|strong|i|em|u|s|strike|ul|ol|li|br)\b/i.test(input)) return esc(input).replace(/\n/g,'<br>')
  const tokens=input.match(/<[^>]*>|[^<]+/g)||[]
  return tokens.map(token=>{
    if(!token.startsWith('<')) return esc(token)
    const match=/^<\s*(\/?)\s*([a-z][a-z0-9]*)\b([^>]*)>$/i.exec(token)
    if(!match)return ''
    const tag=match[2].toLowerCase()
    if(!allowed.test(tag))return ''
    if(match[1])return tag==='br'?'':`</${tag}>`
    if(tag==='br')return '<br>'
    const attrs=match[3]
    const size=/font-size\s*:\s*(\d{1,2})px/i.exec(attrs)
    const align=/text-align\s*:\s*(right|left|center|justify)/i.exec(attrs)
    const css=[size?`font-size:${Math.max(12,Math.min(48,Number(size[1])))}px`:null,align?`text-align:${align[1].toLowerCase()}`:null].filter(Boolean).join(';')
    return `<${tag}${css?` style="${css}"`:''}>`
  }).join('')
}
