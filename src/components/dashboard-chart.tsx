'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney, formatDate } from '@/lib/utils'

export interface DailyPoint {
  date: string
  sales: number
  profit: number | null
}

export function SalesProfitChart({
  data,
  symbol,
  showProfit,
}: {
  data: DailyPoint[]
  symbol: string
  showProfit: boolean
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No sales in the last 30 days.
      </div>
    )
  }
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={11} interval="preserveStartEnd" />
          <YAxis fontSize={11} />
          <Tooltip
            formatter={(v, name) => [formatMoney(Number(v), symbol), name === 'sales' ? 'Sales' : 'Gross profit']}
            labelFormatter={(l) => formatDate(String(l))}
          />
          <Bar dataKey="sales" name="sales" className="fill-primary/80" radius={[3, 3, 0, 0]} />
          {showProfit && (
            <Line
              type="monotone"
              dataKey="profit"
              name="profit"
              className="stroke-emerald-500"
              strokeWidth={2}
              dot={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
