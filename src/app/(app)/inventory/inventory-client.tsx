'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ColumnDef } from '@tanstack/react-table'
import {
  Boxes,
  ClipboardList,
  Download,
  History,
  Loader2,
  Minus,
  Plus,
  ListChecks,
  X,
} from 'lucide-react'
import { adjustStock, runStockTake } from './actions'
import { stockAdjustSchema, stockTakeSchema } from '@/lib/validators'
import { DataTable, SortHeader } from '@/components/data-table'
import { ProductPicker, PickerProduct } from '@/components/product-picker'
import { StockBadge } from '@/components/stock-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatMoney, cn } from '@/lib/utils'
import { toCsv, downloadCsv } from '@/lib/csv'
import type { InventoryRow } from '@/lib/types'

const REASONS = [
  'Damaged',
  'Lost / stolen',
  'Expired',
  'Found stock',
  'Free sample received',
  'Data entry correction',
]

const ALL = '__all__'

interface Props {
  inventory: InventoryRow[]
  categories: { id: string; name: string; parent_id: string | null }[]
}

export function InventoryClient({ inventory, categories }: Props) {
  const router = useRouter()
  const [status, setStatus] = React.useState('all')
  const [category, setCategory] = React.useState(ALL)

  const [adjustFor, setAdjustFor] = React.useState<InventoryRow | null>(null)
  const [adjustQty, setAdjustQty] = React.useState(1)
  const [adjustDir, setAdjustDir] = React.useState<'in' | 'out'>('out')
  const [adjustReason, setAdjustReason] = React.useState(REASONS[0])
  const [adjustCustom, setAdjustCustom] = React.useState('')
  const [adjustNote, setAdjustNote] = React.useState('')
  const [adjustBusy, setAdjustBusy] = React.useState(false)

  const [takeOpen, setTakeOpen] = React.useState(false)
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  const [takeNote, setTakeNote] = React.useState('')
  const [takeBusy, setTakeBusy] = React.useState(false)

  const rows = React.useMemo(() => {
    let out = inventory
    if (status === 'low') out = out.filter((r) => r.is_low_stock && !r.is_out_of_stock)
    else if (status === 'out') out = out.filter((r) => r.is_out_of_stock)
    else if (status === 'healthy') out = out.filter((r) => !r.is_low_stock)
    if (category !== ALL) {
      const ids = descendantIds(categories, category)
      out = out.filter((r) => r.category_id && ids.has(r.category_id))
    }
    return out
  }, [inventory, status, category, categories])

  const totals = React.useMemo(() => {
    const atCost = inventory.reduce((a, r) => a + Number(r.value_at_cost), 0)
    const atSale = inventory.reduce((a, r) => a + Number(r.value_at_sale), 0)
    const low = inventory.filter((r) => r.is_low_stock && !r.is_out_of_stock).length
    const out = inventory.filter((r) => r.is_out_of_stock).length
    return { atCost, atSale, low, out, potential: atSale - atCost }
  }, [inventory])

  const pickerCatalog = React.useMemo<PickerProduct[]>(
    () =>
      inventory.map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        brand: r.brand,
        qty_on_hand: r.qty_on_hand,
        secondary: r.rack_location ? `rack ${r.rack_location}` : undefined,
      })),
    [inventory]
  )

  function openAdjust(r: InventoryRow) {
    setAdjustFor(r)
    setAdjustQty(1)
    setAdjustDir('out')
    setAdjustReason(REASONS[0])
    setAdjustCustom('')
    setAdjustNote('')
  }

  async function submitAdjust() {
    if (!adjustFor) return
    const reason = adjustReason === 'Other' ? adjustCustom.trim() : adjustReason
    const payload = {
      product_id: adjustFor.id,
      delta: adjustDir === 'out' ? -Math.abs(adjustQty) : Math.abs(adjustQty),
      reason,
      note: adjustNote,
    }
    const parsed = stockAdjustSchema.safeParse(payload)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message)
      return
    }
    setAdjustBusy(true)
    try {
      const res = await adjustStock(payload)
      if ('error' in res && res.error) toast.error(res.error)
      else {
        toast.success(`${adjustFor.sku}: ${payload.delta > 0 ? '+' : ''}${payload.delta} posted`)
        setAdjustFor(null)
        router.refresh()
      }
    } finally {
      setAdjustBusy(false)
    }
  }

  const countedIds = Object.keys(counts)
  const variance = countedIds.reduce((a, id) => {
    const r = inventory.find((x) => x.id === id)
    if (!r) return a
    return a + (Number(counts[id]) - Number(r.qty_on_hand))
  }, 0)

  async function submitStockTake() {
    const payload = {
      counts: countedIds.map((product_id) => ({ product_id, counted_qty: Number(counts[product_id]) })),
      note: takeNote,
    }
    const parsed = stockTakeSchema.safeParse(payload)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message)
      return
    }
    setTakeBusy(true)
    try {
      const res = await runStockTake(payload)
      if ('error' in res && res.error) toast.error(res.error)
      else {
        toast.success(`Stock-take done · ${res.adjusted} product(s) corrected`)
        setTakeOpen(false)
        setCounts({})
        setTakeNote('')
        router.refresh()
      }
    } finally {
      setTakeBusy(false)
    }
  }

  const columns = React.useMemo<ColumnDef<InventoryRow, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>Product</SortHeader>,
        accessorKey: 'name',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.sku}
              {row.original.category_name ? ` · ${row.original.category_name}` : ''}
            </p>
          </div>
        ),
      },
      {
        header: 'Rack',
        accessorKey: 'rack_location',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">{getValue() ?? '—'}</span>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>On hand</SortHeader>,
        accessorKey: 'qty_on_hand',
        cell: ({ row }) => (
          <span className="tabular-nums font-semibold">
            {Number(row.original.qty_on_hand)}{' '}
            <span className="text-xs font-normal text-muted-foreground">{row.original.unit}</span>
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'is_low_stock',
        cell: ({ row }) => (
          <StockBadge qty={Number(row.original.qty_on_hand)} reorderLevel={Number(row.original.reorder_level)} />
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Value at cost</SortHeader>,
        accessorKey: 'value_at_cost',
        cell: ({ getValue }) => (
          <span className="tabular-nums">{formatMoney(Number(getValue()))}</span>
        ),
      },
      {
        header: 'Value at sale',
        accessorKey: 'value_at_sale',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-muted-foreground">{formatMoney(Number(getValue()))}</span>
        ),
      },
      {
        id: 'adjust',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              openAdjust(row.original)
            }}
          >
            <Boxes className="h-3.5 w-3.5" /> Adjust
          </Button>
        ),
      },
    ],
    []
  )

  function exportCsv() {
    const header = [
      'SKU',
      'Product',
      'Category',
      'Rack',
      'Unit',
      'On hand',
      'Reorder level',
      'Cost price',
      'Selling price',
      'Value at cost',
      'Value at sale',
    ]
    const out = rows.map((r) => [
      r.sku,
      r.name,
      r.category_name ?? '',
      r.rack_location ?? '',
      r.unit,
      Number(r.qty_on_hand),
      r.reorder_level,
      Number(r.cost_price),
      Number(r.selling_price),
      Number(r.value_at_cost),
      Number(r.value_at_sale),
    ])
    downloadCsv('stock-levels.csv', toCsv(header, out))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Stock value at cost" value={formatMoney(totals.atCost)} />
        <Stat
          label="Retail value of stock"
          value={formatMoney(totals.atSale)}
          hint={`potential margin ${formatMoney(totals.potential)}`}
        />
        <Stat
          label="Low stock"
          value={String(totals.low)}
          tone="amber"
          hint="at or below reorder level"
        />
        <Stat label="Out of stock" value={String(totals.out)} tone="red" hint="nothing on the shelf" />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search product, SKU, rack…"
        initialPageSize={20}
        emptyMessage="No stock matches this filter."
        onRowClick={(r) => openAdjust(r)}
        toolbar={
          <>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
                <SelectItem value="healthy">Healthy</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTakeOpen(true)}>
              <ListChecks className="h-4 w-4" /> Stock-take
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/movements">
                <History className="h-4 w-4" /> Movements
              </Link>
            </Button>
          </>
        }
      />

      {/* Adjust stock */}
      <Dialog open={!!adjustFor} onOpenChange={(v) => !v && setAdjustFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
          </DialogHeader>
          {adjustFor && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <p className="font-medium">{adjustFor.name}</p>
                <p className="text-xs text-muted-foreground">
                  {adjustFor.sku} · {Number(adjustFor.qty_on_hand)} {adjustFor.unit} on hand
                  {adjustFor.rack_location ? ` · rack ${adjustFor.rack_location}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border p-1">
                  {(['out', 'in'] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => setAdjustDir(dir)}
                      className={cn(
                        'flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                        adjustDir === dir
                          ? dir === 'in'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-500/15 text-red-700 dark:text-red-400'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {dir === 'in' ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                      {dir === 'in' ? 'Add stock' : 'Remove stock'}
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Number(e.target.value))}
                  className="w-24 tabular-nums"
                />
                <span className="text-sm text-muted-foreground">{adjustFor.unit}</span>
              </div>

              <p className="text-sm">
                New level:{' '}
                <b className="tabular-nums">
                  {Number(
                    (adjustDir === 'in'
                      ? Number(adjustFor.qty_on_hand) + Math.abs(adjustQty)
                      : Number(adjustFor.qty_on_hand) - Math.abs(adjustQty)
                    ).toFixed(3)
                  )}
                </b>{' '}
                {adjustFor.unit}
              </p>

              <div className="space-y-1.5">
                <Label>Reason *</Label>
                <Select value={adjustReason} onValueChange={setAdjustReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                    <SelectItem value="Other">Other (type below)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {adjustReason === 'Other' && (
                <Input
                  value={adjustCustom}
                  onChange={(e) => setAdjustCustom(e.target.value)}
                  placeholder="Reason for the audit trail"
                />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="adj-note">Note</Label>
                <Textarea
                  id="adj-note"
                  rows={2}
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="Optional detail — who reported it, reference number…"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Every adjustment is written to the movement ledger with your name and the reason, and
                appears in the audit log.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAdjustFor(null)} disabled={adjustBusy}>
              Cancel
            </Button>
            <Button onClick={submitAdjust} disabled={adjustBusy || adjustQty === 0}>
              {adjustBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              Post adjustment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock take */}
      <Dialog open={takeOpen} onOpenChange={setTakeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stock-take</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <ProductPicker
              products={pickerCatalog}
              existingIds={countedIds}
              onPick={(p) => {
                const row = inventory.find((r) => r.id === p.id)
                setCounts((prev) => ({ ...prev, [p.id]: Number(row?.qty_on_hand ?? 0) }))
              }}
              placeholder="Scan or search the product you just counted…"
            />

            {countedIds.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                Counted products appear here. Leaving a product out of this list never changes its
                stock.
              </div>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
                {countedIds.map((id) => {
                  const r = inventory.find((x) => x.id === id)
                  if (!r) return null
                  const diff = Number(counts[id]) - Number(r.qty_on_hand)
                  return (
                    <div key={id} className="flex items-center gap-3 px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.sku} · system says {Number(r.qty_on_hand)} {r.unit}
                        </p>
                      </div>
                      <Badge
                        variant={diff === 0 ? 'outline' : diff > 0 ? 'success' : 'danger'}
                        className="tabular-nums"
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </Badge>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        value={counts[id]}
                        onChange={(e) =>
                          setCounts((prev) => ({ ...prev, [id]: Number(e.target.value) }))
                        }
                        className="w-24 tabular-nums"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() =>
                          setCounts((prev) => {
                            const next = { ...prev }
                            delete next[id]
                            return next
                          })
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total variance to post</span>
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  variance > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : variance < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground'
                )}
              >
                {variance > 0 ? `+${variance}` : variance} units
              </span>
            </div>

            <Input
              value={takeNote}
              onChange={(e) => setTakeNote(e.target.value)}
              placeholder="Count sheet reference, e.g. October wall-to-wall count"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setTakeOpen(false)} disabled={takeBusy}>
              Cancel
            </Button>
            <Button onClick={submitStockTake} disabled={takeBusy || countedIds.length === 0}>
              {takeBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              Post stock-take
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'red' | 'amber'
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'red' && 'text-red-600 dark:text-red-400',
          tone === 'amber' && 'text-amber-600 dark:text-amber-400'
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Selecting a parent category also includes every category beneath it. */
function descendantIds(
  cats: { id: string; name: string; parent_id: string | null }[],
  id: string
): Set<string> {
  const byParent = new Map<string | null, string[]>()
  cats.forEach((c) => byParent.set(c.parent_id, [...(byParent.get(c.parent_id) ?? []), c.id]))
  const out = new Set<string>()
  const walk = (nodeId: string) => {
    out.add(nodeId)
    ;(byParent.get(nodeId) ?? []).forEach(walk)
  }
  walk(id)
  return out
}
