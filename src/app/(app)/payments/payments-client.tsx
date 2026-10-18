'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ColumnDef } from '@tanstack/react-table'
import { ArrowDownLeft, ArrowUpRight, Download, Loader2, Plus, Trash2 } from 'lucide-react'
import { DataTable, SortHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { recordPayment, deletePayment } from './actions'
import { formatMoney, formatDateTime } from '@/lib/utils'
import { toCsv, downloadCsv } from '@/lib/csv'
import type { Customer, PaymentMethod, PaymentRow, SaleRow, Supplier } from '@/lib/types'

interface Props {
  payments: PaymentRow[]
  customers: Pick<Customer, 'id' | 'name'>[]
  suppliers: Pick<Supplier, 'id' | 'name'>[]
  openBills: Pick<SaleRow, 'id' | 'bill_no' | 'customer_id' | 'balance_amount'>[]
  symbol: string
  staff: boolean
}

const METHODS: PaymentMethod[] = ['cash', 'card', 'bank', 'cheque']

export function PaymentsClient({ payments, customers, suppliers, openBills, symbol, staff }: Props) {
  const router = useRouter()
  const [direction, setDirection] = React.useState('all')
  const [method, setMethod] = React.useState('all')
  const [dialog, setDialog] = React.useState<'in' | 'out' | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [removeRow, setRemoveRow] = React.useState<PaymentRow | null>(null)

  // form state
  const [partyId, setPartyId] = React.useState('')
  const [saleId, setSaleId] = React.useState('account')
  const [payMethod, setPayMethod] = React.useState<PaymentMethod>('cash')
  const [amount, setAmount] = React.useState('')
  const [referenceNo, setReferenceNo] = React.useState('')
  const [note, setNote] = React.useState('')
  const [chequeNo, setChequeNo] = React.useState('')
  const [bank, setBank] = React.useState('')
  const [chequeDate, setChequeDate] = React.useState('')

  const data = React.useMemo(
    () =>
      payments.filter(
        (p) =>
          (direction === 'all' || p.direction === direction) &&
          (method === 'all' || p.method === method)
      ),
    [payments, direction, method]
  )

  const today = new Date().toISOString().slice(0, 10)
  const inToday = data
    .filter((p) => p.direction === 'in' && p.paid_at.slice(0, 10) === today)
    .reduce((a, p) => a + Number(p.amount), 0)
  const outToday = data
    .filter((p) => p.direction === 'out' && p.paid_at.slice(0, 10) === today)
    .reduce((a, p) => a + Number(p.amount), 0)

  const partyBills = openBills.filter((b) => b.customer_id === partyId)

  function openDialog(dir: 'in' | 'out') {
    setPartyId('')
    setSaleId('account')
    setPayMethod('cash')
    setAmount('')
    setReferenceNo('')
    setNote('')
    setChequeNo('')
    setBank('')
    setChequeDate('')
    setDialog(dir)
  }

  async function submit() {
    if (!partyId) return toast.error(dialog === 'in' ? 'Select a customer' : 'Select a supplier')
    if (!(Number(amount) > 0)) return toast.error('Enter an amount above 0')
    if (payMethod === 'cheque' && (!chequeNo || !bank))
      return toast.error('Cheque number and bank are required')

    setBusy(true)
    const r = await recordPayment({
      direction: dialog,
      method: payMethod,
      amount: Number(amount),
      customer_id: dialog === 'in' ? partyId : null,
      supplier_id: dialog === 'out' ? partyId : null,
      sale_id: saleId !== 'account' ? saleId : null,
      reference_no: referenceNo || undefined,
      note: note || undefined,
      cheque_no: chequeNo || undefined,
      bank: bank || undefined,
      cheque_date: chequeDate || undefined,
    })
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success(dialog === 'in' ? 'Receipt recorded' : 'Supplier payment recorded')
    setDialog(null)
    router.refresh()
  }

  async function confirmDelete() {
    if (!removeRow) return
    setBusy(true)
    const r = await deletePayment(removeRow.id)
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success('Payment reversed')
    setRemoveRow(null)
    router.refresh()
  }

  const columns = React.useMemo<ColumnDef<PaymentRow, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>When</SortHeader>,
        accessorKey: 'paid_at',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-sm tabular-nums">{formatDateTime(getValue() as string)}</span>
        ),
      },
      {
        header: 'Dir.',
        accessorKey: 'direction',
        cell: ({ getValue }) =>
          getValue() === 'in' ? (
            <Badge variant="success">
              <ArrowDownLeft className="mr-1 h-3 w-3" /> In
            </Badge>
          ) : (
            <Badge variant="warning">
              <ArrowUpRight className="mr-1 h-3 w-3" /> Out
            </Badge>
          ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Party</SortHeader>,
        accessorKey: 'party_name',
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{row.original.party_name}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.bill_no
                ? `Bill ${row.original.bill_no}`
                : row.original.purchase_no
                  ? `PO ${row.original.purchase_no}`
                  : 'On account'}
            </p>
          </div>
        ),
      },
      {
        header: 'Method',
        accessorKey: 'method',
        cell: ({ row }) => (
          <div>
            <Badge variant="outline" className="uppercase">{row.original.method}</Badge>
            {row.original.cheque_no && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                #{row.original.cheque_no} · {row.original.bank}
                {row.original.cheque_status ? ` · ${row.original.cheque_status}` : ''}
              </p>
            )}
            {row.original.reference_no && (
              <p className="mt-0.5 text-xs text-muted-foreground">ref {row.original.reference_no}</p>
            )}
          </div>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Amount</SortHeader>,
        accessorKey: 'amount',
        cell: ({ row }) => (
          <span
            className={
              row.original.direction === 'in'
                ? 'font-semibold tabular-nums text-emerald-600 dark:text-emerald-400'
                : 'font-semibold tabular-nums text-red-600 dark:text-red-400'
            }
          >
            {row.original.direction === 'in' ? '+' : '−'}
            {formatMoney(Number(row.original.amount), symbol)}
          </span>
        ),
      },
      {
        header: 'Recorded by',
        accessorKey: 'recorder_name',
        cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue() as string}</span>,
      },
      ...(staff
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: PaymentRow } }) => (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-600"
                  title="Reverse this payment"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    setRemoveRow(row.original)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ),
            } satisfies ColumnDef<PaymentRow, any>,
          ]
        : []),
    ],
    [symbol, staff]
  )

  function exportCsv() {
    const header = ['Date', 'Direction', 'Party', 'Method', 'Amount', 'Bill', 'PO', 'Reference', 'Note', 'Recorded by']
    const rows = data.map((p) => [
      p.paid_at.slice(0, 10),
      p.direction,
      p.party_name,
      p.method,
      Number(p.amount),
      p.bill_no ?? '',
      p.purchase_no ?? '',
      p.reference_no ?? '',
      p.note ?? '',
      p.recorder_name,
    ])
    downloadCsv('payments.csv', toCsv(header, rows))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Received today</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatMoney(inToday, symbol)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid out today</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatMoney(outToday, symbol)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Entries</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{data.length}</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Search party, reference, bill…"
        emptyMessage="No payments recorded yet."
        toolbar={
          <>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">In + out</SelectItem>
                <SelectItem value="in">Received</SelectItem>
                <SelectItem value="out">Paid out</SelectItem>
              </SelectContent>
            </Select>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {['cash', 'card', 'bank', 'cheque', 'credit'].map((m) => (
                  <SelectItem key={m} value={m} className="uppercase">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={data.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" onClick={() => openDialog('in')}>
              <Plus className="h-4 w-4" /> Receive
            </Button>
            {staff && (
              <Button size="sm" variant="outline" onClick={() => openDialog('out')}>
                <Plus className="h-4 w-4" /> Pay supplier
              </Button>
            )}
          </>
        }
      />

      {/* receive / pay dialog */}
      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === 'in' ? 'Receive from customer' : 'Pay supplier'}</DialogTitle>
            <DialogDescription>
              {dialog === 'in'
                ? 'Allocate to an open bill, or leave on account.'
                : 'On-account payment — settle a specific PO from its detail page.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{dialog === 'in' ? 'Customer' : 'Supplier'}</Label>
              <Select value={partyId} onValueChange={(v) => { setPartyId(v); setSaleId('account') }}>
                <SelectTrigger>
                  <SelectValue placeholder={dialog === 'in' ? 'Select customer…' : 'Select supplier…'} />
                </SelectTrigger>
                <SelectContent>
                  {(dialog === 'in' ? customers : suppliers).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dialog === 'in' && partyId && (
              <div className="space-y-1.5">
                <Label>Allocate to bill</Label>
                <Select value={saleId} onValueChange={(v) => {
                  setSaleId(v)
                  if (v !== 'account') {
                    const bill = partyBills.find((b) => b.id === v)
                    if (bill) setAmount(String(Number(bill.balance_amount)))
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="account">On account (no bill)</SelectItem>
                    {partyBills.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bill_no} — due {formatMoney(b.balance_amount, symbol)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m} className="uppercase">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount ({symbol})</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {payMethod === 'cheque' && (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label>Cheque no *</Label>
                  <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bank *</Label>
                  <Input value={bank} onChange={(e) => setBank(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cheque date</Label>
                  <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                </div>
              </div>
            )}

            {(payMethod === 'card' || payMethod === 'bank') && (
              <div className="space-y-1.5">
                <Label>Reference no.</Label>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="resize-none" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeRow}
        onOpenChange={(v) => !v && setRemoveRow(null)}
        title="Reverse this payment?"
        description={
          removeRow
            ? `${removeRow.direction === 'in' ? 'Receipt' : 'Payment'} of ${formatMoney(removeRow.amount, symbol)} for ${removeRow.party_name} will be soft-deleted. Linked bill/PO balances update immediately and the reversal is audited.`
            : ''
        }
        confirmLabel="Reverse"
        destructive
        busy={busy}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
