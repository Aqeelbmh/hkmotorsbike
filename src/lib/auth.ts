/** Server-side auth & role guards. Import only from Server Components / Actions. */
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile, Role } from '@/lib/types'

export const getAuthedUser = cache(async () => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/** Full profile (with role). Redirects to /login when signed out. */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !profile) redirect('/login')
  if (!profile.is_active) {
    await supabase.auth.signOut()
    redirect('/login')
  }
  return profile as Profile
})

/** Require one of the given roles; redirects non-matching users to their home. */
export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await getProfile()
  if (!roles.includes(profile.role)) redirect('/')
  return profile
}

/** admin + manager — the "back office" roles. */
export async function requireStaff(): Promise<Profile> {
  return requireRole(['admin', 'manager'])
}

/** admin-only screens (settings, users, audit log). */
export async function requireAdmin(): Promise<Profile> {
  return requireRole(['admin'])
}

export const canSeeCost = (role: Role) => role === 'admin' || role === 'manager'
