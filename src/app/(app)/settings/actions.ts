'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { inviteUserSchema, profileRoleSchema, settingsSchema } from '@/lib/validators'

function clean(message: string): string {
  return message
    .replace(/^(\[?PGRST|Error:?\s*)/i, '')
    .replace(/Exception:\s*/, '')
    .trim()
}

/** Shop / currency / tax settings — admin only. */
export async function updateSettings(input: unknown) {
  await requireAdmin()
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { error } = await supabase
    .from('settings')
    .update({
      shop_name: d.shop_name,
      address: d.address,
      phone: d.phone,
      email: d.email,
      tax_number: d.tax_number,
      logo_url: d.logo_url || null,
      receipt_footer: d.receipt_footer,
      currency_code: d.currency_code,
      currency_symbol: d.currency_symbol,
      tax_rate: d.tax_rate,
      invoice_prefix: d.invoice_prefix,
      allow_negative_stock: d.allow_negative_stock,
      low_stock_alert: d.low_stock_alert,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
  if (error) return { error: clean(error.message) }

  revalidatePath('/')
  revalidatePath('/settings')
  revalidatePath('/pos')
  return { ok: true }
}

/** Create a login account + profile. Goes through the GoTrue admin API with the admin's own session. */
export async function inviteUser(input: unknown) {
  await requireAdmin()
  const parsed = inviteUserSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const { data, error } = await supabase.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { full_name: d.full_name, role: d.role },
  })
  if (error) return { error: clean(error.message) }

  if (d.phone && data.user?.id) {
    await supabase.from('profiles').update({ phone: d.phone }).eq('id', data.user.id)
  }
  revalidatePath('/settings')
  return { ok: true }
}

/** Change a user's role or activate/deactivate their access. */
export async function updateUserRole(userId: string, input: unknown) {
  const admin = await requireAdmin()
  const parsed = profileRoleSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  if (userId === admin.id && (d.role !== 'admin' || !d.is_active)) {
    return { error: 'You cannot demote or deactivate your own account' }
  }

  const supabase = createClient()
  // Keep the auth user in sync (the mock's permission guards read the auth role).
  const { error: authErr } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { role: d.role },
  })
  if (authErr) return { error: clean(authErr.message) }

  const { error } = await supabase
    .from('profiles')
    .update({ role: d.role, is_active: d.is_active, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) return { error: clean(error.message) }

  revalidatePath('/settings')
  return { ok: true }
}
