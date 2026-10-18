'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ColumnDef } from '@tanstack/react-table'
import { Plus, Pencil, Trash2, Eye, Loader2, Truck } from 'lucide-react'
import { createSupplier, updateSupplier, deleteSupplier } from './actions'
import { supplierSchema, SupplierForm } from '@/lib/validators'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { formatMoney } from '@/lib/utils'
import type { Supplier } from '@/lib/types'

interface Props {
  suppliers: Supplier[]
  balances: Record<string, number>
}

const EMPTY: SupplierForm = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  tax_number: '',
  credit_terms_days: 0,
  opening_balance: 0,
  notes: '',
  is_active: true,
}

export function SupplierManager({ suppliers, balances }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Supplier | null>(null)
  const [form, setForm] = React.useState<SupplierForm>(EMPTY)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState<Supplier | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setDialogOpen(true)
  }

  function openEdit(s: Supplier) {
    setEditing(s)
    setForm({
      name: s.name,
      contact_person: s.contact_person ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      tax_number: s.tax_number ?? '',
      credit_terms_days: s.credit_terms_days,
      opening_balance: s.opening_balance,
      notes: s.notes ?? '',
      is_active: s.is_active,
    })
    setDialogOpen(true)
  }

  async function submit() {
    setSaving(true)
    try {
      const parsed = supplierSchema.safeParse(form)
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message)
        return
      }
      const res = editing
        ? await updateSupplier(editing.id, form)
        : await createSupplier(form)
      if (res && 'error' in res && res.error) toast.error(res.error)
      else {
        toast.success(editing ? 'Supplier updated' : 'Supplier added')
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
      const res = await deleteSupplier(deleting.id)
      if (res && 'error' in res && res.error) toast.error(res.error)
      else {
        toast.success('Supplier deleted')
        setDeleting(null)
        router.refresh()
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  const totalOutstanding = suppliers.reduce((a, s) => a + Math.max(balances[s.id] ?? 0, 0), 0)

  const columns = React.useMemo<ColumnDef<Supplier, any>[]>(
    () => [
      {
        header: 'Supplier',
        accessorKey: 'name',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Truck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.contact_person || row.original.email || '—'}
              </p>
            </div>
          </div>
        ),
      },
      {
        header: 'Phone',
        accessorKey: 'phone',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-sm">{getValue() || '—'}</span>
        ),
      },
      {
        header: 'Terms',
        accessorKey: 'credit_terms_days',
        cell: ({ getValue }) => {
          const d = getValue() as number
          return (
            <Badge variant={d > 0 ? 'secondary' : 'outline'}>
              {d > 0 ? `Net ${d}` : 'COD'}
            </Badge>
          )
        },
      },
      {
        id: 'balance',
        header: 'Outstanding',
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
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="View details"
            >
              <Link href={`/suppliers/${row.original.id}`}>
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
          </div>
        ),
      },
    ],
    [balances]
  )

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Suppliers</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{suppliers.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Payable to suppliers</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatMoney(totalOutstanding)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">On credit terms</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {suppliers.filter((s) => s.credit_terms_days > 0).length}
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={suppliers}
        searchPlaceholder="Search name, phone, contact…"
        emptyMessage="No suppliers yet. Add your first trade supplier."
        onRowClick={(s) => router.push(`/suppliers/${s.id}`)}
        toolbar={
          <>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New supplier
            </Button>
          </>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit supplier' : 'New supplier'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-name">Supplier name *</Label>
              <Input
                id="sup-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Tokyo Diesel Supplies"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-contact">Contact person</Label>
              <Input
                id="sup-contact"
                value={form.contact_person}
                onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-phone">Phone</Label>
              <Input
                id="sup-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="07x xxx xxxx"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-email">Email</Label>
              <Input
                id="sup-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-tax">Tax number</Label>
              <Input
                id="sup-tax"
                value={form.tax_number}
                onChange={(e) => setForm((f) => ({ ...f, tax_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-addr">Address</Label>
              <Input
                id="sup-addr"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-terms">Credit terms (days)</Label>
              <Input
                id="sup-terms"
                type="number"
                min={0}
                value={form.credit_terms_days}
                onChange={(e) =>
                  setForm((f) => ({ ...f, credit_terms_days: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-opening">Opening balance (you owe)</Label>
              <Input
                id="sup-opening"
                type="number"
                step="0.01"
                value={form.opening_balance}
                onChange={(e) =>
                  setForm((f) => ({ ...f, opening_balance: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-notes">Notes</Label>
              <Textarea
                id="sup-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                id="sup-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <Label htmlFor="sup-active">Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add supplier'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete supplier?"
        description={
          <>
            <b>{deleting?.name}</b> will be hidden from the supplier list. Historical purchases
            and payments are kept intact.
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
