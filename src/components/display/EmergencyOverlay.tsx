'use client'
import type { Announcement } from '@/types'
import { announcementPlainText } from '@/lib/announcementRichText'
export default function EmergencyOverlay({ announcement }: { announcement: Announcement }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center emergency-pulse"
      style={{ background: announcement.bgColor ?? '#b91c1c' }}>
      <div className="text-center p-12 max-w-3xl">
        {announcement.icon && <div style={{ fontSize: 80, marginBottom: 24 }}>{announcement.icon}</div>}
        <div className="font-bold text-white" style={{ fontSize: 'clamp(28px,5vw,64px)', lineHeight: 1.2, marginBottom: 16 }}>
          {announcement.title}
        </div>
        {/* Plain text only (as a React text node): formatting from the editor is not interpreted here. */}
        <div className="text-white/80" style={{ fontSize: 'clamp(18px,3vw,36px)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {announcementPlainText(announcement.body)}
        </div>
      </div>
    </div>
  )
}
