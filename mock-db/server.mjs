/**
 * Dev-only mock of the Supabase APIs this app uses: PostgREST read/write,
 * RPC functions, GoTrue password auth and Storage uploads.
 * Start with `npm run mock`, then point NEXT_PUBLIC_SUPABASE_URL at it.
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  db, rows, VIEWS, rpc, USERS, insertRow, updateRows, deleteRows, reseed, RpcError, UPLOAD_DIR, nowIso, save,
} from './db.mjs'

const PORT = Number(process.env.MOCK_PORT || 54321)

/** Relations a cashier must not read — mirrors the staff-only RLS policies. */
const STAFF_ONLY = new Set([
  'products', 'purchase_items', 'purchases', 'sale_items', 'stock_movements', 'expenses', 'income',
  'suppliers', 'audit_log', 'expense_categories',
  'v_products_full', 'v_inventory_valuation', 'v_last_purchase_costs',
  'v_stock_movements_detail', 'v_purchase_items_detail', 'v_supplier_balances',
  'v_sale_items_detail', 'v_product_sales_summary', 'v_stock_report',
  'v_expenses_detail', 'v_income_list', 'v_cash_up', 'v_expense_daily', 'v_income_daily',
  'v_users', 'v_audit_feed',
])

/**
 * RLS lets a cashier see only their own trading rows. PostgREST cannot express
 * that in the mock, so filter by the owner column the policies use.
 */
const SELF_COLUMN = {
  sales: 'created_by',
  returns: 'created_by',
  payments: 'recorded_by',
  cheques: 'recorded_by',
  held_bills: 'held_by',
  // `profiles` is readable by everyone for their own row, staff read all rows.
  profiles: 'id',
  v_sales_list: 'created_by',
  v_returns_list: 'created_by',
  v_payments_detail: 'recorded_by',
  v_cheques_detail: 'recorded_by',
  v_held_bills: 'held_by',
}

// ---------------------------------------------------------------------------
// fake auth
// ---------------------------------------------------------------------------

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

function tokenFor(user) {
  const exp = Math.floor(Date.now() / 1000) + 86400
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, email: user.email, role: 'authenticated', exp })}.mock-signature`
}

function userFromReq(req) {
  const header = req.headers.authorization ?? ''
  const token = header.replace(/^Bearer\s+/i, '')
  if (!token || !token.includes('.')) return null
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    return USERS.find((u) => u.id === payload.sub) ?? null
  } catch {
    return null
  }
}

const goTrueUser = (u) => ({
  id: u.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: u.email,
  email_confirmed_at: nowIso(),
  confirmed_at: nowIso(),
  created_at: nowIso(),
  updated_at: nowIso(),
  phone: '',
  user_metadata: { full_name: u.full_name, role: u.role },
  app_metadata: { provider: 'email', providers: ['email'] },
  is_anonymous: false,
})

/** Create an auth user and keep its profiles row in step, as the trigger does. */
function newUser(email, password, data = {}) {
  const created = {
    id: randomUUID(),
    email,
    password: String(password ?? ''),
    role: data.role ?? 'cashier',
    full_name: data.full_name ?? email.split('@')[0],
  }
  USERS.push(created)
  rows('auth_users').push({ ...created })
  rows('profiles').push({
    id: created.id, email, full_name: created.full_name, phone: null,
    role: created.role, is_active: true, avatar_url: null,
    created_at: nowIso(), updated_at: nowIso(),
  })
  save()
  return created
}

function patchUser(id, res, json) {
  const u = USERS.find((x) => x.id === id)
  if (!u) return send(res, 404, { message: 'User not found' })
  if (json.email) u.email = String(json.email).toLowerCase()
  if (json.password) u.password = String(json.password)
  if (json.data) {
    u.full_name = json.data.full_name ?? u.full_name
    u.role = json.data.role ?? u.role
  }
  const pr = rows('profiles').find((x) => x.id === id)
  if (pr) Object.assign(pr, { email: u.email, full_name: u.full_name, role: u.role, updated_at: nowIso() })
  save()
  return send(res, 200, goTrueUser(u))
}

function dropUser(id, res) {
  const i = USERS.findIndex((x) => x.id === id)
  if (i === -1) return send(res, 404, { message: 'User not found' })
  const [gone] = USERS.splice(i, 1)
  for (const t of ['auth_users', 'profiles']) {
    const list = rows(t)
    const j = list.findIndex((x) => x.id === id)
    if (j !== -1) list.splice(j, 1)
  }
  save()
  return send(res, 200, goTrueUser(gone))
}

const session = (u) => ({
  access_token: tokenFor(u),
  token_type: 'bearer',
  expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  refresh_token: `mock-refresh.${u.id}`,
  user: goTrueUser(u),
})

// ---------------------------------------------------------------------------
// PostgREST query engine
// ---------------------------------------------------------------------------

function splitTop(input) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of input) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function parseSelect(sel) {
  const spec = { all: false, cols: [], embeds: [] }
  if (!sel || sel === '*') {
    spec.all = true
    return spec
  }
  for (const token of splitTop(sel)) {
    const open = token.indexOf('(')
    if (open === -1) {
      const [name, as] = token.split(/\s+as\s+/)
      spec.cols.push({ name: name.trim(), as: as?.trim() })
      continue
    }
    const name = token.slice(0, open).trim()
    const inner = token.slice(open + 1, -1).trim()
    spec.embeds.push({ name, child: parseSelect(inner) })
  }
  return spec
}

const singular = (n) => (n.endsWith('ies') ? `${n.slice(0, -3)}y` : n.endsWith('s') ? n.slice(0, -1) : n)

function embedTarget(sourceTable, row, name) {
  const candidates = [`${singular(name)}_id`, `${name}_id`]
  if (name === 'profiles') candidates.push('created_by', 'recorded_by', 'user_id')
  for (const key of candidates) {
    const fk = row[key]
    if (fk == null) continue
    const hit = rows(name).find((r) => r.id === fk)
    if (hit) return hit
  }
  return null
}

function project(row, spec, table) {
  const out = {}
  const keys = spec.all ? Object.keys(row) : spec.cols.map((c) => c.name)
  for (const key of keys) {
    if (key in row) out[spec.cols.find((c) => c.name === key && c.as)?.as ?? key] = row[key]
  }
  if (spec.all) for (const c of spec.cols) if (c.as && c.name === '*') out[c.as] = row[c.as]
  for (const embed of spec.embeds) {
    const target = embedTarget(table, row, embed.name)
    out[embed.name] = target ? project(target, embed.child, embed.name) : null
  }
  return out
}

const coerce = (v) => {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null') return null
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v)
  return v
}

function filterFn(col, expr) {
  const dot = expr.indexOf('.')
  let op = dot === -1 ? 'eq' : expr.slice(0, dot)
  let raw = dot === -1 ? expr : expr.slice(dot + 1)
  if (op === 'not') {
    const next = raw.indexOf('.')
    op = `not.${raw.slice(0, next)}`
    raw = raw.slice(next + 1)
  }
  const target = coerce(raw)

  if (op === 'is') return (row) => (raw === 'null' ? row[col] == null : row[col] === target)
  if (op === 'in') {
    const list = raw.replace(/^\((.*)\)$/, '$1').split(',').map((s) => coerce(s.trim()))
    return (row) => list.some((v) => String(row[col]) === String(v))
  }
  if (op === 'not.in') {
    const list = raw.replace(/^\((.*)\)$/, '$1').split(',').map((s) => coerce(s.trim()))
    return (row) => !list.some((v) => String(row[col]) === String(v))
  }
  if (op === 'like' || op === 'ilike') {
    const pattern = raw.replaceAll('*', '.*')
    const re = new RegExp(`^${pattern}$`, op === 'ilike' ? 'i' : '')
    return (row) => re.test(String(row[col] ?? ''))
  }
  if (op === 'not.eq') return (row) => row[col] !== target
  if (op === 'eq') return (row) => row[col] === target || String(row[col]) === String(target)
  const cmp = (row) => {
    const a = row[col]
    if (a == null) return false
    if (typeof a === 'number' || typeof target === 'number') return Number(a)
    return String(a).localeCompare(String(target))
  }
  if (op === 'gt') return (row) => cmp(row) > 0
  if (op === 'gte') return (row) => cmp(row) >= 0
  if (op === 'lt') return (row) => cmp(row) < 0
  if (op === 'lte') return (row) => cmp(row) <= 0
  return () => true
}

function queryRelation(name, params, guard = () => true) {
  const source = VIEWS[name] ? VIEWS[name]() : rows(name)
  let out = source.filter(guard)

  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue
    out = out.filter(filterFn(key, value))
  }

  const order = params.get('order')
  if (order) {
    const terms = order.split(',').map((t) => {
      const [col, ...flags] = t.split('.')
      return { col, desc: flags.includes('desc') }
    })
    out = [...out].sort((a, b) => {
      for (const { col, desc } of terms) {
        const av = a[col]
        const bv = b[col]
        if (av == null && bv == null) continue
        if (av == null) return 1
        if (bv == null) return -1
        const r = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
        if (r !== 0) return desc ? -r : r
      }
      return 0
    })
  }

  const offset = Number(params.get('offset') ?? 0)
  const limit = params.get('limit')
  if (offset) out = out.slice(offset)
  if (limit) out = out.slice(0, Number(limit))

  const spec = parseSelect(params.get('select'))
  return out.map((row) => project(row, spec, name))
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

function send(res, status, body, req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,prefer,accept,x-upsert,content-length',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
    'Access-Control-Expose-Headers': 'content-range,x-supabase-api-version',
  }
  if (body === null || body === undefined) {
    res.writeHead(status, headers)
    return res.end()
  }
  // PostgREST always answers with JSON, so a scalar uuid comes back quoted.
  const payload = JSON.stringify(body)
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

const wantsObject = (req) => String(req.headers.accept ?? '').includes('vnd.pgrst.object')

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendRows(res, req, data) {
  if (!wantsObject(req)) return send(res, 200, data)
  if (data.length === 1) return send(res, 200, data[0])
  return send(res, 406, {
    code: 'PGRST116',
    details: `Results contain ${data.length} rows, application/vnd.pgrst.object+json requires 1 result`,
    message: 'JSON object requested, multiple (or no) rows returned',
  })
}

async function handleRest(req, res, url, rel, body) {
  const user = userFromReq(req)
  const prefer = String(req.headers.prefer ?? '')
  const params = url.searchParams

  if (rel.startsWith('rpc:')) {
    if (!user) return send(res, 401, { code: '401', message: 'Not authenticated' })
    const fn = rel.slice(4)
    const handler = rpc[fn]
    if (!handler) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${fn} within the schema` })
    try {
      const args = body ? JSON.parse(body.toString('utf8')) : {}
      return send(res, 200, handler(user, args) ?? null)
    } catch (e) {
      if (e instanceof RpcError) return send(res, 400, { code: 'P0001', message: e.message, details: null, hint: null })
      throw e
    }
  }

  if (STAFF_ONLY.has(rel) && user?.role === 'cashier') {
    return send(res, 403, { code: '42501', message: `permission denied for ${rel}` })
  }
  if (!user && req.method !== 'GET') {
    return send(res, 401, { code: '401', message: 'Not authenticated' })
  }

  // Cashiers see only their own trading rows, mirroring the RLS `using` clauses.
  const ownerCol = SELF_COLUMN[rel]
  const guard =
    ownerCol && user?.role === 'cashier'
      ? (row) => String(row[ownerCol]) === String(user.id)
      : () => true

  if (VIEWS[rel]) {
    if (req.method !== 'GET') return send(res, 405, { message: `cannot ${req.method} view ${rel}` })
    return sendRows(res, req, queryRelation(rel, params, guard))
  }

  if (!db.tables[rel]) return send(res, 404, { code: '42P01', message: `relation "${rel}" does not exist` })

  if (req.method === 'GET') return sendRows(res, req, queryRelation(rel, params, guard))

  const json = body ? JSON.parse(body.toString('utf8')) : {}
  const spec = parseSelect(params.get('select'))

  if (req.method === 'POST') {
    if (prefer.includes('resolution=merge-duplicates')) {
      const list = Array.isArray(json) ? json : [json]
      const merged = []
      for (const item of list) {
        const existing = rows(rel).find((r) => String(r.id) === String(item.id))
        merged.push(existing ? updateRows(rel, (r) => r === existing, item, user)[0] : insertRow(rel, item, user)[0])
      }
      if (!prefer.includes('return=representation')) return send(res, 201, null)
      return send(res, 201, merged.map((r) => project(r, spec, rel)))
    }
    const created = insertRow(rel, json, user)
    if (prefer.includes('return=representation')) {
      const out = created.map((r) => project(r, spec, rel))
      return send(res, 201, wantsObject(req) ? out[0] : out)
    }
    return send(res, 201, null)
  }

  if (req.method === 'PATCH') {
    const match = (row) => {
      if (!guard(row)) return false
      for (const [key, value] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(key)) continue
        if (!filterFn(key, value)(row)) return false
      }
      return true
    }
    const updated = updateRows(rel, match, json, user)
    if (prefer.includes('return=representation')) {
      const out = updated.map((r) => project(r, spec, rel))
      return send(res, 200, wantsObject(req) ? out[0] ?? null : out)
    }
    return send(res, 204, null)
  }

  if (req.method === 'DELETE') {
    const match = (row) => {
      if (!guard(row)) return false
      for (const [key, value] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(key)) continue
        if (!filterFn(key, value)(row)) return false
      }
      return true
    }
    const removed = deleteRows(rel, match, user)
    if (prefer.includes('return=representation')) {
      const out = removed.map((r) => project(r, spec, rel))
      return send(res, 200, wantsObject(req) ? out[0] ?? null : out)
    }
    return send(res, 204, null)
  }

  return send(res, 405, { message: `unsupported method ${req.method}` })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const p = url.pathname

  try {
    if (req.method === 'OPTIONS') return send(res, 204, null)

    if (p === '/mock/reset') {
      reseed()
      return send(res, 200, { ok: true })
    }

    // --- GoTrue -----------------------------------------------------------
    if (p.startsWith('/auth/v1/')) {
      if (p.startsWith('/auth/v1/token')) {
        const body = req.method === 'POST' ? (await readBody(req)).toString('utf8') : ''
        const json = body ? JSON.parse(body) : {}
        const grant = url.searchParams.get('grant_type')
        if (grant === 'password') {
          const user = USERS.find((u) => u.email === json.email && u.password === json.password)
          if (!user) return send(res, 400, { code: 'invalid_credentials', msg: 'Invalid login credentials', message: 'Invalid login credentials' })
          return send(res, 200, session(user))
        }
        if (grant === 'refresh_token') {
          const rt = String(json.refresh_token ?? '')
          const user = USERS.find((u) => rt.endsWith(u.id))
          if (!user) return send(res, 400, { code: 'bad_jwt', message: 'invalid refresh token' })
          return send(res, 200, session(user))
        }
        return send(res, 400, { message: `unsupported grant_type ${grant}` })
      }
      if (p === '/auth/v1/logout') return send(res, 204, null)
      if (p === '/auth/v1/settings') return send(res, 200, { external: { email: true } })

      // signUp: autoconfirm is on in the mock, so a session comes back too.
      if (p === '/auth/v1/signup' && req.method === 'POST') {
        const json = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        const email = String(json.email ?? '').toLowerCase()
        if (!email) return send(res, 422, { code: 'validation_failed', msg: 'Email is required', message: 'Email is required' })
        if (USERS.some((u) => u.email === email)) {
          return send(res, 422, { code: 'user_already_exists', msg: 'User already registered', message: 'User already registered' })
        }
        const created = newUser(email, json.password, json.data)
        return send(res, 200, { ...goTrueUser(created), session: session(created) })
      }

      // GoTrue admin API — used by the users & roles screen. Admin callers only.
      if (p === '/auth/v1/admin/users') {
        const actor = userFromReq(req)
        if (actor?.role !== 'admin') return send(res, 403, { code: 'not_allowed', message: 'only admins manage users' })
        if (req.method === 'GET') return send(res, 200, { users: USERS.map(goTrueUser), aud: 'authenticated' })
        if (req.method === 'POST') {
          const json = JSON.parse((await readBody(req)).toString('utf8') || '{}')
          const email = String(json.email ?? '').toLowerCase()
          if (USERS.some((u) => u.email === email)) return send(res, 422, { code: 'user_already_exists', msg: 'User already registered' })
          return send(res, 200, goTrueUser(newUser(email, json.password, json.data)))
        }
        // auth-js updates a user by id through PUT with the did in the query.
        if (req.method === 'PUT') {
          const json = JSON.parse((await readBody(req)).toString('utf8') || '{}')
          return patchUser(url.searchParams.get('did') ?? json.id, res, json)
        }
      }

      if (p.startsWith('/auth/v1/admin/users/')) {
        const actor = userFromReq(req)
        if (actor?.role !== 'admin') return send(res, 403, { code: 'not_allowed', message: 'only admins manage users' })
        const id = decodeURIComponent(p.slice('/auth/v1/admin/users/'.length))
        if (req.method === 'DELETE') return dropUser(id, res)
        if (req.method === 'GET') {
          const u = USERS.find((x) => x.id === id)
          return u ? send(res, 200, { ...goTrueUser(u), authenticators: [] }) : send(res, 404, { message: 'User not found' })
        }
        if (req.method === 'PUT' || req.method === 'PATCH') {
          return patchUser(id, res, JSON.parse((await readBody(req)).toString('utf8') || '{}'))
        }
      }

      if (p === '/auth/v1/user') {
        const user = userFromReq(req)
        if (!user) return send(res, 401, { code: 'bad_jwt', message: 'invalid JWT' })
        if (req.method === 'PUT' || req.method === 'PATCH') {
          return patchUser(user.id, res, JSON.parse((await readBody(req)).toString('utf8') || '{}'))
        }
        return send(res, 200, goTrueUser(user))
      }
      return send(res, 404, { message: `no auth route ${p}` })
    }

    // --- PostgREST --------------------------------------------------------
    if (p.startsWith('/rest/v1/')) {
      let rel = decodeURIComponent(p.slice('/rest/v1/'.length))
      if (rel.startsWith('rpc/')) rel = `rpc:${rel.slice(4)}`
      const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req)
      return handleRest(req, res, url, rel, body)
    }

    // --- Storage ----------------------------------------------------------
    if (p.startsWith('/storage/v1/object/')) {
      const segs = decodeURIComponent(p.slice('/storage/v1/object/'.length)).split('/')
      const isPublic = segs[0] === 'public'
      const [bucket, ...tail] = isPublic ? segs.slice(1) : segs
      const target = path.resolve(UPLOAD_DIR, bucket ?? '', ...tail)
      if (!target.startsWith(path.resolve(UPLOAD_DIR)) || !bucket) {
        return send(res, 400, { message: 'invalid storage path' })
      }
      if (isPublic || req.method === 'GET') {
        if (!fs.existsSync(target)) return send(res, 404, { message: 'Object not found' })
        const data = fs.readFileSync(target)
        res.writeHead(200, { 'Content-Type': mimeFor(target), 'Access-Control-Allow-Origin': '*', 'Content-Length': data.length })
        return res.end(data)
      }
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, await readBody(req))
      return send(res, 200, { Key: `${bucket}/${tail.join('/')}`, Id: randomUUID(), path: `${bucket}/${tail.join('/')}` })
    }

    return send(res, 404, { message: `mock has no route ${p}` })
  } catch (e) {
    console.error('[mock]', req.method, p, e)
    return send(res, 500, { message: e?.message ?? 'mock error' })
  }
})

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase()
  return { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }[ext] ?? 'application/octet-stream'
}

server.listen(PORT, () => {
  console.log(`mock supabase on http://localhost:${PORT}`)
  console.log('  admin    admin@penzoparts.lk / admin123')
  console.log('  manager  manager@penzoparts.lk / manager123')
  console.log('  cashier  cashier@penzoparts.lk / cashier123')
})
