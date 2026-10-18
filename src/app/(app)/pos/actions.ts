'use server'

import { revalidatePath } from 'next/cache'
import { getAuthedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { checkoutSchema, holdBillSchema } from '@/lib/validators'
import type { BillData, CheckoutResult } from '@/lib/types'

function clean(message: string): string {
  return message
    .replace(/^(\[?PGRST|Error:?\s*)/i, '')
    .replace(/Exception:\s*/, '')
    .trim()
}

/** Atomic checkout — sale + items + movements + payments + credit checks in one transaction. */
export async function checkout(input: unknown) {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not signed in' }
  const parsed = checkoutSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { data, error } = await supabase.rpc('fn_checkout', {
    p_customer_id: d.customer_id ?? null,
    p_items: d.items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount: i.discount,
    })),
    p_bill_discount: d.bill_discount,
    p_discount_mode: d.discount_mode,
    p_payments: d.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference_no: p.reference_no || null,
      cheque_no: p.cheque_no || null,
      bank: p.bank || null,
      branch: p.branch || null,
      cheque_date: p.cheque_date || null,
      party_name: p.party_name || null,
    })),
    p_note: d.note || null,
  })
  if (error) return { error: clean(error.message) }

  const out = data as CheckoutResult
  revalidatePath('/pos')
  revalidatePath('/sales')
  revalidatePath('/inventory')
  revalidatePath('/products')
  revalidatePath('/')
  return { result: out }
}

/** Cashier-safe bill payload for print / reprint. */
export async function getBill(saleId: string): Promise<{ bill?: BillData; error?: string }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not signed in' }
  const supabase = createClient()
  const { data, error } = await supabase.rpc('fn_get_bill', { p_sale_id: saleId })
  if (error) return { error: clean(error.message) }
  return { bill: data as BillData }
}

/** Park the current cart so another customer can be served. */
export async function holdBill(input: unknown) {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not signed in' }
  const parsed = holdBillSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { error } = await supabase.from('held_bills').insert({
    cart: d.cart,
    customer_id: d.customer_id ?? null,
    note: d.note || null,
    held_by: user.id,
  })
  if (error) return { error: clean(error.message) }
  revalidatePath('/pos')
  return { ok: true }
}

/** Remove a held bill once it is recalled (or discarded). */
export async function deleteHeldBill(id: string) {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not signed in' }
  const supabase = createClient()
  const { error } = await supabase.from('held_bills').delete().eq('id', id)
  if (error) return { error: clean(error.message) }
  revalidatePath('/pos')
  return { ok: true }
}
