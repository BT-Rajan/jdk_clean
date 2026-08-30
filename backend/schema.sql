-- Manufacturing ERP - Core Schema
-- MySQL 8, InnoDB, utf8mb4
-- Pass 1: Database Schema

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- SYSTEM: Number series (custom prefix per document type, sequential)
-- ============================================================
CREATE TABLE IF NOT EXISTS number_series (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doc_type        VARCHAR(30)  NOT NULL UNIQUE,   -- e.g. 'ORDER', 'QUOTATION', 'PRODUCTION_BATCH'
    prefix          VARCHAR(10)  NOT NULL,          -- e.g. 'ORD', 'QTN', 'PB'
    next_number     INT UNSIGNED NOT NULL DEFAULT 1,
    padding         TINYINT UNSIGNED NOT NULL DEFAULT 5, -- zero-padding width, e.g. ORD-00001
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SYSTEM: Field-level audit log (old_value -> new_value per change)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    table_name      VARCHAR(64)  NOT NULL,
    record_id       BIGINT UNSIGNED NOT NULL,
    action          ENUM('CREATE','UPDATE','DELETE','RESTORE') NOT NULL,
    field_name      VARCHAR(64)  NULL,      -- NULL for CREATE/DELETE/RESTORE whole-row events
    old_value       TEXT NULL,
    new_value       TEXT NULL,
    changed_by      BIGINT UNSIGNED NULL,   -- users.id, nullable for system actions
    changed_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_table_record (table_name, record_id),
    INDEX idx_audit_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- USERS & AUTH
-- ============================================================
-- Note: phone and avatar_filename were added after this table's initial
-- release. An existing database needs migrations/2026-07-28_add_profile_fields.sql.
CREATE TABLE IF NOT EXISTS users (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(120) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(120) NOT NULL,
    phone           VARCHAR(30)  NULL,
    avatar_filename VARCHAR(255) NULL,
    department      ENUM('sales','procurement','warehouse') NULL,
    signature_filename VARCHAR(255) NULL,
    role            ENUM('admin','manager','staff','viewer') NOT NULL DEFAULT 'staff',
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    INDEX idx_users_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    contact_person  VARCHAR(120) NULL,
    email           VARCHAR(120) NULL,
    phone           VARCHAR(30)  NULL,
    billing_address VARCHAR(255) NULL,
    shipping_address VARCHAR(255) NULL,
    city            VARCHAR(80)  NULL,
    country         VARCHAR(80)  NULL,
    credit_limit    DECIMAL(14,2) NOT NULL DEFAULT 0,
    payment_terms_days SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    notes           TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    INDEX idx_customers_deleted_at (deleted_at),
    INDEX idx_customers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    contact_person  VARCHAR(120) NULL,
    email           VARCHAR(120) NULL,
    phone           VARCHAR(30)  NULL,
    address         VARCHAR(255) NULL,
    city            VARCHAR(80)  NULL,
    country         VARCHAR(80)  NULL,
    payment_terms_days SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    mode_of_supply  ENUM('direct','distributor','broker','import') NULL,
    rating          TINYINT UNSIGNED NULL,          -- 1-5 stars
    status          ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    INDEX idx_suppliers_deleted_at (deleted_at),
    INDEX idx_suppliers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- UNITS OF MEASURE
-- ============================================================
-- Admin-managed unit list (kg/ton/bag/...) that raw_materials.unit and
-- bom_lines.unit are both validated against and looked up in for
-- quantity conversion -- see app/services/bom_service.py. Kept as
-- separate lookup rows rather than FK columns on those two tables to
-- avoid a wider migration; `unit` there stays a plain string that's
-- expected to match a code here.
CREATE TABLE IF NOT EXISTS units_of_measure (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(20)  NOT NULL UNIQUE,
    name            VARCHAR(60)  NOT NULL,
    category        ENUM('weight','count','volume') NOT NULL,
    -- How many of this category's base unit (the row with is_base=1 in
    -- the same category) one unit of THIS row equals; the base unit's
    -- own factor is always 1.
    factor_to_base  DECIMAL(14,6) NOT NULL DEFAULT 1,
    is_base         TINYINT(1) NOT NULL DEFAULT 0,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    INDEX idx_uom_deleted_at (deleted_at),
    INDEX idx_uom_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed set: weight units the feature was requested for, plus a count
-- base unit so materials tracked by piece aren't forced into a weight
-- unit. `bag` = 50kg is a configurable assumption (a generic "bag" has
-- no fixed weight in reality) -- edit this row's factor_to_base under
-- Settings -> Units of measure if that's wrong for what's actually
-- being bagged, or add more specific bag-size units alongside it.
INSERT INTO units_of_measure (code, name, category, factor_to_base, is_base, status) VALUES
    ('kg',  'Kilogram',    'weight', 1,    1, 'active'),
    ('ton', 'Metric Ton',  'weight', 1000, 0, 'active'),
    ('bag', 'Bag (50kg)',  'weight', 50,   0, 'active'),
    ('pcs', 'Pieces',      'count',  1,    1, 'active')
ON DUPLICATE KEY UPDATE code = code;

-- ============================================================
-- RAW MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_materials (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    unit            VARCHAR(20)  NOT NULL,          -- kg, ltr, pcs, etc.
    reorder_point   DECIMAL(14,4) NOT NULL DEFAULT 0,
    default_supplier_id BIGINT UNSIGNED NULL,
    unit_cost       DECIMAL(14,4) NOT NULL DEFAULT 0,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_rm_supplier FOREIGN KEY (default_supplier_id) REFERENCES suppliers(id),
    INDEX idx_rm_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SUPPLIER MATERIALS (which raw materials a supplier can supply, and
-- how much of each -- a supplier commonly supplies several different
-- materials, so this is a proper line-item table rather than a single
-- FK, mirroring bom_lines' shape)
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_materials (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    supplier_id         BIGINT UNSIGNED NOT NULL,
    raw_material_id     BIGINT UNSIGNED NOT NULL,
    max_supply_quantity DECIMAL(14,4) NOT NULL,
    lead_time_days      SMALLINT UNSIGNED NULL,
    deleted_at          DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    CONSTRAINT fk_sm_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_sm_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    INDEX idx_sm_supplier (supplier_id),
    INDEX idx_sm_material (raw_material_id),
    INDEX idx_sm_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- MACHINES (production capacity used by the feasibility check's
-- machine-availability + time-required calculations)
-- ============================================================
CREATE TABLE IF NOT EXISTS machines (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code                    VARCHAR(30)  NOT NULL UNIQUE,
    name                    VARCHAR(150) NOT NULL,
    capacity_hours_per_day  DECIMAL(6,2) NOT NULL DEFAULT 8,
    status                  ENUM('active','inactive') NOT NULL DEFAULT 'active',
    deleted_at              DATETIME NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    INDEX idx_machines_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- PRODUCTS (finished goods AND intermediate sub-assemblies)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    unit            VARCHAR(20)  NOT NULL,
    product_type    ENUM('finished_good','sub_assembly') NOT NULL DEFAULT 'finished_good',
    selling_price   DECIMAL(14,2) NOT NULL DEFAULT 0,
    -- How production time is actually entered: as one batch (e.g. "500
    -- units, 6 hours"), not a per-unit figure. When both are set,
    -- production_hours_per_unit below is kept in sync as
    -- batch_production_hours / batch_size (see crud.master_data.
    -- ProductCRUD) -- every downstream capacity calculation still reads
    -- the per-unit column unchanged.
    batch_size                 DECIMAL(14,4) NULL,
    batch_production_hours     DECIMAL(10,4) NULL,
    -- The "formula" inputs for the feasibility check's time-required
    -- calculation: which machine makes this product, how many hours of
    -- that machine's time one unit consumes, and how many workers are
    -- needed concurrently for that time (alongside the BOM -- see
    -- bom_lines -- which covers the raw-material side of the formula).
    machine_id                 BIGINT UNSIGNED NULL,
    production_hours_per_unit  DECIMAL(10,4) NULL,
    workers_required           SMALLINT UNSIGNED NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    -- Descriptive only, not read by any business logic: free-form labels
    -- for filtering/grouping, and arbitrary spec key-value pairs (e.g.
    -- color, shelf life). See app/models/product.py.
    tags            JSON NULL,
    properties      JSON NULL,
    -- Finished-goods equivalent of raw_materials.reorder_point -- see
    -- app/models/product.py and inventory_service.get_finished_goods_stock.
    reorder_point   DECIMAL(14,4) NOT NULL DEFAULT 0,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_products_machine FOREIGN KEY (machine_id) REFERENCES machines(id),
    INDEX idx_products_deleted_at (deleted_at),
    INDEX idx_products_type (product_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- BOM (Bill of Materials) - MULTI-LEVEL
-- A product's BOM line points to either a raw_material OR another
-- product (a sub-assembly), enabling arbitrary assembly depth.
-- Depth/cycle guard is enforced in application code (see bom_service).
-- ============================================================
CREATE TABLE IF NOT EXISTS bom_lines (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parent_product_id   BIGINT UNSIGNED NOT NULL,        -- the product/sub-assembly being built
    component_type       ENUM('raw_material','product') NOT NULL,
    component_id          BIGINT UNSIGNED NOT NULL,        -- raw_materials.id or products.id depending on component_type
    quantity              DECIMAL(14,4) NOT NULL,
    unit                   VARCHAR(20) NOT NULL,          -- validated against units_of_measure.code; see bom_service
    scrap_percent          DECIMAL(5,2) NOT NULL DEFAULT 0,
    deleted_at             DATETIME NULL,
    created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by             BIGINT UNSIGNED NULL,
    updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by             BIGINT UNSIGNED NULL,
    CONSTRAINT fk_bom_parent FOREIGN KEY (parent_product_id) REFERENCES products(id),
    INDEX idx_bom_parent (parent_product_id),
    INDEX idx_bom_component (component_type, component_id),
    INDEX idx_bom_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- PACKAGING -- distinct from BOM: a packaging material (box, label,
-- wrap) is never produced *into* the product, it's procured/stocked
-- like a raw material (hence the FK to raw_materials, not a new
-- table) and consumed when the product ships, not during production.
-- Not wired into automatic stock deduction anywhere yet -- see
-- app/models/product_packaging.py.
-- ============================================================
CREATE TABLE IF NOT EXISTS product_packaging_lines (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id              BIGINT UNSIGNED NOT NULL,
    packaging_material_id   BIGINT UNSIGNED NOT NULL,  -- raw_materials.id
    quantity_per_unit       DECIMAL(14,4) NOT NULL,
    unit                    VARCHAR(20) NOT NULL,
    deleted_at              DATETIME NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_packaging_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_packaging_material FOREIGN KEY (packaging_material_id) REFERENCES raw_materials(id),
    INDEX idx_packaging_product (product_id),
    INDEX idx_packaging_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- INVENTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS finished_goods_inventory (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id      BIGINT UNSIGNED NOT NULL UNIQUE,
    quantity_on_hand DECIMAL(14,4) NOT NULL DEFAULT 0,
    quantity_reserved DECIMAL(14,4) NOT NULL DEFAULT 0,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fgi_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS raw_material_inventory (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    raw_material_id BIGINT UNSIGNED NOT NULL UNIQUE,
    quantity_on_hand DECIMAL(14,4) NOT NULL DEFAULT 0,
    quantity_reserved DECIMAL(14,4) NOT NULL DEFAULT 0,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_rmi_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_movements (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_type       ENUM('raw_material','product') NOT NULL,
    item_id         BIGINT UNSIGNED NOT NULL,
    movement_type   ENUM('receipt','issue','adjustment','production_in','production_out','return') NOT NULL,
    quantity        DECIMAL(14,4) NOT NULL,           -- positive = in, negative = out
    reference_type  VARCHAR(40) NULL,                 -- e.g. 'order', 'production_schedule'
    reference_id    BIGINT UNSIGNED NULL,
    -- The following are required by inventory_service.adjust_stock for
    -- every raw_material 'receipt' movement (batch_number/expiry_date
    -- excepted) -- captured so every unit of raw material on hand can be
    -- traced back to who supplied it, at what cost, and when, without
    -- gaps that would otherwise silently break supplier/cost analytics.
    supplier_id     BIGINT UNSIGNED NULL,
    unit_cost       DECIMAL(14,4) NULL,
    batch_number    VARCHAR(60) NULL,
    expiry_date     DATE NULL,
    invoice_number  VARCHAR(60) NULL,
    received_by     VARCHAR(120) NULL,
    received_date   DATE NULL,
    notes           VARCHAR(255) NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    INDEX idx_stock_mov_item (item_type, item_id),
    INDEX idx_stock_mov_reference (reference_type, reference_id),
    INDEX idx_stock_mov_supplier (supplier_id),
    CONSTRAINT fk_stock_mov_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DEALS (loose grouping, not a rigid pipeline: the thread that ties one
-- customer request's feasibility check, quotation(s), and order together
-- so "where does this stand" is one query instead of chasing FKs across
-- five tables. Loose on purpose -- a deal can start at feasibility OR at
-- a standalone quotation OR at a standalone order; whichever stage is
-- created first with no deal_id given creates one. Nothing requires a
-- deal to pass through every stage.)
-- ============================================================
CREATE TABLE IF NOT EXISTS deals (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    deal_number     VARCHAR(30) NOT NULL UNIQUE,     -- generated via number_series (prefix e.g. DEAL-00001)
    customer_id     BIGINT UNSIGNED NOT NULL,
    -- Furthest stage reached so far -- purely descriptive/display, not a
    -- gate on anything. Updated whenever a new stage attaches to this deal.
    furthest_stage  ENUM('feasibility','quotation','order','production','delivery') NOT NULL DEFAULT 'feasibility',
    -- 'cancelled' once nothing under this deal can still move it forward
    -- (every order cancelled, every quotation rejected/expired, every
    -- feasibility check closed/rejected -- see deal_service.
    -- reconcile_deal_status) and it never reached a delivered order.
    -- Reopened automatically if a feasibility check under it is revived.
    status          ENUM('open','cancelled') NOT NULL DEFAULT 'open',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_deals_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    INDEX idx_deals_customer (customer_id),
    INDEX idx_deals_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- FEASIBILITY CHECKS (gates quotation creation: tries to manufacture the
-- requested product(s) from raw materials on hand; a shortfall needs
-- Sales' exception approval before a quotation can be raised)
-- ============================================================
CREATE TABLE IF NOT EXISTS feasibility_checks (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    feasibility_number  VARCHAR(30) NOT NULL UNIQUE,      -- generated via number_series (prefix e.g. FSB-00001)
    customer_id         BIGINT UNSIGNED NOT NULL,
    deal_id             BIGINT UNSIGNED NULL,             -- see `deals` above
    status              ENUM('draft','feasible','exception_pending','exception_approved','exception_rejected','closed','converted','expired') NOT NULL DEFAULT 'draft',
    required_by_date    DATE NULL,        -- when the customer needs this quantity
    checked_at          DATETIME NULL,
    exception_reason    TEXT NULL,        -- Sales' reason for approving/rejecting a shortfall exception (the "override" comment)
    exception_by        BIGINT UNSIGNED NULL,
    close_reason        TEXT NULL,        -- Sales' reason for closing without generating a quotation
    notes               TEXT NULL,
    -- Admin notification: flagged when Sales overrides an infeasible result
    -- (admin_review_reason='override') or when a check has sat open more
    -- than 5 days with no close_reason/conversion (admin_review_reason='stale_open').
    admin_review_required TINYINT(1) NOT NULL DEFAULT 0,
    admin_review_reason   ENUM('override','stale_open') NULL,
    admin_reviewed_at      DATETIME NULL,
    admin_reviewed_by      BIGINT UNSIGNED NULL,
    admin_review_notes     TEXT NULL,
    deleted_at          DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    CONSTRAINT fk_feasibility_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_feasibility_deal FOREIGN KEY (deal_id) REFERENCES deals(id),
    CONSTRAINT fk_feasibility_exception_by FOREIGN KEY (exception_by) REFERENCES users(id),
    CONSTRAINT fk_feasibility_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id),
    INDEX idx_feasibility_status (status),
    INDEX idx_feasibility_deal (deal_id),
    INDEX idx_feasibility_deleted_at (deleted_at),
    INDEX idx_feasibility_admin_review (admin_review_required)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feasibility_lines (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    feasibility_id      BIGINT UNSIGNED NOT NULL,
    product_id          BIGINT UNSIGNED NOT NULL,
    quantity            DECIMAL(14,4) NOT NULL,
    -- How much of `quantity` was already sitting in unreserved
    -- finished-goods stock at check time, netted off before computing
    -- raw-material/capacity requirements for the remainder (see
    -- feasibility_service.run_check). NULL when nothing was covered.
    covered_by_stock    DECIMAL(14,4) NULL,
    -- True when the product genuinely has no BOM/formula configured at
    -- all (distinct from a BOM that resolves to zero requirements) --
    -- feasibility can't be verified, so this line is forced infeasible
    -- rather than silently reported as passing. NULL/false otherwise.
    bom_missing         TINYINT(1) NULL,
    is_feasible         TINYINT(1) NULL,       -- NULL until run; then whether this line's raw materials were fully covered
    shortfall_json      TEXT NULL,             -- JSON list of {raw_material_id, code, name, unit, required, on_hand, shortfall}
    -- Machine-availability / time-required check: whether the product's
    -- machine (see products.machine_id) has enough free capacity, between
    -- today and the feasibility's required_by_date, for this line's
    -- quantity at the product's production_hours_per_unit ("formula"
    -- time), net of what's already booked in production_schedules.
    -- NULL when the product has no machine/time formula or no
    -- required_by_date was given (capacity can't be evaluated).
    capacity_ok           TINYINT(1) NULL,
    capacity_shortfall_json TEXT NULL,         -- JSON {machine, required_hours, available_hours, shortfall_hours}
    -- Date the remainder can actually be supplied: today if fully
    -- covered by stock, otherwise the capacity scan's projected
    -- completion date (starting the next working day, skipping
    -- non-working days per the factory_working_days setting). NULL when
    -- raw materials are short or capacity isn't evaluable.
    estimated_ready_date DATE NULL,
    CONSTRAINT fk_fl_feasibility FOREIGN KEY (feasibility_id) REFERENCES feasibility_checks(id) ON DELETE CASCADE,
    CONSTRAINT fk_fl_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_fl_feasibility (feasibility_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_number    VARCHAR(30) NOT NULL UNIQUE,      -- generated via number_series (prefix e.g. ORD-00001)
    customer_id     BIGINT UNSIGNED NOT NULL,
    deal_id         BIGINT UNSIGNED NULL,             -- see `deals` above
    order_date      DATE NOT NULL,
    requested_delivery_date DATE NULL,
    confirmed_delivery_date DATE NULL,
    status          ENUM('draft','confirmed','in_production','ready_to_ship','shipped','delivered','cancelled') NOT NULL DEFAULT 'draft',
    -- Sum of line totals.
    subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    -- Percentage, e.g. 0 or 10 -- a whole-document discount applied on
    -- top of the already line-discounted subtotal.
    discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    -- subtotal_amount - discount_amount.
    total_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
    notes           TEXT NULL,
    close_reason    TEXT NULL,                        -- Sales' reason for cancelling without a delivery note
    -- A document whose discount (document-level or any single line's)
    -- is at/above Settings -> large_discount_approval_threshold can't
    -- leave 'draft' until an admin approves it.
    approved_at     DATETIME NULL,
    approved_by     BIGINT UNSIGNED NULL,
    admin_review_required TINYINT(1) NOT NULL DEFAULT 0, -- flagged when overdue with no delivery note and no close_reason
    admin_reviewed_at      DATETIME NULL,
    admin_reviewed_by      BIGINT UNSIGNED NULL,
    admin_review_notes     TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_orders_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id),
    CONSTRAINT fk_orders_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    CONSTRAINT fk_orders_deal FOREIGN KEY (deal_id) REFERENCES deals(id),
    INDEX idx_orders_status (status),
    INDEX idx_orders_deal (deal_id),
    INDEX idx_orders_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_details (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT UNSIGNED NOT NULL,
    product_id      BIGINT UNSIGNED NOT NULL,
    quantity        DECIMAL(14,4) NOT NULL,
    unit_price      DECIMAL(14,2) NOT NULL,
    -- Percentage, e.g. 0 or 10 -- this line's own discount, applied
    -- before the document-level discount_percent (see orders table).
    discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    line_total      DECIMAL(14,2) NOT NULL,
    CONSTRAINT fk_od_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_od_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_od_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- PURCHASE ORDERS (the supply-side counterpart to orders: what we're
-- buying from a supplier, rather than what a customer is buying from us)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    po_number       VARCHAR(30) NOT NULL UNIQUE,      -- generated via number_series (prefix e.g. PO-00001)
    supplier_id     BIGINT UNSIGNED NOT NULL,
    order_date      DATE NOT NULL,
    expected_delivery_date DATE NULL,
    status          ENUM('draft','sent','confirmed','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
    subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    -- Percentage, e.g. 0 or 10 -- a whole-document discount applied on
    -- top of the already line-discounted subtotal.
    discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
    notes           TEXT NULL,
    -- True when the system drafted this automatically from an MRP
    -- shortage (see purchase_order_service.auto_draft_from_mrp_shortages),
    -- false for a person-created PO. Never auto-sent -- always lands in
    -- 'draft' for procurement to review, edit, and send by hand.
    auto_created    TINYINT(1) NOT NULL DEFAULT 0,
    -- Sales/order and feasibility already require a reason to cancel; POs
    -- didn't -- inconsistent. Mandatory when status becomes 'cancelled'.
    cancel_reason   TEXT NULL,
    -- A PO at/above Settings -> large_po_approval_threshold can't move
    -- 'draft' -> 'sent' until an admin approves it (see
    -- purchase_order_service.approve_purchase_order). NULL threshold
    -- means the gate is off entirely.
    approved_at     DATETIME NULL,
    approved_by     BIGINT UNSIGNED NULL,
    -- Same admin-review escalation pattern as orders (admin_review_required
    -- there): flagged when a PO is past expected_delivery_date with
    -- nothing received and not cancelled -- a supplier running late, the
    -- purchasing-side mirror of a customer order running overdue.
    admin_review_required TINYINT(1) NOT NULL DEFAULT 0,
    admin_reviewed_at      DATETIME NULL,
    admin_reviewed_by      BIGINT UNSIGNED NULL,
    admin_review_notes     TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_po_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id),
    CONSTRAINT fk_po_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_po_status (status),
    INDEX idx_po_deleted_at (deleted_at),
    INDEX idx_po_admin_review (admin_review_required)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id   BIGINT UNSIGNED NOT NULL,
    raw_material_id     BIGINT UNSIGNED NOT NULL,
    quantity            DECIMAL(14,4) NOT NULL,
    unit_price          DECIMAL(14,2) NOT NULL,
    -- Percentage, e.g. 0 or 10 -- this line's own discount, applied
    -- before the document-level discount_percent (see purchase_orders table).
    discount_percent    DECIMAL(5,2) NOT NULL DEFAULT 0,
    line_total          DECIMAL(14,2) NOT NULL,
    received_quantity   DECIMAL(14,4) NOT NULL DEFAULT 0,
    CONSTRAINT fk_pol_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_pol_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    INDEX idx_pol_po (purchase_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DELIVERY NOTES (proof of what physically left the warehouse against a
-- specific order -- the sales-side counterpart of a purchase order
-- receipt. Issuing one drives the order to 'shipped', reusing the stock
-- issue/reservation-release logic order_service.change_status already
-- has for that transition, rather than duplicating it here.)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_notes (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    delivery_note_number  VARCHAR(30) NOT NULL UNIQUE,      -- generated via number_series (prefix e.g. DN-00001)
    order_id              BIGINT UNSIGNED NOT NULL,
    delivery_date         DATE NOT NULL,
    status                ENUM('draft','issued','cancelled') NOT NULL DEFAULT 'draft',
    -- True when the system drafted this automatically once the order
    -- became ready to ship (see order_service.py's auto-creation hook),
    -- false for a person-created delivery note.
    auto_created          TINYINT(1) NOT NULL DEFAULT 0,
    -- Mandatory when status becomes 'cancelled' -- same requirement as
    -- orders/quotations/feasibility, previously missing here.
    cancel_reason         TEXT NULL,
    notes                 TEXT NULL,
    deleted_at            DATETIME NULL,
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by            BIGINT UNSIGNED NULL,
    updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by            BIGINT UNSIGNED NULL,
    CONSTRAINT fk_dn_order FOREIGN KEY (order_id) REFERENCES orders(id),
    INDEX idx_dn_order (order_id),
    INDEX idx_dn_status (status),
    INDEX idx_dn_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS delivery_note_lines (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    delivery_note_id      BIGINT UNSIGNED NOT NULL,
    product_id            BIGINT UNSIGNED NOT NULL,
    quantity_delivered    DECIMAL(14,4) NOT NULL,
    CONSTRAINT fk_dnl_note FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes(id) ON DELETE CASCADE,
    CONSTRAINT fk_dnl_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_dnl_note (delivery_note_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- QUOTATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS quotations (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    quotation_number VARCHAR(30) NOT NULL UNIQUE,     -- generated via number_series (prefix e.g. QTN-00001)
    customer_id     BIGINT UNSIGNED NOT NULL,
    deal_id         BIGINT UNSIGNED NULL,             -- see `deals` above
    quotation_date  DATE NOT NULL,
    valid_until     DATE NULL,
    status          ENUM('draft','sent','accepted','rejected','expired','converted') NOT NULL DEFAULT 'draft',
    subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    -- Percentage, e.g. 0 or 10 -- a whole-document discount applied on
    -- top of the already line-discounted subtotal.
    discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
    notes           TEXT NULL,
    converted_order_id BIGINT UNSIGNED NULL,
    feasibility_id  BIGINT UNSIGNED NULL,             -- the passed/exception-approved feasibility check this came from
    auto_created    TINYINT(1) NOT NULL DEFAULT 0,    -- true when the system drafted this from a passed feasibility check, not a person
    close_reason    TEXT NULL,                        -- Sales' reason for closing without converting to an order
    -- A quotation whose discount (document-level or any single line's)
    -- is at/above Settings -> large_discount_approval_threshold can't
    -- leave 'draft' until an admin approves it.
    approved_at     DATETIME NULL,
    approved_by     BIGINT UNSIGNED NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_quotations_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_quotations_order FOREIGN KEY (converted_order_id) REFERENCES orders(id),
    CONSTRAINT fk_quotations_feasibility FOREIGN KEY (feasibility_id) REFERENCES feasibility_checks(id),
    CONSTRAINT fk_quotations_deal FOREIGN KEY (deal_id) REFERENCES deals(id),
    CONSTRAINT fk_quotations_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_quotations_status (status),
    INDEX idx_quotations_deal (deal_id),
    INDEX idx_quotations_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotation_details (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    quotation_id    BIGINT UNSIGNED NOT NULL,
    product_id      BIGINT UNSIGNED NOT NULL,
    quantity        DECIMAL(14,4) NOT NULL,
    unit_price      DECIMAL(14,2) NOT NULL,
    -- Percentage, e.g. 0 or 10 -- this line's own discount, applied
    -- before the document-level discount_percent (see quotations table).
    discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    line_total      DECIMAL(14,2) NOT NULL,
    CONSTRAINT fk_qd_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
    CONSTRAINT fk_qd_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_qd_quotation (quotation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- PRODUCTION SCHEDULING
-- ============================================================
CREATE TABLE IF NOT EXISTS production_schedules (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    batch_number    VARCHAR(30) NOT NULL UNIQUE,      -- generated via number_series (prefix e.g. PB-00001)
    product_id      BIGINT UNSIGNED NOT NULL,
    machine_id      BIGINT UNSIGNED NULL,             -- which machine this batch occupies (defaults to the product's machine)
    order_id        BIGINT UNSIGNED NULL,             -- nullable: batch may be for stock, not a specific order
    planned_quantity DECIMAL(14,4) NOT NULL,
    produced_quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
    scheduled_start DATE NOT NULL,
    scheduled_end   DATE NOT NULL,
    actual_start    DATETIME NULL,
    actual_end      DATETIME NULL,
    status          ENUM('planned','in_progress','completed','cancelled') NOT NULL DEFAULT 'planned',
    -- True when the system created this batch automatically on order
    -- confirmation (see order_service.py's auto-scheduling hook), false
    -- for a person-created batch. Purely informational -- an
    -- auto-scheduled batch is a completely normal batch otherwise.
    auto_scheduled  TINYINT(1) NOT NULL DEFAULT 0,
    -- Mandatory when status becomes 'cancelled' -- same requirement as
    -- orders/quotations/feasibility, previously missing here.
    cancel_reason   TEXT NULL,
    notes           TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_ps_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_ps_machine FOREIGN KEY (machine_id) REFERENCES machines(id),
    CONSTRAINT fk_ps_order FOREIGN KEY (order_id) REFERENCES orders(id),
    INDEX idx_ps_status (status),
    INDEX idx_ps_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    setting_key     VARCHAR(80) NOT NULL UNIQUE,
    setting_value   TEXT NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DEPARTMENT PERMISSIONS: governs which pages a 'staff' user (identified
-- by their department) can view or edit. admin/manager always have full
-- access everywhere and never consult this table; 'viewer' always has
-- read-only access everywhere and never consults this table either --
-- this table only ever applies to 'staff' users, since department is
-- the whole basis for the permission (see app/core/permissions.py).
-- A department/page combination with no row here means 'none' (no
-- access at all) -- deny by default until a super-admin (via Settings ->
-- Access Control) explicitly grants read or write.
-- ============================================================
CREATE TABLE IF NOT EXISTS department_permissions (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    department      ENUM('sales','procurement','warehouse') NOT NULL,
    page_key        VARCHAR(40) NOT NULL,
    access_level    ENUM('none','read','write') NOT NULL DEFAULT 'none',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_dept_perm_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
    UNIQUE KEY uq_dept_perm (department, page_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- CALENDAR: personal + shared entries
-- Always visible to its creator; also visible to anyone @mentioned by
-- username, or to everyone when @all was used (all_users). See
-- backend/app/services/calendar_service.py.
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_date      DATE NOT NULL,
    title           VARCHAR(200) NOT NULL,
    notes           TEXT NULL,
    all_users       TINYINT(1) NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NOT NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    deleted_at      DATETIME NULL,
    CONSTRAINT fk_cal_event_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_cal_event_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
    INDEX idx_cal_event_date (event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS calendar_event_mentions (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id    BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    CONSTRAINT fk_cal_mention_event FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
    CONSTRAINT fk_cal_mention_user FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY uq_cal_mention (event_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- AUTH: Revocable refresh tokens
-- Access tokens are short-lived and stateless (JWT only).
-- Refresh tokens are tracked here so logout/compromise can revoke them.
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    jti             CHAR(36) NOT NULL UNIQUE,        -- token identifier (UUID), not the token itself
    user_id         BIGINT UNSIGNED NOT NULL,
    revoked         TINYINT(1) NOT NULL DEFAULT 0,
    expires_at      DATETIME NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_refresh_user (user_id),
    INDEX idx_refresh_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- COMMUNICATION MODULE: email channel
-- One admin-configured mailbox account (IMAP or POP3 incoming, SMTP
-- outgoing). Password stored encrypted, never plaintext -- see
-- app/core/crypto.py. WhatsApp/SMS channels will get their own tables
-- alongside this one when built.
-- ============================================================
CREATE TABLE IF NOT EXISTS email_accounts (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    provider            VARCHAR(20) NOT NULL DEFAULT 'gmail',
    email_address       VARCHAR(255) NOT NULL DEFAULT '',
    display_name        VARCHAR(255) NOT NULL DEFAULT '',
    username            VARCHAR(255) NOT NULL DEFAULT '',
    password_encrypted  TEXT NULL,
    incoming_protocol   VARCHAR(10) NOT NULL DEFAULT 'imap',
    imap_host           VARCHAR(255) NOT NULL DEFAULT 'imap.gmail.com',
    imap_port           INT NOT NULL DEFAULT 993,
    imap_use_ssl        TINYINT(1) NOT NULL DEFAULT 1,
    pop3_host           VARCHAR(255) NOT NULL DEFAULT 'pop.gmail.com',
    pop3_port           INT NOT NULL DEFAULT 995,
    pop3_use_ssl        TINYINT(1) NOT NULL DEFAULT 1,
    smtp_host           VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
    smtp_port           INT NOT NULL DEFAULT 587,
    smtp_use_tls        TINYINT(1) NOT NULL DEFAULT 1,
    is_active           TINYINT(1) NOT NULL DEFAULT 0,
    last_tested_at      DATETIME NULL,
    last_test_ok        TINYINT(1) NULL,
    last_test_error     VARCHAR(500) NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    CONSTRAINT fk_email_account_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_email_account_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- COMMUNICATION MODULE: SMS channel
-- One admin-configured bulk SMS account -- a Kuwait gateway operator
-- (kwtSMS, Unifonic, SMSala) or a custom HTTP endpoint. API secret
-- stored encrypted -- see app/core/crypto.py.
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_accounts (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    provider                VARCHAR(20) NOT NULL DEFAULT 'kwtsms',
    sender_id               VARCHAR(20) NOT NULL DEFAULT '',
    api_url                 VARCHAR(255) NOT NULL DEFAULT 'https://www.kwtsms.com/API/send/',
    api_username            VARCHAR(255) NOT NULL DEFAULT '',
    api_password_encrypted  TEXT NULL,
    test_mode               TINYINT(1) NOT NULL DEFAULT 1,
    is_active               TINYINT(1) NOT NULL DEFAULT 0,
    last_tested_at          DATETIME NULL,
    last_test_ok            TINYINT(1) NULL,
    last_test_error         VARCHAR(500) NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_sms_account_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_sms_account_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- COMMUNICATION MODULE: WhatsApp channel
-- One admin-configured Meta WhatsApp Business Cloud API sender.
-- Template-only by design -- see migrations/2026-08-26_add_whatsapp_accounts.sql
-- for the full rationale. Access token stored encrypted -- see
-- app/core/crypto.py.
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    phone_number_id         VARCHAR(64) NOT NULL DEFAULT '',
    waba_id                 VARCHAR(64) NOT NULL DEFAULT '',
    display_phone_number    VARCHAR(32) NOT NULL DEFAULT '',
    verified_name           VARCHAR(255) NOT NULL DEFAULT '',
    access_token_encrypted  TEXT NULL,
    api_version             VARCHAR(10) NOT NULL DEFAULT 'v21.0',
    is_active               TINYINT(1) NOT NULL DEFAULT 0,
    last_tested_at          DATETIME NULL,
    last_test_ok            TINYINT(1) NULL,
    last_test_error         VARCHAR(500) NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_whatsapp_account_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_whatsapp_account_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SEED
-- ============================================================
INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES
    ('ORDER', 'ORD', 1, 5),
    ('QUOTATION', 'QTN', 1, 5),
    ('PRODUCTION_BATCH', 'PB', 1, 5),
    ('PURCHASE_ORDER', 'PO', 1, 5),
    ('DELIVERY_NOTE', 'DN', 1, 5),
    ('FEASIBILITY', 'FSB', 1, 5),
    ('DEAL', 'DEAL', 1, 5);

SET FOREIGN_KEY_CHECKS = 1;
