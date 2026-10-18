'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { productSchema, productImportRowSchema } from '@/lib/validators'
import { generateBarcode } from '@/lib/utils'

function toRow(d: any) {
  return {
    name: d.name,
    sku: d.sku,
    barcode: d.barcode?.trim() ? d.barcode.trim() : generateBarcode(),
    category_id: d.category_id || null,
    brand: d.brand || null,
    unit: d.unit || 'pcs',
    vehicle_make: d.vehicle_make || null,
    vehicle_model: d.vehicle_model || null,
    vehicle_year_from: d.vehicle_year_from || null,
    vehicle_year_to: d.vehicle_year_to || null,
    rack_location: d.rack_location || null,
    cost_price: d.cost_price,
    selling_price: d.selling_price,
    wholesale_price: d.wholesale_price ?? null,
    reorder_level: d.reorder_level ?? 5,
    image_url: d.image_url || null,
    description: d.description || null,
    is_active: d.is_active,
  }
}

export async function createProduct(input: unknown) {
  await requireStaff()
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('products')
    .insert(toRow(parsed.data))
    .select('id')
    .single()

  if (error) return { error: friendlyDbError(error) }
  revalidatePath('/products')
  return { id: data.id as string }
}

export async function updateProduct(id: string, input: unknown) {
  await requireStaff()
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = createClient()
  const { error } = await supabase.from('products').update(toRow(parsed.data)).eq('id', id)
  if (error) return { error: friendlyDbError(error) }
  revalidatePath('/products')
  return { ok: true }
}

export async function deleteProduct(id: string) {
  await requireStaff()
  const supabase = createClient()
  const { error } = await supabase
    .from('products')
    .update({ is_deleted: true, is_active: false })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/products')
  return { ok: true }
}

export async function restoreProduct(id: string) {
  await requireStaff()
  const supabase = createClient()
  const { error } = await supabase.from('products').update({ is_deleted: false }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/products')
  return { ok: true }
}

/** Bulk CSV import. rows = raw CSV objects (already stringified). */
export async function importProducts(
  rows: Record<string, string>[],
  mode: 'skip' | 'update'
): Promise<{ inserted: number; updated: number; errors: { row: number; message: string }[] }> {
  await requireStaff()
  const supabase = createClient()

  // category lookup: name or slug (case-insensitive)
  const { data: cats } = await supabase.from('categories').select('id, name, slug')
  const catMap = new Map<string, string>()
  ;(cats ?? []).forEach((c: any) => {
    catMap.set(c.name.toLowerCase(), c.id)
    catMap.set(c.slug.toLowerCase(), c.id)
  })

  const errors: { row: number; message: string }[] = []
  let inserted = 0
  let updated = 0

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const parsed = productImportRowSchema.safeParse({
      name: raw.name ?? raw['product name'] ?? '',
      sku: raw.sku ?? '',
      barcode: raw.barcode || undefined,
      category: raw.category ?? raw.category_name ?? '',
      brand: raw.brand || undefined,
      unit: raw.unit || undefined,
      vehicle_make: raw.vehicle_make || undefined,
      vehicle_model: raw.vehicle_model || undefined,
      rack_location: raw.rack_location || undefined,
      cost_price: raw.cost_price ?? '0',
      selling_price: raw.selling_price ?? '',
      wholesale_price: raw.wholesale_price || undefined,
      reorder_level: raw.reorder_level || undefined,
    })
    if (!parsed.success) {
      errors.push({ row: i + 2, message: parsed.error.issues[0]?.message ?? 'Invalid row' })
      continue
    }
    const d = parsed.data
    let categoryId: string | null = null
    if (d.category) {
      categoryId = catMap.get(d.category.toLowerCase()) ?? null
      if (!categoryId) {
        errors.push({ row: i + 2, message: `Unknown category “${d.category}”` })
        continue
      }
    }
    const payload = toRow({
      ...d,
      category_id: categoryId,
      is_active: true,
      vehicle_year_from: null,
      vehicle_year_to: null,
      image_url: '',
      description: '',
    })

    if (mode === 'update') {
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('sku', d.sku)
        .maybeSingle()
      if (existing) {
        const { error } = await supabase
          .from('products')
          .update({ ...payload, is_deleted: false })
          .eq('id', existing.id)
        if (error) errors.push({ row: i + 2, message: friendlyDbError(error) })
        else updated++
        continue
      }
    }

    const { error } = await supabase.from('products').insert(payload)
    if (error) errors.push({ row: i + 2, message: friendlyDbError(error) })
    else inserted++
  }

  revalidatePath('/products')
  return { inserted, updated, errors }
}

function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    if (error.message.includes('sku')) return 'SKU already exists'
    if (error.message.includes('barcode')) return 'Barcode already exists'
    return 'Duplicate value'
  }
  return error.message
}
