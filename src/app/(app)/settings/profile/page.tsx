import { getProfile } from '@/lib/auth'
import { PageHeader } from '@/components/page-header'
import { ProfileForm } from './profile-form'

export const metadata = { title: 'Profile' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const profile = await getProfile()

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" description="Your details and password" />
      <ProfileForm profile={profile} />
    </div>
  )
}
