'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { expenseSchema, incomeSchema, expenseCategorySchema } from '@/lib/validators'

function clean(message: string): string {
  return message
    .replace(/^(\[?PGRST|Error:?\s*)/i, '')
    .replace(/Exception:\s*/, '')
    .trim()
}

function revalidateMoney() {
  revalidatePath('/expenses')
  revalidatePath('/reports')
  revalidatePath('/')
}

export async function createExpense(input: unknown) {
  const user = await requireStaff()
  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { error } = await supabase.from('expenses').insert({
    title: d.title,
    amount: d.amount,
    expense_date: d.expense_date,
    category_id: d.category_id ?? null,
    payment_method: d.payment_method,
    reference_no: d.reference_no || null,
    description: d.description || null,
    attachment_url: d.attachment_url || null,
    is_recurring: d.is_recurring,
    recurring_interval: d.is_recurring ? d.recurring_interval ?? null : null,
    next_due_date: d.is_recurring && d.next_due_date ? d.next_due_date : null,
    created_by: user.id,
  })
  if (error) return { error: clean(error.message) }
  revalidateMoney()
  return { ok: true }
}

export async function deleteExpense(id: string) {
  await requireStaff()
  const supabase = createClient()
  const { error } = await supabase.from('expenses').update({ is_deleted: true }).eq('id', id)
  if (error) return { error: clean(error.message) }
  revalidateMoney()
  return { ok: true }
}

export async function createIncome(input: unknown) {
  const user = await requireStaff()
  const parsed = incomeSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { error } = await supabase.from('income').insert({
    source: d.source,
    amount: d.amount,
    income_date: d.income_date,
    payment_method: d.payment_method,
    description: d.description || null,
    created_by: user.id,
  })
  if (error) return { error: clean(error.message) }
  revalidateMoney()
  return { ok: true }
}

export async function deleteIncome(id: string) {
  await requireStaff()
  const supabase = createClient()
  const { error } = await supabase.from('income').update({ is_deleted: true }).eq('id', id)
  if (error) return { error: clean(error.message) }
  revalidateMoney()
  return { ok: true }
}

export async function createExpenseCategory(input: unknown) {
  await requireStaff()
  const parsed = expenseCategorySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { error } = await supabase.from('expense_categories').insert({
    name: d.name,
    sort_order: d.sort_order,
  })
  if (error) return { error: clean(error.message) }
  revalidatePath('/expenses')
  return { ok: true }
}
