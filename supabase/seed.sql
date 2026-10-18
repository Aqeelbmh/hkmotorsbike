-- ============================================================================
-- PENZO PARTS — Seed data (run AFTER schema.sql)
-- Settings, expense categories, nested categories, 20 spare parts with
-- opening stock, 3 suppliers, 5 customers.
-- Users are created through Supabase Auth (sign-up or dashboard); the
-- on_auth_user_created trigger builds the profile — set role via user
-- metadata { "role": "admin" | "manager" | "cashier" } or update profiles.
-- ============================================================================

insert into public.settings (id) values (1) on conflict (id) do nothing;
update public.settings set
  shop_name      = 'H.K Motors Bike',
  address        = '42/1 Yakgahapitiya, Gunnepana, Kandy, Sri Lanka',
  phone          = '+94 74123 4562',
  email          = 'hkmotors707@gmail.com',
  tax_number     = '',
  currency_code  = 'LKR',
  currency_symbol= 'Rs.',
  receipt_footer = 'Thank you! Goods once sold are exchangeable within 14 days with original bill.',
  tax_rate       = 0
where id = 1;

-- Expense categories ------------------------------------------------------------
insert into public.expense_categories (name, sort_order) values
  ('Rent', 1), ('Salaries', 2), ('Electricity', 3), ('Transport', 4),
  ('Courier', 5), ('Telephone & Internet', 6), ('Bank Charges', 7), ('Other', 99);

-- Categories (nested) -----------------------------------------------------------
insert into public.categories (id, name, slug, sort_order) values
  ('a0000000-0000-4000-8000-000000000001', 'Engine',           'engine',           1),
  ('a0000000-0000-4000-8000-000000000002', 'Brakes',           'brakes',           2),
  ('a0000000-0000-4000-8000-000000000003', 'Electrical',       'electrical',       3),
  ('a0000000-0000-4000-8000-000000000004', 'Suspension',       'suspension',       4),
  ('a0000000-0000-4000-8000-000000000005', 'Filters',          'filters',          5),
  ('a0000000-0000-4000-8000-000000000006', 'Cooling',          'cooling',          6),
  ('a0000000-0000-4000-8000-000000000007', 'Transmission',     'transmission',     7),
  ('a0000000-0000-4000-8000-000000000008', 'Body & Wipers',    'body-wipers',      8),
  ('a0000000-0000-4000-8000-000000000011', 'Engine Oil & Lubricants', 'engine-oils',  9),
  ('a0000000-0000-4000-8000-000000000012', 'Brake Pads',       'brake-pads',      10),
  ('a0000000-0000-4000-8000-000000000013', 'Batteries',        'batteries',       11),
  ('a0000000-0000-4000-8000-000000000014', 'Shocks & Struts',  'shocks',          12);

update public.categories set parent_id = 'a0000000-0000-4000-8000-000000000001'
  where id = 'a0000000-0000-4000-8000-000000000011';
update public.categories set parent_id = 'a0000000-0000-4000-8000-000000000002'
  where id = 'a0000000-0000-4000-8000-000000000012';
update public.categories set parent_id = 'a0000000-0000-4000-8000-000000000003'
  where id = 'a0000000-0000-4000-8000-000000000013';
update public.categories set parent_id = 'a0000000-0000-4000-8000-000000000004'
  where id = 'a0000000-0000-4000-8000-000000000014';

-- Suppliers (3) -----------------------------------------------------------------
insert into public.suppliers (id, name, contact_person, phone, email, address, credit_terms_days, opening_balance) values
  ('b0000000-0000-4000-8000-000000000001', 'Tokai Car Accessories (Pvt) Ltd', 'Mr. Perera',  '+94 77 210 3344', 'sales@tokai.lk',   'Wellawatte, Colombo 06', 30, 45000.00),
  ('b0000000-0000-4000-8000-000000000002', 'IBC Industries Ltd',              'Ms. Silva',   '+94 11 267 8300', 'orders@ibclanka.lk', 'Peliyagoda',           15,  0.00),
  ('b0000000-0000-4000-8000-000000000003', 'AMW Toyota Parts Centre',         'Mr. Nawaz',   '+94 11 209 4455', 'parts@amwmotors.lk', 'Havelock Town, Colombo', 0, 128500.00);

-- Customers (5) ------------------------------------------------------------------
insert into public.customers (id, name, type, phone, address, credit_limit, opening_balance, vehicle_notes) values
  ('c0000000-0000-4000-8000-000000000001', 'Walk-in Customer',        'retail',    null,            null,                        0,       0, null),
  ('c0000000-0000-4000-8000-000000000002', 'Sanath Garage',           'garage',    '+94 71 445 8899', 'Nugegoda',                  150000,  22500, 'Handles Toyota/Honda reconditioning work'),
  ('c0000000-0000-4000-8000-000000000003', 'Kumara Automobiles',      'wholesale', '+94 77 662 1145', 'Maharagama',                80000,   0,    null),
  ('c0000000-0000-4000-8000-000000000004', 'Nimal Perera',            'retail',    '+94 76 309 2277', 'Kadawatha',                 0,       0,    'Honda Civic 2018 — BK-xxxx'),
  ('c0000000-0000-4000-8000-000000000005', 'Green Route Taxi Fleet',  'wholesale', '+94 70 115 8822', 'Rajagiriya',                200000, 64000, '5x Aqua hybrid fleet, monthly service parts');

-- Products (20 spare parts) -------------------------------------------------------
insert into public.products
  (id, sku, barcode, name, category_id, brand, unit, vehicle_make, vehicle_model, vehicle_year_from, vehicle_year_to, rack_location, cost_price, selling_price, wholesale_price, reorder_level)
values
  ('d0000000-0000-4000-8000-000000000001','ENG-OC-0012','2100000000012','Oil Filter — Toyota Aqua/Auris/NX2000','a0000000-0000-4000-8000-000000000001','Denso','pcs','Toyota','Aqua',2014,2023,'A1-03',  720,  1150,  1000, 10),
  ('d0000000-0000-4000-8000-000000000002','ENG-AF-0007','2100000000029','Air Filter — Honda Civic FB',          'a0000000-0000-4000-8000-000000000001','Honda Genuine','pcs','Honda','Civic',2016,2021,'A1-07', 1850,  2750,  2450,  8),
  ('d0000000-0000-4000-8000-000000000003','ENG-SP-0001','2100000000036','Spark Plug NGK Iridium ILKAR8L5','a0000000-0000-4000-8000-000000000001','NGK','pcs','Multiple',null,null,null,'A2-11', 1450,  2200,  1950, 20),
  ('d0000000-0000-4000-8000-000000000004','BRK-PD-F015','2100000000043','Front Brake Pads — Toyota Premio',     'a0000000-0000-4000-8000-000000000012','Nibang','set','Toyota','Premio',2007,2016,'B1-02', 2900,  4500,  4000, 10),
  ('d0000000-0000-4000-8000-000000000005','BRK-PD-R009','2100000000050','Rear Brake Drums Set — Wagon R','a0000000-0000-4000-8000-000000000012','IBC','set','Suzuki','Wagon R',2010,2020,'B1-08', 5600,  8200,  7400,  4),
  ('d0000000-0000-4000-8000-000000000006','BRK-DS-0003','2100000000067','Brake Disc — Honda Vezel Front','a0000000-0000-4000-8000-000000000002','Honda Genuine','pcs','Honda','Vezel',2015,2021,'B2-01', 9400, 13500, 12200,  4),
  ('d0000000-0000-4000-8000-000000000007','ELE-BT-012','2100000000074','Battery 46B24L 35Ah — Silver','a0000000-0000-4000-8000-000000000013','Lucas','pcs','Multiple',null,null,null,'C1-01',11500, 16500, 15200,  6),
  ('d0000000-0000-4000-8000-000000000008','ELE-AL-0021','2100000000081','Alternator Belt — Toyota Allion','a0000000-0000-4000-8000-000000000003','Mitsuboshi','pcs','Toyota','Allion',2007,2017,'C2-04',  1800,  2800,  2500,  8),
  ('d0000000-0000-4000-8000-000000000009','ELE-HL-H4','2100000000098','Headlight Bulb H4 60/55W Philips','a0000000-0000-4000-8000-000000000003','Philips','pcs','Multiple',null,null,null,'C2-09',  850,  1450,  1250, 25),
  ('d0000000-0000-4000-8000-000000000010','ELE-WP-0002','2100000000103','Water Pump — Toyota 1NZ/2NZ','a0000000-0000-4000-8000-000000000003','GMB','pcs','Toyota','Aqua',2013,2023,'C3-02',12800, 18500, 16800,  3),
  ('d0000000-0000-4000-8000-000000000011','SUS-SH-044','2100000000110','Shock Absorber Front — Premio (Right)','a0000000-0000-4000-8000-000000000014','KYB','pcs','Toyota','Premio',2007,2016,'D1-05', 9800, 14200, 13000,  6),
  ('d0000000-0000-4000-8000-000000000012','SUS-LB-017','2100000000127','Lower Arm Bush Set — Wagon R','a0000000-0000-4000-8000-000000000004','555','set','Suzuki','Wagon R',2008,2020,'D1-10', 3200,  4900,  4400, 10),
  ('d0000000-0000-4000-8000-000000000013','FLT-PC-005','2100000000134','PCV / Cabin Filter — Aqua',            'a0000000-0000-4000-8000-000000000005','Denso','pcs','Toyota','Aqua',2014,2023,'E1-02',  2400,  3600,  3200, 10),
  ('d0000000-0000-4000-8000-000000000014','FLT-FU-002','2100000000141','Fuel Filter — Honda Civic',            'a0000000-0000-4000-8000-000000000005','Honda Genuine','pcs','Honda','Civic',2016,2021,'E1-06', 2800,  4200,  3800,  8),
  ('d0000000-0000-4000-8000-000000000015','COL-RT-001','2100000000158','Radiator — Toyota Passo',              'a0000000-0000-4000-8000-000000000006','IBC','pcs','Toyota','Passo',2012,2021,'F1-01',16500, 23500, 21500,  2),
  ('d0000000-0000-4000-8000-000000000016','COL-FN-008','2100000000165','Cooling Fan Assembly — Vezel',         'a0000000-0000-4000-8000-000000000006','Honda Genuine','pcs','Honda','Vezel',2015,2021,'F1-04',21000, 28900, 26500,  2),
  ('d0000000-0000-4000-8000-000000000017','TRN-CL-003','2100000000172','Clutch Kit 3-Piece — Wagon R',         'a0000000-0000-4000-8000-000000000007','Exedy','set','Suzuki','Wagon R',2008,2020,'G1-02',14500, 21000, 19200,  4),
  ('d0000000-0000-4000-8000-000000000018','TRN-CV-006','2100000000189','CVT Belt — Toyota Aqua',               'a0000000-0000-4000-8000-000000000007','Denso','pcs','Toyota','Aqua',2014,2021,'G1-07',23500, 32500, 30000,  3),
  ('d0000000-0000-4000-8000-000000000019','BDY-WP-011','2100000000196','Wiper Blade Set 22"+16" Aero','a0000000-0000-4000-8000-000000000008','Bosch','set','Multiple',null,null,null,'H1-03',  2100,  3400,  3000, 15),
  ('d0000000-0000-4000-8000-000000000020','ENG-OIL-5W30','2100000000202','Engine Oil 5W-30 SN 4L — Denso','a0000000-0000-4000-8000-000000000011','Denso','can','Multiple',null,null,null,'A3-01', 5800,  8200,  7500, 12);

-- Opening stock ledger entries ------------------------------------------------------
insert into public.stock_movements (product_id, quantity_delta, movement_type, reference_table, reason, note)
values
  ('d0000000-0000-4000-8000-000000000001',  34, 'opening', 'seed', 'Opening stock', 'Initial load'),
  ('d0000000-0000-4000-8000-000000000002',  18, 'opening', 'seed', 'Opening stock', 'Initial load'),
  ('d0000000-0000-4000-8000-000000000003',   6, 'opening', 'seed', 'Opening stock', 'Low — reorder soon'),
  ('d0000000-0000-4000-8000-000000000004',  22, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000005',   9, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000006',   7, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000007',   5, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000008',  16, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000009',  40, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000010',   4, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000011',  12, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000012',  25, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000013',   8, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000014',   2, 'opening', 'seed', 'Opening stock', 'Below reorder level'),
  ('d0000000-0000-4000-8000-000000000015',   3, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000016',   0, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000017',   6, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000018',   1, 'opening', 'seed', 'Opening stock', 'Critical'),
  ('d0000000-0000-4000-8000-000000000019',  30, 'opening', 'seed', 'Opening stock', null),
  ('d0000000-0000-4000-8000-000000000020',  14, 'opening', 'seed', 'Opening stock', null);

-- Zero-quantity rows produce no ledger movement rows; delete the dummy ones
delete from public.stock_movements
where movement_type = 'opening' and quantity_delta = 0;
