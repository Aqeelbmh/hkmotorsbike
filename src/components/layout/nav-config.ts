import {
  LayoutDashboard,
  Package,
  FolderTree,
  Boxes,
  Truck,
  Users,
  ShoppingCart,
  PackagePlus,
  ArrowLeftRight,
  BanknoteIcon,
  Landmark,
  Receipt,
  RotateCcw,
  Wallet,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/types'

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  roles: Role[]
  shortcut?: string
}

export interface NavSection {
  label: string
  items: NavItem[]
}

const ALL: Role[] = ['admin', 'manager', 'cashier']
const STAFF: Role[] = ['admin', 'manager']

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Sell',
    items: [
      { title: 'POS Terminal', href: '/pos', icon: ShoppingCart, roles: ALL, shortcut: 'F10' },
      { title: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ALL },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { title: 'Products', href: '/products', icon: Package, roles: ALL },
      { title: 'Categories', href: '/categories', icon: FolderTree, roles: STAFF },
      { title: 'Inventory', href: '/inventory', icon: Boxes, roles: STAFF },
      { title: 'Stock movements', href: '/inventory/movements', icon: ArrowLeftRight, roles: STAFF },
    ],
  },
  {
    label: 'Trading',
    items: [
      { title: 'Suppliers', href: '/suppliers', icon: Truck, roles: STAFF },
      { title: 'Purchases', href: '/purchases', icon: PackagePlus, roles: STAFF },
      { title: 'Customers', href: '/customers', icon: Users, roles: ALL },
      { title: 'Sales', href: '/sales', icon: Receipt, roles: ALL },
      { title: 'Returns', href: '/returns', icon: RotateCcw, roles: ALL },
    ],
  },
  {
    label: 'Money',
    items: [
      { title: 'Payments', href: '/payments', icon: BanknoteIcon, roles: ALL },
      { title: 'Cheques', href: '/cheques', icon: Landmark, roles: ALL },
      { title: 'Expenses & Income', href: '/expenses', icon: Wallet, roles: STAFF },
    ],
  },
  {
    label: 'Insights',
    items: [
      { title: 'Reports', href: '/reports', icon: BarChart3, roles: STAFF },
      { title: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
    ],
  },
]

export function navForRole(role: Role): NavSection[] {
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.roles.includes(role)),
  })).filter((s) => s.items.length > 0)
}
