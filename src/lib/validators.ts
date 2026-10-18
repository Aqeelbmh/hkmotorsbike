import { z } from 'zod'

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  parent_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
})
export type CategoryForm = z.infer<typeof categorySchema>

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(160),
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required')
    .max(40)
    .regex(/^[A-Za-z0-9._\-\/]+$/, 'SKU: letters, numbers, . _ - / only'),
  barcode: z.string().trim().max(32).optional().or(z.literal('')),
  category_id: z.string().uuid().nullable().optional(),
  brand: z.string().trim().max(60).optional().or(z.literal('')),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  vehicle_make: z.string().trim().max(40).optional().or(z.literal('')),
  vehicle_model: z.string().trim().max(40).optional().or(z.literal('')),
  vehicle_year_from: z.coerce.number().int().min(1950).max(2100).nullable().optional(),
  vehicle_year_to: z.coerce.number().int().min(1950).max(2100).nullable().optional(),
  rack_location: z.string().trim().max(30).optional().or(z.literal('')),
  cost_price: z.coerce.number().min(0, 'Cannot be negative'),
  selling_price: z.coerce.number().min(0.01, 'Selling price must be above 0'),
  wholesale_price: z.coerce.number().min(0).nullable().optional(),
  reorder_level: z.coerce.number().min(0).default(5),
  image_url: z.string().trim().nullable().optional().or(z.literal('')),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  is_active: z.boolean().default(true),
})
export type ProductForm = z.infer<typeof productSchema>
/** Pre-coercion shape accepted by the form (z.coerce fields take string|number inputs). */
export type ProductInput = z.input<typeof productSchema>

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(160),
  contact_person: z.string().trim().max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z
    .union([z.literal(''), z.string().trim().email('Invalid email')])
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  tax_number: z.string().trim().max(40).optional().or(z.literal('')),
  credit_terms_days: z.coerce.number().int().min(0).max(365).default(0),
  opening_balance: z.coerce.number().default(0),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  is_active: z.boolean().default(true),
})
export type SupplierForm = z.infer<typeof supplierSchema>

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(160),
  type: z.enum(['retail', 'wholesale', 'garage']).default('retail'),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z
    .union([z.literal(''), z.string().trim().email('Invalid email')])
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  nic: z.string().trim().max(20).optional().or(z.literal('')),
  credit_limit: z.coerce.number().min(0).default(0),
  opening_balance: z.coerce.number().default(0),
  vehicle_notes: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  is_active: z.boolean().default(true),
})
export type CustomerForm = z.infer<typeof customerSchema>

/** CSV import row → product payload (loose validation first, then strict) */
export const productImportRowSchema = z.object({
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1).max(40),
  barcode: z.string().trim().max(32).optional(),
  category: z.string().trim().optional(), // name or slug
  brand: z.string().trim().optional(),
  unit: z.string().trim().max(20).optional(),
  vehicle_make: z.string().trim().optional(),
  vehicle_model: z.string().trim().optional(),
  rack_location: z.string().trim().optional(),
  cost_price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0.01),
  wholesale_price: z.coerce.number().min(0).optional(),
  reorder_level: z.coerce.number().min(0).optional(),
})
export type ProductImportRow = z.infer<typeof productImportRowSchema>

export function firstZodMessage(e: z.ZodError): string {
  return e.issues[0]?.message ?? 'Invalid input'
}

/** Goods receipt: fn_record_purchase payload. */
export const purchaseItemSchema = z.object({
  product_id: z.string().uuid('Missing product'),
  quantity: z.coerce.number().positive('Quantity must be above 0'),
  unit_cost: z.coerce.number().min(0, 'Unit cost cannot be negative'),
})

export const purchasePaymentSchema = z.object({
  method: z.enum(['cash', 'card', 'bank', 'cheque', 'credit']),
  amount: z.coerce.number().positive('Amount must be above 0'),
  reference_no: z.string().trim().max(60).optional().or(z.literal('')),
  cheque_no: z.string().trim().max(40).optional().or(z.literal('')),
  bank: z.string().trim().max(80).optional().or(z.literal('')),
  cheque_date: z.string().trim().optional().or(z.literal('')),
})

export const purchaseSchema = z
  .object({
    supplier_id: z.string().uuid('Select a supplier'),
    supplier_invoice_no: z.string().trim().max(60).optional().or(z.literal('')),
    purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
    items: z.array(purchaseItemSchema).min(1, 'Add at least one item'),
    discount: z.coerce.number().min(0).default(0),
    payments: z.array(purchasePaymentSchema).default([]),
    notes: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    const subtotal = val.items.reduce((a, i) => a + i.quantity * i.unit_cost, 0)
    if (val.discount > subtotal) {
      ctx.addIssue({
        code: 'custom',
        message: 'Discount cannot exceed the line total',
        path: ['discount'],
      })
    }
    const paid = val.payments.reduce((a, p) => a + p.amount, 0)
    if (paid > subtotal - val.discount) {
      ctx.addIssue({
        code: 'custom',
        message: 'Payments exceed the amount payable',
        path: ['payments'],
      })
    }
  })
export type PurchaseForm = z.infer<typeof purchaseSchema>

export const stockAdjustSchema = z.object({
  product_id: z.string().uuid('Pick a product'),
  delta: z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && n !== 0, 'Enter a non-zero quantity'),
  reason: z.string().trim().min(3, 'Reason is required (audited)').max(200),
  note: z.string().trim().max(300).optional().or(z.literal('')),
})
export type StockAdjustForm = z.infer<typeof stockAdjustSchema>

/** fn_stock_take payload */
export const stockTakeSchema = z.object({
  counts: z
    .array(z.object({ product_id: z.string().uuid(), counted_qty: z.coerce.number().min(0) }))
    .min(1, 'Count at least one product'),
  note: z.string().trim().max(300).optional().or(z.literal('')),
})
export type StockTakeForm = z.infer<typeof stockTakeSchema>

/** Supplier return against a purchase order. */
export const purchaseReturnSchema = z.object({
  purchase_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        purchase_item_id: z.string().uuid(),
        quantity: z.coerce.number().positive('Quantity must be above 0'),
      })
    )
    .min(1, 'Select at least one line to return'),
  refund_method: z.enum(['cash', 'card', 'bank', 'cheque']).nullable().default(null),
  reason: z.string().trim().min(3, 'Reason is required').max(200),
})
export type PurchaseReturnForm = z.infer<typeof purchaseReturnSchema>

/** Standalone payment (fn_receive_payment). */
export const receivePaymentSchema = z
  .object({
    direction: z.enum(['in', 'out']),
    method: z.enum(['cash', 'card', 'bank', 'cheque']),
    amount: z.coerce.number().positive('Amount must be above 0'),
    customer_id: z.string().uuid().nullable().optional(),
    supplier_id: z.string().uuid().nullable().optional(),
    sale_id: z.string().uuid().nullable().optional(),
    purchase_id: z.string().uuid().nullable().optional(),
    reference_no: z.string().trim().max(60).optional().or(z.literal('')),
    note: z.string().trim().max(300).optional().or(z.literal('')),
    cheque_no: z.string().trim().max(40).optional().or(z.literal('')),
    bank: z.string().trim().max(80).optional().or(z.literal('')),
    cheque_date: z.string().optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    if (val.method !== 'cheque') return
    if (!val.cheque_no) {
      ctx.addIssue({ code: 'custom', message: 'Cheque number is required', path: ['cheque_no'] })
    }
    if (!val.bank) {
      ctx.addIssue({ code: 'custom', message: 'Bank is required', path: ['bank'] })
    }
  })
export type ReceivePaymentForm = z.infer<typeof receivePaymentSchema>

// ---------------------------------------------------------------------------
// Phase 4-7
// ---------------------------------------------------------------------------

/** fn_checkout payload. Prices come from the POS cart; cost is server-side. */
export const checkoutItemSchema = z.object({
  product_id: z.string().uuid('Missing product'),
  quantity: z.coerce.number().positive('Quantity must be above 0'),
  unit_price: z.coerce.number().min(0, 'Price cannot be negative'),
  discount: z.coerce.number().min(0).default(0),
})

export const checkoutPaymentSchema = z
  .object({
    method: z.enum(['cash', 'card', 'bank', 'cheque', 'credit']),
    amount: z.coerce.number().positive('Amount must be above 0'),
    reference_no: z.string().trim().max(60).optional().or(z.literal('')),
    cheque_no: z.string().trim().max(40).optional().or(z.literal('')),
    bank: z.string().trim().max(80).optional().or(z.literal('')),
    branch: z.string().trim().max(80).optional().or(z.literal('')),
    cheque_date: z.string().optional().or(z.literal('')),
    party_name: z.string().trim().max(120).optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    if (val.method !== 'cheque') return
    if (!val.cheque_no) ctx.addIssue({ code: 'custom', message: 'Cheque number is required', path: ['cheque_no'] })
    if (!val.bank) ctx.addIssue({ code: 'custom', message: 'Bank is required', path: ['bank'] })
  })

export const checkoutSchema = z
  .object({
    customer_id: z.string().uuid().nullable().optional(),
    items: z.array(checkoutItemSchema).min(1, 'Cart is empty'),
    bill_discount: z.coerce.number().min(0).default(0),
    discount_mode: z.enum(['amount', 'percent']).default('amount'),
    payments: z.array(checkoutPaymentSchema).min(1, 'Take at least one payment'),
    note: z.string().trim().max(300).optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    for (const item of val.items) {
      if (item.discount > item.quantity * item.unit_price) {
        ctx.addIssue({
          code: 'custom',
          message: 'Line discount exceeds the line total',
          path: ['items'],
        })
        break
      }
    }
    if (val.discount_mode === 'percent' && val.bill_discount > 100) {
      ctx.addIssue({ code: 'custom', message: 'Percent discount cannot exceed 100', path: ['bill_discount'] })
    }
    if (val.payments.some((p) => p.method === 'credit') && !val.customer_id) {
      ctx.addIssue({ code: 'custom', message: 'Credit needs a named customer', path: ['payments'] })
    }
  })
export type CheckoutForm = z.infer<typeof checkoutSchema>

/** POS hold / recall — cart is stored as jsonb. */
export const holdBillSchema = z.object({
  cart: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        sku: z.string(),
        name: z.string(),
        unit: z.string(),
        quantity: z.coerce.number().positive(),
        unit_price: z.coerce.number().min(0),
        discount: z.coerce.number().min(0).default(0),
        line_total: z.coerce.number().min(0),
      })
    )
    .min(1, 'Nothing to hold'),
  customer_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(200).optional().or(z.literal('')),
})
export type HoldBillForm = z.infer<typeof holdBillSchema>

/** fn_record_sale_return payload. */
export const saleReturnSchema = z.object({
  sale_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        sale_item_id: z.string().uuid(),
        quantity: z.coerce.number().positive('Quantity must be above 0'),
      })
    )
    .min(1, 'Select at least one line to return'),
  restock: z.boolean().default(true),
  refund_method: z.enum(['cash', 'card', 'bank', 'cheque', 'credit']).nullable().default(null),
  reason: z.string().trim().min(3, 'Reason is required').max(200),
})
export type SaleReturnForm = z.infer<typeof saleReturnSchema>

export const expenseSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(140),
  amount: z.coerce.number().positive('Amount must be above 0'),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  category_id: z.string().uuid().nullable().optional(),
  payment_method: z.enum(['cash', 'card', 'bank', 'cheque', 'credit']).default('cash'),
  reference_no: z.string().trim().max(60).optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  attachment_url: z.string().trim().nullable().optional().or(z.literal('')),
  is_recurring: z.boolean().default(false),
  recurring_interval: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).nullable().optional(),
  next_due_date: z.string().optional().or(z.literal('')),
})
export type ExpenseForm = z.infer<typeof expenseSchema>

export const incomeSchema = z.object({
  source: z.string().trim().min(1, 'Source is required').max(140),
  amount: z.coerce.number().positive('Amount must be above 0'),
  income_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  payment_method: z.enum(['cash', 'card', 'bank', 'cheque', 'credit']).default('cash'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
})
export type IncomeForm = z.infer<typeof incomeSchema>

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
})
export type ExpenseCategoryForm = z.infer<typeof expenseCategorySchema>

/** settings row — admin only. */
export const settingsSchema = z.object({
  shop_name: z.string().trim().min(1, 'Shop name is required').max(120),
  address: z.string().trim().max(300).default(''),
  phone: z.string().trim().max(40).default(''),
  email: z.union([z.literal(''), z.string().trim().email('Invalid email')]).default(''),
  tax_number: z.string().trim().max(40).default(''),
  logo_url: z.string().trim().nullable().optional().or(z.literal('')),
  receipt_footer: z.string().trim().max(200).default(''),
  currency_code: z.string().trim().length(3, 'Use the 3-letter code').toUpperCase(),
  currency_symbol: z.string().trim().min(1, 'Symbol is required').max(6),
  tax_rate: z.coerce.number().min(0).max(100),
  invoice_prefix: z.string().trim().min(1).max(10),
  allow_negative_stock: z.boolean().default(false),
  low_stock_alert: z.boolean().default(true),
})
export type SettingsForm = z.infer<typeof settingsSchema>

/** Cheque register status transition. */
export const chequeStatusSchema = z
  .object({
    status: z.enum(['pending', 'deposited', 'cleared', 'bounced', 'returned', 'cancelled']),
    cleared_date: z.string().optional().or(z.literal('')),
    bounced_reason: z.string().trim().max(200).optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    if (['bounced', 'returned', 'cancelled'].includes(val.status) && !val.bounced_reason) {
      ctx.addIssue({
        code: 'custom',
        message: 'A reason is required and is written to the audit trail',
        path: ['bounced_reason'],
      })
    }
  })
export type ChequeStatusForm = z.infer<typeof chequeStatusSchema>

/** Profile edits on the settings screen. */
export const profileRoleSchema = z.object({
  role: z.enum(['admin', 'manager', 'cashier']),
  is_active: z.boolean().default(true),
})
export type ProfileRoleForm = z.infer<typeof profileRoleSchema>

export const inviteUserSchema = z.object({
  email: z.string().trim().email('Valid email required'),
  full_name: z.string().trim().min(1, 'Name is required').max(120),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
  role: z.enum(['admin', 'manager', 'cashier']).default('cashier'),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
})
export type InviteUserForm = z.infer<typeof inviteUserSchema>

export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick an end date'),
})
export type DateRangeForm = z.infer<typeof dateRangeSchema>
