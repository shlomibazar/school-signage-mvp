'use client'
// src/components/admin/editor/ScreenLayoutEditor.tsx

import { useState, useCallback } from 'react'
import { Save, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { distributeWidths } from '@/lib/utils'
import type { Screen, ScreenLayout, ScreenSection } from '@/types'
import ScreenPreview from './ScreenPreview'
import HeaderEditor from './HeaderEditor'
import FooterEditor from './FooterEditor'
import SectionEditor from './SectionEditor'
import { Switch } from '@/components/ui/Switch'

interface Props {
  screen:   Screen
  layout:   ScreenLayout
  sections: ScreenSection[]
}

type EditorTab = 'header' | 'main' | 'footer'

export default function ScreenLayoutEditor({
  screen,
  layout:   initialLayout,
  sections: initialSections,
}: Props) {
  const [layout,   setLayout]   = useState<ScreenLayout>(initialLayout)
  const [sections, setSections] = useState<ScreenSection[]>(initialSections)
  const [isDirty,  setIsDirty]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [activeTab, setActiveTab] = useState<EditorTab>('header')

  const updateLayout = useCallback((patch: Partial<ScreenLayout>) => {
    setLayout(prev => ({ ...prev, ...patch }))
    setIsDirty(true)
  }, [])

  const handleSectionCountChange = useCallback((count: 1 | 2 | 3) => {
    const widths = distributeWidths(count)
    updateLayout({ mainSections: count })
    setSections(prev => {
      if (count === prev.length) return prev
      // Grow: append new empty sections
      if (count > prev.length) {
        const extras: ScreenSection[] = Array.from(
          { length: count - prev.length },
          (_, i): ScreenSection => ({
            id:           `new-pos-${prev.length + i}`,
            screenId:     screen.id,
            position:     prev.length + i,
            widthPct:     widths[prev.length + i],
            contentItems: [],
          }),
        )
        return [...prev, ...extras].map((s, i) => ({ ...s, widthPct: widths[i] }))
      }
      // Shrink: keep first `count` sections, recalculate widths
      return prev.slice(0, count).map((s, i) => ({ ...s, widthPct: widths[i] }))
    })
    setIsDirty(true)
  }, [updateLayout, screen.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/screens/${screen.id}/layout`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          layout,
          sections: sections.map(s => ({ position: s.position, widthPct: s.widthPct })),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'שגיאה בשמירה')
      }
      toast.success('השינויים נשמרו')
      setIsDirty(false)
    } catch (err: any) {
      toast.error(err.message ?? 'שגיאה בשמירת הפריסה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-base font-semibold text-gray-900">{screen.name}</h1>
          <p className="text-xs text-gray-400">
            {screen.orientation === 'LANDSCAPE' ? 'אופקי' : 'אנכי'} ·{' '}
            <span className="text-blue-500">/screen/{screen.slug}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              שינויים לא שמורים
            </span>
          )}
          <a
            href={`/screen/${screen.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            תצוגה ציבורית
          </a>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Controls panel */}
        <div className="w-60 shrink-0 flex flex-col gap-3 overflow-y-auto">
          {/* Tab bar */}
          <div className="flex bg-gray-100 rounded-lg p-1 text-xs">
            {(['header', 'main', 'footer'] as EditorTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 rounded-md transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-gray-900 font-medium shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'header' ? 'כותרת' : tab === 'main' ? 'ראשי' : 'תחתית'}
              </button>
            ))}
          </div>

          {/* Header tab */}
          {activeTab === 'header' && (
            <div className="space-y-3">
              {/* Header on/off toggle */}
              <div className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">כותרת עליונה</span>
                <Switch
                  checked={layout.headerEnabled}
                  onCheckedChange={v => updateLayout({ headerEnabled: v })}
                />
              </div>
              <HeaderEditor layout={layout} onChange={updateLayout} />
            </div>
          )}

          {/* Main tab */}
          {activeTab === 'main' && (
            <div className="space-y-3">
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100">
                  מספר אזורי תוכן
                </div>
                <div className="p-3">
                  <div className="flex gap-2">
                    {([1, 2, 3] as const).map(n => (
                      <button
                        key={n}
                        onClick={() => handleSectionCountChange(n)}
                        className={`flex-1 h-12 border rounded-lg flex items-center justify-center gap-1 transition-colors ${
                          layout.mainSections === n
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {Array.from({ length: n }).map((_, i) => (
                          <span
                            key={i}
                            className={`block rounded-sm h-6 ${layout.mainSections === n ? 'bg-blue-400' : 'bg-gray-300'}`}
                            style={{ width: n === 1 ? 28 : n === 2 ? 12 : 8 }}
                          />
                        ))}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {sections.map((section, i) => (
                <SectionEditor
                  key={section.id}
                  section={section}
                  index={i}
                  onUpdate={updated => {
                    setSections(prev => prev.map(s => s.id === updated.id ? updated : s))
                    setIsDirty(true)
                  }}
                />
              ))}
            </div>
          )}

          {/* Footer tab */}
          {activeTab === 'footer' && (
            <div className="space-y-3">
              <div className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">כותרת תחתונה</span>
                <Switch
                  checked={layout.footerEnabled}
                  onCheckedChange={v => updateLayout({ footerEnabled: v })}
                />
              </div>
              <FooterEditor layout={layout} onChange={updateLayout} />
            </div>
          )}
        </div>

        {/* Preview panel */}
        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-xs text-gray-400 mb-2">תצוגה מקדימה (לא בקנה מידה אמיתי)</p>
          <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-xl p-4">
            <ScreenPreview layout={layout} sections={sections} screen={screen} />
          </div>
        </div>
      </div>
    </div>
  )
}
