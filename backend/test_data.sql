-- ============================================================================
-- jdk_clean - Seed/Test Data
-- Manufacturing ERP (FastAPI/MySQL) -- matches backend/schema.sql exactly
-- ============================================================================
-- Run the WHOLE file in one go, e.g.:
--   mysql -u erp_user -p jdk_clean < backend/test_data.sql
-- Do not paste/run individual statements one at a time in a GUI tool -- some
-- clients open a fresh connection per statement, which drops the
-- FOREIGN_KEY_CHECKS=0 setting below and brings back the truncate error.
-- Safe to re-run: everything is truncated (child tables first) before insert.
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- Children first, then parents (order doesn't matter with checks off, but
-- keeping it FK-safe means this also works if checks are ever left on).
TRUNCATE TABLE quotation_details;
TRUNCATE TABLE quotations;
TRUNCATE TABLE order_details;
TRUNCATE TABLE orders;
TRUNCATE TABLE production_schedules;
TRUNCATE TABLE bom_lines;
TRUNCATE TABLE finished_goods_inventory;
TRUNCATE TABLE raw_material_inventory;
TRUNCATE TABLE products;
TRUNCATE TABLE supplier_materials;
TRUNCATE TABLE raw_materials;
TRUNCATE TABLE suppliers;
TRUNCATE TABLE customers;
TRUNCATE TABLE refresh_tokens;
TRUNCATE TABLE audit_log;
TRUNCATE TABLE users;
TRUNCATE TABLE settings;

-- ============================================================================
-- 1. USERS
-- Password for every seed user is <Role>@12345, e.g. admin / Admin@12345
-- (real bcrypt hashes, generated with the same passlib/bcrypt versions the
-- backend uses -- these will actually log in, not just satisfy NOT NULL).
-- ============================================================================
INSERT INTO users (id, username, email, password_hash, full_name, phone, role, is_active, created_at, updated_at) VALUES
(1, 'admin',     'admin@jdk.com',     '$2b$12$3EBawRdVSeQHLhIax7HCpO94Qo90.xXXTaStlTqChTaKLFk7L07ci', 'Admin User',        '+91-9876543210', 'admin',   1, NOW(), NOW()),
(2, 'manager',   'manager@jdk.com',   '$2b$12$10/Y94vrwMHTMunT8yBUy.CXqboYbcrvjGQs5pGhxujuTR/Yi4116', 'Operations Manager','+91-9876543211', 'manager', 1, NOW(), NOW()),
(3, 'sales',     'sales@jdk.com',     '$2b$12$cUVzEilHjz3LyJmSerPkruWhf5C/qM5TyteflkcjQ3Gk1pkpcN7m.', 'Sales Executive',   '+91-9876543212', 'staff',   1, NOW(), NOW()),
(4, 'inventory', 'inventory@jdk.com', '$2b$12$PC2egDYT4dETeqS3cZtQROaV21s2rVIxn3lQMhk4LjT6hTUgyisF.', 'Inventory Staff',   '+91-9876543213', 'staff',   1, NOW(), NOW()),
(5, 'viewer',    'viewer@jdk.com',    '$2b$12$qleed4S6ixwxIkB1ASNJfehV4t7HAI4R54l3LyFsEN0Me0uSrAAIi', 'Read Only Viewer',  '+91-9876543214', 'viewer',  1, NOW(), NOW());

-- ============================================================================
-- 2. CUSTOMERS
-- ============================================================================
INSERT INTO customers (id, code, name, contact_person, email, phone, billing_address, shipping_address, city, country, credit_limit, payment_terms_days, status, created_at, created_by, updated_at) VALUES
(1, 'CUST-0001', 'BuildTech Construction Ltd',   'Rajesh Kumar',     'rajesh@buildtech.com', '+91-8765432100', '456 Industrial Avenue', '456 Industrial Avenue', 'Bangalore', 'India', 50000.00, 30, 'active', NOW(), 1, NOW()),
(2, 'CUST-0002', 'Metro Infrastructure Solutions','Priya Sharma',     'priya@metro.com',      '+91-8765432101', '789 Commerce Plaza',    '789 Commerce Plaza',    'Pune',      'India', 75000.00, 45, 'active', NOW(), 1, NOW()),
(3, 'CUST-0003', 'National Road Works',          'Amit Patel',       'amit@nrw.com',         '+91-8765432102', '123 Tech Park',         '123 Tech Park',         'Ahmedabad', 'India', 100000.00, 60, 'active', NOW(), 1, NOW()),
(4, 'CUST-0004', 'Urban Builders Collective',    'Sanjana Singh',    'sanjana@urbanbc.com',  '+91-8765432103', '321 Commerce Street',   '321 Commerce Street',   'Delhi',     'India', 60000.00, 30, 'active', NOW(), 1, NOW()),
(5, 'CUST-0005', 'Southern Concrete Pvt Ltd',    'Venkatesh Reddy',  'venkat@scpl.com',      '+91-8765432104', '654 Industrial Zone',   '654 Industrial Zone',   'Hyderabad', 'India', 80000.00, 45, 'active', NOW(), 1, NOW()),
(6, 'CUST-0006', 'Coastal Development Corp',     'Anjali Das',       'anjali@cdc.com',       '+91-8765432105', '987 Port Area',         '987 Port Area',         'Chennai',   'India', 45000.00, 30, 'active', NOW(), 1, NOW()),
(7, 'CUST-0007', 'Eastern Infrastructure',       'Rahul Verma',      'rahul@ei.com',         '+91-8765432106', '111 Business District', '111 Business District', 'Kolkata',   'India', 55000.00, 30, 'inactive', NOW(), 1, NOW()),
(8, 'CUST-0008', 'Premium Concrete Industries',  'Neha Gupta',       'neha@pci.com',         '+91-8765432107', '222 Tech Hub',          '222 Tech Hub',          'Noida',     'India', 120000.00, 60, 'active', NOW(), 1, NOW());

-- ============================================================================
-- 3. SUPPLIERS
-- ============================================================================
INSERT INTO suppliers (id, code, name, contact_person, email, phone, address, city, country, payment_terms_days, mode_of_supply, rating, status, created_at, created_by, updated_at) VALUES
(1, 'SUPP-0001', 'Global Minerals Ltd',          'Vikram Singh',   'vikram@gm.com',    '+91-7654321000', '456 Mining Complex', 'Singrauli',   'India', 15, 'direct',      4, 'active', NOW(), 1, NOW()),
(2, 'SUPP-0002', 'AshRem Industries',            'Deepak Kumar',   'deepak@ashrem.com','+91-7654321001', '789 Industrial Hub',  'Chhindwara',  'India', 30, 'distributor', 5, 'active', NOW(), 1, NOW()),
(3, 'SUPP-0003', 'Quality Limestone Quarries',   'Suresh Nair',    'suresh@qlq.com',   '+91-7654321002', '123 Quarry Road',     'Jodhpur',     'India', 15, 'direct',      5, 'active', NOW(), 1, NOW()),
(4, 'SUPP-0004', 'Peak Gypsum Suppliers',        'Mohan Das',      'mohan@peak.com',   '+91-7654321003', '321 Supply Park',     'Bikaner',     'India', 20, 'direct',      3, 'active', NOW(), 1, NOW()),
(5, 'SUPP-0005', 'Iron Ore Trading Co',          'Arun Desai',     'arun@iot.com',     '+91-7654321004', '654 Trade Center',    'Bellary',     'India', 30, 'broker',      4, 'active', NOW(), 1, NOW()),
(6, 'SUPP-0006', 'Premium Additives Corp',       'Kavya Rao',      'kavya@pac.com',    '+91-7654321005', '987 Chemical Zone',   'Visakhapatnam','India', 25, 'distributor', 4, 'active', NOW(), 1, NOW()),
(7, 'SUPP-0007', 'Coal Energy Solutions',        'Harish Menon',   'harish@ces.com',   '+91-7654321006', '111 Power District',  'Raipur',      'India', 30, 'direct',      3, 'suspended', NOW(), 1, NOW()),
(8, 'SUPP-0008', 'Water Treatment Specialists',  'Priya Mukerjee', 'priya@wts.com',    '+91-7654321007', '222 Clean Tech',      'Jamshedpur',  'India', 10, 'import',      5, 'active', NOW(), 1, NOW());

-- ============================================================================
-- 4. RAW MATERIALS
-- ============================================================================
INSERT INTO raw_materials (id, code, name, unit, reorder_point, default_supplier_id, unit_cost, status, created_at, created_by, updated_at) VALUES
(1,  'MAT-0001', 'Limestone',               'ton', 500,  3, 1500.00, 'active', NOW(), 1, NOW()),
(2,  'MAT-0002', 'Fly Ash',                 'ton', 300,  2, 800.00,  'active', NOW(), 1, NOW()),
(3,  'MAT-0003', 'Blast Furnace Slag',      'ton', 400,  5, 950.00,  'active', NOW(), 1, NOW()),
(4,  'MAT-0004', 'Gypsum',                  'ton', 200,  4, 1200.00, 'active', NOW(), 1, NOW()),
(5,  'MAT-0005', 'Iron Ore',                'ton', 150,  5, 2200.00, 'active', NOW(), 1, NOW()),
(6,  'MAT-0006', 'Silica Sand',             'ton', 250,  3, 600.00,  'active', NOW(), 1, NOW()),
(7,  'MAT-0007', 'Pozzolana',               'ton', 180,  2, 1100.00, 'active', NOW(), 1, NOW()),
(8,  'MAT-0008', 'Coal',                    'ton', 600,  7, 3500.00, 'active', NOW(), 1, NOW()),
(9,  'MAT-0009', 'Plasticizer Additive',    'ltr', 100,  6, 450.00,  'active', NOW(), 1, NOW()),
(10, 'MAT-0010', 'Air Entrainer',           'ltr', 80,   6, 380.00,  'active', NOW(), 1, NOW()),
(11, 'MAT-0011', 'Packaging Bags (50kg)',   'pcs', 5000, 8, 12.00,   'active', NOW(), 1, NOW()),
(12, 'MAT-0012', 'Water Treatment Chemical','ltr', 120,  8, 220.00,  'active', NOW(), 1, NOW());

-- ============================================================================
-- 2b. SUPPLIER MATERIALS (which materials each supplier can supply)
-- ============================================================================
INSERT INTO supplier_materials (supplier_id, raw_material_id, max_supply_quantity, lead_time_days, created_at, created_by, updated_at) VALUES
(1, 6,  400.0000, 10, NOW(), 1, NOW()),  -- Global Minerals also supplies Silica Sand (alternate to supplier 3)
(1, 5,  200.0000, 14, NOW(), 1, NOW()),  -- and Iron Ore (alternate to supplier 5)
(2, 2,  600.0000, 7,  NOW(), 1, NOW()),  -- AshRem: Fly Ash
(2, 7,  350.0000, 7,  NOW(), 1, NOW()),  -- AshRem: Pozzolana
(3, 1,  1000.0000, 5, NOW(), 1, NOW()),  -- Quality Limestone Quarries: Limestone
(3, 6,  500.0000, 5,  NOW(), 1, NOW()),  -- Quality Limestone Quarries: Silica Sand
(4, 4,  400.0000, 10, NOW(), 1, NOW()),  -- Peak Gypsum: Gypsum
(5, 3,  600.0000, 12, NOW(), 1, NOW()),  -- Iron Ore Trading Co: Blast Furnace Slag
(5, 5,  300.0000, 14, NOW(), 1, NOW()),  -- Iron Ore Trading Co: Iron Ore
(6, 9,  200.0000, 3,  NOW(), 1, NOW()),  -- Premium Additives: Plasticizer Additive
(6, 10, 150.0000, 3,  NOW(), 1, NOW()),  -- Premium Additives: Air Entrainer
(7, 8,  1200.0000, 20, NOW(), 1, NOW()), -- Coal Energy Solutions: Coal
(8, 11, 20000.0000, 7, NOW(), 1, NOW()), -- Water Treatment Specialists: Packaging Bags
(8, 12, 300.0000, 5,  NOW(), 1, NOW());  -- Water Treatment Specialists: Water Treatment Chemical

-- ============================================================================
-- 5. PRODUCTS
-- One sub_assembly (clinker) feeding the finished-good cements, to exercise
-- multi-level BOM.
-- ============================================================================
INSERT INTO products (id, code, name, unit, product_type, selling_price, status, created_at, created_by, updated_at) VALUES
(1,  'SUB-0001',  'OPC Clinker',                          'ton',          'sub_assembly', 0.00,    'active', NOW(), 1, NOW()),
(2,  'PROD-0001', 'Ordinary Portland Cement (OPC) 53',    'bag (50kg)',   'finished_good', 550.00,  'active', NOW(), 1, NOW()),
(3,  'PROD-0002', 'Portland Pozzolana Cement (PPC)',      'bag (50kg)',   'finished_good', 480.00,  'active', NOW(), 1, NOW()),
(4,  'PROD-0003', 'White Cement',                         'bag (50kg)',   'finished_good', 900.00,  'active', NOW(), 1, NOW()),
(5,  'PROD-0004', 'Sulfate Resistant Cement (SRC)',       'bag (50kg)',   'finished_good', 720.00,  'active', NOW(), 1, NOW()),
(6,  'PROD-0005', 'Low Heat Cement (LHC)',                'bag (50kg)',   'finished_good', 680.00,  'active', NOW(), 1, NOW()),
(7,  'PROD-0006', 'Rapid Hardening Cement (RHC)',         'bag (50kg)',   'finished_good', 750.00,  'active', NOW(), 1, NOW()),
(8,  'PROD-0007', 'Composite Cement',                     'bag (50kg)',   'finished_good', 420.00,  'active', NOW(), 1, NOW()),
(9,  'PROD-0008', 'Masonry Cement',                       'bag (50kg)',   'finished_good', 380.00,  'active', NOW(), 1, NOW()),
(10, 'PROD-0009', 'Fiber Reinforced Cement',               'bag (50kg)',   'finished_good', 1050.00, 'active', NOW(), 1, NOW());

-- ============================================================================
-- 6. BOM LINES (multi-level: clinker sub-assembly, then finished cements
--    that consume the clinker plus their own raw materials)
-- ============================================================================
INSERT INTO bom_lines (parent_product_id, component_type, component_id, quantity, unit, scrap_percent, created_at, created_by, updated_at) VALUES
-- OPC Clinker (sub-assembly) made from raw materials
(1, 'raw_material', 1, 0.900, 'ton', 1.00, NOW(), 1, NOW()),  -- Limestone
(1, 'raw_material', 5, 0.050, 'ton', 1.00, NOW(), 1, NOW()),  -- Iron Ore
(1, 'raw_material', 8, 0.120, 'ton', 2.00, NOW(), 1, NOW()),  -- Coal (fuel)

-- OPC 53 (product_id 2): clinker sub-assembly + gypsum + packaging
(2, 'product',      1, 0.0475, 'ton', 0.50, NOW(), 1, NOW()), -- Clinker
(2, 'raw_material', 4, 0.0015, 'ton', 0.50, NOW(), 1, NOW()), -- Gypsum
(2, 'raw_material', 11, 1.0000, 'pcs', 0.00, NOW(), 1, NOW()),-- Bag

-- PPC (product_id 3): clinker + fly ash + gypsum + packaging
(3, 'product',      1, 0.0350, 'ton', 0.50, NOW(), 1, NOW()), -- Clinker
(3, 'raw_material', 2, 0.0120, 'ton', 0.50, NOW(), 1, NOW()), -- Fly Ash
(3, 'raw_material', 4, 0.0015, 'ton', 0.50, NOW(), 1, NOW()), -- Gypsum
(3, 'raw_material', 11, 1.0000, 'pcs', 0.00, NOW(), 1, NOW());-- Bag

-- ============================================================================
-- 7. INVENTORY
-- ============================================================================
INSERT INTO raw_material_inventory (raw_material_id, quantity_on_hand, quantity_reserved, updated_at) VALUES
(1, 2500.0000, 0, NOW()),
(2, 1800.0000, 0, NOW()),
(3, 2000.0000, 0, NOW()),
(4, 1500.0000, 0, NOW()),
(5, 800.0000,  0, NOW()),
(6, 1200.0000, 0, NOW()),
(7, 900.0000,  0, NOW()),
(8, 3000.0000, 0, NOW()),
(9, 500.0000,  0, NOW()),
(10, 400.0000, 0, NOW()),
(11, 20000.0000, 0, NOW()),
(12, 600.0000, 0, NOW());

INSERT INTO finished_goods_inventory (product_id, quantity_on_hand, quantity_reserved, updated_at) VALUES
(1, 350.0000, 0, NOW()),    -- Clinker stock
(2, 4200.0000, 150, NOW()),
(3, 3100.0000, 80,  NOW()),
(4, 600.0000,  20,  NOW()),
(5, 900.0000,  0,   NOW()),
(6, 750.0000,  0,   NOW()),
(7, 800.0000,  25,  NOW()),
(8, 1500.0000, 0,   NOW()),
(9, 1100.0000, 0,   NOW()),
(10, 400.0000, 0,   NOW());

-- ============================================================================
-- 8. ORDERS + ORDER DETAILS
-- ============================================================================
INSERT INTO orders (id, order_number, customer_id, order_date, requested_delivery_date, status, total_amount, created_at, created_by, updated_at) VALUES
(1, 'ORD-00001', 1, '2026-07-01', '2026-07-10', 'delivered',    27500.00, NOW(), 2, NOW()),
(2, 'ORD-00002', 2, '2026-07-05', '2026-07-15', 'shipped',      48000.00, NOW(), 2, NOW()),
(3, 'ORD-00003', 3, '2026-07-12', '2026-07-25', 'in_production',72000.00, NOW(), 2, NOW()),
(4, 'ORD-00004', 5, '2026-07-20', '2026-08-01', 'confirmed',    18500.00, NOW(), 3, NOW()),
(5, 'ORD-00005', 8, '2026-07-25', '2026-08-05', 'draft',        31500.00, NOW(), 3, NOW());

INSERT INTO order_details (order_id, product_id, quantity, unit_price, line_total) VALUES
(1, 2, 50.0000, 550.00, 27500.00),
(2, 3, 100.0000, 480.00, 48000.00),
(3, 2, 100.0000, 550.00, 55000.00),
(3, 5, 23.6111, 720.00, 17000.00),
(4, 3, 38.5417, 480.00, 18500.00),
(5, 2, 40.0000, 550.00, 22000.00),
(5, 8, 22.6190, 420.00, 9500.00);

-- ============================================================================
-- 9. QUOTATIONS + QUOTATION DETAILS
-- ============================================================================
INSERT INTO quotations (id, quotation_number, customer_id, quotation_date, valid_until, status, total_amount, created_at, created_by, updated_at) VALUES
(1, 'QTN-00001', 4, '2026-07-08', '2026-08-07', 'sent',      36000.00, NOW(), 3, NOW()),
(2, 'QTN-00002', 6, '2026-07-14', '2026-08-13', 'accepted',  24000.00, NOW(), 3, NOW()),
(3, 'QTN-00003', 7, '2026-07-18', '2026-08-17', 'draft',     15000.00, NOW(), 3, NOW()),
(4, 'QTN-00004', 1, '2026-07-22', '2026-08-21', 'expired',   9600.00,  NOW(), 3, NOW());

INSERT INTO quotation_details (quotation_id, product_id, quantity, unit_price, line_total) VALUES
(1, 5, 50.0000, 720.00, 36000.00),
(2, 3, 50.0000, 480.00, 24000.00),
(3, 9, 39.4737, 380.00, 15000.00),
(4, 2, 17.4545, 550.00, 9600.00);

-- ============================================================================
-- 10. PRODUCTION SCHEDULES
-- ============================================================================
INSERT INTO production_schedules (id, batch_number, product_id, order_id, planned_quantity, produced_quantity, scheduled_start, scheduled_end, status, created_at, created_by, updated_at) VALUES
(1, 'PB-00001', 2, 1, 60.0000,  60.0000, '2026-07-02', '2026-07-04', 'completed',   NOW(), 2, NOW()),
(2, 'PB-00002', 3, 2, 110.0000, 110.0000,'2026-07-06', '2026-07-09', 'completed',   NOW(), 2, NOW()),
(3, 'PB-00003', 2, 3, 100.0000, 40.0000, '2026-07-13', '2026-07-18', 'in_progress', NOW(), 2, NOW()),
(4, 'PB-00004', 1, NULL, 500.0000, 0.0000, '2026-08-01', '2026-08-05', 'planned',   NOW(), 2, NOW());

-- ============================================================================
-- 11. SETTINGS
-- ============================================================================
INSERT INTO settings (setting_key, setting_value, updated_at) VALUES
('company_name', 'JDK Clean Manufacturing', NOW()),
('default_currency', 'INR', NOW()),
('low_stock_alert_enabled', 'true', NOW());

-- ============================================================================
-- 12. Keep number_series ahead of the seeded document numbers above, so the
--     next order/quotation/batch the app generates doesn't collide with one
--     we just inserted directly.
-- ============================================================================
UPDATE number_series SET next_number = 6 WHERE doc_type = 'ORDER';
UPDATE number_series SET next_number = 5 WHERE doc_type = 'QUOTATION';
UPDATE number_series SET next_number = 5 WHERE doc_type = 'PRODUCTION_BATCH';

SET FOREIGN_KEY_CHECKS = 1;
