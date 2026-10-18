import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { CustomerManager } from './customer-manager'
import type { Customer } from '@/lib/types'

export const metadata = { title: 'Customers' }
export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const profile = await getProfile() // any signed-in role — cashiers manage customers
  const staff = profile.role !== 'cashier'
  const supabase = createClient()

  const [{ data: rows }, { data: bals }] = await Promise.all([
    supabase.from('customers').select('*').eq('is_deleted', false).order('name'),
    supabase.from('v_customer_balances').select('id, balance'),
  ])

  const balanceMap: Record<string, number> = {}
  ;(bals ?? []).forEach((b: any) => (balanceMap[b.id] = Number(b.balance)))

  const customers = (rows ?? []) as Customer[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Retail, wholesale and garage accounts with credit limits and balances"
      />
      <CustomerManager customers={customers} balances={balanceMap} staff={staff} />
    </div>
  )
}
