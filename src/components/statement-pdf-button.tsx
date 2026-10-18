'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generateStatementPdf, downloadPdf, StatementRow } from '@/lib/pdf'

interface Props {
  title: 'Customer Statement' | 'Supplier Statement'
  partyName: string
  partyMeta: string[]
  rows: StatementRow[]
  openingBalance: number
  shop: { name: string; address: string; phone: string; currencySymbol: string }
  filename: string
}

export function StatementPdfButton({
  title,
  partyName,
  partyMeta,
  rows,
  openingBalance,
  shop,
  filename,
}: Props) {
  const [busy, setBusy] = React.useState(false)

  function make() {
    setBusy(true)
    try {
      const dates = rows.map((r) => r.date).sort()
      const doc = generateStatementPdf({
        shopName: shop.name,
        shopAddress: shop.address,
        shopPhone: shop.phone,
        partyName,
        partyMeta,
        title: 'Supplier Statement',
        from: dates[0] ?? new Date().toISOString().slice(0, 10),
        to: dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10),
        openingBalance,
        rows,
        currency: shop.currencySymbol,
        running: true,
      })
      downloadPdf(doc, filename)
      toast.success('Statement downloaded')
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to generate PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={make} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      Statement PDF
    </Button>
  )
}
