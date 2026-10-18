/**
 * Dev-only stand-in for Supabase so the UI can be reviewed without a project.
 * Mirrors seed.sql + the Phase 1-3 views and RPC functions in JavaScript.
 * It does NOT enforce RLS or fire Postgres triggers — real auth/RLS/atomicity
 * only get validated against a real Supabase project.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(HERE, 'data.json')
export const UPLOAD_DIR = path.join(HERE, 'uploads')

export const uuid = () => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const r1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10
const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000
const sum = (rows, f) => rows.reduce((a, x) => a + Number(f(x)), 0)
const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
const today = () => startOfToday().toISOString().slice(0, 10)

/** Sum an amount column per day — backs the v_expense_daily / v_income_daily views. */
function groupDaily(list, dateKey) {
  const map = new Map()
  for (const row of list) {
    const day = row[dateKey]
    const entry = map.get(day) ?? { day, total: 0, entry_count: 0 }
    entry.total = r2(entry.total + Number(row.amount))
    entry.entry_count += 1
    map.set(day, entry)
  }
  return [...map.values()]
}

/** Sign-in accounts for the mock. Passwords are deliberately weak/local-only. */
export const USERS = [
  { id: 'e0000000-0000-4000-8000-000000000001', email: 'admin@penzoparts.lk', password: 'admin123', role: 'admin', full_name: 'Nuwan Perera' },
  { id: 'e0000000-0000-4000-8000-000000000002', email: 'manager@penzoparts.lk', password: 'manager123', role: 'manager', full_name: 'Ishara Silva' },
  { id: 'e0000000-0000-4000-8000-000000000003', email: 'cashier@penzoparts.lk', password: 'cashier123', role: 'cashier', full_name: 'Ruwan Fernando' },
]

const TABLES = [
  'categories', 'products', 'suppliers', 'customers', 'purchases', 'purchase_items',
  'sales', 'sale_items', 'payments', 'cheques', 'returns', 'return_items',
  'stock_movements', 'expenses', 'income', 'expense_categories', 'profiles',
  'settings', 'audit_log', 'held_bills', 'auth_users',
]

export const db = { tables: {}, seq: { purchase_no: 0, sale_no: 0, return_no: 0, movement: 0, hold_no: 0 } }
for (const t of TABLES) db.tables[t] = []

export const rows = (t) => {
  if (!db.tables[t]) db.tables[t] = []
  return db.tables[t]
}

const live = (t) => rows(t).filter((r) => r.is_deleted !== true)
const byId = (t, id) => rows(t).find((r) => r.id === id)

export function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2))
}

export function load() {
  if (!fs.existsSync(DATA_FILE)) return false
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    Object.assign(db, parsed)
    for (const t of TABLES) if (!db.tables[t]) db.tables[t] = []
    return true
  } catch {
    return false
  }
}

function audit(table, action, rowId, user, newData) {
  rows('audit_log').push({
    id: uuid(),
    table_name: table,
    row_id: rowId,
    action,
    old_data: null,
    new_data: newData ?? null,
    user_id: user?.id ?? null,
    user_email: user?.email ?? '',
    created_at: nowIso(),
  })
}

export function reseed() {
  // Sign-up'd accounts are operator data, not demo data — keep them.
  const created = (db.tables.auth_users ?? []).filter((u) => !USERS.some((s) => s.id === u.id))
  for (const t of TABLES) db.tables[t] = []
  db.seq = { purchase_no: 0, sale_no: 0, return_no: 0, movement: 0, hold_no: 0 }
  for (const u of created) rows('auth_users').push(u)
  seed()
}

function nextNo(kind) {
  db.seq[kind] = (db.seq[kind] ?? 0) + 1
  const prefix = { purchase_no: 'PO-', sale_no: 'SO-', return_no: 'RT-' }[kind]
  return `${prefix}${String(db.seq[kind]).padStart(6, '0')}`
}

function newMovement({ product_id, quantity_delta, movement_type, reference_table, reference_id, reason, note, recorded_by }) {
  const row = {
    id: ++db.seq.movement,
    product_id,
    quantity_delta: Number(quantity_delta),
    movement_type,
    reference_table: reference_table ?? null,
    reference_id: reference_id ?? null,
    reason: reason ?? null,
    note: note ?? null,
    recorded_by: recorded_by ?? null,
    created_at: nowIso(),
  }
  rows('stock_movements').push(row)
  return row
}

// ---------------------------------------------------------------------------
// Seed data (mirrors supabase/seed.sql)
// ---------------------------------------------------------------------------

const CID = (n) => `a0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const CATS = [
  [1, 'Engine', 'engine', null, 1],
  [2, 'Brakes', 'brakes', null, 2],
  [3, 'Electrical', 'electrical', null, 3],
  [4, 'Suspension', 'suspension', null, 4],
  [5, 'Filters', 'filters', null, 5],
  [6, 'Cooling', 'cooling', null, 6],
  [7, 'Transmission', 'transmission', null, 7],
  [8, 'Body & Wipers', 'body-wipers', null, 8],
  [11, 'Engine Oil & Lubricants', 'engine-oils', 1, 9],
  [12, 'Brake Pads', 'brake-pads', 2, 10],
  [13, 'Batteries', 'batteries', 3, 11],
  [14, 'Shocks & Struts', 'shocks', 4, 12],
]

const PID = (n) => `d0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const SID = (n) => `b0000000-0000-4000-8000-00000000000${n}`
const CUID = (n) => `c0000000-0000-4000-8000-00000000000${n}`

const PRODUCTS = [
  ['ENG-OC-0012', '2100000000012', 'Oil Filter — Toyota Aqua/Auris/NX2000', 1, 'Denso', 'pcs', 'Toyota', 'Aqua', 2014, 2023, 'A1-03', 720, 1150, 1000, 10],
  ['ENG-AF-0007', '2100000000029', 'Air Filter — Honda Civic FB', 1, 'Honda Genuine', 'pcs', 'Honda', 'Civic', 2016, 2021, 'A1-07', 1850, 2750, 2450, 8],
  ['ENG-SP-0001', '2100000000036', 'Spark Plug NGK Iridium ILKAR8L5', 1, 'NGK', 'pcs', 'Multiple', null, null, null, 'A2-11', 1450, 2200, 1950, 20],
  ['BRK-PD-F015', '2100000000043', 'Front Brake Pads — Toyota Premio', 12, 'Nibang', 'set', 'Toyota', 'Premio', 2007, 2016, 'B1-02', 2900, 4500, 4000, 10],
  ['BRK-PD-R009', '2100000000050', 'Rear Brake Drums Set — Wagon R', 12, 'IBC', 'set', 'Suzuki', 'Wagon R', 2010, 2020, 'B1-08', 5600, 8200, 7400, 4],
  ['BRK-DS-0003', '2100000000067', 'Brake Disc — Honda Vezel Front', 2, 'Honda Genuine', 'pcs', 'Honda', 'Vezel', 2015, 2021, 'B2-01', 9400, 13500, 12200, 4],
  ['ELE-BT-012', '2100000000074', 'Battery 46B24L 35Ah — Silver', 13, 'Lucas', 'pcs', 'Multiple', null, null, null, 'C1-01', 11500, 16500, 15200, 6],
  ['ELE-AL-0021', '2100000000081', 'Alternator Belt — Toyota Allion', 3, 'Mitsuboshi', 'pcs', 'Toyota', 'Allion', 2007, 2017, 'C2-04', 1800, 2800, 2500, 8],
  ['ELE-HL-H4', '2100000000098', 'Headlight Bulb H4 60/55W Philips', 3, 'Philips', 'pcs', 'Multiple', null, null, null, 'C2-09', 850, 1450, 1250, 25],
  ['ELE-WP-0002', '2100000000103', 'Water Pump — Toyota 1NZ/2NZ', 3, 'GMB', 'pcs', 'Toyota', 'Aqua', 2013, 2023, 'C3-02', 12800, 18500, 16800, 3],
  ['SUS-SH-044', '2100000000110', 'Shock Absorber Front — Premio (Right)', 14, 'KYB', 'pcs', 'Toyota', 'Premio', 2007, 2016, 'D1-05', 9800, 14200, 13000, 6],
  ['SUS-LB-017', '2100000000127', 'Lower Arm Bush Set — Wagon R', 4, '555', 'set', 'Suzuki', 'Wagon R', 2008, 2020, 'D1-10', 3200, 4900, 4400, 10],
  ['FLT-PC-005', '2100000000134', 'PCV / Cabin Filter — Aqua', 5, 'Denso', 'pcs', 'Toyota', 'Aqua', 2014, 2023, 'E1-02', 2400, 3600, 3200, 10],
  ['FLT-FU-002', '2100000000141', 'Fuel Filter — Honda Civic', 5, 'Honda Genuine', 'pcs', 'Honda', 'Civic', 2016, 2021, 'E1-06', 2800, 4200, 3800, 8],
  ['COL-RT-001', '2100000000158', 'Radiator — Toyota Passo', 6, 'IBC', 'pcs', 'Toyota', 'Passo', 2012, 2021, 'F1-01', 16500, 23500, 21500, 2],
  ['COL-FN-008', '2100000000165', 'Cooling Fan Assembly — Vezel', 6, 'Honda Genuine', 'pcs', 'Honda', 'Vezel', 2015, 2021, 'F1-04', 21000, 28900, 26500, 2],
  ['TRN-CL-003', '2100000000172', 'Clutch Kit 3-Piece — Wagon R', 7, 'Exedy', 'set', 'Suzuki', 'Wagon R', 2008, 2020, 'G1-02', 14500, 21000, 19200, 4],
  ['TRN-CV-006', '2100000000189', 'CVT Belt — Toyota Aqua', 7, 'Denso', 'pcs', 'Toyota', 'Aqua', 2014, 2021, 'G1-07', 23500, 32500, 30000, 3],
  ['BDY-WP-011', '2100000000196', 'Wiper Blade Set 22"+16" Aero', 8, 'Bosch', 'set', 'Multiple', null, null, null, 'H1-03', 2100, 3400, 3000, 15],
  ['ENG-OIL-5W30', '2100000000202', 'Engine Oil 5W-30 SN 4L — Denso', 11, 'Denso', 'can', 'Multiple', null, null, null, 'A3-01', 5800, 8200, 7500, 12],
]

const OPENING = [34, 18, 6, 22, 9, 7, 5, 16, 40, 4, 12, 25, 8, 2, 3, 0, 6, 1, 30, 14]

function seed() {
  rows('settings').push({
    id: 1,
    shop_name: 'H.K Motors Bike',
    address: '42/1 Yakgahapitiya, Gunnepana, Kandy, Sri Lanka',
    phone: '+94 74123 4562',
    email: 'hkmotors707@gmail.com',
    tax_number: '',
    logo_url: null,
    receipt_footer: 'Thank you! Goods once sold are exchangeable within 14 days with original bill.',
    currency_code: 'LKR',
    currency_symbol: 'Rs.',
    tax_rate: 0,
    invoice_prefix: 'INV',
    allow_negative_stock: false,
    low_stock_alert: true,
    updated_by: null,
    updated_at: nowIso(),
  })

  ;['Rent', 'Salaries', 'Electricity', 'Transport', 'Courier', 'Telephone & Internet', 'Bank Charges', 'Other'].forEach((name, i) =>
    rows('expense_categories').push({ id: uuid(), name, sort_order: i === 7 ? 99 : i + 1 })
  )

  for (const [n, name, slug, parent, order] of CATS) {
    rows('categories').push({
      id: CID(n), parent_id: parent ? CID(parent) : null, name, slug,
      description: null, sort_order: order, is_active: true, is_deleted: false,
      created_at: nowIso(), updated_at: nowIso(),
    })
  }

  const suppliers = [
    [1, 'Tokai Car Accessories (Pvt) Ltd', 'Mr. Perera', '+94 77 210 3344', 'sales@tokai.lk', 'Wellawatte, Colombo 06', 30, 45000],
    [2, 'IBC Industries Ltd', 'Ms. Silva', '+94 11 267 8300', 'orders@ibclanka.lk', 'Peliyagoda', 15, 0],
    [3, 'AMW Toyota Parts Centre', 'Mr. Nawaz', '+94 11 209 4455', 'parts@amwmotors.lk', 'Havelock Town, Colombo', 0, 128500],
  ]
  for (const [n, name, contact, phone, email, address, terms, opening] of suppliers) {
    rows('suppliers').push({
      id: SID(n), name, contact_person: contact, phone, email, address,
      credit_terms_days: terms, opening_balance: opening, notes: null,
      is_active: true, is_deleted: false, created_at: nowIso(), updated_at: nowIso(),
    })
  }

  const customers = [
    [1, 'Walk-in Customer', 'retail', null, null, 0, 0, null],
    [2, 'Sanath Garage', 'garage', '+94 71 445 8899', 'Nugegoda', 150000, 22500, 'Handles Toyota/Honda reconditioning work'],
    [3, 'Kumara Automobiles', 'wholesale', '+94 77 662 1145', 'Maharagama', 80000, 0, null],
    [4, 'Nimal Perera', 'retail', '+94 76 309 2277', 'Kadawatha', 0, 0, 'Honda Civic 2018 — BK-xxxx'],
    [5, 'Green Route Taxi Fleet', 'wholesale', '+94 70 115 8822', 'Rajagiriya', 200000, 64000, '5x Aqua hybrid fleet, monthly service parts'],
  ]
  for (const [n, name, type, phone, address, limit, opening, vehicle] of customers) {
    rows('customers').push({
      id: CUID(n), name, type, phone, email: null, address, nic: null,
      credit_limit: limit, opening_balance: opening, vehicle_notes: vehicle, notes: null,
      is_active: true, is_deleted: false, created_at: nowIso(), updated_at: nowIso(),
    })
  }

  PRODUCTS.forEach((p, i) => {
    const [sku, barcode, name, cat, brand, unit, make, model, yf, yt, rack, cost, sell, whole, reorder] = p
    rows('products').push({
      id: PID(i + 1), sku, barcode, name, category_id: CID(cat), brand, unit,
      vehicle_make: make, vehicle_model: model, vehicle_year_from: yf, vehicle_year_to: yt,
      rack_location: rack, cost_price: cost, selling_price: sell, wholesale_price: whole,
      reorder_level: reorder, image_url: null, description: null,
      is_active: true, is_deleted: false, created_at: nowIso(), updated_at: nowIso(),
    })
  })

  const owners = [...USERS, ...rows('auth_users').filter((u) => !USERS.some((s) => s.id === u.id))]
  for (const u of owners) {
    rows('profiles').push({
      id: u.id, email: u.email, full_name: u.full_name, phone: null,
      role: u.role, is_active: true, avatar_url: null,
      created_at: nowIso(), updated_at: nowIso(),
    })
  }

  OPENING.forEach((qty, i) => {
    if (qty === 0) return
    const mv = newMovement({
      product_id: PID(i + 1), quantity_delta: qty, movement_type: 'opening',
      reference_table: 'seed', reason: 'Opening stock',
      note: i === 2 ? 'Low — reorder soon' : i === 13 ? 'Below reorder level' : i === 17 ? 'Critical' : 'Initial load',
    })
    mv.created_at = `2026-09-15T07:${String(10 + i).padStart(2, '0')}:00.000Z`
  })

  // Back-dated demo purchases run through the real receipt logic so stock,
  // weighted cost, payments and the ledger all stay consistent.
  const admin = { id: USERS[0].id, email: USERS[0].email, role: 'admin' }
  const cashier = { id: USERS[2].id, email: USERS[2].email, role: 'cashier' }
  const backdate = (purchaseId, iso) => {
    for (const t of ['purchases', 'purchase_items', 'stock_movements', 'payments', 'cheques']) {
      for (const r of rows(t)) {
        const mine =
          t === 'purchases' ? r.id === purchaseId
          : t === 'stock_movements' ? r.reference_table === 'purchases' && r.reference_id === purchaseId
          : r.purchase_id === purchaseId
        if (!mine) continue
        r.created_at = iso
        if ('paid_at' in r) r.paid_at = iso
      }
    }
  }
  const receipt = (args, iso) => backdate(rpc.fn_record_purchase(admin, args).purchase_id, iso)

  receipt({
    p_supplier_id: SID(3), p_supplier_invoice_no: 'AMW-88214', p_purchase_date: '2026-09-28',
    p_items: [
      { product_id: PID(1), quantity: 20, unit_cost: 700 },
      { product_id: PID(4), quantity: 10, unit_cost: 2950 },
      { product_id: PID(7), quantity: 6, unit_cost: 11600 },
    ],
    p_discount: 500,
    p_payments: [
      { method: 'cash', amount: 20000 },
      { method: 'cheque', amount: 30000, cheque_no: 'CHQ-4471', bank: 'Commercial Bank', cheque_date: '2026-10-05' },
    ],
    p_notes: 'Monthly AMW restock. Balance held against their 30-day terms.',
  }, '2026-09-28T09:14:00.000Z')

  receipt({
    p_supplier_id: SID(1), p_supplier_invoice_no: 'TOK-20261008-A', p_purchase_date: '2026-10-08',
    p_items: [
      { product_id: PID(3), quantity: 24, unit_cost: 1420 },
      { product_id: PID(19), quantity: 12, unit_cost: 2150 },
    ],
    p_discount: 0,
    p_payments: [{ method: 'bank', amount: 59880, reference_no: 'PBL-771204' }],
    p_notes: null,
  }, '2026-10-08T11:02:00.000Z')

  receipt({
    p_supplier_id: SID(2), p_supplier_invoice_no: 'IBC/26/0442', p_purchase_date: '2026-10-12',
    p_items: [
      { product_id: PID(15), quantity: 2, unit_cost: 16800 },
      { product_id: PID(16), quantity: 1, unit_cost: 21500 },
    ],
    p_discount: 1000,
    p_payments: [],
    p_notes: '15-day credit approved by manager.',
  }, '2026-10-12T08:41:00.000Z')

  // Back-dated demo bills run through the real checkout function so stock,
  // cost snapshots, payments, cheques and the ledger stay consistent.
  const daysAgo = (n) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const saleBackdate = (saleId, iso) => {
    const targets = [
      [rows('sales'), (r) => r.id === saleId],
      [rows('sale_items'), (r) => r.sale_id === saleId],
      [rows('stock_movements'), (r) => r.reference_table === 'sales' && r.reference_id === saleId],
      [rows('payments'), (r) => r.sale_id === saleId],
      [rows('cheques'), (r) => r.sale_id === saleId],
      [rows('returns'), (r) => r.original_id === saleId && r.kind === 'sale'],
    ]
    for (const [list, mine] of targets) {
      for (const r of list) {
        if (!mine(r)) continue
        r.created_at = iso
        if ('paid_at' in r) r.paid_at = iso
        if ('sold_at' in r) r.sold_at = iso
        if ('sale_date' in r) r.sale_date = iso.slice(0, 10)
        if ('return_date' in r) r.return_date = iso.slice(0, 10)
      }
    }
  }
  const sell = (args, iso) => {
    const out = rpc.fn_checkout(args.__user ?? cashier, args)
    saleBackdate(out.sale_id, iso)
    return out
  }

  sell({
    p_customer_id: null,
    p_items: [
      { product_id: PID(1), quantity: 4, unit_price: 1150 },
      { product_id: PID(19), quantity: 1, unit_price: 3400 },
    ],
    p_bill_discount: 0, p_discount_mode: 'amount',
    p_payments: [{ method: 'cash', amount: 8000 }],
    p_note: 'Counter sale — taxi driver, quick oil service.',
  }, `${daysAgo(5)}T09:22:00.000Z`)

  sell({
    __user: admin,
    p_customer_id: CUID(2),
    p_items: [
      { product_id: PID(4), quantity: 6, unit_price: 4500 },
      { product_id: PID(3), quantity: 12, unit_price: 2100 },
    ],
    p_bill_discount: 5, p_discount_mode: 'percent',
    p_payments: [
      { method: 'card', amount: 20000, reference_no: 'CARD-558210' },
      { method: 'credit', amount: 29590 },
    ],
    p_note: 'Garage account — monthly settlement agreed.',
  }, `${daysAgo(4)}T11:05:00.000Z`)

  sell({
    p_customer_id: CUID(4),
    p_items: [{ product_id: PID(9), quantity: 4, unit_price: 1450 }],
    p_bill_discount: 0, p_discount_mode: 'amount',
    p_payments: [{ method: 'cash', amount: 5800 }],
    p_note: null,
  }, `${daysAgo(3)}T14:40:00.000Z`)

  sell({
    p_customer_id: CUID(5),
    p_items: [
      { product_id: PID(1), quantity: 8, unit_price: 1000 },
      { product_id: PID(13), quantity: 3, unit_price: 3600 },
      { product_id: PID(20), quantity: 4, unit_price: 8200 },
    ],
    p_bill_discount: 1000, p_discount_mode: 'amount',
    p_payments: [
      { method: 'cheque', amount: 20000, cheque_no: 'CHQ-90112', bank: 'BOC', branch: 'Kadawatha', cheque_date: daysAgo(-9) },
      { method: 'cash', amount: 15000 },
      { method: 'credit', amount: 15600 },
    ],
    p_note: 'Fleet service batch — 3 Achs.',
  }, `${daysAgo(2)}T10:12:00.000Z`)

  sell({
    p_customer_id: CUID(3),
    p_items: [{ product_id: PID(7), quantity: 2, unit_price: 15800 }],
    p_bill_discount: 0, p_discount_mode: 'amount',
    p_payments: [{ method: 'bank', amount: 31600, reference_no: 'PBL-771355' }],
    p_note: 'Wholesale battery price.',
  }, `${daysAgo(1)}T16:25:00.000Z`)

  sell({
    p_items: [
      { product_id: PID(12), quantity: 2, unit_price: 4900 },
      { product_id: PID(2), quantity: 1, unit_price: 2750 },
    ],
    p_bill_discount: 0, p_discount_mode: 'amount',
    p_payments: [{ method: 'cash', amount: 12550 }],
    p_note: null,
  }, `${daysAgo(0)}T08:47:00.000Z`)

  // One part-return against the oldest bill: restock + cash refund.
  {
    const first = rows('sales')[0]
    const line = live('sale_items').find((si) => si.sale_id === first.id)
    rpc.fn_record_sale_return(cashier, {
      p_sale_id: first.id,
      p_items: [{ sale_item_id: line.id, quantity: 1 }],
      p_restock: true,
      p_refund_method: 'cash',
      p_reason: 'Wrong part number — customer took the Premio pad',
    })
    const ret = rows('returns')[rows('returns').length - 1]
    ret.return_date = daysAgo(4)
    for (const ri of rows('return_items').filter((x) => x.return_id === ret.id)) ri.created_at = `${daysAgo(4)}T12:10:00.000Z`
    for (const m of rows('stock_movements').filter((x) => x.reference_id === ret.id)) m.created_at = `${daysAgo(4)}T12:10:00.000Z`
    for (const pm of rows('payments').filter((x) => x.note && x.note.includes(ret.return_no))) {
      pm.paid_at = `${daysAgo(4)}T12:10:00.000Z`
      pm.created_at = pm.paid_at
    }
  }

  // On-account receipt (not allocated to a bill) — moves the customer balance.
  rows('payments').push({
    id: uuid(), direction: 'in', method: 'cash', amount: 10000,
    customer_id: CUID(2), supplier_id: null, sale_id: null, purchase_id: null,
    cheque_id: null, reference_no: 'RCPT-2211', note: 'Partial settlement of garage account',
    paid_at: `${daysAgo(1)}T17:02:00.000Z`, recorded_by: admin.id, is_deleted: false,
    created_at: `${daysAgo(1)}T17:02:00.000Z`,
  })

  rows('income').push(
    { id: uuid(), source: 'Old battery exchange cores', amount: 6500, income_date: daysAgo(6), payment_method: 'cash', description: 'Scrap cores sold to recycler', created_by: admin.id, is_deleted: false, created_at: nowIso(), updated_at: nowIso() },
    { id: uuid(), source: 'Sub-let labour — clutch job', amount: 9000, income_date: daysAgo(2), payment_method: 'bank', description: 'Wayan service centre invoice', created_by: admin.id, is_deleted: false, created_at: nowIso(), updated_at: nowIso() }
  )

  rows('expenses').push(
    { id: uuid(), category_id: rows('expense_categories').find((c) => c.name === 'Electricity')?.id ?? null, title: 'CEB bill — Kadawatha shop', amount: 21450, expense_date: daysAgo(3), payment_method: 'bank', reference_no: 'CEB-881204', description: null, is_recurring: true, recurring_interval: 'monthly', next_due_date: daysAgo(-27), created_by: admin.id, is_deleted: false, created_at: nowIso(), updated_at: nowIso() },
    { id: uuid(), category_id: rows('expense_categories').find((c) => c.name === 'Courier')?.id ?? null, title: 'DHL import — 2 boxes sensors', amount: 18400, expense_date: daysAgo(2), payment_method: 'cash', reference_no: null, description: 'Clearing + freight', is_recurring: false, recurring_interval: null, next_due_date: null, created_by: admin.id, is_deleted: false, created_at: nowIso(), updated_at: nowIso() }
  )

  // A parked cart, so hold/recall has something to show.
  {
    const cart = [
      { product_id: PID(16), sku: 'COL-FN-008', name: 'Cooling Fan Assembly — Vezel', unit: 'pcs', quantity: 1, unit_price: 28900, discount: 0, line_total: 28900 },
      { product_id: PID(6), sku: 'BRK-DS-0003', name: 'Brake Disc — Honda Vezel Front', unit: 'pcs', quantity: 2, unit_price: 13500, discount: 500, line_total: 26500 },
    ]
    rows('held_bills').push({
      id: uuid(), hold_no: ++db.seq.hold_no, cart, customer_id: CUID(4),
      note: 'Customer went to check the VIN plate', held_by: cashier.id,
      created_at: `${daysAgo(0)}T09:15:00.000Z`,
    })
  }

  const rent = rows('expense_categories').find((c) => c.name === 'Rent')
  const transport = rows('expense_categories').find((c) => c.name === 'Transport')
  rows('expenses').push(
    { id: uuid(), category_id: rent.id, title: 'Shop rent October', amount: 85000, expense_date: '2026-10-01', payment_method: 'bank', reference_no: 'PBL-771180', description: null, is_recurring: true, recurring_interval: 'monthly', next_due_date: '2026-11-01', created_by: admin.id, is_deleted: false, created_at: nowIso(), updated_at: nowIso() },
    { id: uuid(), category_id: transport.id, title: 'Van fuel — Colombo pickups', amount: 12400, expense_date: '2026-10-09', payment_method: 'cash', reference_no: null, description: '3 trips', is_recurring: false, recurring_interval: null, next_due_date: null, created_by: admin.id, is_deleted: false, created_at: nowIso(), updated_at: nowIso() }
  )

  save()
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const qtyMap = () => {
  const m = new Map()
  for (const mv of rows('stock_movements')) m.set(mv.product_id, (m.get(mv.product_id) ?? 0) + Number(mv.quantity_delta))
  return m
}

const categoryName = (id) => byId('categories', id)?.name ?? null

const withStock = () => {
  const q = qtyMap()
  return live('products').map((p) => ({ ...p, qty_on_hand: q.get(p.id) ?? 0 }))
}

export const VIEWS = {
  v_stock_levels: () =>
    withStock().map((p) => ({ product_id: p.id, qty_on_hand: p.qty_on_hand })),

  v_products_pos: () =>
    withStock()
      .filter((p) => p.is_active)
      .map((p) => ({
        id: p.id, sku: p.sku, barcode: p.barcode, name: p.name, category_id: p.category_id,
        category_name: categoryName(p.category_id), brand: p.brand, unit: p.unit,
        vehicle_make: p.vehicle_make, vehicle_model: p.vehicle_model,
        vehicle_year_from: p.vehicle_year_from, vehicle_year_to: p.vehicle_year_to,
        rack_location: p.rack_location, selling_price: p.selling_price, wholesale_price: p.wholesale_price,
        reorder_level: p.reorder_level, image_url: p.image_url, is_active: p.is_active,
        qty_on_hand: p.qty_on_hand, is_low_stock: p.qty_on_hand <= Number(p.reorder_level),
      })),

  v_products_full: () =>
    withStock().map((p) => ({
      ...p,
      category_name: categoryName(p.category_id),
      is_low_stock: p.qty_on_hand <= Number(p.reorder_level),
      is_out_of_stock: p.qty_on_hand === 0,
      stock_value_at_cost: r2(p.qty_on_hand * Number(p.cost_price)),
      stock_value_at_sale: r2(p.qty_on_hand * Number(p.selling_price)),
    })),

  v_inventory_valuation: () =>
    withStock().map((p) => ({
      id: p.id, sku: p.sku, name: p.name, unit: p.unit, brand: p.brand,
      rack_location: p.rack_location, reorder_level: p.reorder_level,
      cost_price: p.cost_price, selling_price: p.selling_price, is_active: p.is_active,
      category_id: p.category_id, category_name: categoryName(p.category_id),
      qty_on_hand: p.qty_on_hand,
      value_at_cost: r2(p.qty_on_hand * Number(p.cost_price)),
      value_at_sale: r2(p.qty_on_hand * Number(p.selling_price)),
      is_out_of_stock: p.qty_on_hand === 0,
      is_low_stock: p.qty_on_hand <= Number(p.reorder_level),
    })),

  v_category_product_counts: () =>
    live('categories').map((c) => ({
      category_id: c.id,
      product_count: live('products').filter((p) => p.category_id === c.id).length,
    })),

  v_stock_movements_detail: () =>
    rows('stock_movements').map((m) => {
      const p = byId('products', m.product_id)
      const recorder = m.recorded_by ? byId('profiles', m.recorded_by) : null
      let label = null
      if (m.reference_table === 'purchases') label = byId('purchases', m.reference_id)?.purchase_no ?? null
      else if (m.reference_table === 'sales') label = byId('sales', m.reference_id)?.bill_no ?? null
      else if (m.reference_table === 'returns') label = byId('returns', m.reference_id)?.return_no ?? null
      return {
        id: m.id, created_at: m.created_at, product_id: m.product_id,
        sku: p?.sku ?? '—', product_name: p?.name ?? '—', unit: p?.unit ?? 'pcs',
        rack_location: p?.rack_location ?? null,
        quantity_delta: m.quantity_delta, movement_type: m.movement_type,
        reference_table: m.reference_table, reference_id: m.reference_id,
        reference_label:
          label ??
          { stock_take: 'Stock-take', seed: 'Opening balance', opening: 'Opening balance' }[m.reference_table] ??
          m.reference_table ??
          '—',
        reason: m.reason, note: m.note, recorded_by: m.recorded_by,
        recorder_name: recorder?.full_name || 'System',
      }
    }),

  v_purchase_items_detail: () =>
    live('purchase_items').map((pi) => {
      const p = byId('products', pi.product_id)
      return {
        id: pi.id, purchase_id: pi.purchase_id, product_id: pi.product_id,
        sku: p?.sku ?? '—', product_name: p?.name ?? '—', unit: p?.unit ?? 'pcs',
        barcode: p?.barcode ?? null, rack_location: p?.rack_location ?? null,
        quantity: pi.quantity, unit_cost: pi.unit_cost, line_total: pi.line_total,
      }
    }),

  v_last_purchase_costs: () => {
    const sorted = [...live('purchase_items')]
      .filter((pi) => !byId('purchases', pi.purchase_id)?.is_deleted)
      .sort((a, b) => String(byId('purchases', b.purchase_id)?.purchase_date).localeCompare(String(byId('purchases', a.purchase_id)?.purchase_date)))
    const seen = new Set()
    const out = []
    for (const pi of sorted) {
      if (seen.has(pi.product_id)) continue
      seen.add(pi.product_id)
      const pu = byId('purchases', pi.purchase_id)
      out.push({ product_id: pi.product_id, last_unit_cost: pi.unit_cost, last_purchase_date: pu?.purchase_date ?? null, last_supplier_id: pu?.supplier_id ?? null })
    }
    return out
  },

  v_customer_balances: () =>
    live('customers').map((cu) => {
      const credit = sum(live('sales').filter((s) => s.customer_id === cu.id && s.status !== 'void'), (s) => s.balance_amount)
      const receipts = sum(live('payments').filter((p) => p.customer_id === cu.id && !p.sale_id && p.method !== 'credit' && p.direction === 'in'), (p) => p.amount)
      const refunds = sum(live('payments').filter((p) => p.customer_id === cu.id && !p.sale_id && p.method !== 'credit' && p.direction === 'out'), (p) => p.amount)
      const notes = sum(live('returns').filter((r) => r.kind === 'sale' && r.credit_note && live('sales').some((s) => s.id === r.original_id && s.customer_id === cu.id)), (r) => r.total)
      return { id: cu.id, name: cu.name, balance: r2(Number(cu.opening_balance) + credit - receipts - refunds - notes) }
    }),

  v_supplier_balances: () =>
    live('suppliers').map((su) => {
      const unpaid = sum(live('purchases').filter((p) => p.supplier_id === su.id), (p) => Number(p.total) - Number(p.paid_amount))
      const onAccount = sum(live('payments').filter((p) => p.direction === 'out' && p.supplier_id === su.id && !p.purchase_id), (p) => p.amount)
      const returnsPaid = sum(
        live('returns').filter((r) => r.kind === 'purchase' && r.refund_method && live('purchases').some((p) => p.id === r.original_id && p.supplier_id === su.id)),
        (r) => r.total
      )
      return { id: su.id, name: su.name, balance: r2(Number(su.opening_balance) + unpaid - onAccount + returnsPaid) }
    }),

  v_sales_daily: () => {
    const byDate = new Map()
    for (const s of live('sales').filter((s) => s.status !== 'void')) {
      const d = byDate.get(s.sale_date) ?? { sale_date: s.sale_date, total_sales: 0, total_paid: 0, total_credit: 0, bill_count: 0 }
      d.total_sales = r2(d.total_sales + Number(s.grand_total))
      d.total_paid = r2(d.total_paid + Number(s.paid_amount))
      d.total_credit = r2(d.total_credit + Number(s.balance_amount))
      d.bill_count += 1
      byDate.set(s.sale_date, d)
    }
    return [...byDate.values()]
  },

  v_profit_daily: () => {
    const byDate = new Map()
    for (const s of live('sales').filter((s) => s.status !== 'void')) {
      const items = live('sale_items').filter((si) => si.sale_id === s.id)
      const revenue = r2(sum(items, (i) => Number(i.line_total)))
      const cogs = r2(sum(items, (i) => Number(i.quantity) * Number(i.cost_price)))
      byDate.set(s.sale_date, { sale_date: s.sale_date, revenue, cogs, gross_profit: r2(revenue - cogs) })
    }
    return [...byDate.values()]
  },

  // ---- Phase 4-7 read models (mirror supabase/phase4.sql) ------------------

  v_sales_list: () =>
    live('sales').map((s) => {
      const c = s.customer_id ? byId('customers', s.customer_id) : null
      const items = live('sale_items').filter((si) => si.sale_id === s.id)
      return {
        id: s.id, bill_no: s.bill_no, customer_id: s.customer_id,
        customer_name: c?.name ?? 'Walk-in', customer_phone: c?.phone ?? null,
        customer_type: c?.type ?? null,
        sold_at: s.sold_at ?? s.created_at, sale_date: s.sale_date, status: s.status,
        subtotal: s.subtotal, line_discounts: s.line_discounts, bill_discount: s.bill_discount,
        tax_amount: s.tax_amount, grand_total: s.grand_total, paid_amount: s.paid_amount,
        balance_amount: s.balance_amount, change_amount: s.change_amount, note: s.note ?? null,
        created_by: s.created_by,
        cashier_name: s.created_by ? byId('profiles', s.created_by)?.full_name ?? 'System' : 'System',
        is_credit: Number(s.balance_amount) > 0,
        line_count: items.length,
        total_qty: r3(sum(items, (i) => Number(i.quantity))),
      }
    }),

  v_sale_items_detail: () =>
    live('sale_items').flatMap((si) => {
      const s = byId('sales', si.sale_id)
      const p = byId('products', si.product_id)
      if (!s || s.is_deleted === true || !p) return []
      const profit = r2(Number(si.line_total) - Number(si.quantity) * Number(si.cost_price))
      return [{
        id: si.id, sale_id: si.sale_id, bill_no: s.bill_no, sale_date: s.sale_date,
        product_id: si.product_id, sku: p.sku, product_name: p.name, unit: p.unit,
        rack_location: p.rack_location, barcode: p.barcode,
        quantity: Number(si.quantity), unit_price: Number(si.unit_price),
        cost_price: Number(si.cost_price), discount: Number(si.discount),
        line_total: Number(si.line_total), line_profit: profit,
        margin_pct: Number(si.line_total) > 0 ? r1((profit / Number(si.line_total)) * 100) : 0,
      }]
    }),

  v_returns_list: () =>
    live('returns').map((r) => {
      let original_no = null
      let party_name = 'Walk-in'
      if (r.kind === 'sale') {
        const s = byId('sales', r.original_id)
        original_no = s?.bill_no ?? null
        party_name = (s?.customer_id && byId('customers', s.customer_id)?.name) || 'Walk-in'
      } else {
        const p = byId('purchases', r.original_id)
        original_no = p?.purchase_no ?? null
        party_name = (p?.supplier_id && byId('suppliers', p.supplier_id)?.name) ?? '—'
      }
      return {
        id: r.id, return_no: r.return_no, kind: r.kind, original_id: r.original_id,
        original_no, party_name, return_date: r.return_date,
        subtotal: r.subtotal, tax_amount: r.tax_amount, total: r.total,
        restock: r.restock, refund_method: r.refund_method ?? null, credit_note: r.credit_note,
        reason: r.reason ?? null, notes: r.notes ?? null, created_by: r.created_by,
        recorder_name: r.created_by ? byId('profiles', r.created_by)?.full_name ?? 'System' : 'System',
        line_count: rows('return_items').filter((ri) => ri.return_id === r.id).length,
      }
    }),

  v_return_items_detail: () =>
    rows('return_items').flatMap((ri) => {
      const r = byId('returns', ri.return_id)
      const p = byId('products', ri.product_id)
      if (!r || !p) return []
      return [{
        id: ri.id, return_id: ri.return_id, return_no: r.return_no, kind: r.kind,
        product_id: ri.product_id, sku: p.sku, product_name: p.name, unit: p.unit,
        original_item_id: ri.original_item_id ?? null,
        quantity: Number(ri.quantity), unit_price: Number(ri.unit_price),
        cost_price: Number(ri.cost_price), line_total: Number(ri.line_total),
        restocked: ri.restocked,
      }]
    }),

  v_payments_detail: () =>
    live('payments').map((pm) => {
      const cheque = pm.cheque_id ? byId('cheques', pm.cheque_id) : null
      return {
        id: pm.id, paid_at: pm.paid_at, direction: pm.direction, method: pm.method,
        amount: Number(pm.amount), customer_id: pm.customer_id ?? null, supplier_id: pm.supplier_id ?? null,
        party_name:
          (pm.customer_id && byId('customers', pm.customer_id)?.name) ??
          (pm.supplier_id && byId('suppliers', pm.supplier_id)?.name) ?? '—',
        sale_id: pm.sale_id ?? null,
        bill_no: pm.sale_id ? byId('sales', pm.sale_id)?.bill_no ?? null : null,
        purchase_id: pm.purchase_id ?? null,
        purchase_no: pm.purchase_id ? byId('purchases', pm.purchase_id)?.purchase_no ?? null : null,
        cheque_id: pm.cheque_id ?? null,
        cheque_no: cheque?.cheque_no ?? null, bank: cheque?.bank ?? null,
        cheque_status: cheque?.status ?? null, cheque_date: cheque?.cheque_date ?? null,
        reference_no: pm.reference_no ?? null, note: pm.note ?? null,
        recorded_by: pm.recorded_by ?? null,
        recorder_name: pm.recorded_by ? byId('profiles', pm.recorded_by)?.full_name ?? 'System' : 'System',
      }
    }),

  v_cheques_detail: () =>
    live('cheques').map((ch) => ({
      id: ch.id, direction: ch.direction, status: ch.status, cheque_no: ch.cheque_no,
      bank: ch.bank, branch: ch.branch ?? null, amount: Number(ch.amount),
      cheque_date: ch.cheque_date, party_name: ch.party_name,
      customer_id: ch.customer_id ?? null, supplier_id: ch.supplier_id ?? null,
      sale_id: ch.sale_id ?? null,
      bill_no: ch.sale_id ? byId('sales', ch.sale_id)?.bill_no ?? null : null,
      purchase_id: ch.purchase_id ?? null,
      purchase_no: ch.purchase_id ? byId('purchases', ch.purchase_id)?.purchase_no ?? null : null,
      cleared_date: ch.cleared_date ?? null, bounced_reason: ch.bounced_reason ?? null,
      notes: ch.notes ?? null, recorded_by: ch.recorded_by ?? null,
      recorder_name: ch.recorded_by ? byId('profiles', ch.recorded_by)?.full_name ?? 'System' : 'System',
      created_at: ch.created_at,
      days_to_maturity: Math.round((new Date(ch.cheque_date) - startOfToday()) / 86400000),
      is_due: new Date(ch.cheque_date) <= new Date() && ch.status === 'pending',
    })),

  v_expenses_detail: () =>
    live('expenses').map((e) => ({
      id: e.id, title: e.title, amount: Number(e.amount), expense_date: e.expense_date,
      category_id: e.category_id ?? null,
      category_name: e.category_id ? byId('expense_categories', e.category_id)?.name ?? 'Uncategorised' : 'Uncategorised',
      payment_method: e.payment_method, reference_no: e.reference_no ?? null,
      description: e.description ?? null, attachment_url: e.attachment_url ?? null,
      is_recurring: e.is_recurring ?? false, recurring_interval: e.recurring_interval ?? null,
      next_due_date: e.next_due_date ?? null, created_by: e.created_by ?? null,
      recorder_name: e.created_by ? byId('profiles', e.created_by)?.full_name ?? 'System' : 'System',
    })),

  v_income_list: () =>
    live('income').map((i) => ({
      id: i.id, source: i.source, amount: Number(i.amount), income_date: i.income_date,
      payment_method: i.payment_method, description: i.description ?? null,
      created_by: i.created_by ?? null,
      recorder_name: i.created_by ? byId('profiles', i.created_by)?.full_name ?? 'System' : 'System',
    })),

  v_cash_up: () => {
    const map = new Map()
    for (const pm of live('payments').filter((p) => p.direction === 'in')) {
      const s = pm.sale_id ? byId('sales', pm.sale_id) : null
      if (!s || s.is_deleted === true || s.status === 'void') continue
      const key = `${s.sale_date}|${pm.method}`
      const row = map.get(key) ?? { sale_date: s.sale_date, method: pm.method, payment_count: 0, amount: 0 }
      row.payment_count += 1
      row.amount = r2(row.amount + Number(pm.amount))
      map.set(key, row)
    }
    return [...map.values()]
  },

  v_sales_returns_daily: () => {
    const map = new Map()
    for (const r of live('returns')) {
      const key = `${r.return_date}|${r.kind}|${r.credit_note === true}`
      const row = map.get(key) ?? { day: r.return_date, kind: r.kind, credit_note: r.credit_note, total: 0, return_count: 0 }
      row.return_count += 1
      row.total = r2(row.total + Number(r.total))
      map.set(key, row)
    }
    return [...map.values()]
  },

  v_expense_daily: () => groupDaily(live('expenses'), 'expense_date', 'total', 'entry_count'),
  v_income_daily: () => groupDaily(live('income'), 'income_date', 'total', 'entry_count'),

  v_product_sales_summary: () => {
    const map = new Map()
    for (const si of live('sale_items')) {
      const s = byId('sales', si.sale_id)
      if (!s || s.is_deleted === true || s.status === 'void') continue
      const p = byId('products', si.product_id)
      if (!p) continue
      const row = map.get(p.id) ?? {
        product_id: p.id, sku: p.sku, product_name: p.name,
        category_name: categoryName(p.category_id), unit: p.unit, rack_location: p.rack_location,
        reorder_level: p.reorder_level, qty_sold: 0, revenue: 0, cogs: 0, gross_profit: 0,
        last_sold_date: null,
      }
      row.qty_sold = r3(row.qty_sold + Number(si.quantity))
      row.revenue = r2(row.revenue + Number(si.line_total))
      row.cogs = r2(row.cogs + Number(si.quantity) * Number(si.cost_price))
      row.gross_profit = r2(row.revenue - row.cogs)
      if (!row.last_sold_date || s.sale_date > row.last_sold_date) row.last_sold_date = s.sale_date
      map.set(p.id, row)
    }
    return [...map.values()]
  },

  v_stock_report: () => {
    const q = qtyMap()
    return live('products').map((p) => {
      const onHand = q.get(p.id) ?? 0
      let qtyIn = 0
      let qtyOut = 0
      for (const m of rows('stock_movements').filter((m) => m.product_id === p.id)) {
        if (m.quantity_delta > 0) qtyIn += Number(m.quantity_delta)
        else qtyOut += -Number(m.quantity_delta)
      }
      return {
        product_id: p.id, sku: p.sku, name: p.name, unit: p.unit, brand: p.brand,
        category_name: categoryName(p.category_id), rack_location: p.rack_location,
        reorder_level: p.reorder_level, cost_price: Number(p.cost_price), selling_price: Number(p.selling_price),
        qty_on_hand: r3(onHand), value_at_cost: r2(onHand * Number(p.cost_price)),
        value_at_sale: r2(onHand * Number(p.selling_price)),
        qty_out: r3(qtyOut), qty_in: r3(qtyIn),
      }
    })
  },

  v_held_bills: () =>
    rows('held_bills').map((h) => ({
      id: h.id, hold_no: h.hold_no, cart: h.cart ?? [],
      customer_id: h.customer_id ?? null,
      customer_name: h.customer_id ? byId('customers', h.customer_id)?.name ?? 'Walk-in' : 'Walk-in',
      note: h.note ?? null, held_by: h.held_by ?? null,
      holder_name: h.held_by ? byId('profiles', h.held_by)?.full_name ?? 'System' : 'System',
      created_at: h.created_at,
      line_count: (h.cart ?? []).length,
      cart_total: r2(sum(h.cart ?? [], (l) => Number(l.line_total ?? 0))),
    })),

  v_users: () =>
    rows('profiles').map((pr) => {
      const bills = live('sales').filter((s) => s.created_by === pr.id)
      return {
        id: pr.id, email: pr.email, full_name: pr.full_name, phone: pr.phone ?? null,
        role: pr.role, is_active: pr.is_active, avatar_url: pr.avatar_url ?? null,
        created_at: pr.created_at, updated_at: pr.updated_at,
        bill_count: bills.length,
        sales_total: r2(sum(bills, (s) => Number(s.grand_total))),
      }
    }),

  v_audit_feed: () =>
    rows('audit_log').map((a) => ({
      id: a.id, table_name: a.table_name, row_id: a.row_id, action: a.action,
      old_data: a.old_data ?? null, new_data: a.new_data ?? null,
      user_id: a.user_id ?? null, user_email: a.user_email ?? 'system',
      user_name: (a.user_id && byId('profiles', a.user_id)?.full_name) ?? a.user_email ?? 'System',
      created_at: a.created_at,
    })),
}

// ---------------------------------------------------------------------------
// RPC functions (mirror the SECURITY DEFINER plpgsql versions)
// ---------------------------------------------------------------------------

class RpcError extends Error {}
const fail = (msg) => {
  throw new RpcError(msg)
}
export { RpcError }

function applyWeightedCost(productId, qty, newCost) {
  const p = byId('products', productId)
  if (!p) fail('Product not found')
  const onHand = rows('stock_movements')
    .filter((m) => m.product_id === productId)
    .reduce((a, m) => a + Number(m.quantity_delta), 0)
  const denom = Math.max(onHand, 0) + Number(qty)
  if (denom > 0) p.cost_price = r2((Math.max(onHand, 0) * Number(p.cost_price) + Number(qty) * Number(newCost)) / denom)
}

/** trg_sync_purchase_payments: paid_amount = live payments minus dead cheques. */
function syncPurchasePaid(purchaseId) {
  const paid = sum(
    live('payments').filter((p) => p.purchase_id === purchaseId && (p.cheque_id == null || !['bounced', 'returned', 'cancelled'].includes(byId('cheques', p.cheque_id)?.status))),
    (p) => p.amount
  )
  const pu = byId('purchases', purchaseId)
  if (pu) pu.paid_amount = r2(paid)
}

function syncSalePaid(saleId) {
  const paid = sum(
    live('payments').filter((p) => p.sale_id === saleId && p.method !== 'credit' && (p.cheque_id == null || !['bounced', 'returned', 'cancelled'].includes(byId('cheques', p.cheque_id)?.status))),
    (p) => p.amount
  )
  const s = byId('sales', saleId)
  if (s) {
    s.paid_amount = r2(paid)
    s.balance_amount = r2(Math.max(Number(s.grand_total) - paid, 0))
  }
}

const isStaff = (user) => user?.role === 'admin' || user?.role === 'manager'

export const rpc = {
  fn_record_purchase(user, a) {
    if (!user) fail('Not authenticated')
    if (!isStaff(user)) fail('Not allowed')
    const items = a.p_items ?? []
    if (items.length === 0) fail('Purchase has no items')

    const purchase = {
      id: uuid(),
      purchase_no: nextNo('purchase_no'),
      supplier_id: a.p_supplier_id ?? null,
      supplier_invoice_no: a.p_supplier_invoice_no ?? null,
      purchase_date: a.p_purchase_date ?? new Date().toISOString().slice(0, 10),
      subtotal: 0,
      discount: Number(a.p_discount ?? 0),
      tax_amount: 0,
      total: 0,
      paid_amount: 0,
      notes: a.p_notes ?? null,
      created_by: user.id,
      is_deleted: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    rows('purchases').push(purchase)

    let subtotal = 0
    for (const item of items) {
      const qty = Number(item.quantity)
      const cost = Number(item.unit_cost)
      if (!(qty > 0) || cost < 0) fail('Invalid purchase line')
      applyWeightedCost(item.product_id, qty, cost)
      rows('purchase_items').push({
        id: uuid(), purchase_id: purchase.id, product_id: item.product_id,
        quantity: qty, unit_cost: cost, tax_rate: 0, line_total: r2(qty * cost),
        is_deleted: false, created_at: nowIso(),
      })
      newMovement({
        product_id: item.product_id, quantity_delta: qty, movement_type: 'purchase',
        reference_table: 'purchases', reference_id: purchase.id, recorded_by: user.id,
      })
      subtotal += r2(qty * cost)
    }

    const total = r2(Math.max(subtotal - purchase.discount, 0))
    purchase.subtotal = r2(subtotal)
    purchase.total = total

    for (const pay of a.p_payments ?? []) {
      const amount = Number(pay.amount)
      if (amount <= 0) continue
      const paidSoFar = sum(rows('payments').filter((p) => p.purchase_id === purchase.id && !p.is_deleted), (p) => p.amount)
      if (amount > total - paidSoFar) fail(`Payment exceeds the amount payable (${r2(total - paidSoFar)})`)
      let chequeId = null
      if (pay.method === 'cheque') {
        if (!pay.cheque_no || !pay.bank) fail('Cheque number and bank are required')
        const cheque = {
          id: uuid(), direction: 'issued', status: 'pending', cheque_no: pay.cheque_no,
          bank: pay.bank, branch: pay.branch ?? null, amount,
          cheque_date: pay.cheque_date ?? purchase.purchase_date,
          party_name: byId('suppliers', purchase.supplier_id)?.name ?? '',
          customer_id: null, supplier_id: purchase.supplier_id, sale_id: null, purchase_id: purchase.id,
          cleared_date: null, bounced_reason: null, notes: null, recorded_by: user.id,
          is_deleted: false, created_at: nowIso(), updated_at: nowIso(),
        }
        rows('cheques').push(cheque)
        chequeId = cheque.id
      }
      rows('payments').push({
        id: uuid(), direction: 'out', method: pay.method, amount,
        customer_id: null, supplier_id: purchase.supplier_id, sale_id: null, purchase_id: purchase.id,
        cheque_id: chequeId, reference_no: pay.reference_no ?? null, note: null, paid_at: nowIso(),
        recorded_by: user.id, is_deleted: false, created_at: nowIso(),
      })
    }
    syncPurchasePaid(purchase.id)
    audit('purchases', 'insert', purchase.id, user, { purchase_no: purchase.purchase_no, total: purchase.total })
    save()
    return {
      purchase_id: purchase.id, purchase_no: purchase.purchase_no, total: purchase.total,
      paid: purchase.paid_amount, balance: r2(purchase.total - purchase.paid_amount),
    }
  },

  fn_receive_payment(user, a) {
    if (!user) fail('Not authenticated')
    const amount = Number(a.p_amount)
    if (!amount || amount <= 0) fail('Amount must be positive')
    if (a.p_direction === 'in' && !a.p_customer_id) fail('Customer required')
    if (a.p_direction === 'out' && !a.p_supplier_id) fail('Supplier required')

    let chequeId = null
    if (a.p_method === 'cheque') {
      if (!a.p_cheque_no || !a.p_cheque_bank) fail('Cheque number and bank are required')
      const cheque = {
        id: uuid(),
        direction: a.p_direction === 'in' ? 'received' : 'issued',
        status: 'pending', cheque_no: a.p_cheque_no, bank: a.p_cheque_bank, branch: null,
        amount, cheque_date: a.p_cheque_date ?? new Date().toISOString().slice(0, 10),
        party_name:
          (a.p_direction === 'in' ? byId('customers', a.p_customer_id)?.name : byId('suppliers', a.p_supplier_id)?.name) ?? '',
        customer_id: a.p_customer_id ?? null, supplier_id: a.p_supplier_id ?? null,
        sale_id: a.p_sale_id ?? null, purchase_id: a.p_purchase_id ?? null,
        cleared_date: null, bounced_reason: null, notes: null, recorded_by: user.id,
        is_deleted: false, created_at: nowIso(), updated_at: nowIso(),
      }
      rows('cheques').push(cheque)
      chequeId = cheque.id
    }

    const payment = {
      id: uuid(), direction: a.p_direction, method: a.p_method, amount,
      customer_id: a.p_customer_id ?? null, supplier_id: a.p_supplier_id ?? null,
      sale_id: a.p_sale_id ?? null, purchase_id: a.p_purchase_id ?? null,
      cheque_id: chequeId, reference_no: a.p_reference_no ?? null, note: a.p_note ?? null,
      paid_at: nowIso(), recorded_by: user.id, is_deleted: false, created_at: nowIso(),
    }
    rows('payments').push(payment)
    if (payment.purchase_id) syncPurchasePaid(payment.purchase_id)
    if (payment.sale_id) syncSalePaid(payment.sale_id)
    audit('payments', 'insert', payment.id, user, { amount: payment.amount, method: payment.method })
    save()
    return payment.id
  },

  fn_record_purchase_return(user, a) {
    if (!user) fail('Not authenticated')
    if (!isStaff(user)) fail('Not allowed')
    const items = a.p_items ?? []
    if (items.length === 0) fail('No items selected')
    const purchase = live('purchases').find((p) => p.id === a.p_purchase_id)
    if (!purchase) fail('Purchase not found')

    const refundMethod = a.p_refund_method ?? null
    const ret = {
      id: uuid(), return_no: nextNo('return_no'), kind: 'purchase', original_id: purchase.id,
      return_date: new Date().toISOString().slice(0, 10), subtotal: 0, tax_amount: 0, total: 0,
      restock: true, refund_method: refundMethod, credit_note: refundMethod === null,
      reason: a.p_reason ?? null, notes: null, created_by: user.id,
      is_deleted: false, created_at: nowIso(),
    }
    rows('returns').push(ret)

    let total = 0
    for (const item of items) {
      const pi = live('purchase_items').find((x) => x.id === item.purchase_item_id && x.purchase_id === purchase.id)
      if (!pi) fail('Purchase item not found')
      const qty = Number(item.quantity)
      if (!(qty > 0) || qty > Number(pi.quantity)) fail('Invalid return quantity')
      const lineTotal = r2(qty * Number(pi.unit_cost))
      rows('return_items').push({
        id: uuid(), return_id: ret.id, product_id: pi.product_id, original_item_id: null,
        quantity: qty, unit_price: pi.unit_cost, cost_price: pi.unit_cost, line_total: lineTotal,
        restocked: true, created_at: nowIso(),
      })
      newMovement({
        product_id: pi.product_id, quantity_delta: -qty, movement_type: 'purchase_return',
        reference_table: 'returns', reference_id: ret.id, recorded_by: user.id,
      })
      total += lineTotal
    }
    ret.subtotal = r2(total)
    ret.total = r2(total)

    if (refundMethod && refundMethod !== 'credit') {
      rows('payments').push({
        id: uuid(), direction: 'in', method: refundMethod, amount: ret.total,
        customer_id: null, supplier_id: purchase.supplier_id, sale_id: null, purchase_id: purchase.id,
        cheque_id: null, reference_no: null, note: `Refund for ${ret.return_no}`, paid_at: nowIso(),
        recorded_by: user.id, is_deleted: false, created_at: nowIso(),
      })
    } else {
      purchase.total = r2(Math.max(Number(purchase.total) - ret.total, 0))
    }
    syncPurchasePaid(purchase.id)
    audit('returns', 'insert', ret.id, user, { return_no: ret.return_no, total: ret.total })
    save()
    return { return_id: ret.id, return_no: ret.return_no, total: ret.total }
  },

  /** ATOMIC POS checkout — mirrors fn_checkout in schema.sql. */
  fn_checkout(user, a) {
    if (!user) fail('Not authenticated')
    const items = a.p_items ?? []
    if (items.length === 0) fail('Cart is empty')
    const settings = rows('settings')[0] ?? { tax_rate: 0, allow_negative_stock: false, currency_code: 'LKR' }

    // 1. Validate everything before writing, so a raise leaves nothing behind.
    for (const item of items) {
      const qty = Number(item.quantity)
      const price = Number(item.unit_price)
      if (!(qty > 0)) fail('Invalid quantity')
      if (!(price >= 0)) fail('Invalid price')
      const p = byId('products', item.product_id)
      if (!p || p.is_deleted === true || p.is_active === false) fail(`Product not found or inactive: ${item.product_id}`)
      if (!settings.allow_negative_stock) {
        const avail = qtyMap().get(p.id) ?? 0
        if (avail < qty) fail(`Insufficient stock for ${p.name} (${p.sku}) — available ${avail}`)
      }
    }

    const sale = {
      id: uuid(), bill_no: nextNo('sale_no'), customer_id: a.p_customer_id ?? null,
      sold_at: nowIso(), sale_date: today(), status: 'completed',
      subtotal: 0, line_discounts: 0, bill_discount: 0, tax_amount: 0,
      grand_total: 0, paid_amount: 0, balance_amount: 0, change_amount: 0,
      note: a.p_note ?? null, created_by: user.id, is_deleted: false, void_reason: null,
      created_at: nowIso(),
    }
    rows('sales').push(sale)

    let subtotal = 0
    let lineDiscs = 0
    for (const item of items) {
      const qty = Number(item.quantity)
      const price = Number(item.unit_price)
      const disc = Number(item.discount ?? 0)
      if (disc < 0 || qty * price - disc < 0) fail('Line discount exceeds line total')
      const p = byId('products', item.product_id)
      // Cost snapshot always comes from the product row — the cashier cannot
      // forge it, and a stale UI preview cannot distort profit.
      const cost = Number(p.cost_price ?? 0)
      const lineTotal = r2(qty * price - disc)
      subtotal += r2(qty * price)
      lineDiscs += r2(disc)
      rows('sale_items').push({
        id: uuid(), sale_id: sale.id, product_id: p.id, quantity: qty, unit_price: price,
        cost_price: cost, discount: r2(disc), line_total: lineTotal,
        is_deleted: false, created_at: nowIso(),
      })
      newMovement({
        product_id: p.id, quantity_delta: -qty, movement_type: 'sale',
        reference_table: 'sales', reference_id: sale.id, recorded_by: user.id,
      })
    }

    const billDisc =
      a.p_discount_mode === 'percent'
        ? r2((subtotal - lineDiscs) * Number(a.p_bill_discount ?? 0) / 100)
        : r2(Number(a.p_bill_discount ?? 0))
    if (billDisc < 0) fail('Discount cannot be negative')

    const net = r2(subtotal - lineDiscs - billDisc)
    const tax = r2((net * Number(settings.tax_rate ?? 0)) / 100)
    const grand = r2(net + tax)
    Object.assign(sale, {
      subtotal: r2(subtotal), line_discounts: r2(lineDiscs), bill_discount: billDisc,
      tax_amount: tax, grand_total: grand,
    })

    let paidSum = 0
    let creditSum = 0
    for (const pay of a.p_payments ?? []) {
      const amount = Number(pay.amount)
      if (!(amount > 0)) fail('Invalid payment amount')
      if (!['cash', 'card', 'bank', 'cheque', 'credit'].includes(pay.method)) fail(`Unknown payment method ${pay.method}`)
      let chequeId = null
      if (pay.method === 'cheque') {
        if (!pay.cheque_no || !pay.bank) fail('Cheque number and bank are required')
        const cheque = {
          id: uuid(), direction: 'received', status: 'pending', cheque_no: pay.cheque_no,
          bank: pay.bank, branch: pay.branch ?? null, amount,
          cheque_date: pay.cheque_date ?? today(),
          party_name: pay.party_name ?? (sale.customer_id ? byId('customers', sale.customer_id)?.name ?? '' : ''),
          customer_id: sale.customer_id, supplier_id: null, sale_id: sale.id, purchase_id: null,
          cleared_date: null, bounced_reason: null, notes: null, recorded_by: user.id,
          is_deleted: false, created_at: nowIso(), updated_at: nowIso(),
        }
        rows('cheques').push(cheque)
        chequeId = cheque.id
      }
      if (pay.method === 'credit') {
        if (!sale.customer_id) fail('Credit sale requires a customer')
        creditSum += amount
      } else {
        paidSum += amount
      }
      rows('payments').push({
        id: uuid(), direction: 'in', method: pay.method, amount,
        customer_id: sale.customer_id, supplier_id: null, sale_id: sale.id, purchase_id: null,
        cheque_id: chequeId, reference_no: pay.reference_no ?? null, note: null, paid_at: nowIso(),
        recorded_by: user.id, is_deleted: false, created_at: nowIso(),
      })
    }

    if (r2(paidSum + creditSum) < grand) fail(`Payments (${r2(paidSum + creditSum)}) less than total (${grand})`)

    if (sale.customer_id && creditSum > 0) {
      const customer = byId('customers', sale.customer_id)
      const limit = Number(customer?.credit_limit ?? 0)
      const row = VIEWS.v_customer_balances().find((b) => b.id === sale.customer_id)
      const newBal = row?.balance ?? 0
      if (limit > 0 && newBal > limit) fail(`Customer credit limit exceeded (limit ${limit}, new balance ${newBal})`)
    }

    // trg_sync_sale_payments owns paid/balance, and it excludes credit lines —
    // so a credit sale keeps its balance_amount as the amount still owed.
    syncSalePaid(sale.id)
    sale.change_amount = r2(Math.max(paidSum - grand + creditSum, 0))
    audit('sales', 'insert', sale.id, user, { bill_no: sale.bill_no, grand_total: sale.grand_total })
    save()

    return {
      sale_id: sale.id, bill_no: sale.bill_no, subtotal: sale.subtotal,
      discount: r2(lineDiscs + billDisc), tax_amount: sale.tax_amount, grand_total: sale.grand_total,
      paid_amount: sale.paid_amount, credit_amount: r2(creditSum),
      balance_amount: sale.balance_amount, change_amount: sale.change_amount,
    }
  },

  /** Sales return — mirrors fn_record_sale_return in schema.sql. */
  fn_record_sale_return(user, a) {
    if (!user) fail('Not authenticated')
    const items = a.p_items ?? []
    if (items.length === 0) fail('No items selected')
    const sale = live('sales').find((s) => s.id === a.p_sale_id)
    if (!sale) fail('Sale not found')

    const refundMethod = a.p_refund_method ?? null
    const ret = {
      id: uuid(), return_no: nextNo('return_no'), kind: 'sale', original_id: sale.id,
      return_date: today(), subtotal: 0, tax_amount: 0, total: 0,
      restock: a.p_restock !== false, refund_method: refundMethod, credit_note: refundMethod === null,
      reason: a.p_reason ?? null, notes: null, created_by: user.id,
      is_deleted: false, created_at: nowIso(),
    }
    rows('returns').push(ret)

    let total = 0
    for (const item of items) {
      const si = live('sale_items').find((x) => x.id === item.sale_item_id && x.sale_id === sale.id)
      if (!si) fail('Sale item not found')
      const qty = Number(item.quantity)
      if (!(qty > 0) || qty > Number(si.quantity)) fail(`Invalid return quantity for ${si.id}`)
      const lineTotal = r2(qty * Number(si.unit_price))
      rows('return_items').push({
        id: uuid(), return_id: ret.id, product_id: si.product_id, original_item_id: si.id,
        quantity: qty, unit_price: Number(si.unit_price), cost_price: Number(si.cost_price),
        line_total: lineTotal, restocked: ret.restock, created_at: nowIso(),
      })
      if (ret.restock) {
        newMovement({
          product_id: si.product_id, quantity_delta: qty, movement_type: 'sales_return',
          reference_table: 'returns', reference_id: ret.id, recorded_by: user.id,
        })
      }
      total += lineTotal
    }
    ret.subtotal = r2(total)
    ret.total = r2(total)

    if (refundMethod && refundMethod !== 'credit') {
      rows('payments').push({
        id: uuid(), direction: 'out', method: refundMethod, amount: ret.total,
        customer_id: sale.customer_id, supplier_id: null, sale_id: null, purchase_id: null,
        cheque_id: null, reference_no: null, note: `Refund for ${ret.return_no}`, paid_at: nowIso(),
        recorded_by: user.id, is_deleted: false, created_at: nowIso(),
      })
    }

    const soldQty = sum(live('sale_items').filter((si) => si.sale_id === sale.id), (si) => Number(si.quantity))
    const returnedQty = sum(
      rows('return_items').filter((ri) =>
        ri.original_item_id && live('sale_items').some((si) => si.id === ri.original_item_id && si.sale_id === sale.id) &&
        live('returns').some((r) => r.id === ri.return_id && r.kind === 'sale' && r.is_deleted !== true)
      ),
      (ri) => Number(ri.quantity)
    )
    sale.status = returnedQty >= soldQty ? 'fully_returned' : 'partially_returned'
    // A credit note reduces what the customer owes; refund-out already does too.
    syncSalePaid(sale.id)
    audit('returns', 'insert', ret.id, user, { return_no: ret.return_no, total: ret.total, restock: ret.restock })
    save()
    return { return_id: ret.id, return_no: ret.return_no, total: ret.total, sale_status: sale.status }
  },

  /** Cashier-safe reprint payload — mirrors fn_get_bill in schema.sql. */
  fn_get_bill(user, a) {
    if (!user) fail('Not authenticated')
    const s = live('sales').find((x) => x.id === a.p_sale_id)
    if (!s) fail('Sale not found')
    const c = s.customer_id ? byId('customers', s.customer_id) : null
    return {
      sale: {
        id: s.id, bill_no: s.bill_no, sale_date: s.sale_date, subtotal: s.subtotal,
        line_discounts: s.line_discounts, bill_discount: s.bill_discount, tax_amount: s.tax_amount,
        grand_total: s.grand_total, paid_amount: s.paid_amount, balance_amount: s.balance_amount,
        status: s.status, note: s.note ?? null,
        customer_name: c?.name ?? null, customer_phone: c?.phone ?? null, customer_type: c?.type ?? null,
        cashier_name: s.created_by ? byId('profiles', s.created_by)?.full_name ?? 'System' : 'System',
      },
      items: live('sale_items')
        .filter((si) => si.sale_id === s.id)
        .map((si) => {
          const p = byId('products', si.product_id)
          return {
            id: si.id, name: p?.name ?? '—', sku: p?.sku ?? '—', unit: p?.unit ?? 'pcs',
            quantity: Number(si.quantity), unit_price: Number(si.unit_price),
            discount: Number(si.discount), line_total: Number(si.line_total),
          }
        }),
      payments: live('payments')
        .filter((pm) => pm.sale_id === s.id)
        .map((pm) => ({
          method: pm.method, amount: Number(pm.amount), reference_no: pm.reference_no ?? null,
          cheque_status: pm.cheque_id ? byId('cheques', pm.cheque_id)?.status ?? null : null,
        })),
      settings: rows('settings')[0] ?? null,
    }
  },

  fn_adjust_stock(user, a) {    if (!user) fail('Not authenticated')
    if (!isStaff(user)) fail('Only admin/manager may adjust stock')
    const delta = Number(a.p_delta)
    if (!delta) fail('Delta must be non-zero')
    if (!a.p_reason) fail('Reason is required')
    if (!byId('products', a.p_product_id)) fail('Product not found')
    newMovement({
      product_id: a.p_product_id, quantity_delta: delta, movement_type: 'adjustment',
      reference_table: 'manual', reason: a.p_reason, note: a.p_note ?? null, recorded_by: user.id,
    })
    audit('stock_movements', 'insert', a.p_product_id, user, { delta, reason: a.p_reason })
    save()
    return null
  },

  fn_stock_take(user, a) {
    if (!user) fail('Not authenticated')
    if (!isStaff(user)) fail('Not allowed')
    const current = qtyMap()
    let adjusted = 0
    for (const c of a.p_counts ?? []) {
      const delta = Number(c.counted_qty) - (current.get(c.product_id) ?? 0)
      if (delta === 0) continue
      newMovement({
        product_id: c.product_id, quantity_delta: delta, movement_type: 'adjustment',
        reference_table: 'stock_take', reason: 'stock-take', note: a.p_note ?? null, recorded_by: user.id,
      })
      adjusted += 1
    }
    audit('stock_movements', 'insert', 'stock-take', user, { adjusted })
    save()
    return { adjusted_count: adjusted }
  },
}

// Postgres runs these bodies in one transaction, so a RAISE discards every
// partial write. Mirror that here, otherwise a failed receipt leaves orphan
// stock movements and half-posted purchases behind.
{
  const impl = { ...rpc }
  for (const name of Object.keys(impl)) {
    rpc[name] = (user, args) => {
      const undo = JSON.parse(JSON.stringify(db))
      try {
        const out = impl[name](user, args)
        save()
        return out
      } catch (e) {
        Object.assign(db, undo)
        for (const t of TABLES) if (!db.tables[t]) db.tables[t] = []
        save()
        throw e
      }
    }
  }
}

/** Generic insert defaults so hand-written UI payloads match the SQL defaults. */
export const TABLE_DEFAULTS = {
  products: { is_active: true, is_deleted: false, unit: 'pcs', reorder_level: 5, cost_price: 0, selling_price: 0 },
  categories: { is_active: true, is_deleted: false, sort_order: 0 },
  suppliers: { is_active: true, is_deleted: false, credit_terms_days: 0, opening_balance: 0 },
  customers: { is_active: true, is_deleted: false, type: 'retail', credit_limit: 0, opening_balance: 0 },
  expenses: { is_deleted: false, payment_method: 'cash', expense_date: () => new Date().toISOString().slice(0, 10) },
  income: { is_deleted: false, payment_method: 'cash', income_date: () => new Date().toISOString().slice(0, 10) },
  profiles: { is_active: true, role: 'cashier', full_name: '' },
}

/** trg_sync_* + trg_cheque_status: keep derived balances in step with writes. */
const DEAD_CHEQUE = ['bounced', 'returned', 'cancelled']

function resyncDocument(pm) {
  if (!pm) return
  if (pm.sale_id) syncSalePaid(pm.sale_id)
  if (pm.purchase_id) syncPurchasePaid(pm.purchase_id)
}

function onChequeWrite(cheque, previous) {
  if (!cheque) return
  const wasDead = previous ? DEAD_CHEQUE.includes(previous.status) : DEAD_CHEQUE.includes(cheque.status)
  if (!DEAD_CHEQUE.includes(cheque.status) || wasDead) return
  for (const pm of rows('payments').filter((p) => p.cheque_id === cheque.id && p.is_deleted !== true)) {
    pm.is_deleted = true
    pm.note = `${pm.note ? pm.note + ' | ' : ''}reversed: cheque ${cheque.status}`
    audit('payments', 'update', pm.id, null, { reversed_by_cheque: cheque.id })
    resyncDocument(pm)
  }
  if (cheque.status === 'bounced') cheque.cleared_date = null
}

export function insertRow(table, body, user) {
  const list = Array.isArray(body) ? body : [body]
  const defaults = TABLE_DEFAULTS[table] ?? {}
  const out = []
  for (const item of list) {
    const row = { ...item }
    for (const [k, v] of Object.entries(defaults)) if (row[k] === undefined) row[k] = typeof v === 'function' ? v() : v
    if (row.id === undefined) row.id = table === 'stock_movements' ? ++db.seq.movement : uuid()
    if (row.created_at === undefined) row.created_at = nowIso()
    if (row.updated_at === undefined) row.updated_at = nowIso()
    if (table === 'settings') row.id = Number(row.id ?? 1)
    rows(table).push(row)
    audit(table, 'insert', row.id, user, row)
    if (table === 'payments') resyncDocument(row)
    if (table === 'cheques') onChequeWrite(row, null)
    out.push(row)
  }
  save()
  return out
}

/** PostgREST-style hard delete — used for held_bills recall and draft cleanup. */
export function deleteRows(table, matching, user) {
  const list = rows(table)
  const removed = []
  for (let i = list.length - 1; i >= 0; i--) {
    if (!matching(list[i])) continue
    removed.push(list[i])
    audit(table, 'delete', list[i].id, user, null)
    list.splice(i, 1)
  }
  save()
  return removed
}

export function updateRows(table, matching, patch, user) {
  const out = []
  for (const row of rows(table)) {
    if (!matching(row)) continue
    const before = table === 'cheques' ? { ...row } : null
    Object.assign(row, patch, { updated_at: nowIso() })
    audit(table, 'update', row.id, user, row)
    if (table === 'payments') resyncDocument(row)
    if (table === 'cheques') onChequeWrite(row, before)
    out.push(row)
  }
  save()
  return out
}

if (!load()) seed()

// Sign-ups survive a process restart: fold the persisted rows back into the
// in-memory user list every lookup uses.
for (const u of db.tables.auth_users ?? []) {
  if (!USERS.some((s) => s.id === u.id)) USERS.push({ ...u })
}
