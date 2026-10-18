'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, ScanBarcode, Trash2, ImagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createProduct, updateProduct } from './actions'
import { productSchema, type ProductInput } from '@/lib/validators'
import { generateBarcode } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import type { Category, ProductFull } from '@/lib/types'

const NONE = '__none__'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  product: ProductFull | null
  categories: Category[]
  onSaved?: () => void
}

function defaultValues(p: ProductFull | null): ProductInput {
  return {
    name: p?.name ?? '',
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    category_id: p?.category_id ?? null,
    brand: p?.brand ?? '',
    unit: p?.unit ?? 'pcs',
    vehicle_make: p?.vehicle_make ?? '',
    vehicle_model: p?.vehicle_model ?? '',
    vehicle_year_from: p?.vehicle_year_from ?? null,
    vehicle_year_to: p?.vehicle_year_to ?? null,
    rack_location: p?.rack_location ?? '',
    cost_price: Number(p?.cost_price ?? 0),
    selling_price: Number(p?.selling_price ?? 0),
    wholesale_price: p?.wholesale_price == null ? null : Number(p.wholesale_price),
    reorder_level: Number(p?.reorder_level ?? 5),
    image_url: p?.image_url ?? '',
    description: p?.description ?? '',
    is_active: p?.is_active ?? true,
  }
}

/** Depth-first ordered categories with indentation labels */
function orderedCategories(cats: Category[]): { id: string; label: string }[] {
  const byParent = new Map<string | null, Category[]>()
  cats.forEach((c) => {
    const key = c.parent_id
    byParent.set(key, [...(byParent.get(key) ?? []), c])
  })
  const out: { id: string; label: string }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const c of byParent.get(parent) ?? []) {
      out.push({ id: c.id, label: `${'  '.repeat(depth)}${c.name}${c.is_active ? '' : ' (inactive)'}` })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export function ProductDialog({ open, onOpenChange, product, categories, onSaved }: Props) {
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductInput>({ resolver: zodResolver(productSchema), values: defaultValues(product) })

  React.useEffect(() => {
    if (open) reset(defaultValues(product))
  }, [open, product, reset])

  const categoryId = watch('category_id')
  const imageUrl = watch('image_url')
  const cost = Number(watch('cost_price')) || 0
  const price = Number(watch('selling_price')) || 0
  const margin = price > 0 ? ((price - cost) / price) * 100 : 0
  const options = React.useMemo(() => orderedCategories(categories), [categories])

  async function uploadImage(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Image must be under 4 MB')
      return
    }
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      setValue('image_url', data.publicUrl, { shouldDirty: true })
      toast.success('Image uploaded')
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onSubmit = handleSubmit(async (data) => {
    setSaving(true)
    try {
      const res = product
        ? await updateProduct(product.id, data)
        : await createProduct(data)
      if (res && 'error' in res && res.error) toast.error(res.error)
      else {
        toast.success(product ? 'Product updated' : 'Product created')
        onOpenChange(false)
        onSaved?.()
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{product ? `Edit — ${product.name}` : 'New product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5" id="product-form">
          {/* Image + core */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted/40 transition-colors hover:border-primary/60"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                )}
              </button>
              {!!imageUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-destructive"
                  onClick={() => setValue('image_url', '')}
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
              />
            </div>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Product name *</Label>
                <Input {...register('name')} placeholder="Oil Filter — Toyota Aqua" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>SKU *</Label>
                <Input {...register('sku')} placeholder="ENG-OC-0012" className="font-mono" />
                {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Barcode</Label>
                <div className="flex gap-1.5">
                  <Input {...register('barcode')} placeholder="auto if empty" className="font-mono" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Generate barcode"
                    onClick={() => setValue('barcode', generateBarcode(), { shouldDirty: true })}
                  >
                    <ScanBarcode className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Classification */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={categoryId ?? NONE}
                onValueChange={(v) =>
                  setValue('category_id', v === NONE ? null : v, { shouldDirty: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Uncategorised" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Uncategorised</SelectItem>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      <span className="font-mono text-[10px]">{o.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Input {...register('brand')} placeholder="Denso, NGK, Bosch…" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input {...register('unit')} list="unit-list" placeholder="pcs" />
              <datalist id="unit-list">
                {['pcs', 'set', 'pair', 'liter', 'meter', 'box', 'can', 'kg'].map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Vehicle compatibility */}
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Vehicle compatibility
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Make</Label>
              <Input {...register('vehicle_make')} placeholder="Toyota" />
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Input {...register('vehicle_model')} placeholder="Aqua" />
            </div>
            <div className="space-y-1.5">
              <Label>Year from</Label>
              <Input {...register('vehicle_year_from')} type="number" placeholder="2014" />
            </div>
            <div className="space-y-1.5">
              <Label>Year to</Label>
              <Input {...register('vehicle_year_to')} type="number" placeholder="2023" />
            </div>
          </div>

          {/* Pricing */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Cost price (Rs.) *</Label>
              <Input {...register('cost_price')} type="number" step="0.01" min="0" className="tabular-nums" />
              {errors.cost_price && (
                <p className="text-xs text-destructive">{errors.cost_price.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Selling price (Rs.) *</Label>
              <Input {...register('selling_price')} type="number" step="0.01" min="0" className="tabular-nums" />
              {errors.selling_price && (
                <p className="text-xs text-destructive">{errors.selling_price.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Wholesale price (Rs.)</Label>
              <Input
                {...register('wholesale_price')}
                type="number"
                step="0.01"
                min="0"
                className="tabular-nums"
              />
            </div>
            <div className="flex flex-col justify-end gap-1 pb-0.5">
              <p className="text-xs text-muted-foreground">Margin</p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  margin >= 25 ? 'text-emerald-600' : margin >= 10 ? 'text-amber-600' : 'text-red-600'
                }`}
              >
                {margin.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Stock + status */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Rack location</Label>
              <Input {...register('rack_location')} placeholder="A1-03" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Reorder level</Label>
              <Input {...register('reorder_level')} type="number" min="0" className="tabular-nums" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                id="p-active"
                checked={watch('is_active')}
                onCheckedChange={(v) => setValue('is_active', v, { shouldDirty: true })}
              />
              <Label htmlFor="p-active">Active (sellable)</Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea {...register('description')} rows={2} placeholder="Notes, specs, OEM reference…" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {product ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
