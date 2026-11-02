'use client'
import { useEffect, useState } from 'react'

export default function ScreenPairingManager({ screenId }: { screenId: string }) {
  const [code, setCode] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!code) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [code])
  const seconds = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : 0
  async function act(method: 'POST' | 'DELETE') {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/screens/${screenId}/pairing`, { method, cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'הפעולה נכשלה')
      if (method === 'POST') { setCode(data.code); setExpiresAt(data.expiresAt); setNow(Date.now()) }
      else { setCode(''); setExpiresAt('') }
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') }
    finally { setBusy(false) }
  }
  return <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm" dir="rtl">
    <div className="font-semibold text-gray-800 mb-2">חיבור טלוויזיה בקוד זמני</div>
    {code && seconds > 0 ? <div className="space-y-2">
      <div className="text-2xl font-bold tracking-widest text-blue-800" dir="ltr">{code.slice(0, 3)} {code.slice(3)}</div>
      <div className="text-xs text-gray-600">בתוקף לעוד {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} דקות · חד־פעמי</div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => navigator.clipboard.writeText(code).catch(() => setError('לא ניתן להעתיק'))} className="px-3 py-1 rounded bg-white border">העתק</button>
        <button type="button" disabled={busy} onClick={() => act('POST')} className="px-3 py-1 rounded bg-white border">קוד חדש</button>
        <button type="button" disabled={busy} onClick={() => act('DELETE')} className="px-3 py-1 rounded bg-white border">בטל קוד</button>
      </div>
    </div> : <button type="button" disabled={busy} onClick={() => act('POST')} className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">{busy ? 'ממתין...' : 'צור קוד חיבור (10 דקות)'}</button>}
    {error && <p role="alert" className="text-red-600 mt-2">{error}</p>}
    <p className="text-xs text-gray-500 mt-2">הקוד מוצג רק בעת יצירתו. לאחר רענון העמוד ניתן ליצור קוד חדש.</p>
  </div>
}
