'use client'

import { useState } from 'react'

export default function ShortLinkManager({ screenId, initialCode }: { screenId: string; initialCode: string | null }) {
  const [code, setCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  async function generate() {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/screens/${screenId}/short-link`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'יצירת קישור נכשלה')
      setCode(data.code)
    } catch (e: any) { setError(e.message || 'שגיאה') }
    finally { setBusy(false) }
  }
  async function copy() {
    if (!code) return
    const url = `${window.location.origin}/s/${code}`
    try { await navigator.clipboard.writeText(url); setCopied(true) }
    catch { setError('לא ניתן להעתיק אוטומטית. ניתן להעתיק את הכתובת ידנית.') }
  }
  return (
    <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-2 text-xs" dir="rtl">
      {code ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-gray-700">קישור קצר:</span>
          <a className="font-mono text-blue-700 underline" href={`/s/${code}`} target="_blank" rel="noopener noreferrer" dir="ltr">/s/{code}</a>
          <button type="button" onClick={copy} className="rounded bg-white px-2 py-1 border border-blue-200">{copied ? 'הועתק!' : 'העתק קישור מלא'}</button>
        </div>
      ) : <button type="button" disabled={busy} onClick={generate} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">{busy ? 'מייצר...' : 'צור קישור קצר למסך'}</button>}
      {error && <p className="mt-1 text-red-700">{error}</p>}
    </div>
  )
}
