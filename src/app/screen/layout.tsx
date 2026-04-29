// src/app/screen/layout.tsx
// Minimal layout for public TV display — no body padding, black background
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#000', minHeight: '100vh', margin: 0, padding: 0 }}>
      {children}
    </div>
  )
}
