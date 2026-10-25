'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setError('')
    setSuccess('')
    if (newPassword !== confirmPassword) {
      setError('אימות הסיסמה אינו תואם')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'עדכון הסיסמה נכשל')
        return
      }
      setSuccess('הסיסמה עודכנה בהצלחה')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setError('לא ניתן להתחבר לשרת')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-lg py-4">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">שינוי סיסמה</h1>
        <p className="mb-6 mt-2 text-sm text-gray-500">עדכון סיסמת הכניסה לחשבון שלך ב־SchoolScreen</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="current-password" className="mb-1 block text-sm font-medium">סיסמה נוכחית</label>
            <input id="current-password" type="password" autoComplete="current-password" required
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3" />
          </div>
          <div>
            <label htmlFor="new-password" className="mb-1 block text-sm font-medium">סיסמה חדשה</label>
            <input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
              value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3" />
            <p className="mt-1 text-xs text-gray-500">8–128 תווים</p>
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium">אימות סיסמה חדשה</label>
            <input id="confirm-password" type="password" autoComplete="new-password" required
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 p-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'מעדכן...' : 'עדכן סיסמה'}
          </button>
          <Link href="/admin/dashboard" className="block rounded-lg border border-gray-300 p-3 text-center text-gray-700 hover:bg-gray-50">
            חזרה ללוח הבקרה
          </Link>
        </form>
      </section>
    </div>
  )
}
