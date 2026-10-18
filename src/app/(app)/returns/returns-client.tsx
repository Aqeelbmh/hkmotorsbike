'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ColumnDef } from '@tanstack/react-table'
import { Download, Loader2, RotateCcw } from 'lucide-react'
import { DataTable, SortHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createSaleReturn } from './actions'
import { getBill } from '../pos/actions'
import { formatMoney, formatDate } from '@/lib/utils'
import { toCsv, downloadCsv } from '@/lib/csv'
import type { BillData, PaymentMethod, ReturnRow, SaleRow } from '@/lib/types'

type BillPick = Pick<SaleRow, 'id' | 'bill_no' | 'sale_date' | 'customer_name' | 'grand_total' | 'status'>

interface ReturnLine {
  sale_item_id: string
  name: string
  sku: string
  unit: string
  sold: number
  unit_price: number
  qty: number
}

export function ReturnsClient({
  returns,
  bills,
  symbol,
  staff,
}: {
  returns: ReturnRow[]
  bills: BillPick[]
  symbol: string
  staff: boolean
}) {
  const router = useRouter()
  const [kind, setKind] = React.useState('all')
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [loadingBill, setLoadingBill] = React.useState(false)

  const [saleId, setSaleId] = React.useState('')
  const [bill, setBill] = React.useState<BillData | null>(null)
  const [lines, setLines] = React.useState<ReturnLine[]>([])
  const [restock, setRestock] = React.useState(true)
  const [refund, setRefund] = React.useState<'credit' | PaymentMethod>('credit')
  const [reason, setReason] = React.useState('')

  const data = React.useMemo(
    () => returns.filter((r) => kind === 'all' || r.kind === kind),
    [returns, kind]
  )

  const monthStart = new Date()
  monthStart.setDate(1)
  const monthKey = monthStart.toISOString().slice(0, 10)
  const thisMonth = returns.filter((r) => r.return_date >= monthKey)
  const monthValue = thisMonth.reduce((a, r) => a + Number(r.total), 0)
  const creditNotes = returns.filter((r) => r.credit_note).length

  async function pickBill(id: string) {
    setSaleId(id)
    setBill(null)
    setLines([])
    if (!id) return
    setLoadingBill(true)
    const r = await getBill(id)
    setLoadingBill(false)
    if (r.error || !r.bill) {
      toast.error(r.error ?? 'Could not load the bill')
      setSaleId('')
      return
    }
    setBill(r.bill)
    setLines(
      r.bill.items.map((it) => ({
        sale_item_id: it.id,
        name: it.name,
        sku: it.sku,
        unit: it.unit,
        sold: Number(it.quantity),
        unit_price: Number(it.unit_price),
        qty: 0,
      }))
    )
  }

  function reset() {
    setSaleId('')
    setBill(null)
    setLines([])
    setRestock(true)
    setRefund('credit')
    setReason('')
  }

  const picked = lines.filter((l) => l.qty > 0)
  const refundTotal = picked.reduce((a, l) => a + l.qty * l.unit_price, 0)

  async function submit() {
    if (!saleId) return toast.error('Pick a bill first')
    if (picked.length === 0) return toast.error('Enter a quantity on at least one line')
    if (reason.trim().length < 3) return toast.error('Reason is required')
    setBusy(true)
    const r = await createSaleReturn({
      sale_id: saleId,
      items: picked.map((l) => ({ sale_item_id: l.sale_item_id, quantity: l.qty })),
      restock,
      refund_method: refund,
      reason: reason.trim(),
    })
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success(
      `Return ${r.result?.return_no ?? ''} recorded — ${formatMoney(r.result?.total ?? 0, symbol)}${
        refund === 'credit' ? ' as credit note' : ' refunded'
      }`
    )
    setOpen(false)
    reset()
    router.refresh()
  }

  const columns = React.useMemo<ColumnDef<ReturnRow, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>Return #</SortHeader>,
        accessorKey: 'return_no',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.return_no}</p>
            <p className="text-xs text-muted-foreground">{formatDate(row.original.return_date)}</p>
          </div>
        ),
      },
      {
        header: 'Kind',
        accessorKey: 'kind',
        cell: ({ getValue }) =>
          getValue() === 'sale' ? (
            <Badge variant="info">Sale return</Badge>
          ) : (
            <Badge variant="warning">To supplier</Badge>
          ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Original</SortHeader>,
        accessorKey: 'original_no',
        cell: ({ row }) => (
          <div>
            <p className="text-sm">{row.original.original_no ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{row.original.party_name}</p>
          </div>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Total</SortHeader>,
        accessorKey: 'total',
        cell: ({ getValue }) => (
          <span className="font-semibold tabular-nums">{formatMoney(Number(getValue()), symbol)}</span>
        ),
      },
      {
        header: 'Lines',
        accessorKey: 'line_count',
        cell: ({ getValue }) => <span className="tabular-nums">{Number(getValue())}</span>,
      },
      {
        header: 'Settlement',
        accessorKey: 'refund_method',
        cell: ({ row }) =>
          row.original.credit_note ? (
            <Badge variant="secondary">Credit note</Badge>
          ) : row.original.refund_method ? (
            <Badge variant="outline">Refund · {row.original.refund_method}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        header: 'Restock',
        accessorKey: 'restock',
        cell: ({ getValue }) =>
          getValue() ? (
            <Badge variant="success">Restocked</Badge>
          ) : (
            <Badge variant="danger">Written off</Badge>
          ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Reason</SortHeader>,
        accessorKey: 'reason',
        cell: ({ row }) => (
          <div className="max-w-52">
            <p className="truncate text-sm" title={row.original.reason ?? ''}>
              {row.original.reason ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground">{row.original.recorder_name}</p>
          </div>
        ),
      },
    ],
    [symbol]
  )

  function exportCsv() {
    const header = ['Return no', 'Kind', 'Original', 'Party', 'Date', 'Lines', 'Total', 'Settlement', 'Restock', 'Reason', 'By']
    const rows = data.map((r) => [
      r.return_no,
      r.kind,
      r.original_no ?? '',
      r.party_name,
      r.return_date,
      r.line_count,
      Number(r.total),
      r.credit_note ? 'credit note' : r.refund_method ?? '',
      r.restock ? 'restocked' : 'written off',
      r.reason ?? '',
      r.recorder_name,
    ])
    downloadCsv('returns.csv', toCsv(header, rows))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Returns this month</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{thisMonth.length}</p>
          <p className="text-xs text-muted-foreground">{returns.length} all time</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Value this month</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(monthValue, symbol)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Credit notes issued</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{creditNotes}</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Search return no, party, reason…"
        emptyMessage="No returns recorded yet."
        toolbar={
          <>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All returns</SelectItem>
                <SelectItem value="sale">Sale returns</SelectItem>
                <SelectItem value="purchase">To suppliers</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={data.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <RotateCcw className="h-4 w-4" /> New sale return
            </Button>
          </>
        }
      />

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New sale return</DialogTitle>
            <DialogDescription>
              Pick the bill, enter quantities to take back, and choose how the customer is settled.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Bill</Label>
              <Select value={saleId} onValueChange={pickBill}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a bill…" />
                </SelectTrigger>
                <SelectContent>
                  {bills.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bill_no} · {b.customer_name} · {formatMoney(b.grand_total, symbol)}
                      {b.status === 'partially_returned' ? ' · partially returned' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loadingBill && <p className="text-xs text-muted-foreground">Loading bill lines…</p>}
            </div>

            {bill && (
              <div className="space-y-2 rounded-md border">
                <div className="grid grid-cols-[1fr_5rem_6rem_6rem] items-center gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Item</span>
                  <span className="text-right">Sold</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Return qty</span>
                </div>
                {lines.map((l, i) => (
                  <div key={l.sale_item_id} className="grid grid-cols-[1fr_5rem_6rem_6rem] items-center gap-2 px-3 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.sku}</p>
                    </div>
                    <span className="text-right text-sm tabular-nums">{l.sold} {l.unit}</span>
                    <span className="text-right text-sm tabular-nums">{formatMoney(l.unit_price, symbol)}</span>
                    <Input
                      type="number"
                      min={0}
                      max={l.sold}
                      step="any"
                      className="h-8 text-right tabular-nums"
                      value={l.qty || ''}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(l.sold, Number(e.target.value) || 0))
                        setLines((prev) => prev.map((p, j) => (j === i ? { ...p, qty: v } : p)))
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {bill && (
              <>
                <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span>Return value</span>
                  <span className="font-semibold tabular-nums">{formatMoney(refundTotal, symbol)}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Settlement</Label>
                    <Select value={refund} onValueChange={(v) => setRefund(v as 'credit' | PaymentMethod)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credit">Credit note (keep on account)</SelectItem>
                        <SelectItem value="cash">Cash refund</SelectItem>
                        <SelectItem value="card">Card refund</SelectItem>
                        <SelectItem value="bank">Bank transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={restock} onCheckedChange={(v) => setRestock(v === true)} />
                      Put items back into stock
                    </label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Reason *</Label>
                  <Textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Wrong part supplied — customer brought it back"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !bill || picked.length === 0}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Record return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
