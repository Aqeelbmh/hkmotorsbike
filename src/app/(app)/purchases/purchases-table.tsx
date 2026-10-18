'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { Download, FilePlus2 } from 'lucide-react'
import { DataTable, SortHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatMoney, formatDate } from '@/lib/utils'
import { toCsv, downloadCsv } from '@/lib/csv'
import Link from 'next/link'
import type { Purchase } from '@/lib/types'

interface Props {
  purchases: Purchase[]
  suppliers: { id: string; name: string }[]
  supplierFilter: string
  paidThrough: number
}

type PayStatus = 'unpaid' | 'partial' | 'paid'

function statusOf(p: Purchase): PayStatus {
  const balance = Number(p.total) - Number(p.paid_amount)
  if (balance <= 0.004) return 'paid'
  if (Number(p.paid_amount) > 0.004) return 'partial'
  return 'unpaid'
}

const STATUS_LABEL: Record<PayStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Part paid',
  paid: 'Paid',
}

export function PurchasesTable({ purchases, suppliers, supplierFilter, paidThrough }: Props) {
  const router = useRouter()
  const [status, setStatus] = React.useState('all')

  const data = React.useMemo(
    () => (status === 'all' ? purchases : purchases.filter((p) => statusOf(p) === status)),
    [purchases, status]
  )

  const outstanding = purchases.reduce(
    (a, p) => a + Math.max(Number(p.total) - Number(p.paid_amount), 0),
    0
  )
  const monthTotal = purchases
    .filter((p) => p.purchase_date.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((a, p) => a + Number(p.total), 0)

  const columns = React.useMemo<ColumnDef<Purchase, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>PO number</SortHeader>,
        accessorKey: 'purchase_no',
        cell: ({ row }) => (
          <div>
            <p className="font-medium tabular-nums">{row.original.purchase_no}</p>
            {row.original.supplier_invoice_no && (
              <p className="text-xs text-muted-foreground">
                inv {row.original.supplier_invoice_no}
              </p>
            )}
          </div>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Supplier</SortHeader>,
        accessorKey: 'supplier_name',
        cell: ({ row }) =>
          row.original.supplier_id ? (
            <Link
              href={`/suppliers/${row.original.supplier_id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline"
            >
              {row.original.supplier_name ?? '—'}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Date</SortHeader>,
        accessorKey: 'purchase_date',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap tabular-nums text-sm">
            {formatDate(getValue() as string)}
          </span>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Total</SortHeader>,
        accessorKey: 'total',
        cell: ({ getValue }) => (
          <span className="font-medium tabular-nums">{formatMoney(Number(getValue()))}</span>
        ),
      },
      {
        header: 'Paid',
        accessorKey: 'paid_amount',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-sm">{formatMoney(Number(getValue()))}</span>
        ),
      },
      {
        id: 'balance',
        header: ({ column }) => <SortHeader column={column}>Balance</SortHeader>,
        accessorFn: (p) => Number(p.total) - Number(p.paid_amount),
        cell: ({ row }) => {
          const b = Number(row.original.total) - Number(row.original.paid_amount)
          return (
            <span
              className={
                b > 0.004
                  ? 'font-semibold tabular-nums text-red-600 dark:text-red-400'
                  : 'text-muted-foreground tabular-nums'
              }
            >
              {formatMoney(b)}
            </span>
          )
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (p) => statusOf(p),
        cell: ({ row }) => {
          const s = statusOf(row.original)
          return (
            <Badge variant={s === 'paid' ? 'success' : s === 'partial' ? 'warning' : 'danger'}>
              {STATUS_LABEL[s]}
            </Badge>
          )
        },
      },
    ],
    []
  )

  function exportCsv() {
    const header = [
      'PO number',
      'Date',
      'Supplier',
      'Supplier invoice',
      'Subtotal',
      'Discount',
      'Total',
      'Paid',
      'Balance',
      'Status',
    ]
    const rows = data.map((p) => [
      p.purchase_no,
      p.purchase_date,
      p.supplier_name ?? '',
      p.supplier_invoice_no ?? '',
      Number(p.subtotal),
      Number(p.discount),
      Number(p.total),
      Number(p.paid_amount),
      Number(p.total) - Number(p.paid_amount),
      STATUS_LABEL[statusOf(p)],
    ])
    downloadCsv('purchases.csv', toCsv(header, rows))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Purchases</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{purchases.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Value this month</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(monthTotal)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Payable now</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatMoney(outstanding)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid in advance</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatMoney(paidThrough)}
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Search PO number, supplier, invoice…"
        emptyMessage="No purchases yet — record the first goods receipt."
        onRowClick={(p) => router.push(`/purchases/${p.id}`)}
        toolbar={
          <>
            <Select
              value={supplierFilter || 'all'}
              onValueChange={(v) =>
                router.push(v === 'all' ? '/purchases' : `/purchases?supplier=${v}`)
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Part paid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={data.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button asChild size="sm">
              <Link href="/purchases/new">
                <FilePlus2 className="h-4 w-4" /> New purchase
              </Link>
            </Button>
          </>
        }
      />
    </div>
  )
}
