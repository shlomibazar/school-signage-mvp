'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
export default function DisabledScreen({ timezone }: { timezone: string }) {
  const router = useRouter()
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => setNow(new Date())
    update()
    const clock = setInterval(update, 30000)
    // Check whether an administrator re-enabled the screen.
    const check = setInterval(() => router.refresh(), 60000)
    return () => { clearInterval(clock); clearInterval(check) }
  }, [router])
  const time = now ? new Intl.DateTimeFormat('he-IL', { timeZone: timezone || 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now) : ''
  return <main dir="rtl" className="w-screen h-screen bg-black text-white flex items-center justify-center overflow-hidden" style={{ fontFamily: 'Arial, sans-serif' }}>
    <div className="absolute top-5 right-6 text-xl text-gray-400">{time}</div>
    <div className="text-2xl text-gray-300">המסך אינו פעיל</div>
  </main>
}
