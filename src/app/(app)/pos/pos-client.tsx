'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Banknote,
  CreditCard,
  Landmark,
  Trash2,
  Plus,
  Minus,
  PauseCircle,
  PlayCircle,
  User,
  X,
  Loader2,
  ShoppingCart,
  CheckCircle2,
} from 'lucide-react'
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
import { ProductPicker } from '@/components/product-picker'
import { BillDialog } from '@/components/bill-dialog'
import { checkout, holdBill, deleteHeldBill } from './actions'
import { formatMoney, cn, stockBadgeVariant } from '@/lib/utils'
import type {
  CheckoutResult,
  Customer,
  HeldBill,
  PaymentMethod,
  ProductPOS,
  Settings,
} from '@/lib/types'

interface CartLine {
  product: ProductPOS
  quantity: number
  unit_price: number
  discount: number
}

interface PayLine {
  method: PaymentMethod
  amount: string
  reference_no: string
  cheque_no: string
  bank: string
  cheque_date: string
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const METHOD_META: Record<PaymentMethod, { label: string; icon: typeof Banknote }> = {
  cash: { label: 'Cash', icon: Banknote },
  card: { label: 'Card', icon: CreditCard },
  bank: { label: 'Bank', icon: Landmark },
  cheque: { label: 'Cheque', icon: Landmark },
  credit: { label: 'Credit', icon: User },
}

const emptyPay = (method: PaymentMethod, amount = ''): PayLine => ({
  method,
  amount,
  reference_no: '',
  cheque_no: '',
  bank: '',
  cheque_date: '',
})

interface Props {
  products: ProductPOS[]
  customers: Pick<Customer, 'id' | 'name' | 'type' | 'phone' | 'credit_limit'>[]
  settings: Pick<Settings, 'currency_symbol' | 'tax_rate' | 'allow_negative_stock'>
  heldBills: HeldBill[]
  cashierName: string
}

export function PosClient({ products, customers, settings, heldBills, cashierName }: Props) {
  const router = useRouter()
  const symbol = settings.currency_symbol || 'Rs.'
  const [cart, setCart] = React.useState<CartLine[]>([])
  const [customerId, setCustomerId] = React.useState<string>('walkin')
  const [category, setCategory] = React.useState<string>('all')
  const [billDiscount, setBillDiscount] = React.useState('')
  const [discountMode, setDiscountMode] = React.useState<'amount' | 'percent'>('amount')
  const [payments, setPayments] = React.useState<PayLine[]>([emptyPay('cash')])
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [holdOpen, setHoldOpen] = React.useState(false)
  const [recallOpen, setRecallOpen] = React.useState(false)
  const [holdNote, setHoldNote] = React.useState('')
  const [doneSale, setDoneSale] = React.useState<{ id: string; result: CheckoutResult } | null>(null)

  const customer = customerId === 'walkin' ? null : (customers.find((c) => c.id === customerId) ?? null)
  const wholesale = customer?.type === 'wholesale'

  const categories = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of products) if (p.category_id && p.category_name) seen.set(p.category_id, p.category_name)
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [products])

  const gridProducts = React.useMemo(
    () =>
      products
        .filter((p) => category === 'all' || p.category_id === category)
        .slice(0, 60),
    [products, category]
  )

  // ----- totals -------------------------------------------------------------
  const subtotal = r2(cart.reduce((a, l) => a + l.quantity * l.unit_price, 0))
  const lineDiscounts = r2(cart.reduce((a, l) => a + l.discount, 0))
  const billDisc =
    discountMode === 'percent'
      ? r2(((subtotal - lineDiscounts) * (Number(billDiscount) || 0)) / 100)
      : r2(Number(billDiscount) || 0)
  const net = r2(subtotal - lineDiscounts - billDisc)
  const tax = r2((net * Number(settings.tax_rate ?? 0)) / 100)
  const grand = r2(net + tax)
  const paidSum = r2(
    payments.filter((p) => p.method !== 'credit').reduce((a, p) => a + (Number(p.amount) || 0), 0)
  )
  const creditSum = r2(
    payments.filter((p) => p.method === 'credit').reduce((a, p) => a + (Number(p.amount) || 0), 0)
  )
  const covered = r2(paidSum + creditSum)
  const remaining = r2(grand - covered)
  const change = r2(Math.max(paidSum + creditSum - grand, 0))

  // ----- cart ops -----------------------------------------------------------
  function addProduct(p: ProductPOS) {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id)
      if (i !== -1) {
        const next = [...prev]
        next[i] = { ...next[i], quantity: next[i].quantity + 1 }
        return next
      }
      const price =
        wholesale && p.wholesale_price != null && Number(p.wholesale_price) > 0
          ? Number(p.wholesale_price)
          : Number(p.selling_price)
      return [...prev, { product: p, quantity: 1, unit_price: price, discount: 0 }]
    })
  }

  function patchLine(id: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, ...patch } : l)))
  }

  function stockWarn(l: CartLine): string | null {
    if (settings.allow_negative_stock) return null
    if (l.quantity > l.product.qty_on_hand) return `only ${l.product.qty_on_hand} ${l.product.unit} in stock`
    return null
  }

  // ----- payments -----------------------------------------------------------
  function addPayment(method: PaymentMethod) {
    setPayments((prev) => [...prev, emptyPay(method, remaining > 0 ? String(remaining) : '')])
  }
  function patchPayment(i: number, patch: Partial<PayLine>) {
    setPayments((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }

  // ----- hold / recall ------------------------------------------------------
  async function doHold() {
    if (cart.length === 0) return toast.error('Cart is empty')
    setBusy(true)
    const r = await holdBill({
      cart: cart.map((l) => ({
        product_id: l.product.id,
        sku: l.product.sku,
        name: l.product.name,
        unit: l.product.unit,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount,
        line_total: r2(l.quantity * l.unit_price - l.discount),
      })),
      customer_id: customer?.id ?? null,
      note: holdNote || undefined,
    })
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success('Bill parked — recall it from the held list')
    setHoldOpen(false)
    setHoldNote('')
    resetCart()
    router.refresh()
  }

  async function recall(h: HeldBill) {
    const lines: CartLine[] = []
    for (const l of h.cart) {
      const product = products.find((p) => p.id === l.product_id)
      if (!product) {
        toast.error(`"${l.name}" is no longer available`)
        continue
      }
      lines.push({ product, quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount: Number(l.discount) })
    }
    if (lines.length === 0) return
    const r = await deleteHeldBill(h.id)
    if (r.error) return toast.error(r.error)
    setCart(lines)
    setCustomerId(h.customer_id ?? 'walkin')
    setRecallOpen(false)
    toast.success(`Recalled hold #${h.hold_no}`)
    router.refresh()
  }

  async function discardHeld(h: HeldBill) {
    const r = await deleteHeldBill(h.id)
    if (r.error) return toast.error(r.error)
    toast.success(`Discarded hold #${h.hold_no}`)
    router.refresh()
  }

  function resetCart() {
    setCart([])
    setPayments([emptyPay('cash')])
    setBillDiscount('')
    setDiscountMode('amount')
    setNote('')
    setCustomerId('walkin')
  }

  // ----- checkout -----------------------------------------------------------
  async function doCheckout() {
    if (cart.length === 0) return toast.error('Cart is empty')
    for (const l of cart) {
      const warn = stockWarn(l)
      if (warn) return toast.error(`${l.product.name}: ${warn}`)
      if (l.discount > r2(l.quantity * l.unit_price)) return toast.error(`${l.product.name}: line discount exceeds the line total`)
    }
    const cleanPays = payments.filter((p) => Number(p.amount) > 0)
    if (cleanPays.length === 0) return toast.error('Take at least one payment')
    if (covered + 0.004 < grand) return toast.error(`Payments are short by ${formatMoney(remaining, symbol)}`)
    if (cleanPays.some((p) => p.method === 'credit') && !customer)
      return toast.error('Credit sales need a named customer')
    for (const p of cleanPays) {
      if (p.method === 'cheque' && (!p.cheque_no || !p.bank))
        return toast.error('Cheque payments need a cheque number and bank')
    }

    setBusy(true)
    const r = await checkout({
      customer_id: customer?.id ?? null,
      items: cart.map((l) => ({
        product_id: l.product.id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount,
      })),
      bill_discount: Number(billDiscount) || 0,
      discount_mode: discountMode,
      payments: cleanPays.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
        reference_no: p.reference_no || undefined,
        cheque_no: p.cheque_no || undefined,
        bank: p.bank || undefined,
        cheque_date: p.cheque_date || undefined,
      })),
      note: note || undefined,
    })
    setBusy(false)
    if (r.error) return toast.error(r.error)
    setDoneSale({ id: r.result!.sale_id, result: r.result! })
    resetCart()
    router.refresh()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_440px]">
      {/* ------------------------------ catalogue ------------------------------ */}
      <div className="space-y-3">
        <ProductPicker
          products={products}
          onPick={(p) => addProduct(products.find((x) => x.id === p.id) ?? (p as unknown as ProductPOS))}
          autoFocus
          placeholder="Scan barcode or search name / SKU / brand…"
        />

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setCategory('all')}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              category === 'all' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                category === c.id ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {gridProducts.map((p) => {
            const stock = stockBadgeVariant(p.qty_on_hand, p.reorder_level)
            const inCart = cart.find((l) => l.product.id === p.id)
            return (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className={cn(
                  'group relative rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                  inCart && 'ring-2 ring-primary'
                )}
              >
                <p className="line-clamp-2 min-h-10 text-sm font-medium leading-tight">{p.name}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {p.sku}
                  {p.rack_location ? ` · ${p.rack_location}` : ''}
                </p>
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className="text-sm font-bold tabular-nums">
                    {formatMoney(wholesale && p.wholesale_price ? p.wholesale_price : p.selling_price, symbol)}
                  </span>
                  <Badge variant={stock === 'out' ? 'danger' : stock === 'low' ? 'warning' : 'secondary'}>
                    {p.qty_on_hand} {p.unit}
                  </Badge>
                </div>
                {inCart && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                    {inCart.quantity}
                  </span>
                )}
              </button>
            )
          })}
          {gridProducts.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No products in this category.
            </p>
          )}
        </div>
      </div>

      {/* ------------------------------ bill panel ----------------------------- */}
      <div className="flex flex-col gap-3 self-start lg:sticky lg:top-0">
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b p-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="h-8 flex-1">
                <SelectValue placeholder="Walk-in customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="walkin">Walk-in customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.type !== 'retail' ? ` (${c.type})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecallOpen(true)}
              disabled={heldBills.length === 0}
              title="Recall a parked bill"
            >
              <PlayCircle className="h-4 w-4" />
              Held ({heldBills.length})
            </Button>
          </div>

          {/* cart lines */}
          <div className="max-h-72 overflow-y-auto scrollbar-thin">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 opacity-40" />
                <p className="text-sm">Scan or tap products to start a bill</p>
              </div>
            ) : (
              cart.map((l) => {
                const warn = stockWarn(l)
                return (
                  <div key={l.product.id} className="border-b p-3 last:border-b-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.product.name}</p>
                        <p className="text-[11px] text-muted-foreground">{l.product.sku}</p>
                      </div>
                      <button
                        onClick={() => setCart((prev) => prev.filter((x) => x.product.id !== l.product.id))}
                        className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                        title="Remove line"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                      <div className="flex items-center rounded-md border">
                        <button
                          className="px-2 py-1 hover:bg-accent disabled:opacity-40"
                          onClick={() => patchLine(l.product.id, { quantity: Math.max(1, l.quantity - 1) })}
                          disabled={l.quantity <= 1}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) => patchLine(l.product.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-12 border-x bg-transparent py-1 text-center text-sm tabular-nums outline-none"
                        />
                        <button
                          className="px-2 py-1 hover:bg-accent"
                          onClick={() => patchLine(l.product.id, { quantity: l.quantity + 1 })}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.unit_price}
                        onChange={(e) => patchLine(l.product.id, { unit_price: Number(e.target.value) || 0 })}
                        className="h-8 text-right tabular-nums"
                        title="Unit price"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.discount || ''}
                        placeholder="Disc."
                        onChange={(e) => patchLine(l.product.id, { discount: Number(e.target.value) || 0 })}
                        className="h-8 text-right tabular-nums"
                        title="Line discount"
                      />
                      <span className="w-20 text-right text-sm font-semibold tabular-nums">
                        {formatMoney(r2(l.quantity * l.unit_price - l.discount), symbol)}
                      </span>
                    </div>
                    {warn && <p className="mt-1 text-[11px] font-medium text-red-600">{warn}</p>}
                  </div>
                )
              })
            )}
          </div>

          {/* totals */}
          <div className="space-y-1.5 border-t p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(subtotal, symbol)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className="flex items-center gap-1">
                Bill discount
                <Select value={discountMode} onValueChange={(v) => setDiscountMode(v as 'amount' | 'percent')}>
                  <SelectTrigger className="h-6 w-16 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">{symbol}</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
              </span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={billDiscount}
                onChange={(e) => setBillDiscount(e.target.value)}
                className="h-7 w-24 text-right tabular-nums"
                placeholder="0.00"
              />
            </div>
            {lineDiscounts > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Line discounts</span>
                <span className="tabular-nums">−{formatMoney(lineDiscounts, symbol)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax ({settings.tax_rate}%)</span>
                <span className="tabular-nums">{formatMoney(tax, symbol)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1.5 text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(grand, symbol)}</span>
            </div>
          </div>

          {/* payments */}
          <div className="space-y-2 border-t p-3">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(METHOD_META) as PaymentMethod[]).map((m) => {
                const Meta = METHOD_META[m]
                return (
                  <Button
                    key={m}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => addPayment(m)}
                    disabled={m === 'credit' && !customer}
                    title={m === 'credit' && !customer ? 'Credit needs a named customer' : `Add ${Meta.label}`}
                  >
                    <Meta.icon className="h-3.5 w-3.5" /> {Meta.label}
                  </Button>
                )
              })}
            </div>
            {payments.map((p, i) => (
              <div key={i} className="space-y-1.5 rounded-md border bg-muted/30 p-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="w-16 justify-center">{METHOD_META[p.method].label}</Badge>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={p.amount}
                    onChange={(e) => patchPayment(i, { amount: e.target.value })}
                    className="h-7 flex-1 text-right tabular-nums"
                    placeholder="0.00"
                  />
                  <button
                    onClick={() => setPayments((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {(p.method === 'card' || p.method === 'bank') && (
                  <Input
                    value={p.reference_no}
                    onChange={(e) => patchPayment(i, { reference_no: e.target.value })}
                    className="h-7 text-xs"
                    placeholder="Reference / approval no."
                  />
                )}
                {p.method === 'cheque' && (
                  <div className="grid grid-cols-3 gap-1.5">
                    <Input
                      value={p.cheque_no}
                      onChange={(e) => patchPayment(i, { cheque_no: e.target.value })}
                      className="h-7 text-xs"
                      placeholder="Cheque no *"
                    />
                    <Input
                      value={p.bank}
                      onChange={(e) => patchPayment(i, { bank: e.target.value })}
                      className="h-7 text-xs"
                      placeholder="Bank *"
                    />
                    <Input
                      type="date"
                      value={p.cheque_date}
                      onChange={(e) => patchPayment(i, { cheque_date: e.target.value })}
                      className="h-7 text-xs"
                    />
                  </div>
                )}
              </div>
            ))}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tendered</span>
              <span className="tabular-nums">{formatMoney(covered, symbol)}</span>
            </div>
            {remaining > 0.004 ? (
              <div className="flex justify-between text-sm font-semibold text-amber-600 dark:text-amber-400">
                <span>Remaining</span>
                <span className="tabular-nums">{formatMoney(remaining, symbol)}</span>
              </div>
            ) : change > 0.004 ? (
              <div className="flex justify-between text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <span>Change</span>
                <span className="tabular-nums">{formatMoney(change, symbol)}</span>
              </div>
            ) : null}
          </div>

          {/* actions */}
          <div className="space-y-2 border-t p-3">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bill note (optional)…"
              className="min-h-9 resize-none text-xs"
              rows={1}
            />
            <div className="grid grid-cols-[auto_auto_1fr] gap-2">
              <Button variant="outline" onClick={() => setHoldOpen(true)} disabled={cart.length === 0 || busy}>
                <PauseCircle className="h-4 w-4" /> Hold
              </Button>
              <Button variant="ghost" onClick={resetCart} disabled={busy || (cart.length === 0 && !note)}>
                Clear
              </Button>
              <Button onClick={doCheckout} disabled={busy || cart.length === 0} className="text-base font-semibold">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Charge {formatMoney(grand, symbol)}
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">Cashier: {cashierName}</p>
          </div>
        </div>
      </div>

      {/* hold dialog */}
      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Park this bill</DialogTitle>
            <DialogDescription>
              The cart is saved and can be recalled from the Held list — stock is not reserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="hold-note">Note (optional)</Label>
            <Input
              id="hold-note"
              value={holdNote}
              onChange={(e) => setHoldNote(e.target.value)}
              placeholder="e.g. Customer went to the ATM"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={doHold} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Park bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* recall dialog */}
      <Dialog open={recallOpen} onOpenChange={setRecallOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Held bills</DialogTitle>
            <DialogDescription>Recall a parked cart, or discard it.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {heldBills.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing on hold.</p>
            )}
            {heldBills.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    Hold #{h.hold_no} · {h.customer_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {h.line_count} line{h.line_count === 1 ? '' : 's'} · {formatMoney(h.cart_total, symbol)}
                    {h.note ? ` · ${h.note}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => recall(h)} disabled={busy || cart.length > 0}>
                  Recall
                </Button>
                <Button size="sm" variant="ghost" onClick={() => discardHeld(h)} disabled={busy}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
            {cart.length > 0 && (
              <p className="text-xs text-amber-600">Clear or hold the current cart before recalling another.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* post-sale: reprint / download via the shared bill dialog */}
      <BillDialog saleId={doneSale?.id ?? null} open={!!doneSale} onOpenChange={(v) => !v && setDoneSale(null)} />
    </div>
  )
}
