import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** 1234567 → "1.2M"; locale-aware compact notation. */
export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  )
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = ''
  for (const u of units) {
    value /= 1024
    unit = u
    if (value < 1024) break
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${unit}`
}

/** 8_030_000_000 → "8.0B" parameters. */
export function formatParams(count: number): string {
  if (count >= 1e12) return `${(count / 1e12).toFixed(1)}T`
  if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`
  if (count >= 1e6) return `${Math.round(count / 1e6)}M`
  if (count >= 1e3) return `${Math.round(count / 1e3)}K`
  return String(count)
}

export function formatRelativeTime(iso: string | undefined, locale: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = (then - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const table: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ]
  for (const [unit, seconds] of table) {
    if (Math.abs(diffSec) >= seconds) return rtf.format(Math.round(diffSec / seconds), unit)
  }
  return rtf.format(Math.round(diffSec), 'second')
}

export function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d)
}

/** Buckets used by the client-side parameter filter. */
export type ParamBucket = 'lt1b' | '1to7b' | '7to30b' | 'gt30b'

export function paramBucketOf(count: number | undefined): ParamBucket | undefined {
  if (count === undefined) return undefined
  if (count < 1e9) return 'lt1b'
  if (count < 7e9) return '1to7b'
  if (count < 30e9) return '7to30b'
  return 'gt30b'
}
