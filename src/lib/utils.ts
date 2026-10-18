import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format money in the configured currency. Default: LKR "Rs. 1,234.50" */
export function formatMoney(amount: number | string | null | undefined, symbol = 'Rs.') {
  const n = Number(amount ?? 0)
  return `${symbol} ${n.toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** yyyy-mm-dd for date inputs / API ranges */
export function toDateInputValue(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function stockBadgeVariant(qty: number, reorderLevel: number): 'ok' | 'low' | 'out' {
  if (qty <= 0) return 'out'
  if (qty <= reorderLevel) return 'low'
  return 'ok'
}

export function generateBarcode(): string {
  // Internal "2"-prefixed 13-digit code (in-store barcodes start with 2)
  let s = '2'
  for (let i = 0; i < 12; i++) s += Math.floor(Math.random() * 10)
  return s
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}
