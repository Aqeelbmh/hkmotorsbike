import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LabelSheet } from './label-sheet'

export const metadata = { title: 'Print Labels' }
export const dynamic = 'force-dynamic'

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: { ids?: string }
}) {
  await getProfile() // any role: labels only contain name/price/barcode — never cost
  const ids = (searchParams.ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const supabase = createClient()
  let data: any[] = []
  if (ids.length > 0) {
    const { data: rows } = await supabase
      .from('v_products_pos')
      .select('id, name, sku, barcode, selling_price')
      .in('id', ids.slice(0, 200))
    data = rows ?? []
  }
  // preserve selection order
  data = ids.map((id) => data.find((d) => d.id === id)).filter(Boolean)

  return <LabelSheet products={data} />
}
