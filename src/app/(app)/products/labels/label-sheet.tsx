'use client'

import * as React from 'react'
import Link from 'next/link'
import JsBarcode from 'jsbarcode'
import { Printer, ArrowLeft, PackageX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatMoney } from '@/lib/utils'

interface LabelProduct {
  id: string
  name: string
  sku: string
  barcode: string | null
  selling_price: number | string
}

const SIZES = [
  { id: '40x30', label: '40 × 30 mm', w: 40, h: 30, perRow: 4 },
  { id: '50x35', label: '50 × 35 mm', w: 50, h: 35, perRow: 3 },
  { id: '65x40', label: '65 × 40 mm', w: 65, h: 40, perRow: 3 },
] as const

function BarcodeSvg({ value, height }: { value: string; height: number }) {
  const ref = React.useRef<SVGSVGElement>(null)
  React.useEffect(() => {
    if (!ref.current) return
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        height,
        width: 1.4,
        fontSize: 9,
        margin: 0,
        lineColor: '#000',
        displayValue: true,
      })
    } catch {
      /* invalid chars for CODE128 — leave blank */
    }
  }, [value, height])
  return <svg ref={ref} className="max-w-full" />
}

export function LabelSheet({ products }: { products: LabelProduct[] }) {
  const [sizeId, setSizeId] = React.useState<string>('50x35')
  const [copies, setCopies] = React.useState(2)

  const size = SIZES.find((s) => s.id === sizeId)!
  const labels = products.flatMap((p) => Array.from({ length: copies }, () => p))

  if (products.length === 0) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <PackageX className="h-10 w-10" />
        <p>No products selected. Choose products in the table and click “Print labels”.</p>
        <Button asChild variant="outline">
          <Link href="/products">
            <ArrowLeft className="h-4 w-4" /> Back to products
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="print-hidden flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/products">
            <ArrowLeft className="h-4 w-4" /> Products
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">{products.length} products · {labels.length} labels</h1>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Size</Label>
            <Select value={sizeId} onValueChange={setSizeId}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Copies / product</Label>
            <Select value={String(copies)} onValueChange={(v) => setCopies(Number(v))}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 4, 8, 12].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print sheet
          </Button>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white; }
          .print-hidden { display: none !important; }
          main { padding: 0 !important; background: white !important; overflow: visible !important; }
          .label-grid { border: none !important; box-shadow: none !important; }
        }
      `}</style>

      <div
        className="print-area label-grid mx-auto rounded-lg border bg-white p-3 shadow-sm"
        style={{ width: '210mm', maxWidth: '100%' }}
      >
        <div
          className="flex flex-wrap"
          style={{ gap: '2mm' }}
        >
          {labels.map((p, i) => (
            <div
              key={`${p.id}-${i}`}
              className="flex flex-col items-center justify-between overflow-hidden rounded-[2px] border border-slate-200 p-1.5 text-center"
              style={{ width: `${size.w - 4}mm`, height: `${size.h - 4}mm` }}
            >
              <p className="w-full truncate text-[8px] font-semibold leading-tight text-black">
                {p.name}
              </p>
              {p.barcode ? (
                <BarcodeSvg value={p.barcode} height={size.h > 32 ? 22 : 16} />
              ) : (
                <p className="text-[8px] text-slate-400">no barcode</p>
              )}
              <div className="flex w-full items-center justify-between px-0.5 text-[8px] leading-tight text-black">
                <span className="truncate font-mono">{p.sku}</span>
                <span className="font-bold tabular-nums">{formatMoney(p.selling_price)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
