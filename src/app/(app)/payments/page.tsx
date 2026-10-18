import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { PaymentsClient } from './payments-client'
import type { Customer, PaymentRow, SaleRow, Settings, Supplier } from '@/lib/types'

export const metadata = { title: 'Payments' }
export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
  const profile = await getProfile()
  const staff = profile.role !== 'cashier'
  const supabase = createClient()

  const [{ data: payments }, { data: customers }, { data: suppliers }, { data: openBills }, { data: settingsRow }] =
    await Promise.all([
      supabase.from('v_payments_detail').select('*').order('paid_at', { ascending: false }).limit(1000),
      supabase.from('customers').select('id, name').eq('is_deleted', false).order('name'),
      staff
        ? supabase.from('suppliers').select('id, name').eq('is_deleted', false).order('name')
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('v_sales_list')
        .select('id, bill_no, customer_id, balance_amount')
        .gt('balance_amount', 0)
        .order('sale_date', { ascending: false }),
      supabase.from('settings').select('currency_symbol').eq('id', 1).maybeSingle(),
    ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Receipts from customers and payments to suppliers — including on-account settlements"
      />
      <PaymentsClient
        payments={(payments ?? []) as PaymentRow[]}
        customers={(customers ?? []) as Pick<Customer, 'id' | 'name'>[]}
        suppliers={(suppliers ?? []) as Pick<Supplier, 'id' | 'name'>[]}
        openBills={(openBills ?? []) as Pick<SaleRow, 'id' | 'bill_no' | 'customer_id' | 'balance_amount'>[]}
        symbol={(settingsRow as Pick<Settings, 'currency_symbol'> | null)?.currency_symbol ?? 'Rs.'}
        staff={staff}
      />
    </div>
  )
}
