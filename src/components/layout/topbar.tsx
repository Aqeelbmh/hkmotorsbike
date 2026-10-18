'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, User as UserIcon, Building2 } from 'lucide-react'
import { signOut } from '@/app/login/actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/theme-toggle'
import { MobileSidebar } from './mobile-sidebar'
import type { Profile } from '@/lib/types'

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

export function Topbar({ profile, shopName }: { profile: Profile; shopName: string }) {
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4 md:px-6">
      <div className="lg:hidden">
        <MobileSidebar role={profile.role} shopName={shopName} />
      </div>

      <div className="hidden items-center gap-2 lg:flex">
        <span className="text-sm font-medium text-muted-foreground">{shopName}</span>
        <span className="text-xs text-muted-foreground/60">· Spare Parts POS</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-blue-600 text-xs text-white">
                  {initials(profile.full_name || profile.email)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left sm:block">
                <p className="max-w-[140px] truncate text-sm font-medium leading-tight">
                  {profile.full_name || profile.email}
                </p>
                <p className="text-[11px] capitalize leading-tight text-muted-foreground">
                  {profile.role}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate">{profile.full_name || '—'}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{profile.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile">
                <UserIcon className="mr-2 h-4 w-4" /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Building2 className="mr-2 h-4 w-4" /> Shop settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
