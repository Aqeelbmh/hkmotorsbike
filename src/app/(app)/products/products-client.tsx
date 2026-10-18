'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ColumnDef,
} from '@tanstack/react-table'
import {
  Pencil,
  Trash2,
  Plus,
  Upload,
  Download,
  Tags,
  PackageX,
  RotateCcw,
} from 'lucide-react'
import { deleteProduct, restoreProduct } from './actions'
import { DataTable, SortHeader } from '@/components/data-table'
import { PageHeader } from '@/components/page-header'
import { StockBadge } from '@/components/stock-badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProductDialog } from './product-dialog'
import { CsvImportDialog } from './csv-import-dialog'
import { formatMoney, cn } from '@/lib/utils'
import { toCsv, downloadCsv } from '@/lib/csv'
import type { Category, ProductFull, ProductPOS } from '@/lib/types'

type Row = (ProductFull | ProductPOS) & { cost_price?: number; is_deleted?: boolean }

export function ProductsClient({
  products,
  categories,
  staff,
}: {
  products: (ProductFull | ProductPOS)[]
  categories: Category[]
  staff: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<Row | null | 'new'>(null)
  const [importOpen, setImportOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Row[]>([])
  const [deleting, setDeleting] = React.useState<Row | null>(null)
  const [busy, setBusy] = React.useState(false)

  function exportCsv() {
    const header = [
      'sku', 'barcode', 'name', 'category', 'brand', 'unit',
      'vehicle_make', 'vehicle_model', 'rack_location',
      ...(staff ? ['cost_price'] : []),
      'selling_price', 'wholesale_price', 'reorder_level', 'qty_on_hand', 'is_active',
    ]
    const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? ''
    const rows = products.map((p: any) => [
      p.sku, p.barcode ?? '', p.name, catName(p.category_id), p.brand ?? '', p.unit,
      p.vehicle_make ?? '', p.vehicle_model ?? '', p.rack_location ?? '',
      ...(staff ? [p.cost_price ?? ''] : []),
      p.selling_price, p.wholesale_price ?? '', p.reorder_level, p.qty_on_hand,
      p.is_active ? 'yes' : 'no',
    ])
    downloadCsv('products.csv', toCsv(header, rows))
    toast.success(`Exported ${rows.length} products`)
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      const res = await deleteProduct(deleting.id)
      if (res && 'error' in res && res.error) toast.error(res.error)
      else {
        toast.success('Product deleted')
        setDeleting(null)
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  const restore = React.useCallback(
    async (p: Row) => {
      const res = await restoreProduct(p.id)
      if (res && 'error' in res && res.error) toast.error(res.error)
      else {
        toast.success('Product restored')
        router.refresh()
      }
    },
    [router]
  )

  const columns = React.useMemo<ColumnDef<Row>[]>(() => {
    const cols: ColumnDef<Row>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-blue-600"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!row.getCanSelect()}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => <SortHeader column={column}>Product</SortHeader>,
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border bg-muted">
              {row.original.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.original.image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                  {(row.original.brand ?? '—').slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.sku}
                {row.original.barcode ? ` · ${row.original.barcode}` : ''}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'category_name',
        header: 'Category',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.category_name ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'brand',
        header: 'Brand',
        cell: ({ row }) => <span className="text-sm">{row.original.brand ?? '—'}</span>,
      },
      {
        accessorKey: 'rack_location',
        header: 'Rack',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.rack_location ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'selling_price',
        header: ({ column }) => <SortHeader column={column}>Sale Price</SortHeader>,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm font-medium">
            {formatMoney(row.original.selling_price)}
          </span>
        ),
      },
      {
        accessorKey: 'wholesale_price',
        header: 'Wholesale',
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">
            {row.original.wholesale_price ? formatMoney(row.original.wholesale_price) : '—'}
          </span>
        ),
      },
      ...(staff
        ? [
            {
              accessorKey: 'cost_price',
              header: ({ column }: any) => <SortHeader column={column}>Cost</SortHeader>,
              cell: ({ row }: any) => (
                <span className="tabular-nums text-sm">{formatMoney(row.original.cost_price)}</span>
              ),
            } as ColumnDef<Row>,
            {
              id: 'margin',
              accessorFn: (p: any) =>
                p.selling_price ? ((p.selling_price - p.cost_price) / p.selling_price) * 100 : 0,
              header: ({ column }: any) => <SortHeader column={column}>Margin %</SortHeader>,
              cell: ({ row }: any) => {
                const m = row.getValue('margin') as number
                return (
                  <Badge
                    variant={m >= 25 ? 'success' : m >= 10 ? 'warning' : 'danger'}
                    className="tabular-nums"
                  >
                    {m.toFixed(0)}%
                  </Badge>
                )
              },
            } as ColumnDef<Row>,
          ]
        : []),
      {
        accessorKey: 'qty_on_hand',
        header: ({ column }) => <SortHeader column={column}>Stock</SortHeader>,
        cell: ({ row }) => (
          <StockBadge
            qty={Number(row.original.qty_on_hand)}
            reorderLevel={Number(row.original.reorder_level)}
          />
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => {
          const p = row.original
          if ((p as any).is_deleted)
            return <Badge variant="danger" className={cn('gap-1')}><PackageX className="h-3 w-3" /> Deleted</Badge>
          if (!p.is_active) return <Badge variant="secondary">Inactive</Badge>
          return <Badge variant="success">Active</Badge>
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const p = row.original
          if (!staff) return null
          if ((p as any).is_deleted)
            return (
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); restore(p) }}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </Button>
            )
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(p)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleting(p)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        },
      },
    ]
    return cols
  }, [staff, restore])

  const labelIds = selected.map((p) => p.id).join(',')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description={`${products.length} items in catalogue${staff ? '' : ' (view only)'}`}
        actions={
          staff && (
            <>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
              <Button
                size="sm"
                asChild={!!labelIds}
                variant={labelIds ? 'default' : 'outline'}
                disabled={!labelIds}
              >
                {labelIds ? (
                  <Link href={`/products/labels?ids=${labelIds}`}>
                    <Tags className="h-4 w-4" /> Print labels ({selected.length})
                  </Link>
                ) : (
                  <span>
                    <Tags className="h-4 w-4" /> Print labels
                  </span>
                )}
              </Button>
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus className="h-4 w-4" /> New product
              </Button>
            </>
          )
        }
      />

      <DataTable
        columns={columns}
        data={products as Row[]}
        searchPlaceholder="Search name, SKU, barcode, brand…"
        enableRowSelection={staff}
        rowCanSelect={(p) => !p.is_deleted}
        onSelectionChange={(rows) => setSelected(rows as Row[])}
        onRowClick={staff ? (p) => setEditing(p) : undefined}
        emptyMessage="No products yet — add one or import a CSV."
      />

      {staff && (
        <>
          <ProductDialog
            open={editing !== null}
            onOpenChange={(v) => !v && setEditing(null)}
            product={editing === 'new' ? null : (editing as unknown as ProductFull)}
            categories={categories}
            onSaved={() => router.refresh()}
          />
          <CsvImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={() => router.refresh()}
          />
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete product?"
        description={
          <>
            <b>{deleting?.name}</b> will be hidden from the catalogue. Stock history is preserved —
            you can restore it later from the Deleted filter.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        busy={busy}
      />
    </div>
  )
}
