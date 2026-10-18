'use server'

import { revalidatePath } from 'next/cache'
import { getAuthedUser, requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { customerSchema } from '@/lib/validators'

function toRow(d: any) {
  return {
    name: d.name,
    type: d.type,
    phone: d.phone || null,
    email: d.email || null,
    address: d.address || null,
    nic: d.nic || null,
    credit_limit: d.credit_limit ?? 0,
    opening_balance: d.opening_balance ?? 0,
    vehicle_notes: d.vehicle_notes || null,
    notes: d.notes || null,
    is_active: d.is_active,
  }
}

/** Cashiers may create and edit customers (POS requirement), staff-only fields are stripped below. */
async function guardWrite(input: unknown) {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not signed in' }
  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  // Non-staff cannot set credit limits or opening balances.
  const supabase = createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const staff = profile?.role === 'admin' || profile?.role === 'manager'
  const row = toRow(parsed.data)
  if (!staff) {
    row.credit_limit = 0
    row.opening_balance = 0
    row.is_active = true
  }
  return { row: row as any, staff }
}

export async function createCustomer(input: unknown) {
  const g = await guardWrite(input)
  if ('error' in g) return g

  const supabase = createClient()
  const { data, error } = await supabase.from('customers').insert(g.row).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/customers')
  return { id: data.id as string }
}

export async function updateCustomer(id: string, input: unknown) {
  const g = await guardWrite(input)
  if ('error' in g) return g

  const supabase = createClient()
  if (!g.staff) {
    // Preserve staff-managed financial fields on cashier edits.
    const { data: existing } = await supabase
      .from('customers')
      .select('credit_limit, opening_balance, is_active')
      .eq('id', id)
      .single()
    if (existing) Object.assign(g.row, existing)
  }
  const { error } = await supabase.from('customers').update(g.row).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/customers')
  revalidatePath(`/customers/${id}`)
  return { ok: true }
}

export async function deleteCustomer(id: string) {
  await requireStaff()
  const supabase = createClient()
  // Soft delete only — sales keep the customer link for history.
  const { error } = await supabase
    .from('customers')
    .update({ is_deleted: true, is_active: false })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/customers')
  return { ok: true }
}
