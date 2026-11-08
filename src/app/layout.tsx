// src/app/layout.tsx
import type { Metadata } from 'next'
import { Heebo, Assistant, Rubik, Suez_One } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const heebo = Heebo({
  subsets:  ['hebrew', 'latin'],
  variable: '--font-heebo',
  display:  'swap',
})

const assistant = Assistant({ subsets: ['hebrew', 'latin'], variable: '--font-assistant', display: 'swap' })
const rubik = Rubik({ subsets: ['hebrew', 'latin'], variable: '--font-rubik', display: 'swap' })
// Display face of some curated screen themes (headings, grade letters).
const suez = Suez_One({ weight: '400', subsets: ['hebrew', 'latin'], variable: '--font-suez', display: 'swap' })

export const metadata: Metadata = {
  title:       'SchoolScreen — שילוט דיגיטלי לבתי ספר',
  description: 'מערכת שילוט דיגיטלי מתקדמת לניהול תוכן על מסכי בית הספר',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${assistant.variable} ${rubik.variable} ${suez.variable}`}>
      <body className="font-heebo antialiased">
        {children}
        <Toaster
          position="top-left"
          // Modern Minimal: neutral white toast; the icon carries the success/error color.
          toastOptions={{
            duration: 4000,
            success: { iconTheme: { primary: '#15803d', secondary: '#ffffff' } },
            error: { duration: 6000, iconTheme: { primary: '#dc2626', secondary: '#ffffff' } },
            style: {
              fontFamily: 'var(--font-heebo)',
              direction:  'rtl',
              background: '#ffffff',
              color: '#0f172a',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              boxShadow: '0 12px 32px rgba(15,23,42,.14)',
              fontSize: '14px',
            },
          }}
        />
      </body>
    </html>
  )
}
