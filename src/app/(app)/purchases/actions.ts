'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  purchaseSchema,
  purchaseReturnSchema,
  receivePaymentSchema,
} from '@/lib/validators'

/** Atomic goods receipt — stock, weighted cost, payments and cheques all land in one Postgres transaction. */
export async function createPurchase(input: unknown) {
  await requireStaff()
  const parsed = purchaseSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { data, error } = await supabase.rpc('fn_record_purchase', {
    p_supplier_id: d.supplier_id,
    p_supplier_invoice_no: d.supplier_invoice_no || null,
    p_purchase_date: d.purchase_date,
    p_items: d.items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
    })),
    p_discount: d.discount,
    p_payments: d.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference_no: p.reference_no || null,
      cheque_no: p.cheque_no || null,
      bank: p.bank || null,
      cheque_date: p.cheque_date || null,
    })),
    p_notes: d.notes || null,
  })

  if (error) return { error: clean(error.message) }
  const out = data as { purchase_id: string; purchase_no: string; total: number; paid: number }
  revalidatePath('/purchases')
  revalidatePath('/inventory')
  revalidatePath('/products')
  revalidatePath(`/purchases/${out.purchase_id}`)
  return { id: out.purchase_id, purchase_no: out.purchase_no, total: Number(out.total) }
}

/** Pay part or all of an existing purchase order. */
export async function payForPurchase(purchaseId: string, input: unknown) {
  await requireStaff()
  const parsed = receivePaymentSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { data: purchase, error: loadErr } = await supabase
    .from('purchases')
    .select('id, supplier_id, total, paid_amount, is_deleted')
    .eq('id', purchaseId)
    .single()
  if (loadErr || !purchase) return { error: 'Purchase not found' }
  if (purchase.is_deleted) return { error: 'Purchase was deleted' }

  const remaining = Number(purchase.total) - Number(purchase.paid_amount)
  if (d.amount > remaining + 0.004) {
    return { error: `Payment exceeds the outstanding ${remaining.toFixed(2)}` }
  }

  const { error } = await supabase.rpc('fn_receive_payment', {
    p_direction: 'out',
    p_method: d.method,
    p_amount: d.amount,
    p_customer_id: null,
    p_supplier_id: purchase.supplier_id,
    p_sale_id: null,
    p_purchase_id: purchaseId,
    p_reference_no: d.reference_no || null,
    p_note: d.note || null,
    p_cheque_no: d.cheque_no || null,
    p_cheque_bank: d.bank || null,
    p_cheque_date: d.cheque_date || null,
  })
  if (error) return { error: clean(error.message) }

  revalidatePath('/purchases')
  revalidatePath(`/purchases/${purchaseId}`)
  if (purchase.supplier_id) revalidatePath(`/suppliers/${purchase.supplier_id}`)
  return { ok: true }
}

/** Send goods back to the supplier: stock leaves the shelf, balance/refund adjusts. */
export async function returnToSupplier(input: unknown) {
  await requireStaff()
  const parsed = purchaseReturnSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { data: items, error: loadErr } = await supabase
    .from('v_purchase_items_detail')
    .select('id, quantity, product_id')
    .eq('purchase_id', d.purchase_id)
  if (loadErr) return { error: clean(loadErr.message) }

  const lines = (items ?? []) as { id: string; quantity: number; product_id: string }[]
  const purchasedByProduct = new Map<string, number>()
  const lineProduct = new Map<string, string>()
  for (const l of lines) {
    purchasedByProduct.set(l.product_id, (purchasedByProduct.get(l.product_id) ?? 0) + Number(l.quantity))
    lineProduct.set(l.id, l.product_id)
  }

  // Cumulative guard: never return more of a product than this PO delivered.
  const { data: pastReturns } = await supabase
    .from('returns')
    .select('id')
    .eq('kind', 'purchase')
    .eq('original_id', d.purchase_id)
    .eq('is_deleted', false)
  const returnIds = (pastReturns ?? []).map((r: any) => r.id as string)
  const returnedByProduct = new Map<string, number>()
  if (returnIds.length > 0) {
    const { data: prior } = await supabase
      .from('return_items')
      .select('product_id, quantity')
      .in('return_id', returnIds)
    for (const r of (prior ?? []) as { product_id: string; quantity: number }[]) {
      returnedByProduct.set(
        r.product_id,
        (returnedByProduct.get(r.product_id) ?? 0) + Number(r.quantity)
      )
    }
  }

  const requestedByProduct = new Map<string, number>()
  for (const line of d.items) {
    const pid = lineProduct.get(line.purchase_item_id)
    if (!pid) return { error: 'Return line does not belong to this purchase' }
    requestedByProduct.set(pid, (requestedByProduct.get(pid) ?? 0) + line.quantity)
  }
  for (const [pid, qty] of requestedByProduct) {
    const available = (purchasedByProduct.get(pid) ?? 0) - (returnedByProduct.get(pid) ?? 0)
    if (qty > available) {
      return { error: `Only ${Math.max(available, 0)} can still be returned for one of the items` }
    }
  }

  const { data, error } = await supabase.rpc('fn_record_purchase_return', {
    p_purchase_id: d.purchase_id,
    p_items: d.items.map((i) => ({
      purchase_item_id: i.purchase_item_id,
      quantity: i.quantity,
    })),
    p_refund_method: d.refund_method,
    p_reason: d.reason,
  })
  if (error) return { error: clean(error.message) }

  const out = data as { return_id: string; return_no: string; total: number }
  revalidatePath('/purchases')
  revalidatePath('/returns')
  revalidatePath('/inventory')
  revalidatePath(`/purchases/${d.purchase_id}`)
  return { id: out.return_id, return_no: out.return_no, total: Number(out.total) }
}

function clean(message: string): string {
  return message
    .replace(/^(\[?PGRST|Error:?\s*)/i, '')
    .replace(/Exception:\s*/, '')
    .trim()
}
