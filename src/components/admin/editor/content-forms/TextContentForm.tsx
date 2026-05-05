'use client'
// src/components/admin/editor/content-forms/TextContentForm.tsx

import type { ContentItem } from '@/types'

interface Props {
  item:     Partial<ContentItem>
  onChange: (patch: Partial<ContentItem>) => void
}

const FONT_SIZES = [16, 20, 24, 32, 40, 48, 64]

export default function TextContentForm({ item, onChange }: Props) {
  return (
    <div className="space-y-3">
      {/* Text content */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">טקסט</label>
        <textarea
          rows={5}
          value={item.textContent ?? ''}
          onChange={e => onChange({ textContent: e.target.value })}
          placeholder="הכנס את הטקסט שיוצג על המסך..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50 leading-relaxed"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          ניתן להשתמש ב-HTML בסיסי: &lt;b&gt;, &lt;br&gt;, &lt;span&gt;
        </p>
      </div>

      {/* Font size */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">גודל גופן</label>
        <div className="flex flex-wrap gap-1">
          {FONT_SIZES.map(size => (
            <button
              key={size}
              type="button"
              onClick={() => onChange({ fontSize: size })}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                (item.fontSize ?? 24) === size
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">צבע טקסט</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={item.textColor ?? '#ffffff'}
              onChange={e => onChange({ textColor: e.target.value })}
              className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5 bg-white"
            />
            <span className="text-xs text-gray-500 font-mono">
              {item.textColor ?? '#ffffff'}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">צבע רקע</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={item.bgColor ?? '#000000'}
              onChange={e => onChange({ bgColor: e.target.value })}
              className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5 bg-white"
            />
            <span className="text-xs text-gray-500 font-mono">
              {item.bgColor ?? '#000000'}
            </span>
          </div>
        </div>
      </div>

      {/* Live preview */}
      {item.textContent && (
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">תצוגה מקדימה</label>
          <div
            className="rounded-lg p-4 text-center min-h-16 flex items-center justify-center border border-gray-100"
            style={{
              background: item.bgColor ?? '#000000',
              color:      item.textColor ?? '#ffffff',
              fontSize:   item.fontSize ?? 24,
              fontWeight: 500,
              lineHeight: 1.4,
            }}
            dangerouslySetInnerHTML={{ __html: item.textContent }}
          />
        </div>
      )}
    </div>
  )
}
