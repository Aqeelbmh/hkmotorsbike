'use client'

import * as React from 'react'
import { Download } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DataTable, SortHeader } from '@/components/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatMoney, formatDate } from '@/lib/utils'
import { toCsv, downloadCsv } from '@/lib/csv'
import type { CashUpRow, ProductSalesSummary, StockReportRow } from '@/lib/types'

type DailySales = { sale_date: string; total_sales: number; total_paid: number; total_credit: number; bill_count: number }
type DailyProfit = { sale_date: string; revenue: number; cogs: number; gross_profit: number }
type DailyMoney = { day: string; total: number; entry_count: number }
type ReportKey = 'sales' | 'profit' | 'stock' | 'cashup' | 'pnl'

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'sales', label: 'Daily sales' },
  { key: 'profit', label: 'Profit' },
  { key: 'stock', label: 'Stock valuation' },
  { key: 'cashup', label: 'Cash-up' },
  { key: 'pnl', label: 'P & L' },
]

const inRange = (date: string, from: string, to: string) => date >= from && date <= to

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function ReportsClient({
  salesDaily,
  profitDaily,
  cashUp,
  productSummary,
  stock,
  expenseDaily,
  incomeDaily,
  symbol,
}: {
  salesDaily: DailySales[]
  profitDaily: DailyProfit[]
  cashUp: CashUpRow[]
  productSummary: ProductSalesSummary[]
  stock: StockReportRow[]
  expenseDaily: DailyMoney[]
  incomeDaily: DailyMoney[]
  symbol: string
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [report, setReport] = React.useState<ReportKey>('sales')
  const [from, setFrom] = React.useState(`${today.slice(0, 7)}-01`)
  const [to, setTo] = React.useState(today)

  const sales = React.useMemo(
    () =>
      salesDaily
        .filter((r) => inRange(r.sale_date, from, to))
        .sort((a, b) => a.sale_date.localeCompare(b.sale_date)),
    [salesDaily, from, to]
  )
  const profit = React.useMemo(
    () =>
      profitDaily
        .filter((r) => inRange(r.sale_date, from, to))
        .sort((a, b) => a.sale_date.localeCompare(b.sale_date)),
    [profitDaily, from, to]
  )
  const cashUpRows = React.useMemo(
    () =>
      cashUp
        .filter((r) => inRange(r.sale_date, from, to))
        .sort((a, b) => b.sale_date.localeCompare(a.sale_date)),
    [cashUp, from, to]
  )
  const expenses = React.useMemo(
    () => expenseDaily.filter((r) => inRange(r.day, from, to)),
    [expenseDaily, from, to]
  )
  const incomes = React.useMemo(
    () => incomeDaily.filter((r) => inRange(r.day, from, to)),
    [incomeDaily, from, to]
  )

  const sum = <T,>(list: T[], fn: (t: T) => number) => list.reduce((a, t) => a + fn(t), 0)
  const salesTotals = {
    bills: sum(sales, (r) => r.bill_count),
    sales: sum(sales, (r) => Number(r.total_sales)),
    paid: sum(sales, (r) => Number(r.total_paid)),
    credit: sum(sales, (r) => Number(r.total_credit)),
  }
  const profitTotals = {
    revenue: sum(profit, (r) => Number(r.revenue)),
    cogs: sum(profit, (r) => Number(r.cogs)),
    gp: sum(profit, (r) => Number(r.gross_profit)),
  }
  const expenseTotal = sum(expenses, (r) => Number(r.total))
  const incomeTotal = sum(incomes, (r) => Number(r.total))
  const netProfit = profitTotals.gp + incomeTotal - expenseTotal

  const topProducts = React.useMemo(
    () => [...productSummary].sort((a, b) => Number(b.gross_profit) - Number(a.gross_profit)).slice(0, 10),
    [productSummary]
  )

  const stockTotals = {
    units: sum(stock, (r) => Number(r.qty_on_hand)),
    cost: sum(stock, (r) => Number(r.value_at_cost)),
    sale: sum(stock, (r) => Number(r.value_at_sale)),
  }

  const cashUpByDate = React.useMemo(() => {
    const map = new Map<string, CashUpRow[]>()
    for (const r of cashUpRows) {
      map.set(r.sale_date, [...(map.get(r.sale_date) ?? []), r])
    }
    return [...map.entries()]
  }, [cashUpRows])

  const stockColumns = React.useMemo<ColumnDef<StockReportRow, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>Product</SortHeader>,
        accessorKey: 'name',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.sku}
              {row.original.category_name ? ` · ${row.original.category_name}` : ''}
            </p>
          </div>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>On hand</SortHeader>,
        accessorKey: 'qty_on_hand',
        cell: ({ row }) => (
          <span
            className={
              Number(row.original.qty_on_hand) <= Number(row.original.reorder_level)
                ? 'font-medium tabular-nums text-red-600 dark:text-red-400'
                : 'tabular-nums'
            }
          >
            {Number(row.original.qty_on_hand)} {row.original.unit}
          </span>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Cost</SortHeader>,
        accessorKey: 'cost_price',
        cell: ({ getValue }) => <span className="tabular-nums">{formatMoney(Number(getValue()), symbol)}</span>,
      },
      {
        header: ({ column }) => <SortHeader column={column}>Value at cost</SortHeader>,
        accessorKey: 'value_at_cost',
        cell: ({ getValue }) => (
          <span className="font-medium tabular-nums">{formatMoney(Number(getValue()), symbol)}</span>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Value at sale</SortHeader>,
        accessorKey: 'value_at_sale',
        cell: ({ getValue }) => <span className="tabular-nums">{formatMoney(Number(getValue()), symbol)}</span>,
      },
      {
        header: ({ column }) => <SortHeader column={column}>In / out</SortHeader>,
        accessorKey: 'qty_in',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {Number(row.original.qty_in)} / {Number(row.original.qty_out)}
          </span>
        ),
      },
    ],
    [symbol]
  )

  function exportCsv() {
    const stamp = `${from}_${to}`
    if (report === 'sales') {
      downloadCsv(
        `sales_${stamp}.csv`,
        toCsv(
          ['Date', 'Bills', 'Sales', 'Collected', 'Credit'],
          sales.map((r) => [r.sale_date, r.bill_count, Number(r.total_sales), Number(r.total_paid), Number(r.total_credit)])
        )
      )
    } else if (report === 'profit') {
      downloadCsv(
        `profit_${stamp}.csv`,
        toCsv(
          ['Date', 'Revenue', 'COGS', 'Gross profit'],
          profit.map((r) => [r.sale_date, Number(r.revenue), Number(r.cogs), Number(r.gross_profit)])
        )
      )
    } else if (report === 'stock') {
      downloadCsv(
        'stock_valuation.csv',
        toCsv(
          ['SKU', 'Name', 'Category', 'On hand', 'Unit', 'Cost', 'Value at cost', 'Value at sale'],
          stock.map((r) => [
            r.sku, r.name, r.category_name ?? '', Number(r.qty_on_hand), r.unit,
            Number(r.cost_price), Number(r.value_at_cost), Number(r.value_at_sale),
          ])
        )
      )
    } else if (report === 'cashup') {
      downloadCsv(
        `cashup_${stamp}.csv`,
        toCsv(
          ['Date', 'Method', 'Payments', 'Amount'],
          cashUpRows.map((r) => [r.sale_date, r.method, r.payment_count, Number(r.amount)])
        )
      )
    } else {
      downloadCsv(
        `pnl_${stamp}.csv`,
        toCsv(
          ['Line', 'Amount'],
          [
            ['Revenue', profitTotals.revenue],
            ['Cost of goods sold', -profitTotals.cogs],
            ['Gross profit', profitTotals.gp],
            ['Other income', incomeTotal],
            ['Expenses', -expenseTotal],
            ['Net profit', netProfit],
          ]
        )
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              onClick={() => setReport(r.key)}
              className={
                report === r.key
                  ? 'rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow-sm'
                  : 'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground'
              }
            >
              {r.label}
            </button>
          ))}
        </div>
        {report !== 'stock' && (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {report === 'sales' && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Bills" value={String(salesTotals.bills)} />
            <Stat label="Sales" value={formatMoney(salesTotals.sales, symbol)} />
            <Stat label="Collected" value={formatMoney(salesTotals.paid, symbol)} />
            <Stat label="On credit" value={formatMoney(salesTotals.credit, symbol)} tone="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="h-64 rounded-lg border bg-card p-4 shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sales}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="sale_date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => formatMoney(Number(v), symbol)} labelFormatter={(l) => formatDate(String(l))} />
                <Bar dataKey="total_sales" name="Sales" className="fill-primary" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((r) => (
                  <TableRow key={r.sale_date}>
                    <TableCell className="tabular-nums">{formatDate(r.sale_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.bill_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.total_sales, symbol)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.total_paid, symbol)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.total_credit, symbol)}</TableCell>
                  </TableRow>
                ))}
                {sales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      No sales in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {sales.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{salesTotals.bills}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(salesTotals.sales, symbol)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(salesTotals.paid, symbol)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(salesTotals.credit, symbol)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </>
      )}

      {report === 'profit' && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Revenue" value={formatMoney(profitTotals.revenue, symbol)} />
            <Stat label="Cost of goods sold" value={formatMoney(profitTotals.cogs, symbol)} />
            <Stat
              label="Gross profit"
              value={formatMoney(profitTotals.gp, symbol)}
              tone={profitTotals.gp >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
              hint={profitTotals.revenue > 0 ? `${((profitTotals.gp / profitTotals.revenue) * 100).toFixed(1)}% margin` : undefined}
            />
          </div>
          <div className="h-64 rounded-lg border bg-card p-4 shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={profit}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="sale_date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => formatMoney(Number(v), symbol)} labelFormatter={(l) => formatDate(String(l))} />
                <Line type="monotone" dataKey="gross_profit" name="Gross profit" className="stroke-emerald-500" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="revenue" name="Revenue" className="stroke-primary" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border bg-card shadow-sm">
              <p className="border-b px-4 py-2.5 text-sm font-medium">Daily gross profit</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profit.map((r) => (
                    <TableRow key={r.sale_date}>
                      <TableCell className="tabular-nums">{formatDate(r.sale_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(r.revenue, symbol)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(r.cogs, symbol)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.gross_profit, symbol)}</TableCell>
                    </TableRow>
                  ))}
                  {profit.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No sales in this range.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="rounded-lg border bg-card shadow-sm">
              <p className="border-b px-4 py-2.5 text-sm font-medium">Top products by gross profit (all time)</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty sold</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((p) => (
                    <TableRow key={p.product_id}>
                      <TableCell>
                        <p className="text-sm font-medium">{p.product_name}</p>
                        <p className="text-xs text-muted-foreground">{p.sku}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(p.qty_sold)} {p.unit}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(p.gross_profit, symbol)}</TableCell>
                    </TableRow>
                  ))}
                  {topProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        Nothing sold yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {report === 'stock' && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Units on hand" value={stockTotals.units.toLocaleString()} />
            <Stat label="Value at cost" value={formatMoney(stockTotals.cost, symbol)} />
            <Stat label="Value at sale" value={formatMoney(stockTotals.sale, symbol)} hint={`Potential margin ${formatMoney(stockTotals.sale - stockTotals.cost, symbol)}`} />
          </div>
          <DataTable
            columns={stockColumns}
            data={stock}
            searchPlaceholder="Search SKU, name, category…"
            emptyMessage="No products."
          />
        </>
      )}

      {report === 'cashup' && (
        <div className="space-y-3">
          {cashUpByDate.map(([date, rows]) => (
            <div key={date} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium tabular-nums">{formatDate(date)}</p>
                <p className="font-semibold tabular-nums">
                  {formatMoney(sum(rows, (r) => Number(r.amount)), symbol)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {rows.map((r) => (
                  <Badge key={r.method} variant="outline" className="gap-1.5 px-2.5 py-1 text-sm">
                    <span className="capitalize">{r.method}</span>
                    <span className="tabular-nums">{formatMoney(r.amount, symbol)}</span>
                    <span className="text-xs text-muted-foreground">×{r.payment_count}</span>
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {cashUpByDate.length === 0 && (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
              No takings in this range.
            </div>
          )}
        </div>
      )}

      {report === 'pnl' && (
        <div className="max-w-2xl space-y-4">
          <div className="rounded-lg border bg-card shadow-sm">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Revenue (sales)</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(profitTotals.revenue, symbol)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Cost of goods sold</TableCell>
                  <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                    ({formatMoney(profitTotals.cogs, symbol)})
                  </TableCell>
                </TableRow>
                <TableRow className="bg-muted/40 font-medium">
                  <TableCell>Gross profit</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(profitTotals.gp, symbol)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Other income</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatMoney(incomeTotal, symbol)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Expenses</TableCell>
                  <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                    ({formatMoney(expenseTotal, symbol)})
                  </TableCell>
                </TableRow>
                <TableRow className="bg-muted/40 text-base font-semibold">
                  <TableCell>Net profit</TableCell>
                  <TableCell
                    className={
                      netProfit >= 0
                        ? 'text-right tabular-nums text-emerald-600 dark:text-emerald-400'
                        : 'text-right tabular-nums text-red-600 dark:text-red-400'
                    }
                  >
                    {formatMoney(netProfit, symbol)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Range {formatDate(from)} → {formatDate(to)}. Gross profit uses the cost price snapshotted on each bill line;
            expenses and other income come from the Expenses &amp; Income register.
          </p>
        </div>
      )}
    </div>
  )
}
