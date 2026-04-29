'use client'
// src/app/admin/screens/new/NewScreenForm.tsx

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function NewScreenForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [orientation, setOrientation] = useState<'LANDSCAPE' | 'PORTRAIT'>('LANDSCAPE')

  function autoSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/screens', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, slug, orientation }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'שגיאה ביצירת המסך')
        return
      }
      toast.success('המסך נוצר בהצלחה!')
      router.push(`/admin/editor?screen=${data.data.id}`)
    } catch {
      toast.error('שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-2xl p-6 space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">שם המסך</label>
        <input
          required
          value={name}
          onChange={e => {
            setName(e.target.value)
            if (!slug) setSlug(autoSlug(e.target.value))
          }}
          placeholder="לדוגמה: לובי ראשי"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          כתובת URL ציבורית
          <span className="text-gray-400 font-normal ms-1">(מותרים: a-z, 0-9, מקף)</span>
        </label>
        <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
          <span className="px-3 py-2.5 bg-gray-50 text-gray-400 text-sm border-e border-gray-200 shrink-0">/screen/</span>
          <input
            required
            dir="ltr"
            value={slug}
            onChange={e => setSlug(autoSlug(e.target.value))}
            placeholder="main-lobby"
            className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">כיוון מסך</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'LANDSCAPE' as const, label: 'אופקי', sub: '16:9', icon: '🖥' },
            { value: 'PORTRAIT'  as const, label: 'אנכי',  sub: '9:16', icon: '📱' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOrientation(opt.value)}
              className={`flex flex-col items-center gap-1 py-4 border rounded-xl transition-colors ${
                orientation === opt.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className="text-2xl">{opt.icon}</span>
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-xs opacity-60">{opt.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !name || !slug}
        className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'יוצר...' : 'צור מסך ועבור לעורך'}
      </button>
    </form>
  )
}
