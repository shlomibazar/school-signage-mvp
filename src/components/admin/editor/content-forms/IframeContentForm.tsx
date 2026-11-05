'use client'
import { useEffect, useId, useState } from 'react'
import { ExternalLink, Info } from 'lucide-react'
import { checkExternalUrl } from '@/lib/externalUrl'

// "אתר חיצוני": the page's https address. Only the URL is stored (the server checks it again);
// the preview next to the editor shows the page as the TV will, when the site allows embedding.
export default function IframeContentForm({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const id = useId()
  const [touched, setTouched] = useState(false)
  const [ownHost, setOwnHost] = useState('')
  useEffect(() => { setOwnHost(window.location.host) }, [])
  const check = url.trim() ? checkExternalUrl(url, [ownHost]) : null
  const error = check && !check.ok && (touched || url.length > 12) ? check.error : null

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={id} className="text-[13px] font-semibold text-ui-ink-2">כתובת האתר</label>
        <input id={id} type="url" inputMode="url" dir="ltr" autoComplete="off" spellCheck={false} maxLength={2048}
          placeholder="https://www.example.org/page" value={url}
          onChange={e => onChange(e.target.value)} onBlur={() => setTouched(true)}
          aria-invalid={!!error || undefined} aria-describedby={`${id}-hint`}
          className={`ui-focus h-10 w-full rounded-ui-sm border bg-ui-surface px-3 text-sm text-ui-ink ${error ? 'border-ui-danger' : 'border-ui-border-strong'}`} />
        {error
          ? <p id={`${id}-hint`} role="alert" className="text-xs text-ui-danger">{error}</p>
          : <p id={`${id}-hint`} className="text-xs text-ui-muted">כתובת https מלאה של דף ציבורי. הדף מוצג בגודל האזור.</p>}
        {check?.ok && (
          <a href={check.url} target="_blank" rel="noopener noreferrer" className="ui-focus inline-flex w-fit items-center gap-1 rounded text-xs font-medium text-ui-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />פתיחת האתר בלשונית חדשה
          </a>
        )}
      </div>
      <div className="flex gap-2 rounded-ui-sm border border-ui-border bg-ui-subtle px-3 py-2.5 text-xs leading-relaxed text-ui-ink-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ui-muted" aria-hidden="true" />
        <div>
          <p>חלק מהאתרים חוסמים הצגה בתוך אתר אחר. במקרה כזה האזור יישאר ריק או יציג הודעת חסימה של האתר — בדקו בתצוגה המקדימה לפני השמירה.</p>
          <p className="mt-1">הכתובת גלויה במסך הציבורי: אל תשתמשו בקישור שמכיל סיסמה או מפתח גישה.</p>
        </div>
      </div>
    </div>
  )
}
