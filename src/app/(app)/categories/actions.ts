'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { categorySchema, firstZodMessage } from '@/lib/validators'

function slugify(name: string, suffix = '') {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return suffix ? `${base}-${suffix}` : base
}

export async function createCategory(input: unknown) {
  await requireStaff()
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) return { error: firstZodMessage(parsed.error) }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('categories')
    .insert({
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
      parent_id: parsed.data.parent_id ?? null,
      description: parsed.data.description || null,
      sort_order: parsed.data.sort_order,
      is_active: parsed.data.is_active,
    })
    .select('id')
    .single()

  if (error) {
    return {
      error:
        error.code === '23505'
          ? 'A category with this name already exists'
          : error.message,
    }
  }
  revalidatePath('/categories')
  return { id: data.id as string }
}

export async function updateCategory(id: string, input: unknown) {
  await requireStaff()
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) return { error: firstZodMessage(parsed.error) }

  // prevent making a parent of itself / descendant loop
  if (parsed.data.parent_id === id) return { error: 'A category cannot be its own parent' }
  const supabase = createClient()
  const { error } = await supabase
    .from('categories')
    .update({
      name: parsed.data.name,
      slug: slugify(parsed.data.name, id.slice(0, 4)),
      parent_id: parsed.data.parent_id ?? null,
      description: parsed.data.description || null,
      sort_order: parsed.data.sort_order,
      is_active: parsed.data.is_active,
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/categories')
  revalidatePath('/products')
  return { ok: true }
}

export async function deleteCategory(id: string) {
  await requireStaff()
  const supabase = createClient()

  const { count: children } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id)
    .eq('is_deleted', false)
  if (children && children > 0)
    return { error: 'Move or delete sub-categories first' }

  const { count: products } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
    .eq('is_deleted', false)
  if (products && products > 0)
    return { error: `This category still has ${products} product(s)` }

  const { error } = await supabase.from('categories').update({ is_deleted: true, is_active: false }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/categories')
  return { ok: true }
}
