'use client'

import { useEffect } from 'react'

/** Keep scrolling inside the admin <main>, including after a native file picker closes. */
export default function AdminPageScrollLock() {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const previousHtmlOverflow = html.style.overflow
    const previousBodyOverflow = body.style.overflow
    const previousHtmlOverscroll = html.style.overscrollBehavior
    const previousBodyOverscroll = body.style.overscrollBehavior

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overscrollBehavior = 'none'

    let frame: number | null = null
    const resetDocumentScroll = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        if (html.scrollTop !== 0) html.scrollTop = 0
        if (body.scrollTop !== 0) body.scrollTop = 0
      })
    }

    // File dialogs and browser focus restoration can move the root scroll position.
    // Never reset <main>: that is the intended admin scroll container.
    html.scrollTop = 0
    body.scrollTop = 0
    document.addEventListener('scroll', resetDocumentScroll, { capture: true, passive: true })
    window.addEventListener('focus', resetDocumentScroll)
    window.addEventListener('pageshow', resetDocumentScroll)

    return () => {
      document.removeEventListener('scroll', resetDocumentScroll, true)
      window.removeEventListener('focus', resetDocumentScroll)
      window.removeEventListener('pageshow', resetDocumentScroll)
      if (frame !== null) window.cancelAnimationFrame(frame)
      html.style.overflow = previousHtmlOverflow
      body.style.overflow = previousBodyOverflow
      html.style.overscrollBehavior = previousHtmlOverscroll
      body.style.overscrollBehavior = previousBodyOverscroll
    }
  }, [])

  return null
}
