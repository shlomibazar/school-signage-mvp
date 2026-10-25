import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
export async function GET(req:NextRequest) {
  try {
    await requireRole('EDITOR')
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
    if (q.length < 2 || q.length > 60) return NextResponse.json({results:[]})
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
    url.searchParams.set('name',q);url.searchParams.set('count','30');url.searchParams.set('countryCode','IL');url.searchParams.set('language','he');url.searchParams.set('format','json')
    const r = await fetch(url,{next:{revalidate:86400},signal:AbortSignal.timeout(8000)})
    if(!r.ok) throw new Error('Geocoding unavailable')
    const data = await r.json()
    const results = (data.results??[]).filter((x:any)=>x.country_code==='IL' && Number.isFinite(x.latitude) && Number.isFinite(x.longitude)).map((x:any)=>({name:String(x.name),admin1:x.admin1??'',latitude:x.latitude,longitude:x.longitude}))
    return NextResponse.json({results})
  } catch {return NextResponse.json({error:'חיפוש יישובים אינו זמין כרגע'}, {status:503})}
}
