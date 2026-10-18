'use client'

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface StatementRow {
  date: string
  reference: string
  description: string
  debit: number  // increases balance owed
  credit: number // decreases balance owed
}

export interface StatementInput {
  shopName: string
  shopAddress: string
  shopPhone: string
  partyName: string
  partyMeta: string[]        // phone / address / terms lines
  title: string              // "Customer Statement" | "Supplier Statement"
  from: string
  to: string
  openingBalance: number
  rows: StatementRow[]
  currency: string           // "Rs."
  running: boolean           // show running balance column
}

/** A4 two-page-friendly account statement with running balance. */
export function generateStatementPdf(i: StatementInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const money = (n: number) =>
    `${i.currency} ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Header
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(i.shopName, 14, 16)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor('#5a5a5a')
  doc.text(i.shopAddress, 14, 21)
  doc.text(i.shopPhone, 14, 25.5)

  doc.setTextColor('#000000')
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(i.title.toUpperCase(), W - 14, 16, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor('#5a5a5a')
  doc.text(`Period: ${i.from} — ${i.to}`, W - 14, 21, { align: 'right' })
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, W - 14, 25.5, {
    align: 'right',
  })

  // Party box
  doc.setDrawColor('#d2d2d2')
  doc.setFillColor('#f7f7f7')
  doc.rect(14, 30, W - 28, 8 + i.partyMeta.length * 4.4, 'FD')
  doc.setTextColor('#000000')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(i.partyName, 17, 36)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor('#464646')
  i.partyMeta.forEach((line, idx) => doc.text(line, 17, 41 + idx * 4.4))

  // Rows
  const body: string[][] = []
  let bal = i.openingBalance
  body.push([
    i.from,
    '—',
    'Opening balance',
    bal > 0 ? money(bal) : '',
    bal < 0 ? money(-bal) : '',
    ...(i.running ? [money(bal)] : []),
  ])
  for (const r of i.rows) {
    bal += r.debit - r.credit
    body.push([
      r.date,
      r.reference,
      r.description,
      r.debit ? money(r.debit) : '',
      r.credit ? money(r.credit) : '',
      ...(i.running ? [money(bal)] : []),
    ])
  }

  autoTable(doc, {
    startY: 30 + 8 + i.partyMeta.length * 4.4 + 4,
    head: [['Date', 'Reference', 'Description', 'Debit', 'Credit', ...(i.running ? ['Balance'] : [])]],
    body,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: '#1e40af', textColor: '#ffffff' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 28 },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      ...(i.running ? { 5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } } : {}),
    },
  })

  // Totals
  const totalDebit = i.rows.reduce((a, r) => a + r.debit, 0)
  const totalCredit = i.rows.reduce((a, r) => a + r.credit, 0)
  // @ts-expect-error lastAutoTable is added by the autotable plugin
  let y: number = (doc.lastAutoTable?.finalY ?? 60) + 8
  if (y > 260) {
    doc.addPage()
    y = 20
  }
  const right = W - 14
  doc.setFontSize(9.5)
  doc.text(`Total Debit: ${money(totalDebit)}`, right, y, { align: 'right' })
  doc.text(`Total Credit: ${money(totalCredit)}`, right, y + 5, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(bal > 0 ? '#b42828' : '#108228')
  doc.text(
    `${bal > 0 ? 'Balance Due (owes you)' : bal < 0 ? 'Balance (advance/credit)' : 'Fully settled'}: ${money(Math.abs(bal))}`,
    right,
    y + 12,
    { align: 'right' }
  )

  doc.setTextColor('#787878')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(`${i.shopName} — computer generated statement, no signature required.`, 14, 287)
  return doc
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename)
}
