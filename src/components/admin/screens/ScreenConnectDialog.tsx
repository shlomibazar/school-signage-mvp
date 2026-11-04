'use client'
import { useEffect, useRef, useState } from 'react'
import { KeyRound, Link2, Globe, Loader2, RefreshCw, AlertCircle, Clock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CopyButton, CopyField, copyText, useCopied } from '@/components/ui/CopyField'
import { cn } from '@/lib/utils'

// "חיבור טלוויזיה": the three existing ways to show a screen on a TV, in one place.
// - קוד חיבור: a 6-digit, one-time code (POST /api/screens/[id]/pairing, SCHOOL_ADMIN and up),
//   entered in the TV app. Valid until the server's expiresAt; the countdown only reads it.
// - קישור קצר: /s/<code> (POST /api/screens/[id]/short-link, EDITOR and up; an existing link is
//   returned unchanged). Created only on an explicit click, never when the dialog opens.
// - כתובת מלאה: /screen/<slug>.

type Tab = 'code' | 'short' | 'url'
type Pairing = { code: string; expiresAt: string }

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'code', label: 'קוד חיבור', icon: KeyRound },
  { id: 'short', label: 'קישור קצר', icon: Link2 },
  { id: 'url', label: 'כתובת מלאה', icon: Globe },
]
const errorOf = async (r: Response, fallback: string) => {
  const d = await r.json().catch(() => ({}))
  if (r.status === 403) return 'אין לך הרשאה לפעולה הזו'
  return typeof d.error === 'string' && d.error ? d.error : fallback
}

export default function ScreenConnectDialog({ open, onClose, screen, canPair, canCreateLink }: {
  open: boolean; onClose: () => void
  screen: { id: string; name: string; slug: string; shortCode: string | null }
  canPair: boolean; canCreateLink: boolean
}) {
  const [tab, setTab] = useState<Tab>(canPair ? 'code' : 'short')
  const [origin, setOrigin] = useState('')
  // Kept here (not in the panels) so switching tabs or reopening the dialog keeps a code that is
  // still valid and a link that was just created.
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [shortCode, setShortCode] = useState(screen.shortCode)
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ code: null, short: null, url: null })
  const onTabKey = (e: React.KeyboardEvent) => {
    const order = TABS.map(t => t.id), i = order.indexOf(tab)
    // RTL: ArrowLeft moves to the next tab, ArrowRight to the previous one.
    const next = e.key === 'ArrowLeft' ? order[(i + 1) % order.length] : e.key === 'ArrowRight' ? order[(i - 1 + order.length) % order.length] : null
    if (next) { e.preventDefault(); setTab(next); tabRefs.current[next]?.focus() }
  }
  return (
    <Modal open={open} onClose={onClose} title="חיבור טלוויזיה" description={screen.name} size="lg">
      <div role="tablist" aria-label="שיטת חיבור" onKeyDown={onTabKey} className="mb-4 grid grid-cols-3 gap-1 rounded-ui bg-ui-subtle p-1">
        {TABS.map(t => (
          <button key={t.id} ref={el => { tabRefs.current[t.id] = el }} type="button" role="tab" id={`connect-tab-${t.id}`}
            aria-selected={tab === t.id} aria-controls={`connect-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            data-autofocus={tab === t.id ? '' : undefined} onClick={() => setTab(t.id)}
            className={cn('ui-focus flex min-h-10 items-center justify-center gap-1.5 rounded-ui-sm px-2 text-[13px] font-medium transition-colors',
              tab === t.id ? 'bg-ui-surface text-ui-ink shadow-ui' : 'text-ui-muted hover:text-ui-ink')}>
            <t.icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`connect-panel-${tab}`} aria-labelledby={`connect-tab-${tab}`} className="min-h-[264px]">
        {tab === 'code' && <PairingPanel screenId={screen.id} canPair={canPair} pairing={pairing} setPairing={setPairing} />}
        {tab === 'short' && <ShortLinkPanel screenId={screen.id} code={shortCode} setCode={setShortCode} canCreate={canCreateLink} origin={origin} />}
        {tab === 'url' && <UrlPanel url={origin ? `${origin}/screen/${screen.slug}` : ''} />}
      </div>
    </Modal>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-ui-muted">{children}</p>
}

function PairingPanel({ screenId, canPair, pairing, setPairing }: { screenId: string; canPair: boolean; pairing: Pairing | null; setPairing: (p: Pairing) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [copied, mark] = useCopied()
  const [copyFailed, setCopyFailed] = useState(false)
  const expiresAt = pairing ? Date.parse(pairing.expiresAt) : 0
  const seconds = pairing ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0
  const valid = !!pairing && seconds > 0
  useEffect(() => {
    if (!valid) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [valid])

  async function generate() {
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/screens/${encodeURIComponent(screenId)}/pairing`, { method: 'POST', cache: 'no-store' })
      if (!r.ok) throw new Error(await errorOf(r, 'יצירת הקוד נכשלה. נסו שוב.'))
      const d = await r.json() as Pairing
      setPairing(d); setNow(Date.now())
    } catch (e) { setError(e instanceof Error ? e.message : 'יצירת הקוד נכשלה. נסו שוב.') }
    finally { setBusy(false) }
  }

  if (!canPair) return (
    <div className="grid gap-2">
      <Hint>רק מנהל בית הספר יכול ליצור קוד חיבור. אפשר לחבר טלוויזיה גם בעזרת הקישור הקצר או הכתובת המלאה.</Hint>
    </div>
  )
  return (
    <div className="grid gap-4">
      <Hint><b className="font-semibold text-ui-ink-2">מומלץ לאפליקציית הטלוויזיה.</b> יוצרים קוד ומקלידים אותו במסך החיבור של האפליקציה בטלוויזיה. הקוד חד־פעמי ותקף ל־10 דקות.</Hint>
      {valid ? (
        <div className="grid gap-3 rounded-ui border border-ui-border p-4 text-center">
          <div className="font-mono text-[40px] font-bold leading-none tracking-[0.18em] text-ui-ink tabular-nums" dir="ltr" aria-label={`קוד חיבור ${pairing!.code.split('').join(' ')}`}>
            {pairing!.code.slice(0, 3)}<span className="mx-1.5 text-ui-faint">·</span>{pairing!.code.slice(3)}
          </div>
          <p className="inline-flex items-center justify-center gap-1.5 text-sm text-ui-muted" aria-live="polite">
            <Clock className="h-4 w-4" aria-hidden="true" />
            בתוקף עוד <span className="font-semibold tabular-nums text-ui-ink-2" dir="ltr">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
            · עד {new Date(expiresAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <CopyButton copied={copied} label="העתקת הקוד" onClick={async () => { const ok = await copyText(pairing!.code); setCopyFailed(!ok); if (ok) mark() }} />
            <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />} loading={busy} onClick={generate}>קוד חדש</Button>
          </div>
          {copyFailed && <p role="status" className="text-xs text-ui-muted">ההעתקה האוטומטית לא זמינה כאן. הקלידו את הקוד ידנית.</p>}
        </div>
      ) : (
        <div className="grid justify-items-center gap-3 rounded-ui border border-dashed border-ui-border p-5 text-center">
          {pairing && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-ui-warning"><AlertCircle className="h-4 w-4" aria-hidden="true" />תוקף הקוד פג. צרו קוד חדש.</p>}
          <Button variant="primary" icon={busy ? undefined : <KeyRound className="h-4 w-4" aria-hidden="true" />} loading={busy} onClick={generate}>
            {pairing ? 'יצירת קוד חדש' : 'יצירת קוד חיבור'}
          </Button>
        </div>
      )}
      {error && <p role="alert" className="flex items-center gap-1.5 text-sm text-ui-danger"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}
      <p className="text-xs text-ui-faint">יצירת קוד חדש מבטלת את הקוד הקודם. מטעמי אבטחה הקוד מוצג רק עכשיו.</p>
    </div>
  )
}

function ShortLinkPanel({ screenId, code, setCode, canCreate, origin }: { screenId: string; code: string | null; setCode: (c: string) => void; canCreate: boolean; origin: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function create() {
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/screens/${encodeURIComponent(screenId)}/short-link`, { method: 'POST' })
      if (!r.ok) throw new Error(await errorOf(r, 'יצירת הקישור נכשלה. נסו שוב.'))
      setCode((await r.json()).code)
    } catch (e) { setError(e instanceof Error ? e.message : 'יצירת הקישור נכשלה. נסו שוב.') }
    finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Hint><b className="font-semibold text-ui-ink-2">לדפדפן בטלוויזיה.</b> כתובת קצרה שקל להקליד בשלט. היא לא משתנה, ואפשר להשתמש בה שוב.</Hint>
      {code ? <CopyField value={origin ? `${origin}/s/${code}` : `/s/${code}`} label="קישור קצר למסך" />
        : canCreate ? (
          <div className="grid justify-items-center gap-2 rounded-ui border border-dashed border-ui-border p-5">
            <Button variant="primary" icon={busy ? undefined : <Link2 className="h-4 w-4" aria-hidden="true" />} loading={busy} onClick={create}>יצירת קישור קצר</Button>
          </div>
        ) : <p className="rounded-ui border border-dashed border-ui-border p-5 text-center text-sm text-ui-muted">עדיין אין קישור קצר למסך הזה.</p>}
      {error && <p role="alert" className="flex items-center gap-1.5 text-sm text-ui-danger"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}
    </div>
  )
}

function UrlPanel({ url }: { url: string }) {
  return (
    <div className="grid gap-4">
      <Hint>הכתובת המלאה של המסך. מתאימה למחשב או לנגן שמחוברים לטלוויזיה.</Hint>
      {url ? <CopyField value={url} label="כתובת מלאה של המסך" /> : <div className="flex h-10 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-ui-muted" aria-hidden="true" /></div>}
    </div>
  )
}
