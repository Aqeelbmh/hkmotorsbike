import Link from 'next/link'
import {
  TrendingUp,
  CalendarDays,
  AlertTriangle,
  Receipt,
  ShoppingCart,
  Landmark,
  Wallet,
  PiggyBank,
} from 'lucide-react'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, toDateInputValue } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SalesProfitChart, type DailyPoint } from '@/components/dashboard-chart'
import { formatDateTime } from '@/lib/utils'
import type { SaleRow, SaleStatus, Settings } from '@/lib/types'

const STATUS_VARIANT: Record<SaleStatus, 'success' | 'warning' | 'danger' | 'secondary'> = {
  completed: 'success',
  partially_returned: 'warning',
  fully_returned: 'secondary',
  void: 'danger',
}

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

async function loadKpis(staff: boolean, symbol: string) {
  const supabase = createClient()
  const today = toDateInputValue(new Date())
  const monthStart = today.slice(0, 8) + '01'

  const out = {
    todaySales: null as number | null,
    todayBills: 0,
    monthSales: null as number | null,
    profitMonth: null as number | null,
    lowStock: 0,
    receivables: null as number | null,
    payables: null as number | null,
    expensesMonth: null as number | null,
    chequesDue: 0,
  }

  const { data: salesToday } = await supabase
    .from('sales')
    .select('grand_total, id')
    .eq('sale_date', today)
    .neq('status', 'void')
  if (salesToday) {
    out.todaySales = salesToday.reduce((a, r) => a + Number(r.grand_total), 0)
    out.todayBills = salesToday.length
  }

  const { data: salesMonth } = await supabase
    .from('sales')
    .select('grand_total')
    .gte('sale_date', monthStart)
    .neq('status', 'void')
  if (salesMonth) out.monthSales = salesMonth.reduce((a, r) => a + Number(r.grand_total), 0)

  const { data: posProducts } = await supabase
    .from('v_products_pos')
    .select('id, is_low_stock')
  if (posProducts) out.lowStock = posProducts.filter((p) => p.is_low_stock).length

  if (staff) {
    const { data: profitRows } = await supabase
      .from('v_profit_daily')
      .select('sale_date, gross_profit')
      .gte('sale_date', monthStart)
    if (profitRows) out.profitMonth = profitRows.reduce((a, r) => a + Number(r.gross_profit), 0)

    const { data: cust } = await supabase.from('v_customer_balances').select('balance')
    if (cust) out.receivables = cust.reduce((a, r) => a + Math.max(Number(r.balance), 0), 0)

    const { data: sup } = await supabase.from('v_supplier_balances').select('balance')
    if (sup) out.payables = sup.reduce((a, r) => a + Math.max(Number(r.balance), 0), 0)

    const { data: exp } = await supabase
      .from('expenses')
      .select('amount')
      .gte('expense_date', monthStart)
      .eq('is_deleted', false)
    if (exp) out.expensesMonth = exp.reduce((a, r) => a + Number(r.amount), 0)

    const weekEnd = toDateInputValue(new Date(Date.now() + 7 * 864e5))
    const { count } = await supabase
      .from('cheques')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'received')
      .eq('status', 'pending')
      .lte('cheque_date', weekEnd)
    if (count) out.chequesDue = count
  }
  void symbol
  return out
}

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  restricted,
}: {
  title: string
  value: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'good' | 'warn' | 'bad'
  restricted?: boolean
}) {
  const toneCls = {
    default: 'text-foreground',
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-red-600 dark:text-red-400',
  }[tone]
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${toneCls}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tabular-nums ${toneCls}`}>
          {restricted ? '—' : value}
        </div>
        {hint && !restricted && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
        {restricted && <p className="mt-0.5 text-xs text-muted-foreground">Staff only</p>}
      </CardContent>
    </Card>
  )
}

export default async function DashboardPage() {
  const profile = await getProfile()
  const staff = profile.role !== 'cashier'

  const supabase = createClient()
  const { data: row } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
  const settings = (row ?? { currency_symbol: 'Rs.', shop_name: 'H.K Motors Bike' }) as Settings
  const symbol = settings.currency_symbol || 'Rs.'

  const k = await loadKpis(staff, symbol)

  // Last-30-days chart series + latest bills for the activity feed.
  const rangeStart = toDateInputValue(new Date(Date.now() - 29 * 864e5))
  const [{ data: salesDaily }, { data: profitDaily }, { data: recentBills }] = await Promise.all([
    supabase.from('v_sales_daily').select('*').gte('sale_date', rangeStart).order('sale_date'),
    staff
      ? supabase.from('v_profit_daily').select('sale_date, gross_profit').gte('sale_date', rangeStart)
      : Promise.resolve({ data: null }),
    supabase
      .from('v_sales_list')
      .select('id, bill_no, customer_name, sold_at, grand_total, balance_amount, status')
      .order('sold_at', { ascending: false })
      .limit(6),
  ])

  const profitByDate = new Map((profitDaily ?? []).map((r) => [r.sale_date as string, Number(r.gross_profit)]))
  const series: DailyPoint[] = (salesDaily ?? []).map((r) => ({
    date: r.sale_date as string,
    sales: Number(r.total_sales),
    profit: staff ? profitByDate.get(r.sale_date as string) ?? 0 : null,
  }))
  const bills = (recentBills ?? []) as Pick<
    SaleRow,
    'id' | 'bill_no' | 'customer_name' | 'sold_at' | 'grand_total' | 'balance_amount' | 'status'
  >[]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {profile.full_name.split(' ')[0] || profile.email}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-LK', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Button asChild>
          <Link href="/pos">
            <ShoppingCart className="h-4 w-4" /> Open POS
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <KpiCard
          title="Today's Sales"
          value={formatMoney(k.todaySales ?? 0, symbol)}
          hint={`${k.todayBills} bill${k.todayBills === 1 ? '' : 's'} today`}
          icon={TrendingUp}
          tone="good"
        />
        <KpiCard
          title="Month to Date"
          value={formatMoney(k.monthSales ?? 0, symbol)}
          hint="All non-void bills"
          icon={CalendarDays}
        />
        <KpiCard
          title="Gross Profit (MTD)"
          value={formatMoney(k.profitMonth ?? 0, symbol)}
          hint="Revenue − COGS from bill snapshots"
          icon={PiggyBank}
          tone="good"
          restricted={!staff}
        />
        <KpiCard
          title="Expenses (MTD)"
          value={formatMoney(k.expensesMonth ?? 0, symbol)}
          icon={Wallet}
          tone="warn"
          restricted={!staff}
        />
        <KpiCard
          title="Receivables"
          value={formatMoney(k.receivables ?? 0, symbol)}
          hint="Owed by customers"
          icon={Receipt}
          restricted={!staff}
        />
        <KpiCard
          title="Payables"
          value={formatMoney(k.payables ?? 0, symbol)}
          hint="Owed to suppliers"
          icon={Receipt}
          tone="bad"
          restricted={!staff}
        />
        <KpiCard
          title="Low Stock Items"
          value={String(k.lowStock)}
          hint="At or below reorder level"
          icon={AlertTriangle}
          tone={k.lowStock > 0 ? 'warn' : 'good'}
        />
        <KpiCard
          title="Cheques Due (7 days)"
          value={String(k.chequesDue)}
          hint="Received & pending"
          icon={Landmark}
          restricted={!staff}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sales{staff ? ' vs profit' : ''} — last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesProfitChart data={series} symbol={symbol} showProfit={staff} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent bills</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sales">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {bills.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {b.bill_no} <span className="font-normal text-muted-foreground">· {b.customer_name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatDateTime(b.sold_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatMoney(b.grand_total, symbol)}</p>
                    <div className="mt-0.5 flex justify-end gap-1">
                      <Badge variant={STATUS_VARIANT[b.status]}>{b.status.replace('_', ' ')}</Badge>
                      {Number(b.balance_amount) > 0 && b.status !== 'void' && (
                        <Badge variant="warning">credit</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {bills.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No bills yet — open the POS to make the first sale.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
