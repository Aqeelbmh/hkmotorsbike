import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import type { Settings } from '@/lib/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()

  const supabase = createClient()
  const { data: row } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
  const settings = (row ?? { shop_name: 'H.K Motors Bike' }) as Partial<Settings> as Settings

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar role={profile.role} shopName={settings.shop_name} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar profile={profile} shopName={settings.shop_name} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 md:p-6 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  )
}
