import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { SettingsClient } from './settings-client'
import type { AuditRow, Settings, UserRow } from '@/lib/types'

export const metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const admin = await requireAdmin()
  const supabase = createClient()

  const [{ data: settingsRow }, { data: users }, { data: audit }] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('v_users').select('*').order('created_at'),
    supabase.from('v_audit_feed').select('*').order('created_at', { ascending: false }).limit(200),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Shop info, currency & tax, user roles and the audit trail"
      />
      <SettingsClient
        settings={settingsRow as Settings | null}
        users={(users ?? []) as UserRow[]}
        audit={(audit ?? []) as AuditRow[]}
        currentUserId={admin.id}
      />
    </div>
  )
}
