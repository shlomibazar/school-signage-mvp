'use client'
import { useEffect, useState } from 'react'
import type { ContentItem } from '@/types'
import { checkExternalUrl, IFRAME_ALLOW, IFRAME_SANDBOX } from '@/lib/externalUrl'

// "אתר חיצוני": an external https page filling its region, on the TV and in the editor preview.
// The URL was checked by the content API; it is checked again here (also against this page's own
// host) before anything is loaded. The page is sandboxed (see IFRAME_SANDBOX / IFRAME_ALLOW), gets
// no referrer, and is never proxied: if the site forbids embedding, the browser shows it blank.
export default function IframeContent({ item }: { item: ContentItem }) {
  const raw = ((item.settings ?? {}) as { url?: unknown }).url
  const value = typeof raw === 'string' ? raw : ''
  // While a URL is typed in the editor, wait for a pause before loading it (the TV gets a fixed URL).
  const [url, setUrl] = useState(value)
  useEffect(() => { const t = window.setTimeout(() => setUrl(value), 600); return () => window.clearTimeout(t) }, [value])
  // The page's own host is known only in the browser; nothing is loaded before it is.
  const [ownHost, setOwnHost] = useState<string | null>(null)
  useEffect(() => { setOwnHost(window.location.host) }, [])

  if (!ownHost) return <Placeholder text="" />
  const check = checkExternalUrl(url, [ownHost, window.location.hostname])
  if (!check.ok) return <Placeholder text={value ? 'כתובת האתר אינה תקינה' : 'כתובת האתר לא הוגדרה'} />
  return (
    <iframe key={check.url} src={check.url} title="אתר חיצוני" sandbox={IFRAME_SANDBOX} allow={IFRAME_ALLOW}
      referrerPolicy="no-referrer" loading="eager" className="tv-iframe-content block h-full w-full border-0 bg-white" />
  )
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/30">
      <span style={{ fontSize: 40 }} aria-hidden="true">🌐</span>
      {text && <span className="text-sm">{text}</span>}
    </div>
  )
}
