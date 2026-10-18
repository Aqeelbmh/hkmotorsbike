'use server'

import { revalidatePath } from 'next/cache'
import { getAuthedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { saleReturnSchema } from '@/lib/validators'

function clean(message: string): string {
  return message
    .replace(/^(\[?PGRST|Error:?\s*)/i, '')
    .replace(/Exception:\s*/, '')
    .trim()
}

/**
 * Record a customer return against a bill. Cashier-safe: bill lines come from
 * fn_get_bill (sale_items is staff-only) and return_items is readable by all
 * roles, so the cumulative guard works for every user.
 */
export async function createSaleReturn(input: unknown) {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not signed in' }
  const parsed = saleReturnSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()

  const { data: bill, error: billErr } = await supabase.rpc('fn_get_bill', { p_sale_id: d.sale_id })
  if (billErr) return { error: clean(billErr.message) }
  const lines = ((bill as any)?.items ?? []) as { id: string; quantity: number }[]
  const soldByLine = new Map(lines.map((l) => [l.id, Number(l.quantity)]))

  // Cumulative guard: never return more than what remains on each sale line.
  const itemIds = lines.map((l) => l.id)
  const returnedByLine = new Map<string, number>()
  if (itemIds.length > 0) {
    const { data: prior } = await supabase
      .from('return_items')
      .select('original_item_id, quantity')
      .in('original_item_id', itemIds)
    for (const r of (prior ?? []) as { original_item_id: string | null; quantity: number }[]) {
      if (!r.original_item_id) continue
      returnedByLine.set(
        r.original_item_id,
        (returnedByLine.get(r.original_item_id) ?? 0) + Number(r.quantity)
      )
    }
  }

  for (const item of d.items) {
    const sold = soldByLine.get(item.sale_item_id)
    if (sold == null) return { error: 'Return line does not belong to this bill' }
    const remaining = sold - (returnedByLine.get(item.sale_item_id) ?? 0)
    if (item.quantity > remaining) {
      return { error: `Only ${Math.max(remaining, 0)} left to return on one of the lines` }
    }
  }

  // 'credit' = credit note on the customer account, stored as a null refund method.
  const refundMethod = !d.refund_method || d.refund_method === 'credit' ? null : d.refund_method
  const { data, error } = await supabase.rpc('fn_record_sale_return', {
    p_sale_id: d.sale_id,
    p_items: d.items,
    p_restock: d.restock,
    p_refund_method: refundMethod,
    p_reason: d.reason,
  })
  if (error) return { error: clean(error.message) }

  revalidatePath('/returns')
  revalidatePath('/sales')
  revalidatePath('/inventory')
  revalidatePath('/pos')
  revalidatePath('/')
  return { result: data as { return_id: string; return_no: string; total: number } }
}
