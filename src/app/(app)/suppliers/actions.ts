'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { supplierSchema } from '@/lib/validators'

function toRow(d: any) {
  return {
    name: d.name,
    contact_person: d.contact_person || null,
    phone: d.phone || null,
    email: d.email || null,
    address: d.address || null,
    tax_number: d.tax_number || null,
    credit_terms_days: d.credit_terms_days ?? 0,
    opening_balance: d.opening_balance ?? 0,
    notes: d.notes || null,
    is_active: d.is_active,
  }
}

export async function createSupplier(input: unknown) {
  await requireStaff()
  const parsed = supplierSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('suppliers')
    .insert(toRow(parsed.data))
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/suppliers')
  return { id: data.id as string }
}

export async function updateSupplier(id: string, input: unknown) {
  await requireStaff()
  const parsed = supplierSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = createClient()
  const { error } = await supabase.from('suppliers').update(toRow(parsed.data)).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/suppliers')
  revalidatePath(`/suppliers/${id}`)
  return { ok: true }
}

export async function deleteSupplier(id: string) {
  await requireStaff()
  const supabase = createClient()
  // Soft delete only. Purchases keep the supplier via FK (on delete restrict),
  // so historical records stay intact.
  const { error } = await supabase
    .from('suppliers')
    .update({ is_deleted: true, is_active: false })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/suppliers')
  return { ok: true }
}
