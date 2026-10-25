import { NextResponse } from 'next/server'

export const revalidate = 21600

export async function GET() {
  try {
    // Jerusalem fixes the calendar to Israel (diaspora readings may differ).
    const response = await fetch('https://www.hebcal.com/shabbat?cfg=json&geonameid=281184&lg=he', {
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('Hebcal request failed')
    const data = await response.json()
    const item = Array.isArray(data.items) ? data.items.find((entry: {category?:string})=>entry.category === 'parashat') : null
    const raw = typeof item?.hebrew === 'string' ? item.hebrew : typeof item?.title === 'string' ? item.title : null
    const title = raw ? (raw.startsWith('פרשת ') ? raw : `פרשת ${raw.replace(/^Parashat\\s+/i,'')}`) : null
    return NextResponse.json({title}, {headers:{'Cache-Control':'public, max-age=900, stale-while-revalidate=21600'}})
  } catch {
    return NextResponse.json({title:null}, {status:503})
  }
}
