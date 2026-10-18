import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { CategoryManager } from './category-manager'
import type { Category } from '@/lib/types'

export const metadata = { title: 'Categories' }
export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  await requireStaff()
  const supabase = createClient()

  const [{ data: cats }, { data: counts }] = await Promise.all([
    supabase.from('categories').select('*').eq('is_deleted', false).order('sort_order'),
    supabase.from('v_category_product_counts').select('category_id, product_count'),
  ])

  const categories = (cats ?? []) as Category[]
  const countMap: Record<string, number> = {}
  ;(counts ?? []).forEach((r: any) => (countMap[r.category_id] = Number(r.product_count)))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Nested catalogue tree used by products and the POS"
      />
      <CategoryManager categories={categories} counts={countMap} />
    </div>
  )
}
