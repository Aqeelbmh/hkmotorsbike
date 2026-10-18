'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Layers,
  Loader2,
} from 'lucide-react'
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from './actions'
import { categorySchema } from '@/lib/validators'
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
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Category } from '@/lib/types'

const NONE = '__none__'

interface Props {
  categories: Category[]
  counts: Record<string, number>
}

interface Node extends Category {
  children: Node[]
}

function buildTree(categories: Category[]): Node[] {
  const map = new Map<string, Node>()
  categories.forEach((c) => map.set(c.id, { ...c, children: [] }))
  const roots: Node[] = []
  categories.forEach((c) => {
    const node = map.get(c.id)!
    if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id)!.children.push(node)
    else roots.push(node)
  })
  const sort = (arr: Node[]) => {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    arr.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

export function CategoryManager({ categories, counts }: Props) {
  const router = useRouter()
  const tree = React.useMemo(() => buildTree(categories), [categories])
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(categories.filter((c) => c.parent_id === null).map((c) => c.id))
  )

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Category | null>(null)
  const [form, setForm] = React.useState({
    name: '',
    parent_id: null as string | null,
    description: '',
    sort_order: 0,
    is_active: true,
  })
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState<Category | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openCreate(parentId: string | null = null) {
    setEditing(null)
    setForm({ name: '', parent_id: parentId, description: '', sort_order: 0, is_active: true })
    setDialogOpen(true)
  }

  function openEdit(c: Category) {
    setEditing(c)
    setForm({
      name: c.name,
      parent_id: c.parent_id,
      description: c.description ?? '',
      sort_order: c.sort_order,
      is_active: c.is_active,
    })
    setDialogOpen(true)
  }

  async function submit() {
    setSaving(true)
    try {
      const payload = { ...form }
      const parsed = categorySchema.safeParse(payload)
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message)
        return
      }
      const res = editing
        ? await updateCategory(editing.id, payload)
        : await createCategory(payload)
      if (res && 'error' in res && res.error) toast.error(res.error)
      else {
        toast.success(editing ? 'Category updated' : 'Category created')
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
      const res = await deleteCategory(deleting.id)
      if (res && 'error' in res && res.error) toast.error(res.error)
      else {
        toast.success('Category deleted')
        setDeleting(null)
        router.refresh()
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  const parentOptions = categories.filter((c) => !editing || c.id !== editing.id)

  function renderNode(node: Node, depth: number) {
    const hasChildren = node.children.length > 0
    const isOpen = expanded.has(node.id)
    const productCount = counts[node.id] ?? 0
    const childCount = node.children.length

    return (
      <React.Fragment key={node.id}>
        <div
          className={cn(
            'group flex items-center gap-2 rounded-md border-b border-transparent px-2 py-2 transition-colors hover:bg-accent/60',
            !node.is_active && 'opacity-50'
          )}
          style={{ paddingLeft: `${8 + depth * 22}px` }}
        >
          <button
            onClick={() => toggle(node.id)}
            className={cn('flex h-6 w-6 items-center justify-center rounded', !hasChildren && 'invisible')}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            {depth === 0 ? <FolderTree className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{node.name}</p>
            <p className="truncate text-xs text-muted-foreground">{node.slug}</p>
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex tabular-nums">
            {productCount} product{productCount === 1 ? '' : 's'}
          </Badge>
          {childCount > 0 && (
            <Badge variant="outline" className="tabular-nums">
              {childCount} sub
            </Badge>
          )}
          {!node.is_active && <Badge variant="warning">Inactive</Badge>}
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(node)} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCreate(node.id)} title="Add sub-category">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(node)} title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {isOpen && node.children.map((child) => renderNode(child, depth + 1))}
      </React.Fragment>
    )
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">{categories.length} categories</p>
          <Button size="sm" onClick={() => openCreate(null)}>
            <Plus className="h-4 w-4" /> New category
          </Button>
        </div>
        <CardContent className="p-2">
          {tree.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
              <p className="text-sm">No categories yet.</p>
              <Button onClick={() => openCreate(null)}>
                <Plus className="h-4 w-4" /> Add first category
              </Button>
            </div>
          ) : (
            <div>{tree.map((n) => renderNode(n, 0))}</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit category' : 'New category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Engine, Brake Pads"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Parent category</Label>
              <Select
                value={form.parent_id ?? NONE}
                onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v === NONE ? null : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (top level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None (top level)</SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cat-sort">Sort order</Label>
                <Input
                  id="cat-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  id="cat-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label htmlFor="cat-active">Active</Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete category?"
        description={
          <>
            <b>{deleting?.name}</b> will be removed from the catalogue tree. Categories with products
            or sub-categories cannot be deleted.
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
