import ReloadLater from './ReloadLater'

// Screen address not found (deleted, or a typo in the TV's URL). The page checks again every
// 5 minutes (ReloadLater) so a TV recovers on its own if the screen is restored, without a
// tight reload loop.
export default function ScreenNotFound() {
  return (
    <div dir="rtl" className="w-screen h-screen flex flex-col items-center justify-center gap-3 text-center" style={{ background: '#0b1626', color: '#e6eef8', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ fontSize: 'clamp(22px,2.6vw,40px)' }}>המסך לא נמצא</div>
      <div style={{ fontSize: 'clamp(14px,1.4vw,22px)', opacity: 0.7 }}>יש לבדוק את כתובת המסך במערכת הניהול</div>
      <ReloadLater afterMs={5 * 60_000} />
    </div>
  )
}
