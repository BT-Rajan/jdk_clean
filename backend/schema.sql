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
-- MASTER DATA: Departments -- the one authoritative list of
-- organizational departments. Every other table that used to carry its
-- own ENUM('sales','procurement','warehouse') (users, department_permissions)
-- references this table's id instead -- see app/models/department.py.
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(80)  NOT NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    INDEX idx_departments_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO departments (code, name, status) VALUES
    ('sales',       'Sales',       'active'),
    ('procurement', 'Procurement', 'active'),
    ('warehouse',   'Warehouse',   'active'),
    ('production',  'Production',  'active')
ON DUPLICATE KEY UPDATE code = code;

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
    -- Which document-creating department this user belongs to (staff only
    -- get write access to Quotations/Orders/Purchase Orders through this --
    -- admin/manager keep full access regardless). NULL means no department.
    department_id   BIGINT UNSIGNED NULL,
    -- Which Manager this user (a Member -- staff/viewer) reports to in the
    -- org chart. Admin ("Owner") and manager rows leave this NULL -- see
    -- migrations/2026-08-31_add_user_manager_id.sql for the full rationale.
    manager_id      BIGINT UNSIGNED NULL,
    signature_filename VARCHAR(255) NULL,
    -- 'manager'/'staff' kept for backward compatibility with existing
    -- rows and the org-chart reporting line (see manager_id above) --
    -- new users get 'department_head'/'team_member' instead. See
    -- migrations/2026-10-02_add_department_head_team_member_roles.sql.
    role            ENUM('admin','manager','staff','viewer','department_head','team_member') NOT NULL DEFAULT 'staff',
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    INDEX idx_users_deleted_at (deleted_at),
    INDEX idx_users_manager_id (manager_id),
    INDEX idx_users_department_id (department_id),
    CONSTRAINT fk_users_manager_id FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_users_department_id FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    -- Internal reference number, auto-generated via number_series
    -- (doc_type 'CUSTOMER', prefix CUST) -- distinct from `code` below,
    -- which is the externally-issued Civil ID / Registration number the
    -- person types in themselves.
    customer_number VARCHAR(30)  NOT NULL UNIQUE,
    -- Individual (civil ID in `code`) or business (registration number in
    -- `code`) -- asked as the wizard's first question. See
    -- app/models/customer.py CUSTOMER_TYPES.
    customer_type   ENUM('individual','business') NOT NULL DEFAULT 'business',
    -- NULL for a prospective customer -- e.g. a feasibility check or
    -- quotation raised for someone new who hasn't provided this yet.
    -- UNIQUE still holds (MySQL allows any number of NULLs under it);
    -- locked once set, same as `name`.
    code            VARCHAR(30)  NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    -- Optional display/trading name shown instead of `name` where set
    -- (e.g. a business trading under a brand different from its
    -- registration papers) -- falls back to `name` everywhere.
    trade_name      VARCHAR(150) NULL,
    contact_person  VARCHAR(120) NULL,
    email           VARCHAR(120) NULL,
    phone           VARCHAR(30)  NULL,
    -- Backup contact only, used if the primary is unreachable -- not
    -- deduplicated the way phone/email are (see app/crud/master_data.py).
    alternate_phone VARCHAR(30)  NULL,
    alternate_email VARCHAR(120) NULL,
    billing_address VARCHAR(255) NULL,
    shipping_address VARCHAR(255) NULL,
    city            VARCHAR(80)  NULL,
    country         VARCHAR(80)  NULL,
    -- Free-text operational classification for filtering/reporting
    -- only -- same shape as raw_materials.category / products.category.
    category        VARCHAR(100) NULL,
    -- Who currently owns the operational relationship with this customer
    -- (Sales Head/admin assign; see app/api/customers.py POST
    -- /{id}/assign). Distinct from created_by (TimestampMixin) below,
    -- which never changes once set -- see app/models/customer.py.
    assigned_to     BIGINT UNSIGNED NULL,
    credit_limit    DECIMAL(14,2) NOT NULL DEFAULT 0,
    payment_terms_days SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    -- Classification alongside payment_terms_days above -- 'credit'
    -- requires payment_terms_days > 0, enforced in
    -- app/crud/master_data.py (CustomerCRUD) and schemas/customer.py.
    payment_terms_type ENUM('cash','advance','credit','custom') NOT NULL DEFAULT 'credit',
    -- Per-customer override of Settings' global large-discount approval
    -- threshold (see app/services/settings_service.py) -- e.g. a
    -- long-standing wholesale customer can be trusted with more discount
    -- room than a walk-in one, without changing the threshold for
    -- everyone. NULL means "use the global setting" -- see
    -- get_effective_discount_approval_threshold.
    discount_approval_threshold_override DECIMAL(5,2) NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    -- Onboarding workflow for a newly created customer -- see
    -- app/models/customer.py ONBOARDING_ALLOWED_TRANSITIONS. Independent
    -- of `status` above: a customer can finish onboarding (reach
    -- 'active') and still be toggled inactive later.
    onboarding_status ENUM('pending','under_review','active','on_hold','rejected') NOT NULL DEFAULT 'pending',
    onboarding_reason TEXT NULL,        -- reason recorded the last time onboarding moved to 'rejected'/'on_hold'
    notes           TEXT NULL,
    -- Proof of `code` above -- an uploaded image or PDF, stored on disk
    -- under uploads/customer_ids/ (see id_document_service.py), this
    -- column holding only the generated filename. order_service.
    -- change_status refuses to extend credit (credit_limit > 0) to a
    -- customer whose id isn't verified yet.
    id_document_filename VARCHAR(255) NULL,
    id_verified     TINYINT(1) NOT NULL DEFAULT 0,
    id_verified_at  DATETIME NULL,
    id_verified_by  BIGINT UNSIGNED NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_customers_id_verified_by FOREIGN KEY (id_verified_by) REFERENCES users(id),
    CONSTRAINT fk_customers_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_customers_deleted_at (deleted_at),
    INDEX idx_customers_name (name),
    INDEX idx_customers_assigned_to (assigned_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    -- Auto-generated via number_series (doc_type 'SUPPLIER', prefix SUP)
    -- -- no longer typed in on the wizard.
    code            VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    contact_person  VARCHAR(120) NULL,
    email           VARCHAR(120) NULL,
    phone           VARCHAR(30)  NULL,
    address         VARCHAR(255) NULL,
    city            VARCHAR(80)  NULL,
    country         VARCHAR(80)  NULL,
    payment_terms_days SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    -- Per-supplier overrides of Settings' global approval thresholds (see
    -- app/services/settings_service.py) -- a trusted long-standing
    -- supplier can be given a higher PO ceiling (or a new/risky one a
    -- lower one) without changing the threshold for everyone. NULL means
    -- "use the global setting" -- see get_effective_po_approval_threshold
    -- / get_effective_discount_approval_threshold.
    po_approval_threshold_override DECIMAL(12,2) NULL,
    discount_approval_threshold_override DECIMAL(5,2) NULL,
    mode_of_supply  ENUM('direct','distributor','broker','import') NULL,
    rating          TINYINT UNSIGNED NULL,          -- 1-5 stars
    status          ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
    -- Onboarding workflow for a newly created supplier -- see
    -- app/models/supplier.py ONBOARDING_ALLOWED_TRANSITIONS. Independent
    -- of `status` above, same as customers.onboarding_status.
    onboarding_status ENUM('pending','under_review','active','on_hold','rejected') NOT NULL DEFAULT 'pending',
    onboarding_reason TEXT NULL,        -- reason recorded the last time onboarding moved to 'rejected'/'on_hold'
    -- Proof of registration -- an uploaded image or PDF, stored on disk
    -- under uploads/supplier_ids/ (see id_document_service.py), this
    -- column holding only the generated filename.
    id_document_filename VARCHAR(255) NULL,
    id_verified     TINYINT(1) NOT NULL DEFAULT 0,
    id_verified_at  DATETIME NULL,
    id_verified_by  BIGINT UNSIGNED NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_suppliers_id_verified_by FOREIGN KEY (id_verified_by) REFERENCES users(id),
    INDEX idx_suppliers_deleted_at (deleted_at),
    INDEX idx_suppliers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- UNITS OF MEASURE
-- ============================================================
-- Units of Measure (the dedicated master table) has been removed
-- entirely (see migrations/2026-09-02_drop_units_of_measure.sql). What
-- replaced it isn't free text, though: raw_materials.unit and
-- products.unit are ENUM columns -- a short, catalog-specific picklist
-- (see migrations/2026-09-20_constrain_unit_enum.sql and
-- app/models/raw_material.py's RAW_MATERIAL_UNITS / app/models/
-- product.py's PRODUCT_UNITS), not an open-ended unit library.
--
-- bom_lines.unit and product_packaging_lines.unit stay plain VARCHAR,
-- but are never client-supplied: a line always mirrors its own
-- component/material's unit exactly (there is no unit conversion
-- anywhere -- bom_service.explode_requirements just sums quantities
-- directly), so those two are derived and overwritten server-side on
-- every write (bom_service._validate_line / packaging_service.
-- _validate_line). The frontend also auto-fills and locks those two
-- fields (BomEditor.tsx, PackagingEditor.tsx) so the UI reflects what
-- the server will actually store, but the server-side derivation is
-- what actually makes a mismatch impossible.

-- ============================================================
-- RAW MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_materials (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    -- Classification + descriptive identity. properties is a JSON
    -- key/value bag for structured spec attributes (grade, thickness,
    -- colour, etc.) instead of fixed columns per attribute -- same
    -- approach as products.properties. None of these are read by any
    -- business logic. See app/models/raw_material.py.
    material_type   ENUM('raw_material','packaging','consumable') NOT NULL DEFAULT 'raw_material',
    category        VARCHAR(100) NULL,
    description     TEXT NULL,
    properties      JSON NULL,
    manufacturer    VARCHAR(150) NULL,
    manufacturer_part_number VARCHAR(100) NULL,
    unit            ENUM('kg','20kg','25kg','ton','ml','litre','pcs') NOT NULL,
    -- Stock control thresholds -- on-hand/available/reserved themselves
    -- live in raw_material_inventory (see below), never duplicated here.
    reorder_point   DECIMAL(14,4) NOT NULL DEFAULT 0,
    safety_stock    DECIMAL(14,4) NOT NULL DEFAULT 0,
    maximum_stock   DECIMAL(14,4) NOT NULL DEFAULT 0,
    storage_location VARCHAR(100) NULL,
    default_supplier_id BIGINT UNSIGNED NULL,
    -- Baseline/fallback cost -- kept for compatibility (purchase order
    -- line defaulting, inventory valuation). Supplier-specific pricing
    -- lives on supplier_materials.purchase_price instead; this is not a
    -- second source of truth for what a given supplier charges.
    unit_cost       DECIMAL(14,4) NOT NULL DEFAULT 0,
    -- Lightweight QC -- not a QMS: just enough for receiving to know
    -- whether this material needs inspecting or a certificate, and what
    -- "acceptable" means in free text.
    inspection_required TINYINT(1) NOT NULL DEFAULT 0,
    certificate_required TINYINT(1) NOT NULL DEFAULT 0,
    qc_notes        TEXT NULL,
    status          ENUM('active','inactive','blocked') NOT NULL DEFAULT 'active',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_rm_supplier FOREIGN KEY (default_supplier_id) REFERENCES suppliers(id),
    INDEX idx_rm_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SUPPLIER MATERIALS (which raw materials a supplier can supply, and on
-- what terms -- a supplier commonly supplies several different
-- materials, so this is a proper line-item table rather than a single
-- FK, mirroring bom_lines' shape). Supplier-specific purchase price
-- belongs here, not on raw_materials -- see that table's unit_cost.
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_materials (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    supplier_id         BIGINT UNSIGNED NOT NULL,
    raw_material_id     BIGINT UNSIGNED NOT NULL,
    supplier_material_code VARCHAR(60) NULL,
    purchase_price      DECIMAL(14,4) NOT NULL DEFAULT 0,
    currency            VARCHAR(3) NOT NULL DEFAULT 'KWD',
    max_supply_quantity DECIMAL(14,4) NOT NULL,
    lead_time_days      SMALLINT UNSIGNED NULL,
    moq                 DECIMAL(14,4) NOT NULL DEFAULT 0,
    -- At most one active row per raw_material_id may be preferred --
    -- enforced in supplier_material_service, not the DB.
    is_preferred        TINYINT(1) NOT NULL DEFAULT 0,
    -- Whether this relationship is currently usable, independent of
    -- deleted_at (a temporary pause vs. severing the relationship).
    status              ENUM('active','inactive') NOT NULL DEFAULT 'active',
    -- Both auto-captured -- see app/models/supplier_material.py.
    onboarded_at        DATE NOT NULL,
    last_transaction_at DATE NULL,
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
-- RAW MATERIAL ALTERNATIVES (approved substitutes -- directed: material
-- A allowing B as a substitute doesn't imply the reverse)
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_material_alternatives (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    raw_material_id         BIGINT UNSIGNED NOT NULL,
    alternative_material_id BIGINT UNSIGNED NOT NULL,
    priority                SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    status                  ENUM('approved','blocked') NOT NULL DEFAULT 'approved',
    conversion_ratio        DECIMAL(14,6) NOT NULL DEFAULT 1,   -- units of alternative per 1 unit of the primary material
    notes                   VARCHAR(255) NULL,
    deleted_at              DATETIME NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_rma_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    CONSTRAINT fk_rma_alternative FOREIGN KEY (alternative_material_id) REFERENCES raw_materials(id),
    INDEX idx_rma_material (raw_material_id),
    INDEX idx_rma_alternative (alternative_material_id),
    INDEX idx_rma_deleted_at (deleted_at)
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
    unit            ENUM('kg','20kg','25kg','ton','ml','litre') NOT NULL,
    -- app/models/raw_material.py) -- descriptive only.
    category        VARCHAR(100) NULL,
    description     TEXT NULL,
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
    -- Lightweight QC, mirroring raw_materials.inspection_required/qc_notes.
    inspection_required TINYINT(1) NOT NULL DEFAULT 0,
    qc_notes        TEXT NULL,
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
-- BOM header -- at most one per product (product_id UNIQUE). Owns only
-- what a BOM itself is responsible for: identity, the batch size its
-- lines' quantities are expressed against, whether it's the currently
-- active recipe, and notes. Everything about the product itself stays
-- on `products`; this never duplicates it. See app/models/bom.py.
-- ============================================================
CREATE TABLE IF NOT EXISTS boms (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bom_number          VARCHAR(30) NOT NULL UNIQUE,      -- generated via number_series (prefix e.g. BOM-00001)
    product_id          BIGINT UNSIGNED NOT NULL UNIQUE,
    -- The batch size every bom_lines.quantity for this product is
    -- expressed against (e.g. 20 against output_quantity=100 means "20
    -- per 100 units produced"). Default 1 makes a line's quantity mean
    -- "per unit" directly -- see bom_service.explode_requirements.
    output_quantity     DECIMAL(14,4) NOT NULL DEFAULT 1,
    status              ENUM('active','inactive') NOT NULL DEFAULT 'active',
    notes               VARCHAR(500) NULL,
    deleted_at          DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    CONSTRAINT fk_bom_header_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_bom_header_deleted_at (deleted_at)
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
    unit                   VARCHAR(20) NOT NULL,          -- always the component's own `unit`, server-derived; see bom_service
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
    unit                    VARCHAR(20) NOT NULL,      -- always the packaging material's own `unit`, server-derived; see packaging_service
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
    movement_type   ENUM('receipt','issue','adjustment','production_in','production_out','return','return_to_supplier') NOT NULL,
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
    exception_at        DATETIME NULL,    -- when that decision was made
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
    -- JSON list of {raw_material_id, code, name, unit, original_shortfall,
    -- covered_by_alternatives, remaining_shortfall, alternatives_used}
    -- for materials whose own-stock shortfall was fully or partially
    -- covered by an approved raw_material_alternatives substitute at
    -- check time (see feasibility_service.run_check /
    -- raw_material_alternative_service.get_approved_alternatives_with_stock).
    -- NULL when no material on this line needed alternative coverage.
    -- Purely informational: never causes a BOM or inventory write.
    alternative_coverage_json TEXT NULL,
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
    -- Manually entered (from an external payment system) once the
    -- source quotation is 'accepted' -- copied here at conversion time
    -- as this order's own snapshot, not a live join. Required before
    -- create_order_from_quotation will convert a quotation at all (see
    -- quotation_service.set_payment_link); printed as a QR code on this
    -- order's PDF/invoice.
    payment_link    VARCHAR(500) NULL,
    -- Set the moment this order first reaches 'confirmed' -- drives
    -- escalate_unpaid_orders' "no payment N days after confirm" check,
    -- since credit_limit/outstanding-balance alone doesn't say how long
    -- this specific order has been waiting.
    confirmed_at    DATETIME NULL,
    -- A document whose discount (document-level or any single line's)
    -- is at/above Settings -> large_discount_approval_threshold can't
    -- leave 'draft' until an admin approves it.
    approved_at     DATETIME NULL,
    approved_by     BIGINT UNSIGNED NULL,
    admin_review_required TINYINT(1) NOT NULL DEFAULT 0, -- flagged for admin_review_reason below
    -- Distinguishes *why* admin_review_required is set -- 'overdue_delivery'
    -- (escalate_overdue_orders) or 'payment_overdue' (escalate_unpaid_orders).
    -- NULL whenever admin_review_required is false. Only one reason can be
    -- recorded at a time -- if an order is flagged for one reason, the other
    -- escalation's own query (which only ever targets admin_review_required
    -- = false candidates) will skip it until the first is cleared via
    -- admin_review(). Rare enough in practice not to warrant a proper
    -- multi-reason model.
    admin_review_reason    VARCHAR(30) NULL,
    admin_reviewed_at      DATETIME NULL,
    admin_reviewed_by      BIGINT UNSIGNED NULL,
    admin_review_notes     TEXT NULL,
    -- Set the last time a payment-request email went out for this order
    -- (see payment_service.py) -- purely informational, for Sales to see
    -- "sent N days ago, still nothing recorded" at a glance.
    payment_requested_at   DATETIME NULL,
    -- Set the moment the automatic order-confirmation email successfully
    -- sends (see order_service._maybe_send_confirmation_email, and the
    -- email_templates table below). NULL if the customer has no email
    -- on file or the send failed.
    confirmation_emailed_at DATETIME NULL,
    -- Set when this order was born out of splitting a 'ready_to_ship'
    -- order that stock couldn't fully cover yet (see order_service.
    -- split_order) -- the deliverable-now remainder becomes this order's
    -- own child, a completely normal order from here on. NULL for every
    -- order created the ordinary way.
    parent_order_id BIGINT UNSIGNED NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_orders_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id),
    CONSTRAINT fk_orders_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    CONSTRAINT fk_orders_deal FOREIGN KEY (deal_id) REFERENCES deals(id),
    CONSTRAINT fk_orders_parent_order FOREIGN KEY (parent_order_id) REFERENCES orders(id),
    INDEX idx_orders_status (status),
    INDEX idx_orders_deal (deal_id),
    INDEX idx_orders_deleted_at (deleted_at),
    INDEX idx_orders_parent (parent_order_id)
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

-- A payment recorded against one order, entered by hand once someone's
-- confirmed the money actually arrived (bank transfer, cheque, cash --
-- there's no online payment collection yet, see payment_service.py).
-- Used to compute a customer's outstanding balance against their
-- credit_limit (see customers table) at order-confirm time.
CREATE TABLE IF NOT EXISTS payments (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT UNSIGNED NOT NULL,
    customer_id     BIGINT UNSIGNED NOT NULL, -- denormalized from orders.customer_id, for a one-query balance lookup
    amount          DECIMAL(14,2) NOT NULL,
    payment_date    DATE NOT NULL,
    method          VARCHAR(60) NULL,   -- free text, e.g. "Bank transfer", "Cheque", "Cash"
    reference       VARCHAR(120) NULL,  -- bank ref / cheque number / transaction id
    notes           TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    INDEX idx_payments_order (order_id),
    INDEX idx_payments_customer (customer_id),
    INDEX idx_payments_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A recorded commitment to pay an order off by some date (amount + a
-- single target date, no per-installment breakdown yet) -- purely
-- informational, does NOT feed the credit-limit check the way a real
-- Payment does. See app/services/payment_plan_service.py.
CREATE TABLE IF NOT EXISTS payment_plans (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT UNSIGNED NOT NULL,
    customer_id     BIGINT UNSIGNED NOT NULL, -- denormalized from orders.customer_id, same as payments.customer_id
    amount          DECIMAL(14,2) NOT NULL,
    target_date     DATE NOT NULL,
    notes           TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_payment_plans_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_payment_plans_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    INDEX idx_payment_plans_order (order_id),
    INDEX idx_payment_plans_customer (customer_id),
    INDEX idx_payment_plans_deleted_at (deleted_at)
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
    -- Closes out this one line (the supplier can't deliver the rest of
    -- it) without cancelling the whole PO -- see
    -- purchase_order_service.cancel_purchase_order_line.
    is_cancelled        TINYINT(1) NOT NULL DEFAULT 0,
    cancel_reason       TEXT NULL,
    CONSTRAINT fk_pol_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_pol_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    INDEX idx_pol_po (purchase_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SUPPLIER RETURNS (raw material sent back -- almost always a quality
-- rejection. Recording one immediately deducts the returned quantity
-- from raw-material stock on hand, movement_type='return_to_supplier' on
-- stock_movements. No status workflow: created once, done -- soft-delete
-- reverses it, same "never silently rewrite" stance as payments.)
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_returns (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    return_number   VARCHAR(30) NOT NULL UNIQUE,      -- generated via number_series (prefix e.g. SRN-00001)
    supplier_id     BIGINT UNSIGNED NOT NULL,
    -- Optional: often traceable to a specific delivery, not always.
    purchase_order_id BIGINT UNSIGNED NULL,
    return_date     DATE NOT NULL,
    reason          TEXT NOT NULL,
    notes           TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_sret_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_sret_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    INDEX idx_sret_supplier (supplier_id),
    INDEX idx_sret_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_return_lines (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    supplier_return_id  BIGINT UNSIGNED NOT NULL,
    raw_material_id     BIGINT UNSIGNED NOT NULL,
    quantity             DECIMAL(14,4) NOT NULL,
    CONSTRAINT fk_srl_return FOREIGN KEY (supplier_return_id) REFERENCES supplier_returns(id) ON DELETE CASCADE,
    CONSTRAINT fk_srl_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    INDEX idx_srl_return (supplier_return_id)
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
    language        ENUM('en','ar') NOT NULL DEFAULT 'en', -- which admin quotation template (see doc_templates) Print/Email default to
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
    -- Manually entered (from an external payment system) once this
    -- quotation is 'accepted' -- see quotation_service.set_payment_link.
    -- Required before create_order_from_quotation will convert this
    -- quotation at all; copied onto the new order as its own snapshot.
    payment_link    VARCHAR(500) NULL,
    -- A quotation whose discount (document-level or any single line's)
    -- is at/above Settings -> large_discount_approval_threshold can't
    -- leave 'draft' until an admin approves it.
    approved_at     DATETIME NULL,
    approved_by     BIGINT UNSIGNED NULL,
    -- Set when this quotation's material needs overlapped another
    -- still-open quotation/order and Sales explicitly acknowledged that
    -- at creation/edit time -- see quotation_service.check_material_conflicts.
    material_conflict_acknowledged TINYINT(1) NOT NULL DEFAULT 0,
    material_conflict_notes TEXT NULL, -- JSON snapshot of what was flagged
    -- NULL until the first time this quotation is emailed -- see
    -- quotations.py's email_quotation_pdf, which picks the
    -- quotation_email vs. quotation_followup_email template based on
    -- whether this is still NULL.
    last_emailed_at DATETIME NULL,
    -- Stamped by quotation_service.record_followup every time Sales logs
    -- a customer follow-up; next_followup_date drives the Not Due/Due/
    -- Overdue/Completed verdict (see get_followup_status).
    last_followup_at DATETIME NULL,
    next_followup_date DATE NULL,
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
-- PRODUCTION ORDERS
-- ============================================================
-- The internal manufacturing instruction -- WHAT needs to be produced,
-- how much, and by when. Deliberately does not touch scheduling
-- (machine/dates -- see production_schedules below) or execution
-- (actual output) -- those are a later pass. See
-- docs/production-lifecycle.md for the full architecture reasoning.
-- Defined before production_schedules below because that table's
-- production_order_id column (P5) FKs into this one -- InnoDB requires
-- the referenced table to already exist.
--
-- order_id/order_detail_id are nullable (P8): JDK runs on a stock-driven
-- model, so a Production Order may exist purely to build/replenish
-- general Finished Goods stock with no customer order behind it at all.
-- When order_detail_id IS set, it's the order line this Production Order
-- was raised to help cover -- informational demand-tracking only, never
-- a claim on the resulting stock (any released FG unit fulfils any
-- order regardless of which Production Order produced it -- see
-- app/services/order_service.get_fulfillment).
CREATE TABLE IF NOT EXISTS production_orders (
    id                          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    production_order_number    VARCHAR(30) NOT NULL UNIQUE,      -- generated via number_series (prefix e.g. PRO-00001)
    order_id                    BIGINT UNSIGNED NULL,
    order_detail_id             BIGINT UNSIGNED NULL,              -- the customer order line this was raised for, if any
    product_id                  BIGINT UNSIGNED NOT NULL,          -- mirrors order_details.product_id at creation, or given directly for a stock-only order
    planned_quantity            DECIMAL(14,4) NOT NULL,
    due_date                    DATE NOT NULL,
    priority                    ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
    status                      ENUM('planned','cancelled') NOT NULL DEFAULT 'planned',
    cancel_reason                TEXT NULL,                        -- mandatory when status becomes 'cancelled'
    notes                        TEXT NULL,
    created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by                  BIGINT UNSIGNED NULL,
    updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by                  BIGINT UNSIGNED NULL,
    CONSTRAINT fk_po_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_po_order_detail FOREIGN KEY (order_detail_id) REFERENCES order_details(id),
    CONSTRAINT fk_po_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_po_order (order_id),
    INDEX idx_po_order_detail (order_detail_id),
    INDEX idx_po_status (status)
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
    -- Set only for a schedule created from the new Production Order flow
    -- (P5) -- NULL for a legacy batch auto-scheduled straight from order
    -- confirmation (see order_service._maybe_auto_schedule_production),
    -- which predates the Production Order entity (P2) entirely.
    production_order_id BIGINT UNSIGNED NULL,
    planned_quantity DECIMAL(14,4) NOT NULL,
    -- Cumulative across every recording made against this batch -- see
    -- app/models/production_schedule.py's comment on this column.
    produced_quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
    scheduled_start DATE NOT NULL,
    scheduled_end   DATE NOT NULL,
    -- Time-of-day precision for the new Production Order scheduling flow
    -- (P5) -- scheduled_start/scheduled_end above stay the calendar-day
    -- projection of these (kept in sync on write) so every existing day-
    -- granularity consumer (capacity_service, dashboards, reports,
    -- notifications, the calendar view) keeps working unchanged; these
    -- two are only what the new machine-conflict check and the
    -- Production Order schedule UI need. NULL for a legacy batch that
    -- was never given exact times.
    planned_start   DATETIME NULL,
    planned_end     DATETIME NULL,
    actual_start    DATETIME NULL,
    actual_end      DATETIME NULL,
    status          ENUM('planned','in_progress','paused','completed','cancelled') NOT NULL DEFAULT 'planned',
    -- True when the system created this batch automatically on order
    -- confirmation (see order_service.py's auto-scheduling hook), false
    -- for a person-created batch. Purely informational -- an
    -- auto-scheduled batch is a completely normal batch otherwise.
    auto_scheduled  TINYINT(1) NOT NULL DEFAULT 0,
    -- Mandatory when status becomes 'cancelled' -- same requirement as
    -- orders/quotations/feasibility, previously missing here.
    cancel_reason   TEXT NULL,
    -- Mandatory when status becomes 'paused' -- see
    -- app/models/production_schedule.py's comment on this column.
    pause_reason    TEXT NULL,
    -- Mandatory when completed with produced_quantity different from
    -- planned_quantity (either direction) -- see
    -- app/models/production_schedule.py's comment on this column.
    quantity_discrepancy_reason TEXT NULL,
    -- Mandatory when a Production-Order-driven schedule's quantity is
    -- allowed to exceed the order's remaining unscheduled quantity --
    -- see app/services/production_order_schedule_service.py's
    -- allow_overproduction path.
    overproduction_reason TEXT NULL,
    notes           TEXT NULL,
    -- Set on completion when actual raw-material usage (see
    -- app/api/production_schedules.py's actual_materials) either exceeds
    -- a raw material's BOM-configured scrap_percent allowance or comes
    -- in below the bare zero-scrap requirement -- see
    -- production_service._complete_batch and notification_service.py.
    material_discrepancy_flag TINYINT(1) NOT NULL DEFAULT 0,
    material_discrepancy_notes TEXT NULL, -- JSON list of per-material findings
    -- Same admin-review escalation pattern as orders/purchase_orders --
    -- see app/models/production_schedule.py's comment on this column.
    admin_review_required TINYINT(1) NOT NULL DEFAULT 0,
    admin_reviewed_at DATETIME NULL,
    admin_reviewed_by BIGINT UNSIGNED NULL,
    admin_review_notes TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_ps_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_ps_machine FOREIGN KEY (machine_id) REFERENCES machines(id),
    CONSTRAINT fk_ps_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_ps_production_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    CONSTRAINT fk_ps_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id),
    INDEX idx_ps_status (status),
    INDEX idx_ps_deleted_at (deleted_at),
    INDEX idx_ps_production_order (production_order_id),
    INDEX idx_ps_machine_planned (machine_id, planned_start, planned_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- PRODUCTION ORDER MATERIAL REQUIREMENTS
-- ============================================================
-- Persisted "how much of this raw material does this Production Order
-- need" -- a snapshot, not a live join, so a later BOM edit doesn't
-- retroactively change an already-calculated requirement. Sourced from
-- the existing bom_service (BOM explosion) and packaging_service
-- (product_packaging_lines), never a parallel calculation engine.
-- available/shortage are computed live from inventory at read time, not
-- stored here -- see docs/production-lifecycle.md.
CREATE TABLE IF NOT EXISTS production_order_material_requirements (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    production_order_id    BIGINT UNSIGNED NOT NULL,
    bom_id                  BIGINT UNSIGNED NULL,        -- the BOM this row was calculated from (NULL for packaging-sourced rows)
    raw_material_id         BIGINT UNSIGNED NOT NULL,
    source                  ENUM('bom','packaging') NOT NULL,
    required_quantity       DECIMAL(14,4) NOT NULL,
    allocated_quantity      DECIMAL(14,4) NOT NULL DEFAULT 0, -- how much of this row is committed to this Production Order (P4)
    consumed_quantity       DECIMAL(14,4) NOT NULL DEFAULT 0, -- how much of this row's allocation has actually been issued to production (P6)
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_pomr_production_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    CONSTRAINT fk_pomr_bom FOREIGN KEY (bom_id) REFERENCES boms(id),
    CONSTRAINT fk_pomr_raw_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    UNIQUE KEY uq_pomr_line (production_order_id, raw_material_id, source),
    INDEX idx_pomr_production_order (production_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- PRODUCTION EXECUTIONS
-- ============================================================
-- One actual manufacturing run against a Production Order -- the WHAT-
-- HAPPENED record (P6) alongside production_orders (WHAT, P2) and
-- production_schedules (WHEN/WHERE for this flow, P5). See
-- docs/production-lifecycle.md. A Production Order may have several of
-- these across its lifetime (multiple runs); each is independent and,
-- once completed/cancelled, immutable. started_at/ended_at are always
-- server-authoritative Kuwait time (core/timezone.py's
-- now_kuwait_naive), never client-supplied.
CREATE TABLE IF NOT EXISTS production_executions (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    production_order_id BIGINT UNSIGNED NOT NULL,
    schedule_id         BIGINT UNSIGNED NOT NULL,
    product_id          BIGINT UNSIGNED NOT NULL,          -- mirrors production_orders.product_id at creation
    machine_id          BIGINT UNSIGNED NULL,              -- mirrors production_schedules.machine_id at creation
    planned_quantity    DECIMAL(14,4) NOT NULL,
    produced_quantity   DECIMAL(14,4) NOT NULL DEFAULT 0,  -- set only on completion
    released_quantity   DECIMAL(14,4) NOT NULL DEFAULT 0,  -- released into FinishedGoodsInventory by an accepted QC report (P7)
    rejected_quantity   DECIMAL(14,4) NOT NULL DEFAULT 0,  -- rejected by a QC decision (P8); released+rejected+undecided always sums to produced_quantity
    started_at          DATETIME NOT NULL,
    ended_at            DATETIME NULL,
    status              ENUM('in_progress','completed','cancelled') NOT NULL DEFAULT 'in_progress',
    started_by          BIGINT UNSIGNED NULL,
    completed_by        BIGINT UNSIGNED NULL,
    cancel_reason       TEXT NULL,
    notes               TEXT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    CONSTRAINT fk_pe_production_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    CONSTRAINT fk_pe_schedule FOREIGN KEY (schedule_id) REFERENCES production_schedules(id),
    CONSTRAINT fk_pe_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_pe_machine FOREIGN KEY (machine_id) REFERENCES machines(id),
    CONSTRAINT fk_pe_started_by FOREIGN KEY (started_by) REFERENCES users(id),
    CONSTRAINT fk_pe_completed_by FOREIGN KEY (completed_by) REFERENCES users(id),
    INDEX idx_pe_production_order (production_order_id),
    INDEX idx_pe_schedule (schedule_id),
    INDEX idx_pe_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- QC AGENTS
-- ============================================================
-- External testing laboratories/agents (P7) -- JDK never performs the
-- actual testing itself, this is only enough identity to say which lab
-- a QC request went to. Deliberately its own minimal master rather than
-- reusing suppliers -- see app/models/qc_agent.py.
CREATE TABLE IF NOT EXISTS qc_agents (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(30) NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    contact_person  VARCHAR(120) NULL,
    email           VARCHAR(120) NULL,
    phone           VARCHAR(30) NULL,
    address         VARCHAR(255) NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    INDEX idx_qc_agents_status (status),
    INDEX idx_qc_agents_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- QC REQUESTS
-- ============================================================
-- One external QC request against a specific Production Execution --
-- never a whole Production Order (two executions under one order can be
-- at entirely different QC stages). Gates when a run's produced
-- quantity becomes real, releasable FinishedGoodsInventory stock (see
-- app/services/qc_service.py). id_document_filename/id_verified* reuse
-- the existing generic document-attachment mechanism unchanged (already
-- shared by customers/suppliers) for the report attachment.
CREATE TABLE IF NOT EXISTS qc_requests (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qc_request_number      VARCHAR(30) NOT NULL UNIQUE,
    production_order_id    BIGINT UNSIGNED NOT NULL,
    production_execution_id BIGINT UNSIGNED NOT NULL,
    product_id              BIGINT UNSIGNED NOT NULL,          -- mirrors production_executions.product_id at creation
    qc_agent_id             BIGINT UNSIGNED NOT NULL,
    sample_reference        VARCHAR(30) NOT NULL UNIQUE,       -- generated via number_series (prefix SMP-00001)
    quantity                DECIMAL(14,4) NOT NULL,            -- how much of the execution's produced_quantity this request decides (P8; distinct from sample_quantity)
    sample_quantity         DECIMAL(14,4) NULL,
    request_date            DATE NOT NULL,
    expected_report_date    DATE NULL,
    status                  ENUM('requested','sample_sent','report_received','accepted','rejected') NOT NULL DEFAULT 'requested',
    dispatch_date           DATE NULL,
    dispatch_method         VARCHAR(120) NULL,
    external_reference      VARCHAR(80) NULL,
    dispatched_by           BIGINT UNSIGNED NULL,
    report_number           VARCHAR(60) NULL,
    report_date             DATE NULL,
    received_date           DATE NULL,
    decided_date            DATE NULL,
    decided_by              BIGINT UNSIGNED NULL,
    notes                   TEXT NULL,
    id_document_filename    VARCHAR(255) NULL,
    id_verified             TINYINT(1) NOT NULL DEFAULT 0,
    id_verified_at          DATETIME NULL,
    id_verified_by          BIGINT UNSIGNED NULL,
    admin_review_required   TINYINT(1) NOT NULL DEFAULT 0,
    admin_reviewed_at       DATETIME NULL,
    admin_reviewed_by       BIGINT UNSIGNED NULL,
    admin_review_notes      TEXT NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_qcr_production_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    CONSTRAINT fk_qcr_production_execution FOREIGN KEY (production_execution_id) REFERENCES production_executions(id),
    CONSTRAINT fk_qcr_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_qcr_qc_agent FOREIGN KEY (qc_agent_id) REFERENCES qc_agents(id),
    CONSTRAINT fk_qcr_dispatched_by FOREIGN KEY (dispatched_by) REFERENCES users(id),
    CONSTRAINT fk_qcr_decided_by FOREIGN KEY (decided_by) REFERENCES users(id),
    CONSTRAINT fk_qcr_id_verified_by FOREIGN KEY (id_verified_by) REFERENCES users(id),
    CONSTRAINT fk_qcr_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id),
    INDEX idx_qcr_production_order (production_order_id),
    INDEX idx_qcr_production_execution (production_execution_id),
    INDEX idx_qcr_status (status)
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
    department_id   BIGINT UNSIGNED NOT NULL,
    page_key        VARCHAR(40) NOT NULL,
    access_level    ENUM('none','read','write') NOT NULL DEFAULT 'none',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_dept_perm_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
    CONSTRAINT fk_dept_perm_department_id FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    UNIQUE KEY uq_dept_perm (department_id, page_key)
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
-- DOCUMENTS: Email templates (Admin -> Documents). The subject/body an
-- automated or one-click document email goes out with -- a fixed set
-- of keys defined in code (see email_template_service.py), each row
-- auto-created from that key's default the first time it's read, so a
-- fresh install works out of the box before any admin ever visits this
-- page.
-- ============================================================
CREATE TABLE IF NOT EXISTS email_templates (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    template_key    VARCHAR(40) NOT NULL UNIQUE,
    name            VARCHAR(120) NOT NULL,
    subject         VARCHAR(255) NOT NULL,
    body            TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DOCUMENTS: Document templates (Admin -> Documents). An admin-uploaded
-- .docx template overriding the bundled default for one (doc_type,
-- language) pair -- see doc_template_service.py. A row only exists once
-- someone has uploaded a replacement; the bundled EN/AR defaults ship
-- as files under backend/app/assets/doc_templates/, so a fresh install
-- works out of the box before any admin ever visits this page, same as
-- email_templates above.
-- ============================================================
CREATE TABLE IF NOT EXISTS doc_templates (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doc_type            VARCHAR(20) NOT NULL,
    language            VARCHAR(5) NOT NULL,
    filename            VARCHAR(255) NOT NULL,
    original_filename   VARCHAR(255) NOT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    UNIQUE KEY uq_doc_templates_type_lang (doc_type, language)
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
    ('DEAL', 'DEAL', 1, 5),
    ('SUPPLIER_RETURN', 'SRN', 1, 5),
    ('CUSTOMER', 'CUST', 1, 5),
    ('SUPPLIER', 'SUP', 1, 5),
    ('BOM', 'BOM', 1, 5),
    ('PRODUCTION_ORDER', 'PRO', 1, 5),
    ('QC_REQUEST', 'QCR', 1, 5),
    ('QC_SAMPLE', 'SMP', 1, 5);

SET FOREIGN_KEY_CHECKS = 1;
