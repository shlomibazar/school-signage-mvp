import { NextRequest, NextResponse } from 'next/server'
import { ISRAEL_WEATHER_CITIES } from '@/lib/israelWeatherCities'

export const revalidate = 900
const coordinates = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)\|(.{2,80})$/u

export async function GET(req: NextRequest) {
  try {
    const city = (req.nextUrl.searchParams.get('city')?.trim() || process.env.WEATHER_CITY || 'Tel Aviv').trim()
    if (city.length > 120) return NextResponse.json({error:'Invalid city'}, {status:400})
    let latitude: number, longitude: number, name: string
    const match = city.match(coordinates)
    if (match) {
      latitude = Number(match[1]); longitude = Number(match[2]); name = match[3]
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 29 || latitude > 34 || longitude < 34 || longitude > 36)
        return NextResponse.json({error:'Location outside Israel'}, {status:400})
    } else {
      const normalized = city.toLocaleLowerCase().replace(/[־'״׳-]/g,'').replace(/\s+/g,'')
      const known = ISRAEL_WEATHER_CITIES.find(c =>
        [c.name,c.english].some(n=>n.toLocaleLowerCase().replace(/[־'״׳-]/g,'').replace(/\s+/g,'')===normalized))
      if (known) {
        latitude=known.latitude; longitude=known.longitude; name=known.name
      } else {
        if (!/^[\p{L}\p{M} .,'’\-]{2,80}$/u.test(city)) return NextResponse.json({error:'Invalid city'}, {status:400})
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&countryCode=IL&language=en&format=json`, {next:{revalidate:86400},signal:AbortSignal.timeout(8000)})
        if (!geo.ok) throw new Error('Geocoding unavailable')
        const found=(await geo.json()).results?.find((r:any)=>r.country_code==='IL')
        if (!found) return NextResponse.json({error:'City not found'}, {status:404})
        latitude=found.latitude;longitude=found.longitude;name=city
      }
    }
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude',String(latitude))
    url.searchParams.set('longitude',String(longitude))
    url.searchParams.set('current','temperature_2m,weather_code')
    url.searchParams.set('timezone','Asia/Jerusalem')
    const response=await fetch(url,{next:{revalidate:900},signal:AbortSignal.timeout(8000)})
    if (!response.ok) throw new Error('Forecast unavailable')
    const current=(await response.json()).current
    if(typeof current?.temperature_2m!=='number')throw new Error('Missing temperature')
    return NextResponse.json({city:name,temperature:current.temperature_2m,code:current.weather_code})
  } catch {
    return NextResponse.json({error:'Weather unavailable'},{status:503})
  }
}
