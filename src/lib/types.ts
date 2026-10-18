export type Role = 'admin' | 'manager' | 'cashier'
export type CustomerType = 'retail' | 'wholesale' | 'garage'
export type PaymentMethod = 'cash' | 'card' | 'bank' | 'cheque' | 'credit'
export type ChequeDirection = 'received' | 'issued'
export type ChequeStatus =
  | 'pending'
  | 'deposited'
  | 'cleared'
  | 'bounced'
  | 'returned'
  | 'cancelled'
export type MovementType =
  | 'opening'
  | 'purchase'
  | 'sale'
  | 'sales_return'
  | 'purchase_return'
  | 'adjustment'
export type SaleStatus = 'completed' | 'partially_returned' | 'fully_returned' | 'void'

export interface Profile {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: Role
  is_active: boolean
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  parent_id: string | null
  name: string
  slug: string
  description: string | null
  sort_order: number
  is_active: boolean
  is_deleted: boolean
}

/** POS-safe product shape (v_products_pos) — no cost/profit fields. */
export interface ProductPOS {
  id: string
  sku: string
  barcode: string | null
  name: string
  category_id: string | null
  category_name: string | null
  brand: string | null
  unit: string
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year_from: number | null
  vehicle_year_to: number | null
  rack_location: string | null
  selling_price: number
  wholesale_price: number | null
  reorder_level: number
  image_url: string | null
  is_active: boolean
  qty_on_hand: number
  is_low_stock: boolean
}

/** Full product shape (products table / v_products_full) — staff only. */
export interface ProductFull extends ProductPOS {
  cost_price: number
  description: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
  stock_value_at_cost?: number
  stock_value_at_sale?: number
  is_out_of_stock?: boolean
}

export interface Settings {
  id: number
  shop_name: string
  address: string
  phone: string
  email: string
  tax_number: string
  logo_url: string | null
  receipt_footer: string
  currency_code: string
  currency_symbol: string
  tax_rate: number
  invoice_prefix: string
  allow_negative_stock: boolean
  low_stock_alert: boolean
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  type: CustomerType
  phone: string | null
  email: string | null
  address: string | null
  nic: string | null
  credit_limit: number
  opening_balance: number
  vehicle_notes: string | null
  notes: string | null
  is_active: boolean
  is_deleted?: boolean
}

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  tax_number: string | null
  credit_terms_days: number
  opening_balance: number
  notes: string | null
  is_active: boolean
  is_deleted?: boolean
}

export interface Sale {
  id: string
  bill_no: string
  customer_id: string | null
  sale_date: string
  status: SaleStatus
  subtotal: number
  line_discounts: number
  bill_discount: number
  tax_amount: number
  grand_total: number
  paid_amount: number
  balance_amount: number
  change_amount: number
  note: string | null
  created_by: string
}

export interface Cheque {
  id: string
  direction: ChequeDirection
  status: ChequeStatus
  cheque_no: string
  bank: string
  branch: string | null
  amount: number
  cheque_date: string
  party_name: string
  customer_id: string | null
  supplier_id: string | null
  sale_id: string | null
  purchase_id: string | null
  cleared_date: string | null
  bounced_reason: string | null
}

export interface CheckoutItem {
  product_id: string
  quantity: number
  unit_price: number
  discount: number
  /** Ignored server-side — fn_checkout snapshots cost from products. */
  cost_price?: number
}
export interface CheckoutPayment {
  method: PaymentMethod
  amount: number
  reference_no?: string
  cheque_no?: string
  bank?: string
  branch?: string
  cheque_date?: string
  party_name?: string
}

export interface Purchase {
  id: string
  purchase_no: string
  supplier_id: string | null
  supplier_name?: string | null
  supplier_invoice_no: string | null
  purchase_date: string
  subtotal: number
  discount: number
  tax_amount: number
  total: number
  paid_amount: number
  notes: string | null
  created_by: string
  created_at: string
  is_deleted?: boolean
}

/** v_purchase_items_detail row */
export interface PurchaseItem {
  id: string
  purchase_id: string
  product_id: string
  sku: string
  product_name: string
  unit: string
  barcode: string | null
  rack_location: string | null
  quantity: number
  unit_cost: number
  line_total: number
}

/** v_inventory_valuation row */
export interface InventoryRow {
  id: string
  sku: string
  name: string
  unit: string
  brand: string | null
  rack_location: string | null
  reorder_level: number
  cost_price: number
  selling_price: number
  is_active: boolean
  category_id: string | null
  category_name: string | null
  qty_on_hand: number
  value_at_cost: number
  value_at_sale: number
  is_out_of_stock: boolean
  is_low_stock: boolean
}

/** v_stock_movements_detail row */
export interface StockMovement {
  id: number
  created_at: string
  product_id: string
  sku: string
  product_name: string
  unit: string
  rack_location: string | null
  quantity_delta: number
  movement_type: MovementType
  reference_table: string | null
  reference_id: string | null
  reference_label: string | null
  reason: string | null
  note: string | null
  recorded_by: string | null
  recorder_name: string
}

// ---------------------------------------------------------------------------
// Phase 4-7 read models (supabase/phase4.sql)
// ---------------------------------------------------------------------------

/** v_sales_list row — bill header, no cost data. */
export interface SaleRow {
  id: string
  bill_no: string
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  customer_type: CustomerType | null
  sold_at: string
  sale_date: string
  status: SaleStatus
  subtotal: number
  line_discounts: number
  bill_discount: number
  tax_amount: number
  grand_total: number
  paid_amount: number
  balance_amount: number
  change_amount: number
  note: string | null
  created_by: string
  cashier_name: string
  is_credit: boolean
  line_count: number
  total_qty: number
}

/** v_sale_items_detail row — STAFF ONLY (carries cost_price + margin). */
export interface SaleItemDetail {
  id: string
  sale_id: string
  bill_no: string
  sale_date: string
  product_id: string
  sku: string
  product_name: string
  unit: string
  rack_location: string | null
  barcode: string | null
  quantity: number
  unit_price: number
  cost_price: number
  discount: number
  line_total: number
  line_profit: number
  margin_pct: number
}

/** v_returns_list row */
export interface ReturnRow {
  id: string
  return_no: string
  kind: 'sale' | 'purchase'
  original_id: string
  original_no: string | null
  party_name: string
  return_date: string
  subtotal: number
  tax_amount: number
  total: number
  restock: boolean
  refund_method: PaymentMethod | null
  credit_note: boolean
  reason: string | null
  notes: string | null
  created_by: string | null
  recorder_name: string
  line_count: number
}

/** v_return_items_detail row */
export interface ReturnItemDetail {
  id: string
  return_id: string
  return_no: string
  kind: 'sale' | 'purchase'
  product_id: string
  sku: string
  product_name: string
  unit: string
  original_item_id: string | null
  quantity: number
  unit_price: number
  cost_price: number
  line_total: number
  restocked: boolean
}

/** v_payments_detail row */
export interface PaymentRow {
  id: string
  paid_at: string
  direction: 'in' | 'out'
  method: PaymentMethod
  amount: number
  customer_id: string | null
  supplier_id: string | null
  party_name: string
  sale_id: string | null
  bill_no: string | null
  purchase_id: string | null
  purchase_no: string | null
  cheque_id: string | null
  cheque_no: string | null
  bank: string | null
  cheque_status: ChequeStatus | null
  cheque_date: string | null
  reference_no: string | null
  note: string | null
  recorded_by: string | null
  recorder_name: string
}

/** v_cheques_detail row */
export interface ChequeRow extends Cheque {
  bill_no: string | null
  purchase_no: string | null
  recorder_name: string
  created_at: string
  days_to_maturity: number
  is_due: boolean
}

/** v_expenses_detail row */
export interface ExpenseRow {
  id: string
  title: string
  amount: number
  expense_date: string
  category_id: string | null
  category_name: string
  payment_method: PaymentMethod
  reference_no: string | null
  description: string | null
  attachment_url: string | null
  is_recurring: boolean
  recurring_interval: RecurringInterval | null
  next_due_date: string | null
  created_by: string | null
  recorder_name: string
}

export type RecurringInterval = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

/** v_income_list row */
export interface IncomeRow {
  id: string
  source: string
  amount: number
  income_date: string
  payment_method: PaymentMethod
  description: string | null
  created_by: string | null
  recorder_name: string
}

export interface ExpenseCategory {
  id: string
  name: string
  sort_order: number
}

/** v_cash_up row — tender-wise daily takings */
export interface CashUpRow {
  sale_date: string
  method: PaymentMethod
  payment_count: number
  amount: number
}

/** v_product_sales_summary row — STAFF ONLY */
export interface ProductSalesSummary {
  product_id: string
  sku: string
  product_name: string
  category_name: string | null
  unit: string
  rack_location: string | null
  reorder_level: number
  qty_sold: number
  revenue: number
  cogs: number
  gross_profit: number
  last_sold_date: string | null
}

/** v_stock_report row — STAFF ONLY */
export interface StockReportRow {
  product_id: string
  sku: string
  name: string
  unit: string
  brand: string | null
  category_name: string | null
  rack_location: string | null
  reorder_level: number
  cost_price: number
  selling_price: number
  qty_on_hand: number
  value_at_cost: number
  value_at_sale: number
  qty_out: number
  qty_in: number
}

/** v_held_bills row — POS hold/recall */
export interface HeldBill {
  id: string
  hold_no: number
  cart: HeldCartLine[]
  customer_id: string | null
  customer_name: string
  note: string | null
  held_by: string | null
  holder_name: string
  created_at: string
  line_count: number
  cart_total: number
}

export interface HeldCartLine {
  product_id: string
  sku: string
  name: string
  unit: string
  quantity: number
  unit_price: number
  discount: number
  line_total: number
  rack_location?: string | null
  qty_on_hand?: number
}

/** v_users row */
export interface UserRow {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: Role
  is_active: boolean
  avatar_url: string | null
  created_at: string
  updated_at: string
  bill_count: number
  sales_total: number
}

/** v_audit_feed row */
export interface AuditRow {
  id: number
  table_name: string
  row_id: string | null
  action: 'insert' | 'update' | 'delete'
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  user_id: string | null
  user_email: string
  user_name: string
  created_at: string
}

/** fn_get_bill payload — cashier-safe reprint data. */
export interface BillData {
  sale: {
    id: string
    bill_no: string
    sale_date: string
    sold_at?: string
    subtotal: number
    line_discounts: number
    bill_discount: number
    tax_amount: number
    grand_total: number
    paid_amount: number
    balance_amount: number
    status: SaleStatus
    note: string | null
    customer_name: string | null
    customer_phone: string | null
    customer_type: CustomerType | null
    cashier_name: string
  }
  items: {
    id: string
    name: string
    sku: string
    unit: string
    quantity: number
    unit_price: number
    discount: number
    line_total: number
  }[]
  payments: {
    method: PaymentMethod
    amount: number
    reference_no: string | null
    cheque_status: ChequeStatus | null
  }[]
  settings: Settings | null
}

/** fn_checkout result */
export interface CheckoutResult {
  sale_id: string
  bill_no: string
  subtotal: number
  discount: number
  tax_amount: number
  grand_total: number
  paid_amount: number
  credit_amount: number
  balance_amount: number
  change_amount: number
}
