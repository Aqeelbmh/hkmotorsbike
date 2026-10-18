'use server'

import { revalidatePath } from 'next/cache'
import { getAuthedUser, requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { receivePaymentSchema } from '@/lib/validators'

function clean(message: string): string {
  return message
    .replace(/^(\[?PGRST|Error:?\s*)/i, '')
    .replace(/Exception:\s*/, '')
    .trim()
}

/** Standalone receipt / payment — optionally allocated to a specific bill or PO. */
export async function recordPayment(input: unknown) {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not signed in' }
  const parsed = receivePaymentSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const staff = profile?.role === 'admin' || profile?.role === 'manager'
  if (d.direction === 'out' && !staff) return { error: 'Only admin/manager may pay suppliers' }

  // Allocation sanity: the bill must belong to the paying customer.
  if (d.sale_id) {
    const { data: sale } = await supabase
      .from('sales')
      .select('id, customer_id, balance_amount')
      .eq('id', d.sale_id)
      .maybeSingle()
    if (!sale) return { error: 'Bill not found' }
    if (sale.customer_id !== d.customer_id) return { error: 'That bill belongs to a different customer' }
    if (d.amount > Number(sale.balance_amount) + 0.004) {
      return { error: `Bill balance is only ${Number(sale.balance_amount).toFixed(2)}` }
    }
  }

  const { error } = await supabase.rpc('fn_receive_payment', {
    p_direction: d.direction,
    p_method: d.method,
    p_amount: d.amount,
    p_customer_id: d.direction === 'in' ? (d.customer_id ?? null) : null,
    p_supplier_id: d.direction === 'out' ? (d.supplier_id ?? null) : null,
    p_sale_id: d.sale_id ?? null,
    p_purchase_id: d.purchase_id ?? null,
    p_reference_no: d.reference_no || null,
    p_note: d.note || null,
    p_cheque_no: d.cheque_no || null,
    p_cheque_bank: d.bank || null,
    p_cheque_date: d.cheque_date || null,
  })
  if (error) return { error: clean(error.message) }

  revalidatePath('/payments')
  revalidatePath('/cheques')
  revalidatePath('/sales')
  revalidatePath('/customers')
  revalidatePath('/suppliers')
  revalidatePath('/')
  return { ok: true }
}

/** Soft-delete a mistaken entry; triggers resync the linked bill/PO balances. */
export async function deletePayment(id: string) {
  await requireStaff()
  const supabase = createClient()
  const { error } = await supabase.from('payments').update({ is_deleted: true }).eq('id', id)
  if (error) return { error: clean(error.message) }
  revalidatePath('/payments')
  revalidatePath('/sales')
  revalidatePath('/customers')
  revalidatePath('/suppliers')
  revalidatePath('/')
  return { ok: true }
}
