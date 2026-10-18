import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ReportsClient } from './reports-client'
import type { CashUpRow, ProductSalesSummary, Settings, StockReportRow } from '@/lib/types'

export const metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  await requireStaff()
  const supabase = createClient()

  const [
    { data: salesDaily },
    { data: profitDaily },
    { data: cashUp },
    { data: productSummary },
    { data: stock },
    { data: expenseDaily },
    { data: incomeDaily },
    { data: settingsRow },
  ] = await Promise.all([
    supabase.from('v_sales_daily').select('*'),
    supabase.from('v_profit_daily').select('*'),
    supabase.from('v_cash_up').select('*'),
    supabase.from('v_product_sales_summary').select('*'),
    supabase.from('v_stock_report').select('*'),
    supabase.from('v_expense_daily').select('*'),
    supabase.from('v_income_daily').select('*'),
    supabase.from('settings').select('currency_symbol').eq('id', 1).maybeSingle(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Sales, profit, stock valuation, daily cash-up and P&L — filter by date and export CSV"
      />
      <ReportsClient
        salesDaily={(salesDaily ?? []) as { sale_date: string; total_sales: number; total_paid: number; total_credit: number; bill_count: number }[]}
        profitDaily={(profitDaily ?? []) as { sale_date: string; revenue: number; cogs: number; gross_profit: number }[]}
        cashUp={(cashUp ?? []) as CashUpRow[]}
        productSummary={(productSummary ?? []) as ProductSalesSummary[]}
        stock={(stock ?? []) as StockReportRow[]}
        expenseDaily={(expenseDaily ?? []) as { day: string; total: number; entry_count: number }[]}
        incomeDaily={(incomeDaily ?? []) as { day: string; total: number; entry_count: number }[]}
        symbol={(settingsRow as Pick<Settings, 'currency_symbol'> | null)?.currency_symbol ?? 'Rs.'}
      />
    </div>
  )
}
