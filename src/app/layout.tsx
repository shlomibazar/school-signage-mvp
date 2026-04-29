// src/app/layout.tsx
import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const heebo = Heebo({
  subsets:  ['hebrew', 'latin'],
  variable: '--font-heebo',
  display:  'swap',
})

export const metadata: Metadata = {
  title:       'SchoolScreen — שילוט דיגיטלי לבתי ספר',
  description: 'מערכת שילוט דיגיטלי מתקדמת לניהול תוכן על מסכי בית הספר',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-heebo antialiased">
        {children}
        <Toaster
          position="bottom-left"
          toastOptions={{
            style: {
              fontFamily: 'var(--font-heebo)',
              direction:  'rtl',
            },
          }}
        />
      </body>
    </html>
  )
}
