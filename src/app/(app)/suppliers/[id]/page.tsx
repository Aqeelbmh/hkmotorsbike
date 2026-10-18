import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, CreditCard, Phone, Mail, MapPin, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMoney, formatDate } from '@/lib/utils'
import { StatementPdfButton } from '@/components/statement-pdf-button'
import type { StatementRow } from '@/lib/pdf'
import type { Supplier } from '@/lib/types'

export const metadata = { title: 'Supplier' }
export const dynamic = 'force-dynamic'

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  await requireStaff()
  const supabase = createClient()

  const [{ data: sup }, { data: settings }, { data: purchases }, { data: payments }, { data: returns }] =
    await Promise.all([
      supabase.from('suppliers').select('*').eq('id', params.id).maybeSingle(),
      supabase.from('settings').select('shop_name, address, phone, currency_symbol').eq('id', 1).maybeSingle(),
      supabase
        .from('purchases')
        .select('id, purchase_no, supplier_invoice_no, purchase_date, total, paid_amount, is_deleted')
        .eq('supplier_id', params.id)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('payments')
        .select('id, reference_no, method, amount, paid_at, purchase_id, note, is_deleted')
        .eq('supplier_id', params.id)
        .eq('direction', 'out')
        .order('paid_at', { ascending: false }),
      supabase
        .from('returns')
        .select('id, return_no, return_date, total, restock, refund_method, credit_note, original_id')
        .eq('kind', 'purchase')
        .eq('is_deleted', false)
        .order('return_date', { ascending: false }),
    ])

  const supplier = sup as Supplier | null
  if (!supplier || supplier.is_deleted) notFound()

  // returns.original_id has no FK constraint, so match purchase returns in code.
  const purchaseIds = new Set((purchases ?? []).map((p: any) => p.id))
  const purchaseReturns = ((returns ?? []) as any[]).filter((r) => purchaseIds.has(r.original_id))

  // Chronological ledger: purchases add to what we owe, payments and returns reduce it.
  const txns: (StatementRow & { id: string })[] = [
    ...(purchases ?? [])
      .filter((p: any) => !p.is_deleted)
      .map((p: any) => ({
        id: p.id,
        date: p.purchase_date,
        reference: p.purchase_no,
        description: `Purchase${p.supplier_invoice_no ? ` (inv ${p.supplier_invoice_no})` : ''}`,
        debit: Number(p.total),
        credit: 0,
      })),
    ...(payments ?? [])
      .filter((p: any) => !p.is_deleted)
      .map((p: any) => ({
        id: p.id,
        date: String(p.paid_at).slice(0, 10),
        reference: p.reference_no || p.method.toUpperCase(),
        description: `Payment — ${p.method}${p.note ? ` (${p.note})` : ''}`,
        debit: 0,
        credit: Number(p.amount),
      })),
    ...purchaseReturns.map((r: any) => ({
      id: r.id,
      date: r.return_date,
      reference: r.return_no,
      description: `Purchase return${r.credit_note ? ' (credit note)' : ''}`,
      debit: 0,
      credit: Number(r.total),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference))

  let running = supplier.opening_balance
  const ledger = txns.map((t) => {
    running += t.debit - t.credit
    return { ...t, balance: running }
  })
  const balanceOwed = running

  const shop = {
    name: settings?.shop_name ?? 'H.K Motors Bike',
    address: settings?.address ?? '',
    phone: settings?.phone ?? '',
    currencySymbol: settings?.currency_symbol ?? 'Rs.',
  }

  const activePurchases = (purchases ?? []).filter((p: any) => !p.is_deleted)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/suppliers" title="Back to suppliers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <PageHeader
            title={supplier.name}
            description={supplier.contact_person ? `Contact: ${supplier.contact_person}` : 'Supplier account'}
          />
        </div>
        <StatementPdfButton
          title="Supplier Statement"
          partyName={supplier.name}
          partyMeta={[
            supplier.phone ? `Phone: ${supplier.phone}` : '',
            supplier.address ? `Address: ${supplier.address}` : '',
            supplier.credit_terms_days > 0 ? `Credit terms: Net ${supplier.credit_terms_days} days` : 'Credit terms: COD',
            supplier.tax_number ? `Tax no: ${supplier.tax_number}` : '',
          ].filter(Boolean)}
          rows={txns}
          openingBalance={supplier.opening_balance}
          shop={shop}
          filename={`statement-supplier-${supplier.name.replace(/\s+/g, '-')}.pdf`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Balance we owe</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={
                balanceOwed > 0.004
                  ? 'text-3xl font-bold tabular-nums text-red-600 dark:text-red-400'
                  : balanceOwed < -0.004
                    ? 'text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400'
                    : 'text-3xl font-bold tabular-nums'
              }
            >
              {formatMoney(Math.abs(balanceOwed), shop.currencySymbol)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {balanceOwed > 0.004
                ? 'Outstanding payable'
                : balanceOwed < -0.004
                  ? 'Advance paid / supplier credit'
                  : 'Fully settled'}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Contact &amp; terms</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <p className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" /> {supplier.phone || '—'}
            </p>
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" /> {supplier.email || '—'}
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" /> {supplier.address || '—'}
            </p>
            <p className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> Tax: {supplier.tax_number || '—'}
            </p>
            <p className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              {supplier.credit_terms_days > 0 ? `Net ${supplier.credit_terms_days} days` : 'Cash on delivery'}
            </p>
            <p className="flex items-center gap-2">
              {!supplier.is_active && <Badge variant="warning">Inactive</Badge>}
              {supplier.notes && <span className="line-clamp-2 text-muted-foreground">{supplier.notes}</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Purchases ({activePurchases.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {activePurchases.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No purchases recorded yet. Purchase entries arrive with Phase 3.
              </p>
            ) : (
              <div className="divide-y">
                {activePurchases.slice(0, 8).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium">{p.purchase_no}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.purchase_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{formatMoney(p.total, shop.currencySymbol)}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        paid {formatMoney(p.paid_amount, shop.currencySymbol)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Account ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Ref</th>
                    <th className="px-2 py-2 font-medium">Description</th>
                    <th className="px-2 py-2 text-right font-medium">Debit</th>
                    <th className="px-2 py-2 text-right font-medium">Credit</th>
                    <th className="px-2 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-2 py-2 text-muted-foreground" colSpan={3}>
                      Opening balance
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {supplier.opening_balance > 0 ? formatMoney(supplier.opening_balance, shop.currencySymbol) : ''}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {supplier.opening_balance < 0 ? formatMoney(-supplier.opening_balance, shop.currencySymbol) : ''}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(supplier.opening_balance, shop.currencySymbol)}
                    </td>
                  </tr>
                  {ledger.slice(-40).map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{formatDate(t.date)}</td>
                      <td className="whitespace-nowrap px-2 py-2">{t.reference}</td>
                      <td className="px-2 py-2">{t.description}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {t.debit ? formatMoney(t.debit, shop.currencySymbol) : ''}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {t.credit ? formatMoney(t.credit, shop.currencySymbol) : ''}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {formatMoney(t.balance, shop.currencySymbol)}
                      </td>
                    </tr>
                  ))}
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                        No transactions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
