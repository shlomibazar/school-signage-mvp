import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toISOStringOrNull(d: Date | null | undefined): string | null {
  if (!d) return null
  try { return d instanceof Date ? d.toISOString() : new Date(d).toISOString() } catch { return null }
}

export function distributeWidths(count: number): number[] {
  if (count === 1) return [100]
  if (count === 2) return [50, 50]
  const base = Math.floor(100 / count)
  const rem  = 100 - base * count
  return Array.from({ length: count }, (_, i) => i === 0 ? base + rem : base)
}

export function sanitizeHTML(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
}

/** Hebrew calendar date: 15 בסיוון התשפ"ה */
export function formatHebrewDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  } catch {
    return ''
  }
}

/** Gregorian date in Hebrew: יום שלישי, 15 ביוני 2025 */
export function formatGregorianDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  } catch {
    return date.toLocaleDateString('he-IL')
  }
}
