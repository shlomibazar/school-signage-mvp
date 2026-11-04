// When a screen snapshot was taken, always in Israel time. The stored value is UTC; formatting with
// a fixed time zone gives the same text on the server (UTC on Render) and in the browser, so there
// is no hydration mismatch and no two-hour shift.
const TZ = 'Asia/Jerusalem'

/** "4.11, 16:16" (editor tooltip). */
export const snapshotShortTime = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

/** "4.11.26, 16:16" (screens list). */
export const snapshotStamp = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' })
