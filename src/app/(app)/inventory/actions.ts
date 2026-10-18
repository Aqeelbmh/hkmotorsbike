'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { stockAdjustSchema, stockTakeSchema } from '@/lib/validators'

/**
 * The ONLY sanctioned way to move stock outside sales/purchases/returns.
 * Never writes products.qty — it appends a stock_movements row via the
 * SECURITY DEFINER function, so the ledger stays the single source of truth.
 */
export async function adjustStock(input: unknown) {
  await requireStaff()
  const parsed = stockAdjustSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()

  // Guard against driving a live product below zero (settings may allow it for sales).
  const { data: stock } = await supabase
    .from('v_stock_levels')
    .select('qty_on_hand')
    .eq('product_id', d.product_id)
    .maybeSingle()
  const current = Number(stock?.qty_on_hand ?? 0)
  if (current + d.delta < 0) {
    return { error: `Adjustment would leave ${Math.abs(current + d.delta)} below zero (on hand: ${current})` }
  }

  const { error } = await supabase.rpc('fn_adjust_stock', {
    p_product_id: d.product_id,
    p_delta: d.delta,
    p_reason: d.reason,
    p_note: d.note || null,
  })
  if (error) return { error: error.message }

  revalidatePath('/inventory')
  revalidatePath('/products')
  revalidatePath('/inventory/movements')
  return { ok: true }
}

/** Stock-take: counted quantities become the on-hand figure; variance posts as adjustments. */
export async function runStockTake(input: unknown) {
  await requireStaff()
  const parsed = stockTakeSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { data, error } = await supabase.rpc('fn_stock_take', {
    p_counts: d.counts.map((c) => ({ product_id: c.product_id, counted_qty: c.counted_qty })),
    p_note: d.note || null,
  })
  if (error) return { error: error.message }

  const out = data as { adjusted_count: number }
  revalidatePath('/inventory')
  revalidatePath('/products')
  revalidatePath('/inventory/movements')
  return { adjusted: Number(out.adjusted_count) }
}
