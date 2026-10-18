'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { Download, X } from 'lucide-react'
import { DataTable, SortHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'
import { toCsv, downloadCsv } from '@/lib/csv'
import type { StockMovement, MovementType } from '@/lib/types'

const TYPE_META: Record<MovementType, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'secondary' | 'outline' }> = {
  opening: { label: 'Opening', variant: 'info' },
  purchase: { label: 'Purchase in', variant: 'success' },
  sale: { label: 'Sale out', variant: 'danger' },
  sales_return: { label: 'Sale return', variant: 'warning' },
  purchase_return: { label: 'Purchase return', variant: 'warning' },
  adjustment: { label: 'Adjustment', variant: 'secondary' },
}

interface Props {
  movements: StockMovement[]
  typeFilter: string
  from: string
  to: string
}

export function MovementsTable({ movements, typeFilter, from, to }: Props) {
  const router = useRouter()
  const [draftFrom, setDraftFrom] = React.useState(from)
  const [draftTo, setDraftTo] = React.useState(to)

  React.useEffect(() => {
    setDraftFrom(from)
    setDraftTo(to)
  }, [from, to])

  const unitsIn = movements
    .filter((m) => Number(m.quantity_delta) > 0)
    .reduce((a, m) => a + Number(m.quantity_delta), 0)
  const unitsOut = movements
    .filter((m) => Number(m.quantity_delta) < 0)
    .reduce((a, m) => a + Math.abs(Number(m.quantity_delta)), 0)
  const adjustments = movements.filter((m) => m.movement_type === 'adjustment').length

  const columns = React.useMemo<ColumnDef<StockMovement, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>When</SortHeader>,
        accessorKey: 'created_at',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
            {formatDateTime(getValue() as string)}
          </span>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Product</SortHeader>,
        accessorKey: 'product_name',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.product_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.sku}
              {row.original.rack_location ? ` · rack ${row.original.rack_location}` : ''}
            </p>
          </div>
        ),
      },
      {
        header: 'Type',
        accessorKey: 'movement_type',
        cell: ({ row }) => {
          const meta = TYPE_META[row.original.movement_type]
          return <Badge variant={meta.variant}>{meta.label}</Badge>
        },
      },
      {
        header: ({ column }) => <SortHeader column={column}>Change</SortHeader>,
        accessorKey: 'quantity_delta',
        cell: ({ row }) => {
          const d = Number(row.original.quantity_delta)
          return (
            <span
              className={
                d > 0
                  ? 'font-semibold tabular-nums text-emerald-600 dark:text-emerald-400'
                  : 'font-semibold tabular-nums text-red-600 dark:text-red-400'
              }
            >
              {d > 0 ? `+${d}` : d} {row.original.unit}
            </span>
          )
        },
      },
      {
        header: 'Reference',
        accessorKey: 'reference_label',
        cell: ({ row }) => {
          const m = row.original
          const label = m.reference_label ?? '—'
          if (m.reference_table === 'purchases' && m.reference_id) {
            return (
              <Link
                href={`/purchases/${m.reference_id}`}
                className="text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {label}
              </Link>
            )
          }
          return <span className="text-sm">{label}</span>
        },
      },
      {
        header: 'Reason',
        accessorKey: 'reason',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm">{row.original.reason ?? '—'}</p>
            {row.original.note && (
              <p className="truncate text-xs text-muted-foreground">{row.original.note}</p>
            )}
          </div>
        ),
      },
      {
        header: 'By',
        accessorKey: 'recorder_name',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue() as string}</span>
        ),
      },
    ],
    []
  )

  function applyDates() {
    const params = new URLSearchParams()
    if (typeFilter) params.set('type', typeFilter)
    if (draftFrom) params.set('from', draftFrom)
    if (draftTo) params.set('to', draftTo)
    const qs = params.toString()
    router.push(qs ? `/inventory/movements?${qs}` : '/inventory/movements')
  }

  function clearFilters() {
    setDraftFrom('')
    setDraftTo('')
    router.push('/inventory/movements')
  }

  function exportCsv() {
    const header = [
      'Date time',
      'SKU',
      'Product',
      'Type',
      'Change',
      'Unit',
      'Reference',
      'Reason',
      'Note',
      'Recorded by',
    ]
    const out = movements.map((m) => [
      formatDateTime(m.created_at),
      m.sku,
      m.product_name,
      TYPE_META[m.movement_type].label,
      Number(m.quantity_delta),
      m.unit,
      m.reference_label ?? '',
      m.reason ?? '',
      m.note ?? '',
      m.recorder_name,
    ])
    downloadCsv('stock-movements.csv', toCsv(header, out))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Units in</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            +{unitsIn}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Units out</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
            −{unitsOut}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Adjustments</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{adjustments}</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={movements}
        searchPlaceholder="Search product, SKU, reason…"
        initialPageSize={25}
        emptyMessage="No movements for this filter."
        toolbar={
          <>
            <Select
              value={typeFilter || 'all'}
              onValueChange={(v) => {
                const params = new URLSearchParams()
                if (v !== 'all') params.set('type', v)
                if (draftFrom) params.set('from', draftFrom)
                if (draftTo) params.set('to', draftTo)
                const qs = params.toString()
                router.push(qs ? `/inventory/movements?${qs}` : '/inventory/movements')
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(TYPE_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="w-36"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                className="w-36"
                aria-label="To date"
              />
              <Button variant="outline" size="sm" onClick={applyDates}>
                Apply
              </Button>
              {(from || to || typeFilter) && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearFilters} title="Clear filters">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={movements.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </>
        }
      />
    </div>
  )
}
