import { Badge } from '@/components/ui/badge'
import { stockBadgeVariant } from '@/lib/utils'

export function StockBadge({ qty, reorderLevel }: { qty: number; reorderLevel: number }) {
  const v = stockBadgeVariant(qty, reorderLevel)
  if (v === 'out') return <Badge variant="danger">Out of stock</Badge>
  if (v === 'low')
    return (
      <Badge variant="warning" className="tabular-nums">
        Low · {qty}
      </Badge>
    )
  return (
    <Badge variant="success" className="tabular-nums">
      {qty} in stock
    </Badge>
  )
}
