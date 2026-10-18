'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navForRole } from './nav-config'
import type { Role } from '@/lib/types'

export function Sidebar({ role, shopName }: { role: Role; shopName: string }) {
  const pathname = usePathname()
  const sections = navForRole(role)

  return (
    <aside className="flex h-full w-60 flex-col border-r border-slate-800 bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 shadow-md shadow-blue-600/30">
          <Wrench className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{shopName}</p>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Parts POS</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-thin">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-sidebar-accent text-white shadow-sm'
                        : 'text-slate-400 hover:bg-sidebar-accent/60 hover:text-slate-200'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'
                      )}
                    />
                    <span className="truncate">{item.title}</span>
                    {item.shortcut && (
                      <kbd className="ml-auto rounded border border-slate-700 px-1 text-[10px] text-slate-500">
                        {item.shortcut}
                      </kbd>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800 px-4 py-3">
        <p className="text-[11px] text-slate-500">
          Role: <span className="font-semibold capitalize text-slate-300">{role}</span>
        </p>
      </div>
    </aside>
  )
}
