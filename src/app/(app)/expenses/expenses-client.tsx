'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ColumnDef } from '@tanstack/react-table'
import { Download, Loader2, Plus, Repeat, Trash2 } from 'lucide-react'
import { DataTable, SortHeader } from '@/components/data-table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createExpense,
  deleteExpense,
  createIncome,
  deleteIncome,
  createExpenseCategory,
} from './actions'
import { formatMoney, formatDate } from '@/lib/utils'
import { toCsv, downloadCsv } from '@/lib/csv'
import type {
  ExpenseCategory,
  ExpenseRow,
  IncomeRow,
  PaymentMethod,
  RecurringInterval,
} from '@/lib/types'

type Tab = 'expenses' | 'income' | 'categories'
const METHODS: PaymentMethod[] = ['cash', 'card', 'bank', 'cheque', 'credit']
const INTERVALS: RecurringInterval[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

export function ExpensesClient({
  expenses,
  income,
  categories,
  symbol,
}: {
  expenses: ExpenseRow[]
  income: IncomeRow[]
  categories: ExpenseCategory[]
  symbol: string
}) {
  const router = useRouter()
  const [tab, setTab] = React.useState<Tab>('expenses')
  const [catFilter, setCatFilter] = React.useState('all')
  const [busy, setBusy] = React.useState(false)

  const [expenseOpen, setExpenseOpen] = React.useState(false)
  const [incomeOpen, setIncomeOpen] = React.useState(false)
  const [delExpense, setDelExpense] = React.useState<ExpenseRow | null>(null)
  const [delIncome, setDelIncome] = React.useState<IncomeRow | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const monthKey = today.slice(0, 7)

  // expense form state
  const [eTitle, setETitle] = React.useState('')
  const [eAmount, setEAmount] = React.useState('')
  const [eDate, setEDate] = React.useState(today)
  const [eCategory, setECategory] = React.useState('')
  const [eMethod, setEMethod] = React.useState<PaymentMethod>('cash')
  const [eRef, setERef] = React.useState('')
  const [eDesc, setEDesc] = React.useState('')
  const [eRecurring, setERecurring] = React.useState(false)
  const [eInterval, setEInterval] = React.useState<RecurringInterval>('monthly')
  const [eNextDue, setENextDue] = React.useState('')

  // income form state
  const [iSource, setISource] = React.useState('')
  const [iAmount, setIAmount] = React.useState('')
  const [iDate, setIDate] = React.useState(today)
  const [iMethod, setIMethod] = React.useState<PaymentMethod>('cash')
  const [iDesc, setIDesc] = React.useState('')

  // category form state
  const [cName, setCName] = React.useState('')

  const filteredExpenses = React.useMemo(
    () => expenses.filter((e) => catFilter === 'all' || e.category_id === catFilter),
    [expenses, catFilter]
  )

  const monthExpenses = expenses
    .filter((e) => e.expense_date.startsWith(monthKey))
    .reduce((a, e) => a + Number(e.amount), 0)
  const monthIncome = income
    .filter((i) => i.income_date.startsWith(monthKey))
    .reduce((a, i) => a + Number(i.amount), 0)
  const dueSoon = expenses.filter(
    (e) => e.is_recurring && e.next_due_date && e.next_due_date <= today
  )

  function resetExpense() {
    setETitle(''); setEAmount(''); setEDate(today); setECategory('')
    setEMethod('cash'); setERef(''); setEDesc('')
    setERecurring(false); setEInterval('monthly'); setENextDue('')
  }

  async function submitExpense() {
    if (!eTitle.trim()) return toast.error('Title is required')
    if (!(Number(eAmount) > 0)) return toast.error('Amount must be above 0')
    setBusy(true)
    const r = await createExpense({
      title: eTitle.trim(),
      amount: Number(eAmount),
      expense_date: eDate,
      category_id: eCategory || null,
      payment_method: eMethod,
      reference_no: eRef,
      description: eDesc,
      is_recurring: eRecurring,
      recurring_interval: eRecurring ? eInterval : null,
      next_due_date: eRecurring ? eNextDue : '',
    })
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success('Expense recorded')
    setExpenseOpen(false)
    resetExpense()
    router.refresh()
  }

  async function submitIncome() {
    if (!iSource.trim()) return toast.error('Source is required')
    if (!(Number(iAmount) > 0)) return toast.error('Amount must be above 0')
    setBusy(true)
    const r = await createIncome({
      source: iSource.trim(),
      amount: Number(iAmount),
      income_date: iDate,
      payment_method: iMethod,
      description: iDesc,
    })
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success('Income recorded')
    setIncomeOpen(false)
    setISource(''); setIAmount(''); setIDate(today); setIMethod('cash'); setIDesc('')
    router.refresh()
  }

  async function submitCategory() {
    if (!cName.trim()) return toast.error('Name is required')
    setBusy(true)
    const r = await createExpenseCategory({ name: cName.trim(), sort_order: categories.length })
    setBusy(false)
    if (r.error) return toast.error(r.error)
    toast.success('Category added')
    setCName('')
    router.refresh()
  }

  const expenseColumns = React.useMemo<ColumnDef<ExpenseRow, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>Expense</SortHeader>,
        accessorKey: 'title',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.category_name}
              {row.original.reference_no ? ` · ${row.original.reference_no}` : ''}
            </p>
          </div>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Date</SortHeader>,
        accessorKey: 'expense_date',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-sm tabular-nums">{formatDate(getValue())}</span>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Amount</SortHeader>,
        accessorKey: 'amount',
        cell: ({ getValue }) => (
          <span className="font-semibold tabular-nums">{formatMoney(Number(getValue()), symbol)}</span>
        ),
      },
      {
        header: 'Method',
        accessorKey: 'payment_method',
        cell: ({ getValue }) => <Badge variant="outline">{getValue()}</Badge>,
      },
      {
        header: 'Recurring',
        accessorKey: 'is_recurring',
        cell: ({ row }) =>
          row.original.is_recurring ? (
            <div>
              <Badge variant="info">
                <Repeat className="mr-1 h-3 w-3" /> {row.original.recurring_interval}
              </Badge>
              {row.original.next_due_date && (
                <p
                  className={
                    row.original.next_due_date <= today
                      ? 'text-xs font-medium text-red-600 dark:text-red-400'
                      : 'text-xs text-muted-foreground'
                  }
                >
                  due {formatDate(row.original.next_due_date)}
                </p>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        header: 'By',
        accessorKey: 'recorder_name',
        cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue()}</span>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setDelExpense(row.original)}>
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </Button>
        ),
      },
    ],
    [symbol, today]
  )

  const incomeColumns = React.useMemo<ColumnDef<IncomeRow, any>[]>(
    () => [
      {
        header: ({ column }) => <SortHeader column={column}>Source</SortHeader>,
        accessorKey: 'source',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.source}</p>
            {row.original.description && (
              <p className="max-w-64 truncate text-xs text-muted-foreground" title={row.original.description}>
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Date</SortHeader>,
        accessorKey: 'income_date',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-sm tabular-nums">{formatDate(getValue())}</span>
        ),
      },
      {
        header: ({ column }) => <SortHeader column={column}>Amount</SortHeader>,
        accessorKey: 'amount',
        cell: ({ getValue }) => (
          <span className="font-semibold tabular-nums">{formatMoney(Number(getValue()), symbol)}</span>
        ),
      },
      {
        header: 'Method',
        accessorKey: 'payment_method',
        cell: ({ getValue }) => <Badge variant="outline">{getValue()}</Badge>,
      },
      {
        header: 'By',
        accessorKey: 'recorder_name',
        cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue()}</span>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setDelIncome(row.original)}>
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </Button>
        ),
      },
    ],
    [symbol]
  )

  function exportExpensesCsv() {
    const header = ['Title', 'Category', 'Date', 'Amount', 'Method', 'Reference', 'Recurring', 'Next due', 'By']
    const rows = filteredExpenses.map((e) => [
      e.title, e.category_name, e.expense_date, Number(e.amount), e.payment_method,
      e.reference_no ?? '', e.is_recurring ? e.recurring_interval ?? 'yes' : '', e.next_due_date ?? '', e.recorder_name,
    ])
    downloadCsv('expenses.csv', toCsv(header, rows))
  }

  function exportIncomeCsv() {
    const header = ['Source', 'Date', 'Amount', 'Method', 'Description', 'By']
    const rows = income.map((i) => [
      i.source, i.income_date, Number(i.amount), i.payment_method, i.description ?? '', i.recorder_name,
    ])
    downloadCsv('income.csv', toCsv(header, rows))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Expenses this month</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatMoney(monthExpenses, symbol)}
          </p>
          <p className="text-xs text-muted-foreground">{expenses.length} entries all time</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Other income this month</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatMoney(monthIncome, symbol)}
          </p>
          <p className="text-xs text-muted-foreground">{income.length} entries all time</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Recurring due</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
            {dueSoon.length}
          </p>
          <p className="text-xs text-muted-foreground">
            {dueSoon.length > 0 ? `Next: ${dueSoon[0].title}` : 'Nothing overdue'}
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        {(['expenses', 'income', 'categories'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'flex-1 rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow-sm'
                : 'flex-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground'
            }
          >
            {t === 'expenses' ? 'Expenses' : t === 'income' ? 'Other income' : 'Categories'}
          </button>
        ))}
      </div>

      {tab === 'expenses' && (
        <DataTable
          columns={expenseColumns}
          data={filteredExpenses}
          searchPlaceholder="Search title, category, reference…"
          emptyMessage="No expenses recorded."
          toolbar={
            <>
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportExpensesCsv} disabled={filteredExpenses.length === 0}>
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button size="sm" onClick={() => setExpenseOpen(true)}>
                <Plus className="h-4 w-4" /> Add expense
              </Button>
            </>
          }
        />
      )}

      {tab === 'income' && (
        <DataTable
          columns={incomeColumns}
          data={income}
          searchPlaceholder="Search source or description…"
          emptyMessage="No other income recorded."
          toolbar={
            <>
              <Button variant="outline" size="sm" onClick={exportIncomeCsv} disabled={income.length === 0}>
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button size="sm" onClick={() => setIncomeOpen(true)}>
                <Plus className="h-4 w-4" /> Add income
              </Button>
            </>
          }
        />
      )}

      {tab === 'categories' && (
        <div className="max-w-md space-y-4 rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex gap-2">
            <Input
              placeholder="New category name"
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCategory()}
            />
            <Button onClick={submitCategory} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add
            </Button>
          </div>
          <ul className="divide-y">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span>{c.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {expenses.filter((e) => e.category_id === c.id).length} entries
                </span>
              </li>
            ))}
            {categories.length === 0 && (
              <li className="py-4 text-center text-sm text-muted-foreground">No categories yet.</li>
            )}
          </ul>
        </div>
      )}

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
            <DialogDescription>Overheads like rent, salaries, utilities and transport.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="e.g. CEB electricity bill" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input type="number" min={0} step="any" value={eAmount} onChange={(e) => setEAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={eCategory || 'none'} onValueChange={(v) => setECategory(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorised</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Paid via</Label>
                <Select value={eMethod} onValueChange={(v) => setEMethod(v as PaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reference no</Label>
              <Input value={eRef} onChange={(e) => setERef(e.target.value)} placeholder="Bill / receipt number" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={eDesc} onChange={(e) => setEDesc(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={eRecurring} onCheckedChange={(v) => setERecurring(v === true)} />
              Recurring expense
            </label>
            {eRecurring && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Repeats</Label>
                  <Select value={eInterval} onValueChange={(v) => setEInterval(v as RecurringInterval)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INTERVALS.map((i) => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Next due date</Label>
                  <Input type="date" value={eNextDue} onChange={(e) => setENextDue(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitExpense} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={incomeOpen} onOpenChange={setIncomeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add other income</DialogTitle>
            <DialogDescription>Non-sales income — scrap sales, sub-let labour, commissions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Source *</Label>
              <Input value={iSource} onChange={(e) => setISource(e.target.value)} placeholder="e.g. Old battery cores" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input type="number" min={0} step="any" value={iAmount} onChange={(e) => setIAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={iDate} onChange={(e) => setIDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Received via</Label>
              <Select value={iMethod} onValueChange={(v) => setIMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={iDesc} onChange={(e) => setIDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncomeOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitIncome} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save income
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!delExpense}
        onOpenChange={(v) => !v && setDelExpense(null)}
        title="Delete expense?"
        description={delExpense ? `"${delExpense.title}" (${formatMoney(delExpense.amount, symbol)}) will be removed from reports.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!delExpense) return
          const r = await deleteExpense(delExpense.id)
          if (r.error) toast.error(r.error)
          else {
            toast.success('Expense deleted')
            router.refresh()
          }
          setDelExpense(null)
        }}
      />
      <ConfirmDialog
        open={!!delIncome}
        onOpenChange={(v) => !v && setDelIncome(null)}
        title="Delete income entry?"
        description={delIncome ? `"${delIncome.source}" (${formatMoney(delIncome.amount, symbol)}) will be removed from reports.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!delIncome) return
          const r = await deleteIncome(delIncome.id)
          if (r.error) toast.error(r.error)
          else {
            toast.success('Income deleted')
            router.refresh()
          }
          setDelIncome(null)
        }}
      />
    </div>
  )
}
