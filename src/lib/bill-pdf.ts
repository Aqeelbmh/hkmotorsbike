'use client'

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import JsBarcode from 'jsbarcode'
import type { BillData } from '@/lib/types'

const money = (n: number | string, symbol = 'Rs.') =>
  `${symbol} ${Number(n ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dateLabel = (d: string) =>
  new Date(d).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: '2-digit' })

const dateTimeLabel = (d: string) =>
  new Date(d).toLocaleString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/** EAN-13 style strip for the bill number; silently skipped if the value is unusable. */
function barcodePng(value: string): string | null {
  try {
    const digits = value.replace(/\D/g, '').padEnd(12, '0').slice(0, 12)
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, digits, {
      format: 'ean13',
      width: 1.6,
      height: 34,
      fontSize: 11,
      margin: 0,
      displayValue: true,
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

interface BillPrinter {
  /** Bill number printed as a scannable strip. */
  withBarcode?: boolean
  /** Copy label, e.g. "Customer copy". */
  copyLabel?: string
}

/**
 * 80mm thermal receipt — the paper actually loaded in a counter printer.
 * jsPDF cannot resize a page once written, so the layout runs twice: once on a
 * long scratch page to measure the used height, then again at that exact size.
 */
export function billThermalPdf(bill: BillData, opts: BillPrinter = {}): jsPDF {
  const scratch = new jsPDF({ unit: 'mm', format: [80, 400] })
  const used = drawThermal(scratch, bill, opts)
  const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(used + 4, 60)] })
  drawThermal(doc, bill, opts)
  return doc
}

function drawThermal(doc: jsPDF, bill: BillData, opts: BillPrinter): number {
  const symbol = bill.settings?.currency_symbol ?? 'Rs.'
  const s = bill.sale
  let y = 8

  const write = (
    value: string,
    size: number,
    style: 'normal' | 'bold',
    align: 'left' | 'center' | 'right'
  ) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    const x = align === 'center' ? 40 : align === 'right' ? 76 : 4
    doc.text(value, x, y, { align })
    y += size * 0.42
  }
  const rule = () => {
    doc.setLineWidth(0.2)
    doc.line(4, y, 76, y)
    y += 1.4
  }
  const pair = (left: string, right: string, size = 8.5, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.text(left, 4, y)
    doc.text(right, 76, y, { align: 'right' })
    y += size * 0.42
  }

  write(bill.settings?.shop_name ?? 'H.K Motors Bike', 12, 'bold', 'center')
  if (bill.settings?.address) write(bill.settings.address, 7.5, 'normal', 'center')
  if (bill.settings?.phone) write(`Tel: ${bill.settings.phone}`, 7.5, 'normal', 'center')
  if (bill.settings?.tax_number) write(`TIN: ${bill.settings.tax_number}`, 7.5, 'normal', 'center')
  y += 1
  rule()
  write(`BILL ${s.bill_no}`, 10, 'bold', 'center')
  write(dateTimeLabel(s.sold_at ?? s.sale_date), 7.5, 'normal', 'center')
  if (opts.copyLabel) write(opts.copyLabel.toUpperCase(), 7, 'normal', 'center')
  write(`Served by ${s.cashier_name}`, 7.5, 'normal', 'center')
  if (s.customer_name)
    write(`${s.customer_name}${s.customer_phone ? ` · ${s.customer_phone}` : ''}`, 7.5, 'normal', 'center')
  rule()

  for (const item of bill.items) {
    write(item.name, 8, 'bold', 'left')
    pair(`${item.quantity} ${item.unit} x ${money(item.unit_price, symbol)}`, money(item.line_total, symbol), 8)
    if (Number(item.discount) > 0) write(`  discount −${money(item.discount, symbol)}`, 7.5, 'normal', 'left')
  }
  rule()

  pair('Subtotal', money(s.subtotal, symbol))
  if (Number(s.line_discounts) > 0) pair('Line discounts', `−${money(s.line_discounts, symbol)}`)
  if (Number(s.bill_discount) > 0) pair('Bill discount', `−${money(s.bill_discount, symbol)}`)
  if (Number(s.tax_amount) > 0) pair(`${bill.settings?.tax_rate ?? 0}% tax`, money(s.tax_amount, symbol))
  pair('TOTAL', money(s.grand_total, symbol), 11, 'bold')
  for (const pay of bill.payments) {
    const label = `${pay.method.toUpperCase()}${pay.cheque_status ? ` (${pay.cheque_status})` : ''}${
      pay.reference_no ? ` #${pay.reference_no}` : ''
    }`
    pair(label, money(pay.amount, symbol), 8)
  }
  if (Number(s.balance_amount) > 0) pair('BALANCE DUE', money(s.balance_amount, symbol), 9, 'bold')
  if (Number(s.paid_amount) > Number(s.grand_total))
    pair('CHANGE', money(Number(s.paid_amount) - Number(s.grand_total), symbol), 9, 'bold')
  if (s.note) {
    rule()
    write(`Note: ${s.note}`, 7.5, 'normal', 'left')
  }
  rule()
  write(bill.settings?.receipt_footer ?? 'Thank you for your business!', 7.5, 'normal', 'center')
  if (s.status !== 'completed') write(`Status: ${s.status.replace(/_/g, ' ')}`, 7.5, 'bold', 'center')

  if (opts.withBarcode) {
    const png = barcodePng(s.bill_no)
    if (png) {
      y += 2
      try {
        doc.addImage(png, 'PNG', 10, y, 60, 14)
        y += 16
      } catch {
        /* never block a receipt over a barcode */
      }
    }
  }
  return y
}

/** A4 tax invoice — the formal copy for wholesale / garage accounts. */
export function billInvoicePdf(bill: BillData, opts: BillPrinter = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const symbol = bill.settings?.currency_symbol ?? 'Rs.'
  const s = bill.sale
  const W = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(bill.settings?.shop_name ?? 'H.K Motors Bike', 14, 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor('#5a5a5a')
  if (bill.settings?.address) doc.text(bill.settings.address, 14, 24)
  if (bill.settings?.phone) doc.text(`Tel: ${bill.settings.phone}`, 14, 28.5)
  if (bill.settings?.tax_number) doc.text(`TIN: ${bill.settings.tax_number}`, 14, 33)

  doc.setTextColor('#000000')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('TAX INVOICE', W - 14, 18, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text(`Bill no: ${s.bill_no}`, W - 14, 24, { align: 'right' })
  doc.text(`Date: ${dateLabel(s.sale_date)}`, W - 14, 28.5, { align: 'right' })
  doc.text(`Served by: ${s.cashier_name}`, W - 14, 33, { align: 'right' })
  if (opts.copyLabel) doc.text(opts.copyLabel, W - 14, 37.5, { align: 'right' })

  autoTable(doc, {
    startY: 44,
    head: [['#', 'SKU', 'Item', 'Qty', 'Unit price', 'Discount', 'Line total']],
    body: bill.items.map((it, i) => [
      String(i + 1),
      it.sku,
      it.name,
      `${it.quantity} ${it.unit}`,
      money(it.unit_price, symbol),
      Number(it.discount) > 0 ? money(it.discount, symbol) : '—',
      money(it.line_total, symbol),
    ]),
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: '#1e40af', textColor: '#ffffff' },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 28 },
      3: { cellWidth: 22 },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 28, halign: 'right' },
    },
  })

  // @ts-expect-error added by jspdf-autotable
  let y: number = (doc.lastAutoTable?.finalY ?? 70) + 8
  const right = W - 14
  const summary: [string, string][] = [
    ['Subtotal', money(s.subtotal, symbol)],
    ...(Number(s.line_discounts) > 0
      ? ([['Line discounts', `−${money(s.line_discounts, symbol)}`]] as [string, string][])
      : []),
    ...(Number(s.bill_discount) > 0
      ? ([['Bill discount', `−${money(s.bill_discount, symbol)}`]] as [string, string][])
      : []),
    ...(Number(s.tax_amount) > 0
      ? ([[`${bill.settings?.tax_rate ?? 0}% tax`, money(s.tax_amount, symbol)]] as [string, string][])
      : []),
    ['Grand total', money(s.grand_total, symbol)],
  ]
  doc.setFontSize(10)
  for (const [label, value] of summary) {
    doc.setFont('helvetica', label === 'Grand total' ? 'bold' : 'normal')
    doc.text(label, right - 60, y)
    doc.text(value, right, y, { align: 'right' })
    y += 5.5
  }
  for (const pay of bill.payments) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(
      `${pay.method.toUpperCase()}${pay.cheque_status ? ` (${pay.cheque_status})` : ''}${pay.reference_no ? ` #${pay.reference_no}` : ''}`,
      right - 60,
      y
    )
    doc.text(money(pay.amount, symbol), right, y, { align: 'right' })
    y += 5
  }
  if (Number(s.balance_amount) > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#b42828')
    doc.text('Balance due', right - 60, y)
    doc.text(money(s.balance_amount, symbol), right, y, { align: 'right' })
    y += 5
    doc.setTextColor('#000000')
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor('#5a5a5a')
  doc.text(s.note ? `Note: ${s.note}` : '', 14, y + 4, { maxWidth: W - 28 })
  doc.text(bill.settings?.receipt_footer ?? '', 14, y + 12)
  doc.text('Computer generated invoice — no signature required.', 14, 287)
  return doc
}

/**
 * Direct-to-printer path: an 80mm HTML receipt pushed through the browser
 * print dialog. Thermal drivers honour the @page size, so no PDF step is needed.
 */
export function printThermalBill(bill: BillData, opts: BillPrinter = {}): boolean {
  const symbol = bill.settings?.currency_symbol ?? 'Rs.'
  const s = bill.sale
  const esc = (v: unknown) =>
    String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

  const rows = bill.items
    .map(
      (it) => `<tr><td colspan="2" class="nm">${esc(it.name)}</td></tr>
      <tr><td class="dt">${it.quantity} ${esc(it.unit)} × ${money(it.unit_price, symbol)}</td>
      <td class="amt">${money(it.line_total, symbol)}</td></tr>
      ${Number(it.discount) > 0 ? `<tr><td class="dt">discount</td><td class="amt">−${money(it.discount, symbol)}</td></tr>` : ''}`
    )
    .join('')

  const pays = bill.payments
    .map(
      (p) =>
        `<tr><td class="dt">${esc(p.method).toUpperCase()}${p.cheque_status ? ` (${esc(p.cheque_status)})` : ''}${
          p.reference_no ? ` #${esc(p.reference_no)}` : ''
        }</td><td class="amt">${money(p.amount, symbol)}</td></tr>`
    )
    .join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.bill_no)}</title>
  <style>
    @page { size: 80mm auto; margin: 0 }
    * { box-sizing: border-box }
    body { font-family: 'Courier New', monospace; width: 80mm; margin: 0 auto; padding: 4mm 3mm; font-size: 11px; color: #000 }
    h1 { font-size: 15px; text-align: center; margin: 0 0 2mm }
    .c { text-align: center }
    .sub { font-size: 10px }
    hr { border: none; border-top: 1px dashed #000; margin: 2mm 0 }
    table { width: 100%; border-collapse: collapse }
    td { padding: .4mm 0; vertical-align: top }
    td.nm { font-weight: bold; font-size: 11px }
    td.dt { color: #333 }
    td.amt { text-align: right; white-space: nowrap }
    tr.tot td { font-weight: bold; font-size: 13px }
    .foot { font-size: 10px; text-align: center; margin-top: 2mm }
    svg { display: block; margin: 2mm auto 0 }
  </style></head><body>
    <h1>${esc(bill.settings?.shop_name ?? 'H.K Motors Bike')}</h1>
    <div class="c sub">${esc(bill.settings?.address)}<br/>Tel: ${esc(bill.settings?.phone)}${
      bill.settings?.tax_number ? `<br/>TIN: ${esc(bill.settings.tax_number)}` : ''
    }</div>
    <hr/>
    <div class="c"><b>BILL ${esc(s.bill_no)}</b><br/>${esc(dateTimeLabel(s.sold_at ?? s.sale_date))}
      ${opts.copyLabel ? `<br/>${esc(opts.copyLabel)}` : ''}<br/>Served by ${esc(s.cashier_name)}
      ${s.customer_name ? `<br/>${esc(s.customer_name)}${s.customer_phone ? ' · ' + esc(s.customer_phone) : ''}` : ''}
    </div>
    <hr/>
    <table>
      ${rows}
      <tr><td class="dt">Subtotal</td><td class="amt">${money(s.subtotal, symbol)}</td></tr>
      ${Number(s.line_discounts) > 0 ? `<tr><td class="dt">Line discounts</td><td class="amt">−${money(s.line_discounts, symbol)}</td></tr>` : ''}
      ${Number(s.bill_discount) > 0 ? `<tr><td class="dt">Bill discount</td><td class="amt">−${money(s.bill_discount, symbol)}</td></tr>` : ''}
      ${Number(s.tax_amount) > 0 ? `<tr><td class="dt">${esc(bill.settings?.tax_rate ?? 0)}% tax</td><td class="amt">${money(s.tax_amount, symbol)}</td></tr>` : ''}
      <tr class="tot"><td>TOTAL</td><td class="amt">${money(s.grand_total, symbol)}</td></tr>
      ${pays}
      ${Number(s.balance_amount) > 0 ? `<tr class="tot"><td>BALANCE DUE</td><td class="amt">${money(s.balance_amount, symbol)}</td></tr>` : ''}
      ${Number(s.paid_amount) > Number(s.grand_total) ? `<tr class="tot"><td>CHANGE</td><td class="amt">${money(Number(s.paid_amount) - Number(s.grand_total), symbol)}</td></tr>` : ''}
    </table>
    <hr/>
    ${s.note ? `<div class="sub">Note: ${esc(s.note)}</div><hr/>` : ''}
    <div class="foot">${esc(bill.settings?.receipt_footer ?? 'Thank you for your business!')}</div>
    ${s.status !== 'completed' ? `<div class="c sub"><b>Status: ${esc(s.status).replace(/_/g, ' ')}</b></div>` : ''}
    <div id="bc"></div>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <script>
      try {
        if (window.JsBarcode) {
          var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          document.getElementById('bc').appendChild(svg)
          JsBarcode(svg, '${esc(s.bill_no).replace(/[^A-Za-z0-9]/g, '')}'.padEnd(12, '0').slice(0, 12), { format: 'ean13', width: 1.4, height: 34, fontSize: 11, margin: 0, displayValue: true })
        }
      } catch (e) {}
      window.addEventListener('load', function () { setTimeout(function () { window.focus(); window.print() }, 350) })
    </script>
  </body></html>`

  const win = window.open('', 'penzo-bill', 'width=380,height=680')
  if (!win) return false
  win.document.open()
  win.document.write(html)
  win.document.close()
  return true
}
