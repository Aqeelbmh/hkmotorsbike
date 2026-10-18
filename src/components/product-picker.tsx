'use client'

import * as React from 'react'
import { Search, Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PickerProduct {
  id: string
  sku: string
  name: string
  unit: string
  brand?: string | null
  barcode?: string | null
  qty_on_hand?: number
  secondary?: string
}

interface Props {
  products: PickerProduct[]
  onPick: (p: PickerProduct) => void
  placeholder?: string
  /** hide rows whose product id is already in the cart */
  className?: string
  autoFocus?: boolean
  existingIds?: string[]
}

const MAX_ROWS = 30

/**
 * Barcode-first product search used by the goods receipt (and later the POS).
 * Typing a full barcode/SKU then Enter picks the exact match immediately.
 */
export function ProductPicker({
  products,
  onPick,
  placeholder = 'Scan barcode or search name / SKU / brand…',
  className,
  autoFocus,
  existingIds = [],
}: Props) {
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const existing = React.useMemo(() => new Set(existingIds), [existingIds])
  const q = query.trim().toLowerCase()

  const matches = React.useMemo(() => {
    if (!q) return []
    const scored = products
      .filter((p) => !existing.has(p.id))
      .map((p) => {
        const name = p.name.toLowerCase()
        const sku = p.sku.toLowerCase()
        const barcode = (p.barcode ?? '').toLowerCase()
        const brand = (p.brand ?? '').toLowerCase()
        let score = -1
        if (barcode === q || sku === q) score = 0
        else if (sku.startsWith(q) || barcode.startsWith(q)) score = 1
        else if (name.startsWith(q)) score = 2
        else if (name.includes(q)) score = 3
        else if (brand && (brand.includes(q) || name.includes(brand))) score = 4
        return { p, score }
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
    return scored.slice(0, MAX_ROWS).map((r) => r.p)
  }, [products, q, existing])

  React.useEffect(() => setActive(0), [q])

  function pick(p: PickerProduct | undefined) {
    if (!p) return
    onPick(p)
    setQuery('')
    setActive(0)
    inputRef.current?.focus()
  }

  function submitExact() {
    if (matches.length === 0) return
    // Enter on an exact barcode/SKU hit (or the first match) adds it.
    pick(matches[active] ?? matches[0])
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, matches.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              submitExact()
            } else if (e.key === 'Escape') {
              setQuery('')
            }
          }}
          placeholder={placeholder}
          className="h-11 w-full rounded-lg border bg-background pl-9 pr-24 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[11px] text-muted-foreground">
          <Keyboard className="h-3.5 w-3.5" />
          Enter adds
        </span>
      </div>

      {matches.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-lg">
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(p)}
              className={cn(
                'flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0',
                i === active ? 'bg-accent' : 'hover:bg-accent/60'
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.sku}
                  {p.brand ? ` · ${p.brand}` : ''}
                  {p.secondary ? ` · ${p.secondary}` : ''}
                </p>
              </div>
              {typeof p.qty_on_hand === 'number' && (
                <span
                  className={cn(
                    'shrink-0 rounded-md px-2 py-0.5 text-xs tabular-nums',
                    p.qty_on_hand <= 0
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                      : 'bg-secondary text-secondary-foreground'
                  )}
                >
                  {p.qty_on_hand} {p.unit}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
