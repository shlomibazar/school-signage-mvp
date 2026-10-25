'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react'
import type { Message } from '@/types'

const ICONS = ['📢','⚠️','🚨','✅','❌','🎉','📌','🔔','💡','ℹ️','🏫','📅']
const PRIORITIES = [
  { value: 'info',    label: 'רגיל',  bg: 'bg-blue-100',  text: 'text-blue-700'  },
  { value: 'warning', label: 'אזהרה', bg: 'bg-amber-100', text: 'text-amber-700' },
  { value: 'urgent',  label: 'דחוף',  bg: 'bg-red-100',   text: 'text-red-700'   },
] as const

function bgForPriority(p: string) {
  return p === 'urgent' ? '#b91c1c' : p === 'warning' ? '#b45309' : '#1e3a5f'
}

const EMPTY = { title: '', body: '', priority: 'info' as 'info' | 'warning' | 'urgent', icon: '📢', bgColor: '#1e3a5f', textColor: '#ffffff', active: true }
export default function MessagesPage() {
  const [messages,  setMessages]  = useState<Message[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [editId,    setEditId]    = useState<string | 'new' | null>(null)
  const [form,      setForm]      = useState(EMPTY)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/messages')
      const d = await r.json()
      setMessages(d.data ?? [])
    } finally { setLoading(false) }
  }

  function startNew() {
    setForm(EMPTY)
    setEditId('new')
  }

  function startEdit(msg: Message) {
    setForm({ title: msg.title, body: msg.body, priority: msg.priority as any, icon: msg.icon, bgColor: msg.bgColor, textColor: msg.textColor, active: msg.active })
    setEditId(msg.id)
  }

  function cancelEdit() { setEditId(null) }

  async function handleSave() {
    setSaving(true)
    try {
      if (editId === 'new') {
        const r = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, bgColor: bgForPriority(form.priority) }) })
        const d = await r.json()
        if (r.ok) setMessages(prev => [d.data, ...prev])
      } else {
        const r = await fetch(`/api/messages/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, bgColor: bgForPriority(form.priority) }) })
        const d = await r.json()
        if (r.ok) setMessages(prev => prev.map(m => m.id === editId ? d.data : m))
      }
      setEditId(null)
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק הודעה זו?')) return
    await fetch(`/api/messages/${id}`, { method: 'DELETE' })
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">הודעות ותוכן</h1>
          <p className="text-sm text-gray-500 mt-0.5">{messages.length} הודעות</p>
        </div>
        <button onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" />הודעה חדשה
        </button>
      </div>

      {/* New / Edit form */}
      {editId && (
        <div className="bg-white border border-blue-100 rounded-2xl p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">{editId === 'new' ? 'הודעה חדשה' : 'עריכת הודעה'}</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">כותרת</label>
              <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="כותרת ההודעה" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">תוכן</label>
              <textarea rows={3} value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                placeholder="טקסט ההודעה..." className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">עדיפות</label>
                <div className="flex gap-1.5">
                  {PRIORITIES.map(p => (
                    <button key={p.value} type="button" onClick={() => setForm(prev => ({ ...prev, priority: p.value }))}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${form.priority === p.value ? `${p.bg} ${p.text} border-transparent` : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">אייקון</label>
                <div className="flex flex-wrap gap-1">
                  {ICONS.map(icon => (
                    <button key={icon} type="button" onClick={() => setForm(p => ({ ...p, icon }))}
                      className={`w-8 h-8 text-sm rounded-lg border transition-colors ${form.icon === icon ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-200'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: bgForPriority(form.priority) }}>
              <span style={{ fontSize: 28 }}>{form.icon}</span>
              <div>
                <div className="text-white font-semibold text-sm">{form.title || 'כותרת'}</div>
                <div className="text-white/75 text-xs mt-0.5">{form.body || 'תוכן ההודעה'}</div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={cancelEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <X className="w-3.5 h-3.5" />ביטול
            </button>
            <button onClick={handleSave} disabled={saving || !form.title || !form.body}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              שמור
            </button>
          </div>
        </div>
      )}

      {/* Messages list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : messages.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📢</div>
          <p>אין הודעות עדיין</p>
          <p className="text-sm mt-1">לחץ על &quot;הודעה חדשה&quot; להוספה</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4 hover:border-gray-200 transition-colors group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
                style={{ background: bgForPriority(msg.priority) }}>
                {msg.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900 truncate">{msg.title}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PRIORITIES.find(p => p.value === msg.priority)?.bg} ${PRIORITIES.find(p => p.value === msg.priority)?.text}`}>
                    {PRIORITIES.find(p => p.value === msg.priority)?.label}
                  </span>
                  {!msg.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">לא פעיל</span>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{msg.body}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(msg)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(msg.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
