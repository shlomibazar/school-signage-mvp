'use client'

import { useState, type ReactNode } from 'react'

export default function SettingsAccordion({ sections }: { sections: { id: string; title: string; description: string; content: ReactNode }[] }) {
  const [open, setOpen] = useState('hours')
  return <div className="space-y-3" dir="rtl">{sections.map(s => <section key={s.id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
    <button type="button" aria-expanded={open === s.id} aria-controls={`settings-${s.id}`} onClick={() => setOpen(open === s.id ? '' : s.id)} className="flex w-full items-center justify-between gap-4 p-5 text-right hover:bg-gray-50">
      <span><span className="block font-semibold text-gray-900">{s.title}</span><span className="block text-sm text-gray-500 mt-1">{s.description}</span></span>
      <span aria-hidden="true" className="text-gray-500 text-xl">{open === s.id ? '−' : '+'}</span>
    </button>
    {open === s.id && <div id={`settings-${s.id}`} className="border-t border-gray-100 p-5">{s.content}</div>}
  </section>)}</div>
}
