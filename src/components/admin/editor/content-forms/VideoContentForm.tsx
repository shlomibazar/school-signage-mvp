'use client'
// src/components/admin/editor/content-forms/VideoContentForm.tsx

import { youtubeId } from '@/lib/youtubeVideo'
import { Switch } from '@/components/ui/Switch'
import type { ContentItem, VideoSettings } from '@/types'

interface Props {
  item:       Partial<ContentItem>
  settings:   VideoSettings
  onChange:   (patch: Partial<ContentItem>) => void
  onSettings: (s: VideoSettings) => void
}

export default function VideoContentForm({ item, settings, onChange, onSettings }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">כתובת וידאו (URL)</label>
        <input
          type="url"
          value={item.videoUrl ?? ''}
          onChange={e => onChange({ videoUrl: e.target.value || null })}
          placeholder="https://example.com/video.mp4"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50 font-mono"
          dir="ltr"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          MP4, WebM או קישור YouTube / YouTube Shorts
        </p>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-700">השמעה אוטומטית (Autoplay)</span>
          <Switch
            checked={item.videoLoop ?? true}
            onCheckedChange={v => onChange({ videoLoop: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-700">השתק (Mute)</span>
          <Switch
            checked={item.videoMuted ?? true}
            onCheckedChange={v => onChange({ videoMuted: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-700">הצג פקדי וידאו</span>
          <Switch
            checked={settings.showControls ?? false}
            onCheckedChange={v => onSettings({ ...settings, showControls: v })}
          />
        </div>
      </div>

      {item.videoUrl ? (
        <div className="rounded-xl overflow-hidden bg-black aspect-video">
          {youtubeId(item.videoUrl) ? <iframe title="YouTube preview" src={`https://www.youtube-nocookie.com/embed/${youtubeId(item.videoUrl)}?autoplay=1&mute=1&playsinline=1`} allow="autoplay; encrypted-media" className="w-full h-full border-0" /> : <video
            src={item.videoUrl}
            muted={item.videoMuted ?? true}
            loop={item.videoLoop ?? true}
            controls={settings.showControls ?? false}
            autoPlay
            className="w-full h-full object-contain"
          />}
        </div>
      ) : (
        <div className="rounded-xl bg-gray-900 aspect-video flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-2">🎬</div>
            <p className="text-white/40 text-xs">הכנס כתובת וידאו לתצוגה מקדימה</p>
          </div>
        </div>
      )}
    </div>
  )
}
