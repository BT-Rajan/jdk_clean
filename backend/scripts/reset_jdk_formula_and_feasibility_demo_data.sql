-- ============================================================
-- JDK Factory formula reset + feasibility test data
-- ============================================================
-- Replaces the product/material master data with EXACTLY the 5
-- products and 4 raw materials in "JDK Factory - Product Formula
-- Summary" (K91, Mega, ECO, Block Bond, Grout/K16 x Sand/Silica,
-- Cement, RDP Polymer, HPMC/Cellulose Ether), and seeds enough
-- supporting data (a machine, suppliers, customers, stock levels, and
-- 5 draft feasibility checks) to exercise every outcome the feasibility
-- engine can produce -- ready to open and click "Run check" on from
-- the Feasibility Checks list, no further setup needed:
--
--   1. FSB-DEMO-01  K91, 500kg          -> feasible (materials + machine capacity both clear)
--   2. FSB-DEMO-02  Mega, 1200kg        -> exception_pending (RDP Polymer short: needs 12kg, 8kg on hand)
--   3. FSB-DEMO-03  Block Bond, 3000kg  -> exception_pending (materials clear; machine can't finish by today)
--   4. FSB-DEMO-04  Grout/K16, 500kg    -> exception_pending (bom_missing: no formula on file)
--   5. FSB-DEMO-05  K91, 250kg          -> feasible instantly (fully covered_by_stock, 300kg already on hand)
--
-- !! WARNING -- THIS IS A DESTRUCTIVE RESET, NOT AN INCREMENTAL SEED !!
-- Truncates products/raw materials and everything downstream of them
-- (BOMs, packaging, supplier materials, stock, quotations, orders,
-- delivery notes, purchase orders, production schedules, feasibility
-- checks, deals) plus customers and suppliers, since existing rows
-- referencing the old products/materials would otherwise block
-- deleting them. Users, login credentials, RBAC, audit log,
-- and departments are left untouched -- only the 3
-- factory capacity settings below are touched, every other setting
-- (company info, workflow automation, approval thresholds, ...) is
-- left as-is. Run this only against a dev/test database whose existing
-- transactional data you don't need to keep.
--
-- Formula percentages are used LITERALLY as kg-needed-per-kg-of-product
-- (0.70 = 70%), not normalized to sum to exactly 100% -- the source
-- sheet's own note says some formulas run slightly over 100% (polymer/
-- HPMC are small additions on top of the sand/cement base) and
-- normalizing is optional, not required. Grout / K16 is seeded with NO
-- bill of materials at all, exactly matching the sheet marking its
-- ratio "Not specified" -- that absence is what drives demo scenario 4
-- below, not a placeholder waiting to be filled in.
--
-- This is a manual script (backend/scripts/), NOT a migration -- it
-- will never run automatically on deploy/startup, only when you run it
-- yourself:
--   mysql -u <user> -p <database> < backend/scripts/reset_jdk_formula_and_feasibility_demo_data.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE quotation_details;
TRUNCATE TABLE quotations;
TRUNCATE TABLE order_details;
TRUNCATE TABLE orders;
TRUNCATE TABLE delivery_note_lines;
TRUNCATE TABLE delivery_notes;
TRUNCATE TABLE purchase_order_lines;
TRUNCATE TABLE purchase_orders;
TRUNCATE TABLE production_schedules;
TRUNCATE TABLE feasibility_lines;
TRUNCATE TABLE feasibility_checks;
TRUNCATE TABLE deals;
TRUNCATE TABLE bom_lines;
TRUNCATE TABLE product_packaging_lines;
TRUNCATE TABLE supplier_materials;
TRUNCATE TABLE finished_goods_inventory;
TRUNCATE TABLE raw_material_inventory;
TRUNCATE TABLE stock_movements;
TRUNCATE TABLE products;
TRUNCATE TABLE machines;
TRUNCATE TABLE raw_materials;
TRUNCATE TABLE suppliers;
TRUNCATE TABLE customers;

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- Factory capacity settings -- feasibility's machine/worker-pool check
-- reads these (see app/services/settings_service.py). 10 workers x 8hr
-- shifts, Sun-Thu working week (the app's own defaults for the latter
-- two; set explicitly here so the numbers below are self-contained).
-- ------------------------------------------------------------
INSERT INTO settings (setting_key, setting_value) VALUES
    ('factory_total_workers', '10'),
    ('factory_workday_hours', '8'),
    ('factory_working_days', 'Sun,Mon,Tue,Wed,Thu')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- ------------------------------------------------------------
-- Machine -- production capacity for the time-required check
-- ------------------------------------------------------------
INSERT INTO machines (code, name, capacity_hours_per_day, status) VALUES
    ('MC-MIX-01', 'Mixer Line 1', 8, 'active');

-- ------------------------------------------------------------
-- Suppliers
-- ------------------------------------------------------------
INSERT INTO suppliers (code, name, city, country, payment_terms_days, mode_of_supply, rating, status) VALUES
    ('SUP-001', 'Gulf Building Materials Co.', 'Kuwait City', 'Kuwait', 30, 'direct', 4, 'active'),
    ('SUP-002', 'Al Khaleej Chemicals Trading', 'Kuwait City', 'Kuwait', 45, 'distributor', 4, 'active');

-- ------------------------------------------------------------
-- Customers
-- ------------------------------------------------------------
INSERT INTO customers (code, name, city, country, credit_limit, payment_terms_days, status) VALUES
    ('CUST-001', 'Al Rashid Trading Co.', 'Kuwait City', 'Kuwait', 50000, 30, 'active'),
    ('CUST-002', 'Gulf Coast Builders', 'Ahmadi', 'Kuwait', 30000, 30, 'active');

-- ------------------------------------------------------------
-- Raw materials -- exactly the 4 in the source sheet
-- ------------------------------------------------------------
INSERT INTO raw_materials (code, name, unit, reorder_point, default_supplier_id, unit_cost, status) VALUES
    ('RM-SAND',   'Sand / Silica',           'kg', 2000, (SELECT id FROM suppliers WHERE code = 'SUP-001'), 0.05, 'active'),
    ('RM-CEMENT', 'Cement',                  'kg', 1000, (SELECT id FROM suppliers WHERE code = 'SUP-001'), 0.15, 'active'),
    ('RM-RDP',    'RDP Polymer',             'kg',   20, (SELECT id FROM suppliers WHERE code = 'SUP-002'), 3.50, 'active'),
    ('RM-HPMC',   'HPMC / Cellulose Ether',  'kg',   20, (SELECT id FROM suppliers WHERE code = 'SUP-002'), 4.00, 'active');

INSERT INTO supplier_materials (supplier_id, raw_material_id, max_supply_quantity, lead_time_days) VALUES
    ((SELECT id FROM suppliers WHERE code = 'SUP-001'), (SELECT id FROM raw_materials WHERE code = 'RM-SAND'),   100000, 3),
    ((SELECT id FROM suppliers WHERE code = 'SUP-001'), (SELECT id FROM raw_materials WHERE code = 'RM-CEMENT'),  50000, 3),
    ((SELECT id FROM suppliers WHERE code = 'SUP-002'), (SELECT id FROM raw_materials WHERE code = 'RM-RDP'),       500, 7),
    ((SELECT id FROM suppliers WHERE code = 'SUP-002'), (SELECT id FROM raw_materials WHERE code = 'RM-HPMC'),      500, 7);

-- Stock on hand. Sand/Cement/HPMC are generously stocked so they're
-- never the binding constraint in the scenarios below; RDP Polymer is
-- deliberately kept tight (8kg) so it's the one that runs short in
-- scenario 2 -- every product's RDP requirement is a small percentage
-- of quantity, so a modest order is enough to exceed 8kg without
-- needing an unrealistic batch size.
INSERT INTO raw_material_inventory (raw_material_id, quantity_on_hand, quantity_reserved) VALUES
    ((SELECT id FROM raw_materials WHERE code = 'RM-SAND'),   20000, 0),
    ((SELECT id FROM raw_materials WHERE code = 'RM-CEMENT'), 10000, 0),
    ((SELECT id FROM raw_materials WHERE code = 'RM-RDP'),        8, 0),
    ((SELECT id FROM raw_materials WHERE code = 'RM-HPMC'),      50, 0);

-- ------------------------------------------------------------
-- Products -- the 5 in the source sheet. Batch size is 1,000kg (1 ton)
-- per the sheet; production_hours_per_unit = batch_production_hours /
-- batch_size, the same derivation the app's own product form applies
-- (see app/crud/master_data.py ProductCRUD._sync_hours_per_unit).
-- Grout / K16 intentionally gets no machine/production-time formula
-- either, on top of no BOM below -- nothing about it was specified.
-- ------------------------------------------------------------
INSERT INTO products (code, name, unit, product_type, selling_price, batch_size, batch_production_hours, machine_id, production_hours_per_unit, workers_required, status) VALUES
    ('PRD-K91',       'K91',        'kg', 'finished_good', 0.35, 1000, 5, (SELECT id FROM machines WHERE code = 'MC-MIX-01'), 0.0050, 4, 'active'),
    ('PRD-MEGA',      'Mega',       'kg', 'finished_good', 0.40, 1000, 6, (SELECT id FROM machines WHERE code = 'MC-MIX-01'), 0.0060, 4, 'active'),
    ('PRD-ECO',       'ECO',        'kg', 'finished_good', 0.32, 1000, 5, (SELECT id FROM machines WHERE code = 'MC-MIX-01'), 0.0050, 4, 'active'),
    ('PRD-BLOCKBOND', 'Block Bond', 'kg', 'finished_good', 0.45, 1000, 4, (SELECT id FROM machines WHERE code = 'MC-MIX-01'), 0.0040, 4, 'active');

INSERT INTO products (code, name, unit, product_type, selling_price, status) VALUES
    ('PRD-K16', 'Grout / K16', 'kg', 'finished_good', 0.00, 'active');

-- ------------------------------------------------------------
-- Bills of material -- one line per raw material, quantity = the
-- sheet's percentage expressed as kg needed per 1kg of finished
-- product, so bom_service.explode_requirements scales correctly
-- against Product.unit = 'kg'. Grout / K16 gets NO rows here -- see
-- the header note; that's what makes it a "bom_missing" scenario.
-- ------------------------------------------------------------
INSERT INTO bom_lines (parent_product_id, component_type, component_id, quantity, unit, scrap_percent) VALUES
    ((SELECT id FROM products WHERE code = 'PRD-K91'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-SAND'),   0.700, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-K91'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-CEMENT'), 0.300, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-K91'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-RDP'),    0.002, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-K91'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-HPMC'),   0.006, 'kg', 0),

    ((SELECT id FROM products WHERE code = 'PRD-MEGA'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-SAND'),   0.600, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-MEGA'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-CEMENT'), 0.400, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-MEGA'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-RDP'),    0.010, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-MEGA'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-HPMC'),   0.002, 'kg', 0),

    ((SELECT id FROM products WHERE code = 'PRD-ECO'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-SAND'),   0.700, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-ECO'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-CEMENT'), 0.300, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-ECO'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-RDP'),    0.004, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-ECO'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-HPMC'),   0.002, 'kg', 0),

    ((SELECT id FROM products WHERE code = 'PRD-BLOCKBOND'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-SAND'),   0.750, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-BLOCKBOND'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-CEMENT'), 0.250, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-BLOCKBOND'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-RDP'),    0.002, 'kg', 0),
    ((SELECT id FROM products WHERE code = 'PRD-BLOCKBOND'), 'raw_material', (SELECT id FROM raw_materials WHERE code = 'RM-HPMC'),   0.001, 'kg', 0);

-- ------------------------------------------------------------
-- Finished-goods stock -- 300kg of K91 already on hand, unreserved,
-- for scenario 5's covered_by_stock check.
-- ------------------------------------------------------------
INSERT INTO finished_goods_inventory (product_id, quantity_on_hand, quantity_reserved) VALUES
    ((SELECT id FROM products WHERE code = 'PRD-K91'), 300, 0);

-- ------------------------------------------------------------
-- Deals + draft feasibility checks -- one per scenario, ready to open
-- and click "Run check" on from the Feasibility Checks list.
-- ------------------------------------------------------------
INSERT INTO deals (deal_number, customer_id, furthest_stage, status) VALUES
    ('DEAL-DEMO-01', (SELECT id FROM customers WHERE code = 'CUST-001'), 'feasibility', 'open'),
    ('DEAL-DEMO-02', (SELECT id FROM customers WHERE code = 'CUST-002'), 'feasibility', 'open'),
    ('DEAL-DEMO-03', (SELECT id FROM customers WHERE code = 'CUST-001'), 'feasibility', 'open'),
    ('DEAL-DEMO-04', (SELECT id FROM customers WHERE code = 'CUST-002'), 'feasibility', 'open'),
    ('DEAL-DEMO-05', (SELECT id FROM customers WHERE code = 'CUST-001'), 'feasibility', 'open');

-- Scenario 1: K91, 500kg, due in 2 weeks -> feasible (materials + capacity both clear)
INSERT INTO feasibility_checks (feasibility_number, customer_id, deal_id, status, required_by_date, notes) VALUES
    ('FSB-DEMO-01', (SELECT id FROM customers WHERE code = 'CUST-001'), (SELECT id FROM deals WHERE deal_number = 'DEAL-DEMO-01'), 'draft', DATE_ADD(CURDATE(), INTERVAL 14 DAY), 'Demo scenario 1: expect feasible.');
INSERT INTO feasibility_lines (feasibility_id, product_id, quantity) VALUES
    ((SELECT id FROM feasibility_checks WHERE feasibility_number = 'FSB-DEMO-01'), (SELECT id FROM products WHERE code = 'PRD-K91'), 500);

-- Scenario 2: Mega, 1200kg, due in 2 weeks -> exception_pending (RDP short: needs 12kg, 8kg on hand)
INSERT INTO feasibility_checks (feasibility_number, customer_id, deal_id, status, required_by_date, notes) VALUES
    ('FSB-DEMO-02', (SELECT id FROM customers WHERE code = 'CUST-002'), (SELECT id FROM deals WHERE deal_number = 'DEAL-DEMO-02'), 'draft', DATE_ADD(CURDATE(), INTERVAL 14 DAY), 'Demo scenario 2: expect exception_pending, RDP Polymer shortfall.');
INSERT INTO feasibility_lines (feasibility_id, product_id, quantity) VALUES
    ((SELECT id FROM feasibility_checks WHERE feasibility_number = 'FSB-DEMO-02'), (SELECT id FROM products WHERE code = 'PRD-MEGA'), 1200);

-- Scenario 3: Block Bond, 3000kg, due TODAY -> exception_pending (materials clear; machine can't finish that fast)
INSERT INTO feasibility_checks (feasibility_number, customer_id, deal_id, status, required_by_date, notes) VALUES
    ('FSB-DEMO-03', (SELECT id FROM customers WHERE code = 'CUST-001'), (SELECT id FROM deals WHERE deal_number = 'DEAL-DEMO-03'), 'draft', CURDATE(), 'Demo scenario 3: expect exception_pending, machine capacity shortfall.');
INSERT INTO feasibility_lines (feasibility_id, product_id, quantity) VALUES
    ((SELECT id FROM feasibility_checks WHERE feasibility_number = 'FSB-DEMO-03'), (SELECT id FROM products WHERE code = 'PRD-BLOCKBOND'), 3000);

-- Scenario 4: Grout / K16, 500kg, due in 2 weeks -> exception_pending (bom_missing: no formula on file)
INSERT INTO feasibility_checks (feasibility_number, customer_id, deal_id, status, required_by_date, notes) VALUES
    ('FSB-DEMO-04', (SELECT id FROM customers WHERE code = 'CUST-002'), (SELECT id FROM deals WHERE deal_number = 'DEAL-DEMO-04'), 'draft', DATE_ADD(CURDATE(), INTERVAL 14 DAY), 'Demo scenario 4: expect exception_pending, bom_missing (Grout/K16 has no formula, per the source sheet).');
INSERT INTO feasibility_lines (feasibility_id, product_id, quantity) VALUES
    ((SELECT id FROM feasibility_checks WHERE feasibility_number = 'FSB-DEMO-04'), (SELECT id FROM products WHERE code = 'PRD-K16'), 500);

-- Scenario 5: K91, 250kg, due in 2 weeks -> feasible instantly (300kg already in finished-goods stock covers it)
INSERT INTO feasibility_checks (feasibility_number, customer_id, deal_id, status, required_by_date, notes) VALUES
    ('FSB-DEMO-05', (SELECT id FROM customers WHERE code = 'CUST-001'), (SELECT id FROM deals WHERE deal_number = 'DEAL-DEMO-05'), 'draft', DATE_ADD(CURDATE(), INTERVAL 14 DAY), 'Demo scenario 5: expect feasible, fully covered_by_stock (try requesting more than 300kg here to see the partial-coverage path instead).');
INSERT INTO feasibility_lines (feasibility_id, product_id, quantity) VALUES
    ((SELECT id FROM feasibility_checks WHERE feasibility_number = 'FSB-DEMO-05'), (SELECT id FROM products WHERE code = 'PRD-K91'), 250);
