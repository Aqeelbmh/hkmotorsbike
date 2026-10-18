'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAuthedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

function clean(message: string): string {
  return message
    .replace(/^(\[?PGRST|Error:?\s*)/i, '')
    .replace(/Exception:\s*/, '')
    .trim()
}

const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
})

const passwordSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters').max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })

/** Update the signed-in user's own profile (name, phone). */
export async function updateProfile(input: unknown) {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not signed in' }
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  // Auth metadata first so the display name stays in sync everywhere.
  const { error: authErr } = await supabase.auth.updateUser({ data: { full_name: d.full_name } })
  if (authErr) return { error: clean(authErr.message) }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: d.full_name, phone: d.phone || null, updated_at: new Date().toISOString() })
    .eq('id', user.id)
  if (error) return { error: clean(error.message) }

  revalidatePath('/settings/profile')
  revalidatePath('/')
  return { ok: true }
}

/** Change the signed-in user's password. */
export async function changePassword(input: unknown) {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not signed in' }
  const parsed = passwordSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: clean(error.message) }
  return { ok: true }
}
