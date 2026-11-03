'use client'
import { useEffect, useState } from 'react'

type Weather = { temperature: number; code: number; city: string }
function symbol(code: number) {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 67 || code >= 80 && code <= 82) return '🌧️'
  if (code <= 77 || code >= 85 && code <= 86) return '❄️'
  if (code >= 95) return '⛈️'
  return '🌤️'
}
// A failed refresh keeps the last reading for up to 3 hours; older data is hidden, not shown as current.
const KEEP_LAST_MS = 3 * 60 * 60 * 1000

export default function HeaderWeather({ compact = false, city }: { compact?: boolean; city?: string | null }) {
  const [weather, setWeather] = useState<Weather | null>(null)
  useEffect(() => {
    let active = true
    let loadedAt = 0
    setWeather(null)
    const refresh = async () => {
      try {
        const response = await fetch(`/api/header-weather${city?.trim() ? `?city=${encodeURIComponent(city.trim())}` : ''}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('weather unavailable')
        const result = await response.json() as Weather
        if (active) { loadedAt = Date.now(); setWeather(result) }
      } catch { if (active && Date.now() - loadedAt > KEEP_LAST_MS) setWeather(null) }
    }
    void refresh()
    const interval = window.setInterval(refresh, 15 * 60 * 1000)
    return () => { active = false; window.clearInterval(interval) }
  }, [city])
  if (!weather) return null
  return <div className="tv-header-weather" dir="rtl" title={weather.city} aria-label={`מזג אוויר ב${weather.city}: ${Math.round(weather.temperature)} מעלות`}>
    <span aria-hidden="true">{symbol(weather.code)}</span>
    <strong>{Math.round(weather.temperature)}°</strong>
    {!compact && <small>{weather.city}</small>}
  </div>
}
