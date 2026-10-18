import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { PosClient } from './pos-client'
import type { Customer, HeldBill, ProductPOS, Settings } from '@/lib/types'

export const metadata = { title: 'POS' }
export const dynamic = 'force-dynamic'

export default async function PosPage() {
  const profile = await getProfile()
  const supabase = createClient()

  const [{ data: products }, { data: customers }, { data: settingsRow }, { data: held }] =
    await Promise.all([
      supabase
        .from('v_products_pos')
        .select('*')
        .eq('is_active', true)
        .order('name')
        .limit(2000),
      supabase
        .from('customers')
        .select('id, name, type, phone, credit_limit')
        .eq('is_deleted', false)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('settings')
        .select('currency_symbol, tax_rate, allow_negative_stock')
        .eq('id', 1)
        .maybeSingle(),
      supabase.from('v_held_bills').select('*').order('created_at', { ascending: false }),
    ])

  const settings = (settingsRow ?? {
    currency_symbol: 'Rs.',
    tax_rate: 0,
    allow_negative_stock: false,
  }) as Pick<Settings, 'currency_symbol' | 'tax_rate' | 'allow_negative_stock'>

  return (
    <div className="space-y-4">
      <PageHeader
        title="POS Terminal"
        description="Scan, tap, charge — checkout is one atomic transaction with cost snapshotting"
      />
      <PosClient
        products={(products ?? []) as ProductPOS[]}
        customers={(customers ?? []) as Pick<Customer, 'id' | 'name' | 'type' | 'phone' | 'credit_limit'>[]}
        settings={settings}
        heldBills={(held ?? []) as HeldBill[]}
        cashierName={profile.full_name || profile.email}
      />
    </div>
  )
}
