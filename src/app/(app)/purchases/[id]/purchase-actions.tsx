'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Printer, RotateCcw, Wallet } from 'lucide-react'
import { payForPurchase, returnToSupplier } from '../actions'
import { receivePaymentSchema, purchaseReturnSchema } from '@/lib/validators'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { formatMoney, toDateInputValue } from '@/lib/utils'

interface Line {
  id: string
  product_id: string
  sku: string
  product_name: string
  unit: string
  quantity: number
  unit_cost: number
  line_total: number
}

interface Props {
  purchaseId: string
  purchaseNo: string
  supplierId: string | null
  outstanding: number
  lines: Line[]
  shop: { name: string; address: string; phone: string; currencySymbol: string }
}

export function PurchaseActions({
  purchaseId,
  purchaseNo,
  supplierId,
  outstanding,
  lines,
  shop,
}: Props) {
  const router = useRouter()
  const [payOpen, setPayOpen] = React.useState(false)
  const [retOpen, setRetOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const [pay, setPay] = React.useState({
    method: 'cash',
    amount: Math.max(outstanding, 0),
    reference_no: '',
    note: '',
    cheque_no: '',
    bank: '',
    cheque_date: toDateInputValue(new Date()),
  })

  const [selected, setSelected] = React.useState<Record<string, number>>({})
  const [refundMethod, setRefundMethod] = React.useState<string>('credit')
  const [returnReason, setReturnReason] = React.useState('')

  const returnTotal = Object.entries(selected).reduce(
    (a, [id, qty]) => a + qty * (lines.find((l) => l.id === id)?.unit_cost ?? 0),
    0
  )

  async function submitPayment() {
    setBusy(true)
    try {
      const payload = {
        direction: 'out' as const,
        method: pay.method as any,
        amount: Number(pay.amount),
        supplier_id: supplierId,
        purchase_id: purchaseId,
        reference_no: pay.reference_no,
        note: pay.note,
        cheque_no: pay.cheque_no,
        bank: pay.bank,
        cheque_date: pay.cheque_date,
      }
      const parsed = receivePaymentSchema.safeParse(payload)
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message)
        return
      }
      const res = await payForPurchase(purchaseId, payload)
      if ('error' in res && res.error) toast.error(res.error)
      else {
        toast.success('Payment recorded')
        setPayOpen(false)
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  async function submitReturn() {
    const items = Object.entries(selected).map(([purchase_item_id, quantity]) => ({
      purchase_item_id,
      quantity,
    }))
    const payload = {
      purchase_id: purchaseId,
      items,
      refund_method: refundMethod === 'credit' ? null : (refundMethod as any),
      reason: returnReason,
    }
    const parsed = purchaseReturnSchema.safeParse(payload)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message)
      return
    }
    setBusy(true)
    try {
      const res = await returnToSupplier(payload)
      if ('error' in res && res.error) toast.error(res.error)
      else {
        toast.success(`${res.return_no} posted · stock reduced`)
        setRetOpen(false)
        setSelected({})
        setReturnReason('')
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print GRN
        </Button>
        <Button variant="outline" size="sm" onClick={() => setRetOpen(true)} disabled={lines.length === 0}>
          <RotateCcw className="h-4 w-4" /> Return to supplier
        </Button>
        <Button
          size="sm"
          onClick={() => setPayOpen(true)}
          disabled={outstanding <= 0.004}
          title={outstanding <= 0.004 ? 'This purchase is fully paid' : undefined}
        >
          <Wallet className="h-4 w-4" />
          {outstanding <= 0.004 ? 'Settled' : `Pay ${formatMoney(outstanding, shop.currencySymbol)}`}
        </Button>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pay towards {purchaseNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={pay.method} onValueChange={(v) => setPay((p) => ({ ...p, method: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  step="0.01"
                  min={0}
                  value={pay.amount}
                  onChange={(e) => setPay((p) => ({ ...p, amount: Number(e.target.value) }))}
                  className="tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Reference / slip no</Label>
              <Input
                id="pay-ref"
                value={pay.reference_no}
                onChange={(e) => setPay((p) => ({ ...p, reference_no: e.target.value }))}
              />
            </div>
            {pay.method === 'cheque' && (
              <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pay-cheque-no">Cheque no</Label>
                    <Input
                      id="pay-cheque-no"
                      value={pay.cheque_no}
                      onChange={(e) => setPay((p) => ({ ...p, cheque_no: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pay-cheque-date">Cheque date</Label>
                    <Input
                      id="pay-cheque-date"
                      type="date"
                      value={pay.cheque_date}
                      onChange={(e) => setPay((p) => ({ ...p, cheque_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-bank">Bank</Label>
                  <Input
                    id="pay-bank"
                    value={pay.bank}
                    onChange={(e) => setPay((p) => ({ ...p, bank: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pay-note">Note</Label>
              <Textarea
                id="pay-note"
                rows={2}
                value={pay.note}
                onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Balance on this purchase: <b>{formatMoney(outstanding, shop.currencySymbol)}</b>. A cheque
              payment posts as Pending and is reversed automatically if it bounces.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPayOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitPayment} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Record payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={retOpen} onOpenChange={setRetOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Return goods · {purchaseNo}</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
            {lines.map((l) => {
              const qty = selected[l.id] ?? 0
              const on = qty > 0
              return (
                <label
                  key={l.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/60"
                >
                  <Checkbox
                    checked={on}
                    onCheckedChange={(v) =>
                      setSelected((prev) => {
                        const next = { ...prev }
                        if (v) next[l.id] = next[l.id] ?? 1
                        else delete next[l.id]
                        return next
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.sku} · {l.quantity} {l.unit} received @ {formatMoney(l.unit_cost, shop.currencySymbol)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={l.quantity}
                    step="1"
                    value={qty || ''}
                    disabled={!on}
                    onChange={(e) => {
                      const v = Math.min(Math.max(Number(e.target.value), 0), l.quantity)
                      setSelected((prev) => ({ ...prev, [l.id]: v }))
                    }}
                    className="w-20 tabular-nums"
                  />
                </label>
              )
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Settlement</Label>
              <Select value={refundMethod} onValueChange={setRefundMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit note (reduce what we owe)</SelectItem>
                  <SelectItem value="cash">Cash refund</SelectItem>
                  <SelectItem value="card">Card refund</SelectItem>
                  <SelectItem value="bank">Bank refund</SelectItem>
                  <SelectItem value="cheque">Cheque refund</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret-reason">Reason</Label>
              <Input
                id="ret-reason"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Damaged in transit, wrong part…"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Return total · {Object.keys(selected).length} line(s)
            </span>
            <Badge variant="secondary" className="tabular-nums">
              {formatMoney(returnTotal, shop.currencySymbol)}
            </Badge>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRetOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitReturn}
              disabled={busy || Object.keys(selected).length === 0}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Post return
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
