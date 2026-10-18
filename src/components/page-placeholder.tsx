import { Wrench, Construction } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string
  description: string
  phase: number
}) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Construction className="h-5 w-5 text-muted-foreground" />
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="secondary">Phase {phase}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" /> Scheduled for Phase {phase}
          </CardTitle>
          <CardDescription>
            The database tables, RLS policies and RPC functions powering this module are already
            live in Supabase (see <code>supabase/schema.sql</code>). The UI ships in Phase {phase}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg border border-dashed bg-muted/40" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
