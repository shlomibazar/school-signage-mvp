// src/lib/utils.ts
// Shared utility functions

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Basic HTML sanitizer.
 * Strips <script>, <iframe>, inline event handlers and dangerous URL schemes.
 * NOTE: Replace with DOMPurify in production for thorough XSS protection.
 */
export function sanitizeHTML(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/\bhref\s*=\s*["']?\s*javascript\s*:/gi, 'href="blocked:')
    .replace(/\bsrc\s*=\s*["']?\s*javascript\s*:/gi, 'src="blocked:')
}

/**
 * Format a Date as a Hebrew (Jewish) calendar date string.
 * Uses the built-in Intl API with Hebrew calendar — no external package needed.
 */
export function formatHebrewDate(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day:   'numeric',
      month: 'long',
      year:  'numeric',
    }).format(date)
  } catch {
    // Fallback if Intl Hebrew calendar not supported (old Node versions)
    return date.toLocaleDateString('he-IL')
  }
}

/**
 * Format a Date as a Gregorian Hebrew-locale string.
 */
export function formatGregorianDate(date: Date = new Date()): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  })
}

/**
 * Distribute 100% width across N sections with no rounding loss.
 * Example: 3 sections → [34, 33, 33]
 */
export function distributeWidths(count: number): number[] {
  const base = Math.floor(100 / count)
  const remainder = 100 - base * count
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? base + remainder : base
  )
}

/**
 * Convert a Prisma Date (or string/null) to an ISO string or null.
 * Handles both direct Prisma results (Date objects) and serialized API responses (strings).
 */
export function toISOStringOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  return value.toISOString()
}
