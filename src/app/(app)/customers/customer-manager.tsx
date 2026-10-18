'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ColumnDef } from '@tanstack/react-table'
import { Plus, Pencil, Trash2, Eye, Loader2, User, Car, Store } from 'lucide-react'
import { createCustomer, updateCustomer, deleteCustomer } from './actions'
import { customerSchema, CustomerForm } from '@/lib/validators'
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { formatMoney } from '@/lib/utils'
import type { Customer, CustomerType } from '@/lib/types'

interface Props {
  customers: Customer[]
  balances: Record<string, number>
  staff: boolean
}

const EMPTY: CustomerForm = {
  name: '',
  type: 'retail',
  phone: '',
  email: '',
  address: '',
  nic: '',
  credit_limit: 0,
  opening_balance: 0,
  vehicle_notes: '',
  notes: '',
  is_active: true,
}

const TYPE_META: Record<CustomerType, { label: string; variant: 'secondary' | 'info' | 'outline' }> = {
  retail: { label: 'Retail', variant: 'secondary' },
  wholesale: { label: 'Wholesale', variant: 'info' },
  garage: { label: 'Garage', variant: 'outline' },
}

export function CustomerManager({ customers, balances, staff }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Customer | null>(null)
  const [form, setForm] = React.useState<CustomerForm>(EMPTY)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState<Customer | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const [typeFilter, setTypeFilter] = React.useState<string>('all')

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setDialogOpen(true)
  }

  function openEdit(c: Customer) {
    setEditing(c)
    setForm({
      name: c.name,
      type: c.type,
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      nic: c.nic ?? '',
      credit_limit: c.credit_limit,
      opening_balance: c.opening_balance,
      vehicle_notes: c.vehicle_notes ?? '',
      notes: c.notes ?? '',
      is_active: c.is_active,
    })
    setDialogOpen(true)
  }

  async function submit() {
    setSaving(true)
    try {
      const parsed = customerSchema.safeParse(form)
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message)
        return
      }
      const res = editing ? await updateCustomer(editing.id, form) : await createCustomer(form)
      if (res && 'error' in res && res.error) toast.error(res.error)
      else {
        toast.success(editing ? 'Customer updated' : 'Customer added')
        setDialogOpen(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      const res = await deleteCustomer(deleting.id)
      if (res && 'error' in res && res.error) toast.error(res.error)
      else {
        toast.success('Customer deleted')
        setDeleting(null)
        router.refresh()
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  const totalReceivable = customers.reduce((a, c) => a + Math.max(balances[c.id] ?? 0, 0), 0)
  const data = typeFilter === 'all' ? customers : customers.filter((c) => c.type === typeFilter)

  const columns = React.useMemo<ColumnDef<Customer, any>[]>(
    () => [
      {
        header: 'Customer',
        accessorKey: 'name',
        cell: ({ row }) => {
          const c = row.original
          const Icon = c.type === 'garage' ? Car : c.type === 'wholesale' ? Store : User
          return (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">{c.phone || c.email || '—'}</p>
              </div>
            </div>
          )
        },
      },
      {
        header: 'Type',
        accessorKey: 'type',
        cell: ({ row }) => {
          const m = TYPE_META[row.original.type]
          return <Badge variant={m.variant}>{m.label}</Badge>
        },
      },
      ...(staff
        ? [
            {
              id: 'limit',
              header: 'Credit limit',
              accessorKey: 'credit_limit',
              cell: ({ getValue }) => (
                <span className="tabular-nums text-sm">
                  {getValue() ? formatMoney(Number(getValue())) : '—'}
                </span>
              ),
            } as ColumnDef<Customer, any>,
          ]
        : []),
      {
        id: 'balance',
        header: 'Owes you',
        accessorKey: 'id',
        cell: ({ row }) => {
          const b = balances[row.original.id] ?? 0
          return (
            <span
              className={
                b > 0.004
                  ? 'font-semibold tabular-nums text-red-600 dark:text-red-400'
                  : b < -0.004
                    ? 'font-semibold tabular-nums text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground tabular-nums'
              }
            >
              {formatMoney(b)}
            </span>
          )
        },
      },
      {
        id: 'status',
        header: '',
        accessorKey: 'is_active',
        cell: ({ row }) =>
          !row.original.is_active ? <Badge variant="warning">Inactive</Badge> : null,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="View details">
              <Link href={`/customers/${row.original.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Edit"
              onClick={(e) => {
                e.stopPropagation()
                openEdit(row.original)
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {staff && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleting(row.original)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [balances, staff]
  )

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Customers</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{customers.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Receivable (on credit)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatMoney(totalReceivable)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Garages &amp; wholesale</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {customers.filter((c) => c.type !== 'retail').length}
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Search name, phone, vehicle notes…"
        emptyMessage="No customers match."
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
        toolbar={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="wholesale">Wholesale</SelectItem>
                <SelectItem value="garage">Garage</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New customer
            </Button>
          </>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit customer' : 'New customer'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cus-name">Customer name *</Label>
              <Input
                id="cus-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Saman Garage"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Customer type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as CustomerType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                  <SelectItem value="garage">Garage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cus-phone">Phone</Label>
              <Input
                id="cus-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="07x xxx xxxx"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cus-email">Email</Label>
              <Input
                id="cus-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cus-nic">NIC</Label>
              <Input
                id="cus-nic"
                value={form.nic}
                onChange={(e) => setForm((f) => ({ ...f, nic: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cus-addr">Address</Label>
              <Input
                id="cus-addr"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cus-limit">Credit limit</Label>
              <Input
                id="cus-limit"
                type="number"
                step="0.01"
                value={form.credit_limit}
                disabled={!staff}
                onChange={(e) => setForm((f) => ({ ...f, credit_limit: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cus-opening">Opening balance (owes you)</Label>
              <Input
                id="cus-opening"
                type="number"
                step="0.01"
                value={form.opening_balance}
                disabled={!staff}
                onChange={(e) =>
                  setForm((f) => ({ ...f, opening_balance: Number(e.target.value) }))
                }
              />
            </div>
            {!staff && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Credit limit, opening balance and active status are managed by managers.
              </p>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cus-vehicles">Vehicle notes</Label>
              <Textarea
                id="cus-vehicles"
                rows={2}
                value={form.vehicle_notes}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_notes: e.target.value }))}
                placeholder="e.g. Honda Fit 2015 · registration WP/KL-4521"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cus-notes">Notes</Label>
              <Textarea
                id="cus-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {staff && (
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  id="cus-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label htmlFor="cus-active">Active</Label>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add customer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete customer?"
        description={
          <>
            <b>{deleting?.name}</b> will be removed from the customer list. Their sales history is
            preserved.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        busy={deleteBusy}
      />
    </>
  )
}
