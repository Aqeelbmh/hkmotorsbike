'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ColumnDef } from '@tanstack/react-table'
import { ArrowDownLeft, ArrowUpRight, Download, Loader2, RefreshCw } from 'lucide-react'
import { DataTable, SortHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { updateChequeStatus } from './actions'
import { formatMoney, formatDate } from '@/lib/utils'
import { toCsv, downloadCsv } from '@/lib/csv'
import type { ChequeRow, ChequeStatus } from '@/lib/types'

const STATUS_VARIANT: Record<ChequeStatus, 'warning' | 'info' | 'success' | 'danger' | 'secondary'> = {
  pending: 'warning',
  deposited: 'info',
  cleared: 'success',
  bounced: 'danger',
  returned: 'danger',
  cancelled: 'secondary',
}

const ALL_STATUSES: ChequeStatus[] = ['pending', 'deposited', 'cleared', 'bounced', 'returned', 'cancelled']
const DEAD: ChequeStatus[] = ['bounced', 'returned', 'cancelled']

export function ChequesClient({
  cheques,
  symbol,
  staff,
}: {
  cheques: ChequeRow[]
  symbol: string
  staff: boolean
}) {
  const router = useRouter()
  const [direction, setDirection] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [target, setTarget] = React.useState<ChequeRow | null>(null)
  const [nextStatus, setNextStatus] = React.useState<ChequeStatus>('deposited')
  const [clearedDate, setClearedDate] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const data = React.useMemo(
    () =>
      cheques.filter(
        (c) =>
          (direction === 'all' || c.direction === direction) && (status === 'all' || c.status === status)
      ),
    [cheques, direction, status]
  )

  const pendingReceived = cheques.filter((c) => c.direction === 'received' && c.status === 'pending')
  const dueValue = pendingReceived.filter((c) => c.is_due).reduce((a, c) => a + Number(c.amount), 0)
  const inCirculation = pendingReceived.reduce((a, c) => a + Number(c.amount), 0)
  const bounced = cheques.filter((c) => c.status === 'bounced').length

  function openStatus(c: ChequeRow) {
    setTarget(c)
    setNextStatus(c.status === 'pending' ? 'deposited' : c.status === 'deposited' ? 'cleared' : c.status)
    setClearedDate(new Date().toISOString().slice(0, 10))
    setReason('')
  }

  async function submit() {
    if (!target) return
    if (DEAD.includes(nextStatus) && !reason.trim())
      return toast.error('A reason is required for bounced/returned/cancelled')
    setBusy(true)
    const r = await updateChequeStatus(target.id, {
      status: nextStatus,
      cleared_date: nextStatus === 'cleared' ? clearedDate : '',
      bounced_reason: DEAD.includes(nextStatus) ? reason : '',
    })
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success(
      DEAD.includes(nextStatus)
        ? `Marked ${nextStatus} — linked payment reversed`
        : `Marked ${nextStatus}`
    )
    setTarget(null)
    router.refresh()
  }

  const columns = React.useMemo<ColumnDef<ChequeRow, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>Cheque</SortHeader>,
        accessorKey: 'cheque_no',
        cell: ({ row }) => (
          <div>
            <p className="font-medium tabular-nums">#{row.original.cheque_no}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.bank}
              {row.original.branch ? ` · ${row.original.branch}` : ''}
            </p>
          </div>
        ),
      },
      {
        header: 'Dir.',
        accessorKey: 'direction',
        cell: ({ getValue }) =>
          getValue() === 'received' ? (
            <Badge variant="success">
              <ArrowDownLeft className="mr-1 h-3 w-3" /> Received
            </Badge>
          ) : (
            <Badge variant="warning">
              <ArrowUpRight className="mr-1 h-3 w-3" /> Issued
            </Badge>
          ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Party</SortHeader>,
        accessorKey: 'party_name',
        cell: ({ row }) => (
          <div>
            <p className="text-sm">{row.original.party_name}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.bill_no ? `Bill ${row.original.bill_no}` : row.original.purchase_no ? `PO ${row.original.purchase_no}` : 'On account'}
            </p>
          </div>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Amount</SortHeader>,
        accessorKey: 'amount',
        cell: ({ getValue }) => (
          <span className="font-semibold tabular-nums">{formatMoney(Number(getValue()), symbol)}</span>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Cheque date</SortHeader>,
        accessorKey: 'cheque_date',
        cell: ({ row }) => (
          <div>
            <p className="whitespace-nowrap text-sm tabular-nums">{formatDate(row.original.cheque_date)}</p>
            {row.original.status === 'pending' && (
              <p
                className={
                  row.original.is_due
                    ? 'text-xs font-medium text-red-600 dark:text-red-400'
                    : 'text-xs text-muted-foreground'
                }
              >
                {row.original.is_due
                  ? 'Due now'
                  : `in ${row.original.days_to_maturity} day${row.original.days_to_maturity === 1 ? '' : 's'}`}
              </p>
            )}
          </div>
        ),
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => (
          <div>
            <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge>
            {row.original.bounced_reason && (
              <p className="mt-0.5 max-w-40 truncate text-xs text-muted-foreground" title={row.original.bounced_reason}>
                {row.original.bounced_reason}
              </p>
            )}
          </div>
        ),
      },
      ...(staff
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: ChequeRow } }) =>
                ['cleared', 'cancelled'].includes(row.original.status) ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation()
                      openStatus(row.original)
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Update
                  </Button>
                ),
            } satisfies ColumnDef<ChequeRow, any>,
          ]
        : []),
    ],
    [symbol, staff]
  )

  function exportCsv() {
    const header = ['Cheque no', 'Bank', 'Direction', 'Party', 'Amount', 'Cheque date', 'Status', 'Bill', 'PO', 'Reason']
    const rows = data.map((c) => [
      c.cheque_no,
      c.bank,
      c.direction,
      c.party_name,
      Number(c.amount),
      c.cheque_date,
      c.status,
      c.bill_no ?? '',
      c.purchase_no ?? '',
      c.bounced_reason ?? '',
    ])
    downloadCsv('cheques.csv', toCsv(header, rows))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">In circulation (received)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(inCirculation, symbol)}</p>
          <p className="text-xs text-muted-foreground">{pendingReceived.length} pending</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Due for deposit</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
            {formatMoney(dueValue, symbol)}
          </p>
          <p className="text-xs text-muted-foreground">Maturity date reached</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Bounced</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">{bounced}</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Search cheque no, bank, party…"
        emptyMessage="No cheques on record."
        toolbar={
          <>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Received + issued</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={data.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </>
        }
      />

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update cheque #{target?.cheque_no}</DialogTitle>
            <DialogDescription>
              {target ? `${formatMoney(target.amount, symbol)} · ${target.party_name}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>New status</Label>
              <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as ChequeStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.filter((s) => s !== target?.status).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {nextStatus === 'cleared' && (
              <div className="space-y-1.5">
                <Label>Cleared date</Label>
                <Input type="date" value={clearedDate} onChange={(e) => setClearedDate(e.target.value)} />
              </div>
            )}
            {DEAD.includes(nextStatus) && (
              <>
                <div className="space-y-1.5">
                  <Label>Reason *</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Insufficient funds"
                  />
                </div>
                <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
                  The linked payment is reversed automatically — the customer/supplier balance goes back up.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy} variant={DEAD.includes(nextStatus) ? 'destructive' : 'default'}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
