'use client'
import { useEffect, useState } from 'react'
import { normalizeBirthdayConfig, type BirthdayDisplayConfig, type PublicBirthdayList } from '@/lib/birthdayDisplay'

// Editor only: what the public screen would show for a birthday configuration, from
// /api/screens/[id]/birthdays (the same public projection the TV receives), plus the school's grades.
// Requests are debounced and cached for a minute per configuration, so the form, the region preview
// and the footer preview share them.

type Result = { list: PublicBirthdayList; grades: string[] }
const cache = new Map<string, { at: number; promise: Promise<Result> }>()
const TTL_MS = 60_000

export function birthdayPreviewKey(screenId: string, config: BirthdayDisplayConfig): string {
  const c = normalizeBirthdayConfig(config)
  return `${screenId}|${c.audience}|${c.period}|${c.nameFormat}|${[...c.grades].sort().join(',')}`
}

export function fetchBirthdayPreview(screenId: string, config: BirthdayDisplayConfig): Promise<Result> {
  const key = birthdayPreviewKey(screenId, config)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise
  const c = normalizeBirthdayConfig(config)
  const qs = new URLSearchParams({ audience: c.audience, period: c.period, nameFormat: c.nameFormat, grades: c.grades.join(',') })
  const promise = fetch(`/api/screens/${encodeURIComponent(screenId)}/birthdays?${qs}`, { cache: 'no-store' }).then(async r => {
    if (!r.ok) throw new Error(r.status === 401 ? 'נדרשת התחברות מחדש' : r.status === 403 ? 'אין הרשאה' : 'טעינת ימי ההולדת נכשלה')
    return (await r.json()).data as Result
  })
  cache.set(key, { at: Date.now(), promise })
  promise.catch(() => cache.delete(key))
  return promise
}

/** Forget cached previews (e.g. after the registry may have changed). */
export function clearBirthdayPreviewCache() { cache.clear() }

export function useBirthdayPreview(screenId: string | null | undefined, config: BirthdayDisplayConfig | null, delayMs = 300) {
  const key = screenId && config ? birthdayPreviewKey(screenId, config) : ''
  const [state, setState] = useState<{ key: string; list: PublicBirthdayList | null; grades: string[] | null; error: string | null }>({ key: '', list: null, grades: null, error: null })
  useEffect(() => {
    if (!key || !screenId || !config) return
    let alive = true
    const t = window.setTimeout(() => {
      fetchBirthdayPreview(screenId, config)
        .then(r => { if (alive) setState({ key, list: r.list, grades: r.grades, error: null }) })
        .catch(e => { if (alive) setState(s => ({ ...s, key, error: e instanceof Error ? e.message : 'טעינת ימי ההולדת נכשלה' })) })
    }, delayMs)
    return () => { alive = false; window.clearTimeout(t) }
    // The key captures the configuration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs])
  return { list: state.list, grades: state.grades, error: state.error, loading: state.key !== key }
}
