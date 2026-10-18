'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { KeyRound, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateProfile, changePassword } from './actions'
import { formatDateTime } from '@/lib/utils'
import type { Profile } from '@/lib/types'

const ROLE_VARIANT = { admin: 'danger', manager: 'info', cashier: 'secondary' } as const

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<'profile' | 'password' | null>(null)

  const [fullName, setFullName] = React.useState(profile.full_name)
  const [phone, setPhone] = React.useState(profile.phone ?? '')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')

  async function saveProfile() {
    setBusy('profile')
    const r = await updateProfile({ full_name: fullName, phone })
    setBusy(null)
    if (r.error) return toast.error(r.error)
    toast.success('Profile updated')
    router.refresh()
  }

  async function savePassword() {
    if (password.length < 8) return toast.error('Use at least 8 characters')
    if (password !== confirm) return toast.error('Passwords do not match')
    setBusy('password')
    const r = await changePassword({ password, confirm })
    setBusy(null)
    if (r.error) return toast.error(r.error)
    toast.success('Password changed')
    setPassword('')
    setConfirm('')
  }

  return (
    <div className="grid max-w-3xl gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Details</h3>
            <Badge variant={ROLE_VARIANT[profile.role]}>{profile.role}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Member since {formatDateTime(profile.created_at)}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={profile.email} disabled />
          <p className="text-xs text-muted-foreground">Email is your login — ask an admin to change it.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Full name *</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button onClick={saveProfile} disabled={busy !== null}>
            {busy === 'profile' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save details
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div>
          <h3 className="font-medium">Change password</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            You stay signed in on this device; use the new password next login.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>New password *</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Confirm password *</Label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={savePassword} disabled={busy !== null} variant="outline">
            {busy === 'password' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Change password
          </Button>
        </div>
      </div>
    </div>
  )
}
