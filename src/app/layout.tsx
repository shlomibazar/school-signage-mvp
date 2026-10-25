// src/app/layout.tsx
import type { Metadata } from 'next'
import { Heebo, Assistant, Rubik } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const heebo = Heebo({
  subsets:  ['hebrew', 'latin'],
  variable: '--font-heebo',
  display:  'swap',
})

const assistant = Assistant({ subsets: ['hebrew', 'latin'], variable: '--font-assistant', display: 'swap' })
const rubik = Rubik({ subsets: ['hebrew', 'latin'], variable: '--font-rubik', display: 'swap' })

export const metadata: Metadata = {
  title:       'SchoolScreen — שילוט דיגיטלי לבתי ספר',
  description: 'מערכת שילוט דיגיטלי מתקדמת לניהול תוכן על מסכי בית הספר',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${assistant.variable} ${rubik.variable}`}>
      <body className="font-heebo antialiased">
        {children}
        <Toaster
          position="top-left"
          toastOptions={{
            duration: 4000,
            error: { style: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' } },
            style: {
              fontFamily: 'var(--font-heebo)',
              direction:  'rtl',
              background: '#dcfce7',
              color: '#166534',
              border: '1px solid #86efac',
            },
          }}
        />
      </body>
    </html>
  )
}
