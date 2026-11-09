'use client'
import { Info } from 'lucide-react'
import { youtubeId } from '@/lib/youtubeVideo'
import { Switch } from '@/components/ui/Switch'
import type { ContentItem, VideoSettings } from '@/types'

interface Props {
  item:       Partial<ContentItem>
  settings:   VideoSettings
  onChange:   (patch: Partial<ContentItem>) => void
  onSettings: (s: VideoSettings) => void
}

// "וידאו": the screen always starts the video by itself. What can be chosen is whether it repeats
// (videoLoop) and whether it plays with sound (videoMuted). Browsers block automatic playback with
// sound, so sound is a request, not a promise (see the note). The old "show video controls" switch
// was never applied by the TV (an unattended screen has no one to use them) and is not offered.
export default function VideoContentForm({ item, onChange }: Props) {
  const id = item.videoUrl ? youtubeId(item.videoUrl) : null
  const muted = item.videoMuted ?? true
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="video-url" className="mb-1.5 block text-xs font-medium text-ui-ink-2">כתובת הווידאו</label>
        <input id="video-url" type="url" value={item.videoUrl ?? ''} onChange={e => onChange({ videoUrl: e.target.value || null })}
          placeholder="https://www.youtube.com/watch?v=… או https://example.com/video.mp4"
          className="ui-focus h-10 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 font-mono text-sm" dir="ltr" />
        <p className="mt-1 text-[11px] text-ui-muted">קובץ MP4 או WebM, או קישור YouTube / YouTube Shorts.</p>
      </div>

      <div className="divide-y divide-ui-border rounded-ui border border-ui-border px-3">
        <div className="flex items-center justify-between gap-3 py-2">
          <span><span className="block text-[13px] text-ui-ink">הפעלה חוזרת (לולאה)</span><span className="block text-[11px] text-ui-muted">הווידאו מתחיל לבד, וכשהוא נגמר מתחיל מחדש</span></span>
          <Switch checked={item.videoLoop ?? true} onCheckedChange={v => onChange({ videoLoop: v })} aria-label="הפעלה חוזרת" />
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <span><span className="block text-[13px] text-ui-ink">ללא קול (מושתק)</span><span className="block text-[11px] text-ui-muted">מומלץ: כך הווידאו מתחיל לפעול בכל מסך</span></span>
          <Switch checked={muted} onCheckedChange={v => onChange({ videoMuted: v })} aria-label="ללא קול" />
        </div>
      </div>
      {!muted && (
        <p role="note" className="flex gap-2 rounded-ui-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>דפדפנים חוסמים לרוב השמעה אוטומטית עם קול. קובץ וידאו יופעל אז ללא קול. בסרטון YouTube ייתכן שהסרטון לא יתחיל כלל עד שמישהו ילחץ על המסך. לשידור בלי השגחה עדיף להשאיר את הווידאו מושתק.</span>
        </p>
      )}

      {item.videoUrl ? (
        <div className="aspect-video overflow-hidden rounded-ui bg-black">
          {/* The editor preview is always muted (the browser would block it with sound). */}
          {id ? <iframe title="תצוגה מקדימה של YouTube" src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`} allow="autoplay; encrypted-media" className="h-full w-full border-0" />
            : <video src={item.videoUrl} muted loop={item.videoLoop ?? true} autoPlay playsInline className="h-full w-full object-contain" />}
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-ui bg-slate-900 text-center">
          <div><div className="mb-2 text-3xl">🎬</div><p className="text-xs text-white/50">הדביקו כתובת וידאו כדי לראות תצוגה מקדימה</p></div>
        </div>
      )}
    </div>
  )
}
