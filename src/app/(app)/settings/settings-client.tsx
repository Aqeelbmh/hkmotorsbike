'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ColumnDef } from '@tanstack/react-table'
import { Loader2, Pencil, UserPlus } from 'lucide-react'
import { DataTable, SortHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateSettings, inviteUser, updateUserRole } from './actions'
import { formatMoney, formatDateTime } from '@/lib/utils'
import type { AuditRow, Role, Settings, UserRow } from '@/lib/types'

type Tab = 'shop' | 'users' | 'audit'

const ROLE_VARIANT: Record<Role, 'danger' | 'info' | 'secondary'> = {
  admin: 'danger',
  manager: 'info',
  cashier: 'secondary',
}

const ACTION_VARIANT: Record<AuditRow['action'], 'success' | 'info' | 'danger'> = {
  insert: 'success',
  update: 'info',
  delete: 'danger',
}

export function SettingsClient({
  settings,
  users,
  audit,
  currentUserId,
}: {
  settings: Settings | null
  users: UserRow[]
  audit: AuditRow[]
  currentUserId: string
}) {
  const router = useRouter()
  const [tab, setTab] = React.useState<Tab>('shop')
  const [busy, setBusy] = React.useState(false)

  // ---- shop form -----------------------------------------------------------
  const [s, setS] = React.useState({
    shop_name: settings?.shop_name ?? '',
    address: settings?.address ?? '',
    phone: settings?.phone ?? '',
    email: settings?.email ?? '',
    tax_number: settings?.tax_number ?? '',
    receipt_footer: settings?.receipt_footer ?? '',
    currency_code: settings?.currency_code ?? 'LKR',
    currency_symbol: settings?.currency_symbol ?? 'Rs.',
    tax_rate: String(settings?.tax_rate ?? 0),
    invoice_prefix: settings?.invoice_prefix ?? 'PB',
    allow_negative_stock: settings?.allow_negative_stock ?? false,
    low_stock_alert: settings?.low_stock_alert ?? true,
  })
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }))

  async function saveSettings() {
    setBusy(true)
    const r = await updateSettings({
      ...s,
      tax_rate: Number(s.tax_rate) || 0,
      logo_url: settings?.logo_url ?? '',
    })
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success('Settings saved')
    router.refresh()
  }

  // ---- invite user ----------------------------------------------------------
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [inv, setInv] = React.useState({ email: '', full_name: '', password: '', role: 'cashier' as Role, phone: '' })

  async function submitInvite() {
    setBusy(true)
    const r = await inviteUser(inv)
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success(`Account created for ${inv.email}`)
    setInviteOpen(false)
    setInv({ email: '', full_name: '', password: '', role: 'cashier', phone: '' })
    router.refresh()
  }

  // ---- role edit -------------------------------------------------------------
  const [editUser, setEditUser] = React.useState<UserRow | null>(null)
  const [editRole, setEditRole] = React.useState<Role>('cashier')
  const [editActive, setEditActive] = React.useState(true)

  function openEdit(u: UserRow) {
    setEditUser(u)
    setEditRole(u.role)
    setEditActive(u.is_active)
  }

  async function submitRole() {
    if (!editUser) return
    setBusy(true)
    const r = await updateUserRole(editUser.id, { role: editRole, is_active: editActive })
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success('User updated')
    setEditUser(null)
    router.refresh()
  }

  const userColumns = React.useMemo<ColumnDef<UserRow, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>User</SortHeader>,
        accessorKey: 'full_name',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">
              {row.original.full_name}
              {row.original.id === currentUserId && (
                <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      {
        header: 'Role',
        accessorKey: 'role',
        cell: ({ getValue }) => (
          <Badge variant={ROLE_VARIANT[getValue() as Role]}>{getValue()}</Badge>
        ),
      },
      {
        header: 'Status',
        accessorKey: 'is_active',
        cell: ({ getValue }) =>
          getValue() ? <Badge variant="success">active</Badge> : <Badge variant="secondary">disabled</Badge>,
      },
      {
        header: ({ column }) => <SortHeader column={column}>Bills</SortHeader>,
        accessorKey: 'bill_count',
        cell: ({ getValue }) => <span className="tabular-nums">{Number(getValue())}</span>,
      },
      {
        header: ({ column }) => <SortHeader column={column}>Sales total</SortHeader>,
        accessorKey: 'sales_total',
        cell: ({ getValue }) => (
          <span className="tabular-nums">{formatMoney(Number(getValue()), settings?.currency_symbol ?? 'Rs.')}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="outline" size="sm" onClick={() => openEdit(row.original)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        ),
      },
    ],
    [currentUserId, settings?.currency_symbol]
  )

  const auditColumns = React.useMemo<ColumnDef<AuditRow, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>When</SortHeader>,
        accessorKey: 'created_at',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-sm tabular-nums">{formatDateTime(getValue())}</span>
        ),
      },
      {
        header: 'Action',
        accessorKey: 'action',
        cell: ({ getValue }) => <Badge variant={ACTION_VARIANT[getValue() as AuditRow['action']]}>{getValue()}</Badge>,
      },
      {
        header: ({ column }) => <SortHeader column={column}>Table</SortHeader>,
        accessorKey: 'table_name',
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-sm">{row.original.table_name}</p>
            {row.original.row_id && (
              <p className="font-mono text-xs text-muted-foreground">{row.original.row_id.slice(0, 8)}…</p>
            )}
          </div>
        ),
      },
      {
        header: 'By',
        accessorKey: 'user_name',
        cell: ({ row }) => (
          <div>
            <p className="text-sm">{row.original.user_name}</p>
            <p className="text-xs text-muted-foreground">{row.original.user_email}</p>
          </div>
        ),
      },
      {
        header: 'Details',
        accessorKey: 'new_data',
        cell: ({ row }) => {
          const payload = row.original.new_data ?? row.original.old_data
          const text = payload ? JSON.stringify(payload) : '—'
          return (
            <p className="max-w-72 truncate font-mono text-xs text-muted-foreground" title={text}>
              {text}
            </p>
          )
        },
      },
    ],
    []
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        {(['shop', 'users', 'audit'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'flex-1 rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow-sm'
                : 'flex-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground'
            }
          >
            {t === 'shop' ? 'Shop' : t === 'users' ? 'Users & roles' : 'Audit log'}
          </button>
        ))}
      </div>

      {tab === 'shop' && (
        <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Shop name *</Label>
              <Input value={s.shop_name} onChange={(e) => set('shop_name', e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input value={s.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={s.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={s.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tax number</Label>
              <Input value={s.tax_number} onChange={(e) => set('tax_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice prefix *</Label>
              <Input value={s.invoice_prefix} onChange={(e) => set('invoice_prefix', e.target.value)} maxLength={10} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency code *</Label>
              <Input value={s.currency_code} onChange={(e) => set('currency_code', e.target.value.toUpperCase())} maxLength={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency symbol *</Label>
              <Input value={s.currency_symbol} onChange={(e) => set('currency_symbol', e.target.value)} maxLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label>Tax rate (%)</Label>
              <Input type="number" min={0} max={100} step="any" value={s.tax_rate} onChange={(e) => set('tax_rate', e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Receipt footer</Label>
              <Input value={s.receipt_footer} onChange={(e) => set('receipt_footer', e.target.value)} placeholder="Printed at the bottom of every bill" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={s.allow_negative_stock} onCheckedChange={(v) => set('allow_negative_stock', v === true)} />
              Allow selling below zero stock
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={s.low_stock_alert} onCheckedChange={(v) => set('low_stock_alert', v === true)} />
              Show low-stock alerts
            </label>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save settings
            </Button>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <DataTable
          columns={userColumns}
          data={users}
          searchPlaceholder="Search name or email…"
          emptyMessage="No users."
          toolbar={
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add user
            </Button>
          }
        />
      )}

      {tab === 'audit' && (
        <DataTable
          columns={auditColumns}
          data={audit}
          searchPlaceholder="Search table, user, action…"
          emptyMessage="Nothing in the audit trail yet."
        />
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>Creates a login account and profile immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full name *</Label>
              <Input value={inv.full_name} onChange={(e) => setInv((p) => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={inv.email} onChange={(e) => setInv((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Password *</Label>
                <Input
                  type="password"
                  value={inv.password}
                  onChange={(e) => setInv((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Min 8 characters"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={inv.role} onValueChange={(v) => setInv((p) => ({ ...p, role: v as Role }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">cashier</SelectItem>
                    <SelectItem value="manager">manager</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={inv.phone} onChange={(e) => setInv((p) => ({ ...p, phone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitInvite} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit {editUser?.full_name}</DialogTitle>
            <DialogDescription>{editUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cashier">cashier</SelectItem>
                  <SelectItem value="manager">manager</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={editActive} onCheckedChange={(v) => setEditActive(v === true)} />
              Account is active
            </label>
            {!editActive && (
              <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
                A deactivated user is signed out and cannot log back in until re-enabled.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitRole} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
