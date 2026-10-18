'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { chequeStatusSchema } from '@/lib/validators'

function clean(message: string): string {
  return message
    .replace(/^(\[?PGRST|Error:?\s*)/i, '')
    .replace(/Exception:\s*/, '')
    .trim()
}

/**
 * Move a cheque through its lifecycle. Marking bounced/returned/cancelled
 * auto-reverses the linked payment via trigger, restoring the owed balance.
 */
export async function updateChequeStatus(id: string, input: unknown) {
  await requireStaff()
  const parsed = chequeStatusSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  const supabase = createClient()
  const patch: Record<string, unknown> = {
    status: d.status,
    bounced_reason: ['bounced', 'returned', 'cancelled'].includes(d.status) ? d.bounced_reason : null,
    cleared_date:
      d.status === 'cleared'
        ? d.cleared_date || new Date().toISOString().slice(0, 10)
        : d.status === 'bounced'
          ? null
          : undefined,
  }
  // undefined keys must not be sent — PostgREST would null them out.
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k]

  const { error } = await supabase.from('cheques').update(patch).eq('id', id)
  if (error) return { error: clean(error.message) }

  revalidatePath('/cheques')
  revalidatePath('/payments')
  revalidatePath('/sales')
  revalidatePath('/customers')
  revalidatePath('/suppliers')
  return { ok: true }
}
