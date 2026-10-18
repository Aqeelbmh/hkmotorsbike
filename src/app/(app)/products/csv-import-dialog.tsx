'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { FileUp, Loader2, CheckCircle2, XCircle, Download } from 'lucide-react'
import { importProducts } from './actions'
import { parseCsvAsObjects, toCsv, downloadCsv } from '@/lib/csv'
import { productImportRowSchema } from '@/lib/validators'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

const REQUIRED_COLUMNS = ['sku', 'name', 'selling_price', 'cost_price']

interface ParsedRow {
  raw: Record<string, string>
  ok: boolean
  error?: string
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onImported: () => void
}) {
  const [rows, setRows] = React.useState<ParsedRow[]>([])
  const [fileName, setFileName] = React.useState('')
  const [mode, setMode] = React.useState<'skip' | 'update'>('skip')
  const [importing, setImporting] = React.useState(false)
  const [missingCols, setMissingCols] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!open) {
      setRows([])
      setFileName('')
      setMissingCols([])
    }
  }, [open])

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const objs = parseCsvAsObjects(text)
      if (objs.length === 0) {
        toast.error('CSV appears to be empty')
        return
      }
      const header = Object.keys(objs[0])
      const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c))
      setMissingCols(missing)
      if (missing.length) {
        setRows([])
        return
      }
      setFileName(file.name)
      setRows(
        objs.map((raw) => {
          const parsed = productImportRowSchema.safeParse({
            name: raw.name,
            sku: raw.sku,
            barcode: raw.barcode || undefined,
            category: raw.category || undefined,
            brand: raw.brand || undefined,
            unit: raw.unit || undefined,
            vehicle_make: raw.vehicle_make || undefined,
            vehicle_model: raw.vehicle_model || undefined,
            rack_location: raw.rack_location || undefined,
            cost_price: raw.cost_price,
            selling_price: raw.selling_price,
            wholesale_price: raw.wholesale_price || undefined,
            reorder_level: raw.reorder_level || undefined,
          })
          return parsed.success
            ? { raw, ok: true }
            : { raw, ok: false, error: parsed.error.issues[0]?.message }
        })
      )
    }
    reader.readAsText(file)
  }

  async function runImport() {
    setImporting(true)
    try {
      const valid = rows.filter((r) => r.ok).map((r) => r.raw)
      const res = await importProducts(valid, mode)
      if (res.errors.length === 0) toast.success(`${res.inserted} imported, ${res.updated} updated`)
      else
        toast.warning(
          `${res.inserted} imported, ${res.updated} updated — ${res.errors.length} row errors (SKU/barcode duplicates etc.)`
        )
      if (res.inserted + res.updated > 0) onImported()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message ?? 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function downloadTemplate() {
    const header = [
      'sku', 'barcode', 'name', 'category', 'brand', 'unit',
      'vehicle_make', 'vehicle_model', 'rack_location',
      'cost_price', 'selling_price', 'wholesale_price', 'reorder_level',
    ]
    downloadCsv(
      'products-template.csv',
      toCsv(header, [
        ['ENG-XX-9999', '', 'Example Part', 'Engine', 'Denso', 'pcs', 'Toyota', 'Aqua', 'A1-01', '720', '1150', '1000', '10'],
      ])
    )
  }

  const validCount = rows.filter((r) => r.ok).length
  const invalidCount = rows.length - validCount

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>Bulk import products (CSV)</DialogTitle>
          <DialogDescription>
            Columns: {REQUIRED_COLUMNS.join(', ')} (required) plus barcode, category, brand, unit,
            vehicle_make, vehicle_model, rack_location, wholesale_price, reorder_level. Category is
            matched by name or slug.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <FileUp className="h-4 w-4" />
            Choose CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          <Button variant="ghost" size="sm" onClick={downloadTemplate} className="ml-auto">
            <Download className="h-4 w-4" /> Template
          </Button>
        </div>

        {missingCols.length > 0 && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Missing required columns: {missingCols.join(', ')}
          </p>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="success">
                <CheckCircle2 className="mr-1 h-3 w-3" /> {validCount} valid
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="danger">
                  <XCircle className="mr-1 h-3 w-3" /> {invalidCount} invalid
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Existing SKU:</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip (error)</SelectItem>
                    <SelectItem value="update">Update it</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs uppercase">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">SKU</th>
                    <th className="px-2 py-1.5">Name</th>
                    <th className="px-2 py-1.5">Category</th>
                    <th className="px-2 py-1.5">Cost</th>
                    <th className="px-2 py-1.5">Price</th>
                    <th className="px-2 py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1 text-muted-foreground tabular-nums">{i + 2}</td>
                      <td className="px-2 py-1 font-mono text-xs">{r.raw.sku}</td>
                      <td className="max-w-40 truncate px-2 py-1">{r.raw.name}</td>
                      <td className="px-2 py-1">{r.raw.category || '—'}</td>
                      <td className="px-2 py-1 tabular-nums">{r.raw.cost_price}</td>
                      <td className="px-2 py-1 tabular-nums">{r.raw.selling_price}</td>
                      <td className="px-2 py-1">
                        {r.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-destructive">
                            <XCircle className="h-4 w-4" /> {r.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  …and {rows.length - 100} more rows
                </p>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={runImport} disabled={importing || validCount === 0}>
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            Import {validCount > 0 ? `${validCount} rows` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
