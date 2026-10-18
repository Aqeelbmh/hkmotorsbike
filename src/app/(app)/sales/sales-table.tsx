'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { Download } from 'lucide-react'
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
import { BillDialog } from '@/components/bill-dialog'
import { formatMoney, formatDateTime } from '@/lib/utils'
import { toCsv, downloadCsv } from '@/lib/csv'
import type { SaleRow } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  partially_returned: 'Part. returned',
  fully_returned: 'Returned',
  void: 'Void',
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
  completed: 'success',
  partially_returned: 'warning',
  fully_returned: 'info',
  void: 'danger',
}

export function SalesTable({ sales, symbol }: { sales: SaleRow[]; symbol: string }) {
  const [status, setStatus] = React.useState('all')
  const [credit, setCredit] = React.useState('all')
  const [viewId, setViewId] = React.useState<string | null>(null)

  const data = React.useMemo(
    () =>
      sales.filter(
        (s) =>
          (status === 'all' || s.status === status) &&
          (credit === 'all' || (credit === 'credit' ? Number(s.balance_amount) > 0.004 : Number(s.balance_amount) <= 0.004))
      ),
    [sales, status, credit]
  )

  const totalSales = data.reduce((a, s) => a + Number(s.grand_total), 0)
  const totalDue = data.reduce((a, s) => a + Number(s.balance_amount), 0)
  const today = new Date().toISOString().slice(0, 10)
  const todayTotal = data.filter((s) => s.sale_date === today).reduce((a, s) => a + Number(s.grand_total), 0)

  const columns = React.useMemo<ColumnDef<SaleRow, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>Bill</SortHeader>,
        accessorKey: 'bill_no',
        cell: ({ row }) => (
          <div>
            <p className="font-medium tabular-nums">{row.original.bill_no}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.line_count} line{row.original.line_count === 1 ? '' : 's'} · {row.original.total_qty} pcs
            </p>
          </div>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Time</SortHeader>,
        accessorKey: 'sold_at',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-sm tabular-nums">{formatDateTime(getValue() as string)}</span>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Customer</SortHeader>,
        accessorKey: 'customer_name',
        cell: ({ row }) => (
          <div>
            <p className="text-sm">{row.original.customer_name}</p>
            {row.original.customer_type && row.original.customer_type !== 'retail' && (
              <Badge variant="outline" className="mt-0.5">{row.original.customer_type}</Badge>
            )}
          </div>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Total</SortHeader>,
        accessorKey: 'grand_total',
        cell: ({ getValue }) => (
          <span className="font-medium tabular-nums">{formatMoney(Number(getValue()), symbol)}</span>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Balance</SortHeader>,
        accessorKey: 'balance_amount',
        cell: ({ getValue }) => {
          const b = Number(getValue())
          return (
            <span
              className={
                b > 0.004
                  ? 'font-semibold tabular-nums text-red-600 dark:text-red-400'
                  : 'text-muted-foreground tabular-nums'
              }
            >
              {formatMoney(b, symbol)}
            </span>
          )
        },
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ getValue }) => {
          const s = getValue() as string
          return <Badge variant={STATUS_VARIANT[s] ?? 'secondary'}>{STATUS_LABEL[s] ?? s}</Badge>
        },
      },
      {
        header: ({ column }) => <SortHeader column={column}>Cashier</SortHeader>,
        accessorKey: 'cashier_name',
        cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue() as string}</span>,
      },
    ],
    [symbol]
  )

  function exportCsv() {
    const header = ['Bill', 'Date', 'Customer', 'Total', 'Paid', 'Balance', 'Status', 'Cashier']
    const rows = data.map((s) => [
      s.bill_no,
      s.sale_date,
      s.customer_name,
      Number(s.grand_total),
      Number(s.paid_amount),
      Number(s.balance_amount),
      STATUS_LABEL[s.status] ?? s.status,
      s.cashier_name,
    ])
    downloadCsv('sales.csv', toCsv(header, rows))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Filtered sales</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(totalSales, symbol)}</p>
          <p className="text-xs text-muted-foreground">{data.length} bill{data.length === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Today</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatMoney(todayTotal, symbol)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Credit outstanding</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatMoney(totalDue, symbol)}
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Search bill no, customer, cashier…"
        emptyMessage="No bills match — open the POS to make a sale."
        onRowClick={(s) => setViewId(s.id)}
        toolbar={
          <>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="partially_returned">Part. returned</SelectItem>
                <SelectItem value="fully_returned">Returned</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
            <Select value={credit} onValueChange={setCredit}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Paid + credit</SelectItem>
                <SelectItem value="credit">Credit only</SelectItem>
                <SelectItem value="paid">Settled only</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={data.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </>
        }
      />

      <BillDialog saleId={viewId} open={!!viewId} onOpenChange={(v) => !v && setViewId(null)} />
    </div>
  )
}
