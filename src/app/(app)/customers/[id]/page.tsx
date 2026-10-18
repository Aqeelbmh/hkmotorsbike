import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Phone, Mail, MapPin, Car, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatMoney, formatDate } from '@/lib/utils'
import { StatementPdfButton } from '@/components/statement-pdf-button'
import type { StatementRow } from '@/lib/pdf'
import type { Customer } from '@/lib/types'

export const metadata = { title: 'Customer' }
export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  partially_returned: 'Part. returned',
  fully_returned: 'Returned',
  void: 'Void',
}

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const profile = await getProfile() // cashiers may view customer accounts
  const staff = profile.role !== 'cashier'
  const supabase = createClient()

  const [{ data: cus }, { data: settings }, { data: sales }, { data: payments }, { data: returns }] =
    await Promise.all([
      supabase.from('customers').select('*').eq('id', params.id).maybeSingle(),
      supabase.from('settings').select('shop_name, address, phone, currency_symbol').eq('id', 1).maybeSingle(),
      supabase
        .from('sales')
        .select('id, bill_no, sale_date, status, grand_total, paid_amount, balance_amount')
        .eq('customer_id', params.id)
        .neq('status', 'void')
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('payments')
        .select('id, reference_no, method, amount, paid_at, sale_id, direction, note, is_deleted')
        .eq('customer_id', params.id)
        .order('paid_at', { ascending: false }),
      supabase
        .from('returns')
        .select('id, return_no, return_date, total, credit_note, refund_method, original_id')
        .eq('kind', 'sale')
        .eq('is_deleted', false)
        .order('return_date', { ascending: false }),
    ])

  const customer = cus as Customer | null
  if (!customer || customer.is_deleted) notFound()

  // returns.original_id has no FK constraint, so match sale returns in code.
  const saleIds = new Set((sales ?? []).map((s: any) => s.id))
  const creditNoteReturns = ((returns ?? []) as any[]).filter(
    (r) => r.credit_note && saleIds.has(r.original_id)
  )

  // Ledger mirrors v_customer_balances: invoices add their unpaid amount,
  // payments (any allocation) reduce it, refunds and credit notes reduce it.
  const txns: (StatementRow & { id: string })[] = [
    ...(sales ?? []).map((s: any) => ({
      id: s.id,
      date: s.sale_date,
      reference: s.bill_no,
      description: `Sale${Number(s.balance_amount) > 0 ? ' (on credit)' : ''}`,
      debit: Number(s.grand_total),
      credit: Number(s.grand_total) - Number(s.balance_amount),
    })),
    ...(payments ?? [])
      .filter((p: any) => !p.is_deleted && p.sale_id === null && p.method !== 'credit')
      .map((p: any) => ({
        id: p.id,
        date: String(p.paid_at).slice(0, 10),
        reference: p.reference_no || p.method.toUpperCase(),
        description: `${p.direction === 'in' ? 'Payment received' : 'Refund paid'}${p.note ? ` (${p.note})` : ''}`,
        debit: p.direction === 'out' ? Number(p.amount) : 0,
        credit: p.direction === 'in' ? Number(p.amount) : 0,
      })),
    ...creditNoteReturns.map((r: any) => ({
      id: r.id,
      date: r.return_date,
      reference: r.return_no,
      description: 'Sale return (credit note)',
      debit: 0,
      credit: Number(r.total),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference))

  let running = customer.opening_balance
  const ledger = txns.map((t) => {
    running += t.debit - t.credit
    return { ...t, balance: running }
  })
  const balance = running
  const limit = customer.credit_limit
  const utilization = limit > 0 ? Math.min(Math.max(balance / limit, 0) * 100, 100) : 0

  const shop = {
    name: settings?.shop_name ?? 'H.K Motors Bike',
    address: settings?.address ?? '',
    phone: settings?.phone ?? '',
    currencySymbol: settings?.currency_symbol ?? 'Rs.',
  }

  const activeSales = (sales ?? []).filter((s: any) => s.status !== 'void')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/customers" title="Back to customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <PageHeader
            title={customer.name}
            description={`Account type: ${customer.type}`}
          />
        </div>
        <StatementPdfButton
          title="Customer Statement"
          partyName={customer.name}
          partyMeta={[
            customer.phone ? `Phone: ${customer.phone}` : '',
            customer.address ? `Address: ${customer.address}` : '',
            limit > 0 ? `Credit limit: ${formatMoney(limit, shop.currencySymbol)}` : '',
            customer.nic ? `NIC: ${customer.nic}` : '',
          ].filter(Boolean)}
          rows={txns}
          openingBalance={customer.opening_balance}
          shop={shop}
          filename={`statement-customer-${customer.name.replace(/\s+/g, '-')}.pdf`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Owes you</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={
                balance > 0.004
                  ? 'text-3xl font-bold tabular-nums text-red-600 dark:text-red-400'
                  : balance < -0.004
                    ? 'text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400'
                    : 'text-3xl font-bold tabular-nums'
              }
            >
              {formatMoney(Math.abs(balance), shop.currencySymbol)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {balance > 0.004
                ? 'Outstanding receivable'
                : balance < -0.004
                  ? 'Advance / account credit'
                  : 'Fully settled'}
            </p>
            {staff && limit > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" /> Credit limit used
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(limit, shop.currencySymbol)} · {utilization.toFixed(0)}%
                  </span>
                </div>
                <Progress
                  value={utilization}
                  className={utilization > 85 ? 'bg-red-500/20 [&>div]:bg-red-500' : undefined}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Contact &amp; account</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <p className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" /> {customer.phone || '—'}
            </p>
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" /> {customer.email || '—'}
            </p>
            <p className="flex items-center gap-2 sm:col-span-2">
              <MapPin className="h-4 w-4 text-muted-foreground" /> {customer.address || '—'}
            </p>
            <p className="flex items-start gap-2 sm:col-span-2">
              <Car className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className={customer.vehicle_notes ? '' : 'text-muted-foreground'}>
                {customer.vehicle_notes || 'No vehicle notes'}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <Badge variant={customer.type === 'garage' ? 'outline' : customer.type === 'wholesale' ? 'info' : 'secondary'}>
                {customer.type}
              </Badge>
              {!customer.is_active && <Badge variant="warning">Inactive</Badge>}
            </p>
            {staff && (
              <p className="text-muted-foreground">
                {customer.nic ? `NIC: ${customer.nic}` : ''}
              </p>
            )}
            {customer.notes && (
              <p className="text-muted-foreground sm:col-span-2">{customer.notes}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Purchase history ({activeSales.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {activeSales.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No sales recorded for this customer yet.
              </p>
            ) : (
              <div className="divide-y">
                {activeSales.slice(0, 8).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium">{s.bill_no}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(s.sale_date)} · {STATUS_LABEL[s.status] ?? s.status}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">
                        {formatMoney(s.grand_total, shop.currencySymbol)}
                      </p>
                      {Number(s.balance_amount) > 0.004 && (
                        <p className="text-xs tabular-nums text-red-600 dark:text-red-400">
                          due {formatMoney(s.balance_amount, shop.currencySymbol)}
                        </p>
                      )}
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
                      {customer.opening_balance > 0 ? formatMoney(customer.opening_balance, shop.currencySymbol) : ''}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {customer.opening_balance < 0 ? formatMoney(-customer.opening_balance, shop.currencySymbol) : ''}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(customer.opening_balance, shop.currencySymbol)}
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
