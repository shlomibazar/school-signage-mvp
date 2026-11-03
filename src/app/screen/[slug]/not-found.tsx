'use client'
import { useEffect } from 'react'

// Screen address not found (deleted, or a typo in the TV's URL). Check again every 5 minutes so
// a TV recovers on its own if the screen is restored, without reloading in a tight loop.
export default function ScreenNotFound() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.reload(), 5 * 60_000)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <div dir="rtl" className="w-screen h-screen flex flex-col items-center justify-center gap-3 text-center" style={{ background: '#0b1626', color: '#e6eef8', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ fontSize: 'clamp(22px,2.6vw,40px)' }}>המסך לא נמצא</div>
      <div style={{ fontSize: 'clamp(14px,1.4vw,22px)', opacity: 0.7 }}>יש לבדוק את כתובת המסך במערכת הניהול</div>
    </div>
  )
}
