'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, X, Wand2 } from 'lucide-react'
import { createPurchase } from '../actions'
import { purchaseSchema } from '@/lib/validators'
import { ProductPicker, PickerProduct } from '@/components/product-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatMoney, toDateInputValue } from '@/lib/utils'
import type { PaymentMethod } from '@/lib/types'

interface Supplier {
  id: string
  name: string
  credit_terms_days: number
  phone: string | null
}

interface CatalogProduct extends PickerProduct {
  cost_price: number
  selling_price: number
  qty_on_hand: number
  rack_location: string | null
}

interface Line {
  key: string
  product_id: string
  sku: string
  name: string
  unit: string
  quantity: number
  unit_cost: number
  previous_cost: number
  prior_qty: number
}

interface PayRow {
  key: string
  method: Exclude<PaymentMethod, 'credit'>
  amount: number
  reference_no: string
  cheque_no: string
  bank: string
  cheque_date: string
}

const PAY_METHODS: { value: PayRow['method']; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
]

const uid = () => Math.random().toString(36).slice(2, 10)

export function PurchaseForm({
  suppliers,
  products,
  lastCosts,
}: {
  suppliers: Supplier[]
  products: CatalogProduct[]
  lastCosts: Record<string, number>
}) {
  const router = useRouter()
  const [supplierId, setSupplierId] = React.useState(suppliers[0]?.id ?? '')
  const [invoiceNo, setInvoiceNo] = React.useState('')
  const [date, setDate] = React.useState(toDateInputValue(new Date()))
  const [notes, setNotes] = React.useState('')
  const [lines, setLines] = React.useState<Line[]>([])
  const [payments, setPayments] = React.useState<PayRow[]>([])
  const [discount, setDiscount] = React.useState(0)
  const [saving, setSaving] = React.useState(false)

  const catalog = React.useMemo<PickerProduct[]>(
    () =>
      products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        brand: p.brand,
        barcode: p.barcode,
        qty_on_hand: p.qty_on_hand,
        secondary: p.rack_location ? `rack ${p.rack_location}` : undefined,
      })),
    [products]
  )

  const subtotal = lines.reduce((a, l) => a + l.quantity * l.unit_cost, 0)
  const payable = Math.max(subtotal - discount, 0)
  const paid = payments.reduce((a, p) => a + p.amount, 0)
  const balance = payable - paid

  function addLine(p: PickerProduct) {
    const full = products.find((x) => x.id === p.id)
    if (!full) return
    const suggested = lastCosts[full.id] ?? Number(full.cost_price)
    const priorQty = Math.max(Number(full.qty_on_hand), 0)
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === full.id)
      if (existing) {
        return prev.map((l) =>
          l.product_id === full.id ? { ...l, quantity: l.quantity + 1 } : l
        )
      }
      return [
        ...prev,
        {
          key: uid(),
          product_id: full.id,
          sku: full.sku,
          name: full.name,
          unit: full.unit,
          quantity: 1,
          unit_cost: Number(suggested.toFixed(2)),
          previous_cost: Number(full.cost_price),
          prior_qty: priorQty,
        },
      ]
    })
  }

  function patchLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addPayment(amount?: number) {
    setPayments((prev) => [
      ...prev,
      {
        key: uid(),
        method: 'cash',
        amount: Number(Math.max(amount ?? balance, 0).toFixed(2)),
        reference_no: '',
        cheque_no: '',
        bank: '',
        cheque_date: date,
      },
    ])
  }

  function patchPayment(key: string, patch: Partial<PayRow>) {
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }

  function markPaidInFull() {
    if (balance <= 0) {
      setPayments([])
      return
    }
    setPayments((prev) => {
      const others = prev.reduce((a, p) => a + p.amount, 0)
      const rest = Math.max(payable - others, 0)
      if (rest <= 0) return prev.slice(0, -1)
      return [
        ...prev,
        {
          key: uid(),
          method: 'cash',
          amount: Number(rest.toFixed(2)),
          reference_no: '',
          cheque_no: '',
          bank: '',
          cheque_date: date,
        },
      ]
    })
  }

  async function submit() {
    if (!supplierId) {
      toast.error('Select a supplier')
      return
    }
    const payload = {
      supplier_id: supplierId,
      supplier_invoice_no: invoiceNo,
      purchase_date: date,
      items: lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
      })),
      discount,
      payments: payments
        .filter((p) => p.amount > 0)
        .map((p) => ({
          method: p.method,
          amount: p.amount,
          reference_no: p.reference_no,
          cheque_no: p.cheque_no,
          bank: p.bank,
          cheque_date: p.method === 'cheque' ? p.cheque_date : '',
        })),
      notes,
    }

    const parsed = purchaseSchema.safeParse(payload)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message)
      return
    }

    setSaving(true)
    try {
      const res = await createPurchase(payload)
      if ('error' in res && res.error) toast.error(res.error)
      else {
        toast.success(`${res.purchase_no} recorded · ${formatMoney(res.total)}`)
        router.push(`/purchases/${res.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const supplier = suppliers.find((s) => s.id === supplierId)

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Purchase details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {supplier && supplier.credit_terms_days > 0 && (
                <p className="text-xs text-muted-foreground">
                  Net {supplier.credit_terms_days} days
                  {supplier.phone ? ` · ${supplier.phone}` : ''}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-date">Purchase date</Label>
              <Input id="po-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-inv">Supplier invoice no</Label>
              <Input
                id="po-inv"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="INV-00123"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Items received</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProductPicker products={catalog} onPick={addLine} autoFocus existingIds={lines.map((l) => l.product_id)} />

            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                No items yet. Scan a barcode or search above — repeat scans add quantity.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Product</th>
                      <th className="px-2 py-2 font-medium">Qty</th>
                      <th className="px-2 py-2 font-medium">Unit cost</th>
                      <th className="px-2 py-2 text-right font-medium">Line total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map((l) => {
                      const denom = l.prior_qty + l.quantity
                      const projected =
                        denom > 0
                          ? (l.prior_qty * l.previous_cost + l.quantity * l.unit_cost) / denom
                          : l.unit_cost
                      return (
                        <tr key={l.key}>
                          <td className="py-2 pr-2">
                            <p className="font-medium">{l.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {l.sku}
                              {' · cost now '}
                              {formatMoney(l.previous_cost)}
                              {' → new avg '}
                              <span className="text-emerald-600 dark:text-emerald-400">
                                {formatMoney(projected)}
                              </span>
                            </p>
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="1"
                              value={l.quantity}
                              onChange={(e) => patchLine(l.key, { quantity: Number(e.target.value) })}
                              className="w-20 tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.unit_cost}
                              onChange={(e) => patchLine(l.key, { unit_cost: Number(e.target.value) })}
                              className="w-28 tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-2 text-right font-medium tabular-nums">
                            {formatMoney(l.quantity * l.unit_cost)}
                          </td>
                          <td className="py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                              title="Remove line"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal note — carrier, seal numbers, warranty…"
                rows={1}
                className="min-h-9 flex-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Payment on receipt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payments.map((p) => (
              <div key={p.key} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-36 space-y-1">
                    <Label className="text-xs">Method</Label>
                    <Select
                      value={p.method}
                      onValueChange={(v) => patchPayment(p.key, { method: v as PayRow['method'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAY_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32 space-y-1">
                    <Label className="text-xs">Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={p.amount}
                      onChange={(e) => patchPayment(p.key, { amount: Number(e.target.value) })}
                      className="tabular-nums"
                    />
                  </div>
                  <div className="w-40 space-y-1">
                    <Label className="text-xs">{p.method === 'cheque' ? 'Reference' : 'Reference / slip no'}</Label>
                    <Input
                      value={p.reference_no}
                      onChange={(e) => patchPayment(p.key, { reference_no: e.target.value })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    onClick={() => setPayments((prev) => prev.filter((x) => x.key !== p.key))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {p.method === 'cheque' && (
                  <div className="flex flex-wrap gap-2 border-t pt-2">
                    <div className="w-36 space-y-1">
                      <Label className="text-xs">Cheque no *</Label>
                      <Input
                        value={p.cheque_no}
                        onChange={(e) => patchPayment(p.key, { cheque_no: e.target.value })}
                      />
                    </div>
                    <div className="w-44 space-y-1">
                      <Label className="text-xs">Bank *</Label>
                      <Input
                        value={p.bank}
                        onChange={(e) => patchPayment(p.key, { bank: e.target.value })}
                        placeholder="BOC, HNB…"
                      />
                    </div>
                    <div className="w-40 space-y-1">
                      <Label className="text-xs">Cheque date</Label>
                      <Input
                        type="date"
                        value={p.cheque_date}
                        onChange={(e) => patchPayment(p.key, { cheque_date: e.target.value })}
                      />
                    </div>
                    <p className="w-full text-xs text-muted-foreground">
                      Posted as <b>Pending</b> in the cheque register — the payment reverses itself if
                      the cheque bounces.
                    </p>
                  </div>
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => addPayment(balance)}>
                <Plus className="h-4 w-4" /> Add payment
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={markPaidInFull}>
                <Wand2 className="h-4 w-4" /> Balance as last payment
              </Button>
              {payments.length > 0 && (
                <Button variant="ghost" size="sm" type="button" onClick={() => setPayments([])}>
                  Clear payments
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-1">
        <Card className="sticky top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-sm">
              <Row label={`Subtotal (${lines.length} lines)`} value={formatMoney(subtotal)} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Bill discount</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-28 text-right tabular-nums"
                />
              </div>
              <div className="flex items-center justify-between border-t pt-2 font-semibold">
                <span>Payable</span>
                <span className="tabular-nums">{formatMoney(payable)}</span>
              </div>
              <Row label="Paid now" value={formatMoney(paid)} />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Balance to supplier</span>
                <span
                  className={
                    balance > 0.004
                      ? 'font-semibold tabular-nums text-red-600 dark:text-red-400'
                      : balance < -0.004
                        ? 'font-semibold tabular-nums text-amber-600 dark:text-amber-400'
                        : 'tabular-nums text-muted-foreground'
                  }
                >
                  {formatMoney(balance)}
                </span>
              </div>
            </div>

            {balance < -0.004 && (
              <Badge variant="warning">Overpaid — reduce the payment amount</Badge>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={submit}
              disabled={saving || lines.length === 0}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Posting purchase…' : 'Record purchase'}
            </Button>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Stock rises immediately. Product cost price is re-computed as a weighted average of the
              old stock value and this receipt — you cannot edit cost from this screen.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
