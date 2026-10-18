import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ExpensesClient } from './expenses-client'
import type { ExpenseCategory, ExpenseRow, IncomeRow, Settings } from '@/lib/types'

export const metadata = { title: 'Expenses & Income' }
export const dynamic = 'force-dynamic'

export default async function ExpensesPage() {
  await requireStaff()
  const supabase = createClient()

  const [{ data: expenses }, { data: income }, { data: categories }, { data: settingsRow }] =
    await Promise.all([
      supabase.from('v_expenses_detail').select('*').order('expense_date', { ascending: false }).limit(1000),
      supabase.from('v_income_list').select('*').order('income_date', { ascending: false }).limit(1000),
      supabase.from('expense_categories').select('id, name, sort_order').order('sort_order').order('name'),
      supabase.from('settings').select('currency_symbol').eq('id', 1).maybeSingle(),
    ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses & Income"
        description="Overheads, recurring bills and other income — feeds the P&L report"
      />
      <ExpensesClient
        expenses={(expenses ?? []) as ExpenseRow[]}
        income={(income ?? []) as IncomeRow[]}
        categories={(categories ?? []) as ExpenseCategory[]}
        symbol={(settingsRow as Pick<Settings, 'currency_symbol'> | null)?.currency_symbol ?? 'Rs.'}
      />
    </div>
  )
}
