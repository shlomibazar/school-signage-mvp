// Connection status of a screen, from the last heartbeat its public page sent (Screen.lastSeenAt,
// server time). Independent of the administrative status (Screen.active).
//
// A heartbeat means the public display page is running and can reach the server. It does not prove
// that the television is switched on or that anyone can see the picture.

/** The public page reports once shortly after it loads, then once an hour. */
export const HEARTBEAT_INTERVAL_MS = 60 * 60_000
export const HEARTBEAT_FIRST_DELAY_MS = 5_000
/** A screen is "מחובר" when its last report is at most this old (two missed reports allowed for). */
export const CONNECTED_WITHIN_MS = 2 * 60 * 60_000
/** The server stores a new report only when the stored one is older than this (one write per hour). */
export const HEARTBEAT_MIN_WRITE_GAP_MINUTES = 50

export type ConnectionStatus = 'connected' | 'disconnected' | 'never'

export const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connected: 'מחובר',
  disconnected: 'לא מחובר',
  never: 'טרם התחבר',
}

export function connectionStatus(lastSeenAt: Date | string | null | undefined, now: Date): ConnectionStatus {
  if (!lastSeenAt) return 'never'
  const seen = new Date(lastSeenAt).getTime()
  if (Number.isNaN(seen)) return 'never'
  return now.getTime() - seen <= CONNECTED_WITHIN_MS ? 'connected' : 'disconnected'
}

/** "לפני 45 דקות", "לפני 3 שעות", "לפני 2 ימים" (relative to the server's now). */
export function relativeTimeHe(then: Date | string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(then).getTime()) / 60_000))
  if (minutes < 1) return 'לפני פחות מדקה'
  if (minutes === 1) return 'לפני דקה'
  if (minutes < 60) return `לפני ${minutes} דקות`
  const hours = Math.floor(minutes / 60)
  if (hours === 1) return 'לפני שעה'
  if (hours === 2) return 'לפני שעתיים'
  if (hours < 24) return `לפני ${hours} שעות`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'לפני יום'
  if (days === 2) return 'לפני יומיים'
  return `לפני ${days} ימים`
}
