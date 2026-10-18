'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Loader2, Printer, FileDown, Receipt } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getBill } from '@/app/(app)/pos/actions'
import { billInvoicePdf, billThermalPdf, printThermalBill } from '@/lib/bill-pdf'
import { formatMoney, formatDateTime } from '@/lib/utils'
import type { BillData } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  partially_returned: 'Partially returned',
  fully_returned: 'Fully returned',
  void: 'Void',
}

/**
 * Bill viewer + printer. Loads through fn_get_bill (cashier-safe — no cost data),
 * then offers thermal print / 80mm PDF / A4 invoice.
 */
export function BillDialog({
  saleId,
  open,
  onOpenChange,
}: {
  saleId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [bill, setBill] = React.useState<BillData | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open || !saleId) return
    setLoading(true)
    setBill(null)
    getBill(saleId)
      .then((r) => {
        if (r.error || !r.bill) toast.error(r.error ?? 'Could not load the bill')
        else setBill(r.bill)
      })
      .finally(() => setLoading(false))
  }, [open, saleId])

  const symbol = bill?.settings?.currency_symbol ?? 'Rs.'
  const s = bill?.sale

  function withBill(fn: (b: BillData) => void) {
    if (!bill) return
    try {
      fn(bill)
    } catch (e: any) {
      toast.error(e?.message ?? 'Print failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Bill {s?.bill_no ?? ''}
          </DialogTitle>
          <DialogDescription>
            {s ? formatDateTime(s.sold_at ?? s.sale_date) : 'Loading bill…'}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {bill && s && (
          <>
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{s.customer_name ?? 'Walk-in customer'}</p>
                  <p className="text-xs text-muted-foreground">Served by {s.cashier_name}</p>
                </div>
                <Badge
                  variant={
                    s.status === 'completed'
                      ? 'success'
                      : s.status === 'void'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {STATUS_LABEL[s.status] ?? s.status}
                </Badge>
              </div>

              <div className="divide-y border-y">
                {bill.items.map((it) => (
                  <div key={it.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{it.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {it.quantity} {it.unit} × {formatMoney(it.unit_price, symbol)}
                        {Number(it.discount) > 0 && ` · −${formatMoney(it.discount, symbol)}`}
                      </p>
                    </div>
                    <p className="shrink-0 tabular-nums">{formatMoney(it.line_total, symbol)}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(s.subtotal, symbol)}</span>
                </div>
                {Number(s.line_discounts) + Number(s.bill_discount) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discounts</span>
                    <span className="tabular-nums">
                      −{formatMoney(Number(s.line_discounts) + Number(s.bill_discount), symbol)}
                    </span>
                  </div>
                )}
                {Number(s.tax_amount) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span className="tabular-nums">{formatMoney(s.tax_amount, symbol)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 text-base font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(s.grand_total, symbol)}</span>
                </div>
                {bill.payments.map((p, i) => (
                  <div key={i} className="flex justify-between text-muted-foreground">
                    <span className="uppercase">
                      {p.method}
                      {p.cheque_status ? ` (${p.cheque_status})` : ''}
                    </span>
                    <span className="tabular-nums">{formatMoney(p.amount, symbol)}</span>
                  </div>
                ))}
                {Number(s.balance_amount) > 0 && (
                  <div className="flex justify-between font-semibold text-red-600 dark:text-red-400">
                    <span>Balance due</span>
                    <span className="tabular-nums">{formatMoney(s.balance_amount, symbol)}</span>
                  </div>
                )}
              </div>
              {s.note && <p className="text-xs text-muted-foreground">Note: {s.note}</p>}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  withBill((b) => {
                    if (!printThermalBill(b, { withBarcode: true }))
                      toast.error('Popup blocked — allow popups to print')
                  })
                }
              >
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  withBill((b) => billThermalPdf(b, { withBarcode: true }).save(`${b.sale.bill_no}.pdf`))
                }
              >
                <FileDown className="h-4 w-4" /> 80mm PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  withBill((b) => billInvoicePdf(b, { copyLabel: 'Customer copy' }).save(`${b.sale.bill_no}-invoice.pdf`))
                }
              >
                <FileDown className="h-4 w-4" /> A4 invoice
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
