import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { formatMoney, formatDate, formatDateTime } from '@/lib/utils'
import { PurchaseActions } from './purchase-actions'
import type { Purchase, PurchaseItem } from '@/lib/types'

export const metadata = { title: 'Purchase' }
export const dynamic = 'force-dynamic'

export default async function PurchaseDetailPage({ params }: { params: { id: string } }) {
  await requireStaff()
  const supabase = createClient()

  const [{ data: pur }, { data: items }, { data: payments }, { data: returns }, { data: settings }, { data: bals }] =
    await Promise.all([
      supabase
        .from('purchases')
        .select('id, purchase_no, supplier_id, supplier_invoice_no, purchase_date, subtotal, discount, tax_amount, total, paid_amount, notes, created_by, created_at, is_deleted, suppliers(id, name, phone, address, credit_terms_days)')
        .eq('id', params.id)
        .maybeSingle(),
      supabase
        .from('v_purchase_items_detail')
        .select('id, purchase_id, product_id, sku, product_name, unit, rack_location, quantity, unit_cost, line_total')
        .eq('purchase_id', params.id)
        .order('product_name'),
      supabase
        .from('payments')
        .select('id, method, amount, reference_no, note, paid_at, cheque_id, is_deleted, cheques(status, cheque_no, bank)')
        .eq('purchase_id', params.id)
        .order('paid_at'),
      supabase
        .from('returns')
        .select('id, return_no, return_date, total, refund_method, credit_note, reason')
        .eq('kind', 'purchase')
        .eq('original_id', params.id)
        .eq('is_deleted', false)
        .order('return_date'),
      supabase
        .from('settings')
        .select('shop_name, address, phone, currency_symbol')
        .eq('id', 1)
        .maybeSingle(),
      supabase.from('v_supplier_balances').select('id, balance'),
    ])

  const purchase = pur as (Purchase & { suppliers: any } | null)
  if (!purchase || purchase.is_deleted) notFound()

  const supplier = purchase.suppliers ?? { id: null, name: 'Unknown supplier' }
  const lines = (items ?? []) as PurchaseItem[]
  const txns = (payments ?? []).filter((p: any) => !p.is_deleted)
  const returnRows = (returns ?? []) as any[]

  const balance = Number(purchase.total) - Number(purchase.paid_amount)
  const supplierBalance = Number(
    ((bals ?? []) as any[]).find((b) => b.id === purchase.supplier_id)?.balance ?? 0
  )

  const shop = {
    name: settings?.shop_name ?? 'H.K Motors Bike',
    address: settings?.address ?? '',
    phone: settings?.phone ?? '',
    currencySymbol: settings?.currency_symbol ?? 'Rs.',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 print-hidden">
          <Link href="/purchases" title="Back to purchases">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <PageHeader
            title={purchase.purchase_no}
            description={`Goods received ${formatDate(purchase.purchase_date)}${
              purchase.supplier_invoice_no ? ` · supplier invoice ${purchase.supplier_invoice_no}` : ''
            }`}
          />
        </div>
        <div className="print-hidden">
          <PurchaseActions
            purchaseId={purchase.id}
            purchaseNo={purchase.purchase_no}
            supplierId={purchase.supplier_id}
            outstanding={balance}
            shop={shop}
            lines={lines.map((l) => ({
              id: l.id,
              product_id: l.product_id,
              sku: l.sku,
              product_name: l.product_name,
              unit: l.unit,
              quantity: Number(l.quantity),
              unit_cost: Number(l.unit_cost),
              line_total: Number(l.line_total),
            }))}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Order total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatMoney(purchase.total, shop.currencySymbol)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lines.length} line{lines.length === 1 ? '' : 's'} · gross {formatMoney(purchase.subtotal, shop.currencySymbol)}
              {Number(purchase.discount) > 0 ? ` · discount ${formatMoney(purchase.discount, shop.currencySymbol)}` : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatMoney(purchase.paid_amount, shop.currencySymbol)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {txns.length} payment{txns.length === 1 ? '' : 's'} recorded
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This order balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={
                balance > 0.004
                  ? 'text-2xl font-bold tabular-nums text-red-600 dark:text-red-400'
                  : 'text-2xl font-bold tabular-nums'
              }
            >
              {formatMoney(Math.max(balance, 0), shop.currencySymbol)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {balance <= 0.004 ? 'Settled in full' : 'Unpaid against this PO'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Supplier account</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={
                supplierBalance > 0.004
                  ? 'text-2xl font-bold tabular-nums text-red-600 dark:text-red-400'
                  : 'text-2xl font-bold tabular-nums'
              }
            >
              {formatMoney(Math.abs(supplierBalance), shop.currencySymbol)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Total payable to {supplier.name}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 print-area">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {shop.name} — Goods Received Note
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground print-only">
                  {shop.address} · {shop.phone}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold tabular-nums">{purchase.purchase_no}</p>
                <p className="text-xs text-muted-foreground">{formatDate(purchase.purchase_date)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Supplier: <span className="font-medium text-foreground">{supplier.name}</span>
              {purchase.supplier_invoice_no ? ` · invoice ${purchase.supplier_invoice_no}` : ''}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 font-medium">SKU</th>
                    <th className="py-2 font-medium">Product</th>
                    <th className="py-2 font-medium">Rack</th>
                    <th className="py-2 text-right font-medium">Qty</th>
                    <th className="py-2 text-right font-medium">Unit cost</th>
                    <th className="py-2 text-right font-medium">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 font-mono text-xs">{l.sku}</td>
                      <td className="py-2">
                        <p>{l.product_name}</p>
                        <p className="text-xs text-muted-foreground">{l.unit}</p>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">{l.rack_location ?? '—'}</td>
                      <td className="py-2 text-right tabular-nums">{Number(l.quantity)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(l.unit_cost, shop.currencySymbol)}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {formatMoney(l.line_total, shop.currencySymbol)}
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        No items on this purchase.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={5} className="py-2 text-right text-muted-foreground">
                      Subtotal
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(purchase.subtotal, shop.currencySymbol)}
                    </td>
                  </tr>
                  {Number(purchase.discount) > 0 && (
                    <tr>
                      <td colSpan={5} className="py-1 text-right text-muted-foreground">
                        Discount
                      </td>
                      <td className="py-1 text-right tabular-nums text-muted-foreground">
                        −{formatMoney(purchase.discount, shop.currencySymbol)}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t font-semibold">
                    <td colSpan={5} className="py-2 text-right">Total payable</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(purchase.total, shop.currencySymbol)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="py-1 text-right text-muted-foreground">Paid</td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">
                      {formatMoney(purchase.paid_amount, shop.currencySymbol)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="py-1 text-right font-semibold">Balance</td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {formatMoney(balance, shop.currencySymbol)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {purchase.notes && (
              <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm">
                <span className="font-medium">Note: </span>
                {purchase.notes}
              </p>
            )}

            <div className="mt-6 hidden print-only justify-between text-xs">
              <span>Received by: ______________________</span>
              <span>Supplier rep: ______________________</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Payments ({txns.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {txns.length === 0 && (
                <p className="py-3 text-center text-muted-foreground">Nothing paid yet.</p>
              )}
              {txns.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0">
                  <div className="min-w-0">
                    <p className="font-medium capitalize">
                      {p.method}
                      {p.reference_no ? ` · ${p.reference_no}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(p.paid_at)}</p>
                    {p.cheques && (
                      <Badge
                        className="mt-1"
                        variant={
                          p.cheques.status === 'cleared'
                            ? 'success'
                            : p.cheques.status === 'pending'
                              ? 'secondary'
                              : 'danger'
                        }
                      >
                        {p.cheques.cheque_no} · {p.cheques.status}
                      </Badge>
                    )}
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatMoney(p.amount, shop.currencySymbol)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Returns to supplier ({returnRows.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {returnRows.length === 0 && (
                <p className="py-3 text-center text-muted-foreground">No goods sent back.</p>
              )}
              {returnRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0">
                  <div>
                    <p className="font-medium">{r.return_no}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.return_date)} ·{' '}
                      {r.credit_note ? 'credit note' : `refunded ${r.refund_method}`}
                    </p>
                    {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    −{formatMoney(r.total, shop.currencySymbol)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
