-- =============================================================================
-- Database Schema for Car Wash ERP & POS System (نظام إدارة مغسلة السيارات)
-- Target Database: Neon PostgreSQL
-- =============================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Helper Functions & Triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. إدارة المواد الخام والمخزون بالجرام (Raw Materials & Inventory in Grams)
-- =============================================================================

CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'gram',
    current_stock_grams NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (current_stock_grams >= 0),
    reorder_threshold_grams NUMERIC(12, 2) NOT NULL DEFAULT 1000.00 CHECK (reorder_threshold_grams >= 0),
    cost_per_gram NUMERIC(10, 4) NOT NULL DEFAULT 0.0000 CHECK (cost_per_gram >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 2. إدارة أنواع الغسيل والخدمات (Services & Washing Packages)
-- =============================================================================

CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    description TEXT,
    category VARCHAR(100) DEFAULT 'عام',
    egs_code VARCHAR(100),
    media_url TEXT,
    media_type VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (media_type IN ('none', 'image', 'video')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE services ADD COLUMN IF NOT EXISTS egs_code VARCHAR(100);
ALTER TABLE services ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) DEFAULT 'none';


-- =============================================================================
-- 3. جدول الوصفات ومكونات الغسيل (Service Recipes / BOM - Bill of Materials)
-- =============================================================================

CREATE TABLE IF NOT EXISTS service_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity_grams NUMERIC(10, 2) NOT NULL CHECK (quantity_grams > 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_service_inventory_item UNIQUE (service_id, inventory_item_id)
);

-- =============================================================================
-- 4. إدارة الموظفين (Employees with PIN Code & Work Schedule)
-- =============================================================================

CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(100) NOT NULL DEFAULT 'فني غسيل',
    hourly_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (hourly_rate >= 0),
    overtime_hourly_rate NUMERIC(10, 2) DEFAULT NULL,
    target_weekly_days INTEGER NOT NULL DEFAULT 6 CHECK (target_weekly_days BETWEEN 1 AND 7),
    target_weekly_hours NUMERIC(5, 2) NOT NULL DEFAULT 48.00 CHECK (target_weekly_hours >= 0),
    weekly_off_day VARCHAR(30) NOT NULL DEFAULT 'الجمعة',
    is_paid_weekly_off BOOLEAN NOT NULL DEFAULT false,
    pin_code VARCHAR(10) NOT NULL DEFAULT '1234',
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
    hire_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add columns dynamically if table already exists in DB
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_code VARCHAR(10) NOT NULL DEFAULT '1234';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS weekly_off_day VARCHAR(30) NOT NULL DEFAULT 'الجمعة';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_paid_weekly_off BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS target_weekly_days INTEGER NOT NULL DEFAULT 6;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS target_weekly_hours NUMERIC(5, 2) NOT NULL DEFAULT 48.00;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS overtime_hourly_rate NUMERIC(10, 2) DEFAULT NULL;

-- =============================================================================
-- 5. فواتير ونقاط البيع (POS & Orders with ETA Integration)
-- =============================================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code VARCHAR(100) NOT NULL UNIQUE,
    car_plate VARCHAR(50),
    car_type VARCHAR(50) DEFAULT 'سيدان',
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer', 'split')),
    status VARCHAR(50) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    eta_uuid VARCHAR(100),
    eta_submission_id VARCHAR(100),
    eta_status VARCHAR(50) NOT NULL DEFAULT 'not_synced' CHECK (eta_status IN ('not_synced', 'pending', 'valid', 'invalid', 'failed')),
    eta_share_url TEXT,
    eta_synced_at TIMESTAMPTZ,
    eta_error_message TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_uuid VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_submission_id VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_status VARCHAR(50) NOT NULL DEFAULT 'not_synced';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_share_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_synced_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_error_message TEXT;

-- =============================================================================
-- 6. سجل الحضور والانصراف (Attendance)
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in TIMESTAMPTZ NOT NULL,
    check_out TIMESTAMPTZ,
    actual_hours NUMERIC(5, 2) DEFAULT 0.00 CHECK (actual_hours >= 0),
    overtime_hours NUMERIC(5, 2) DEFAULT 0.00 CHECK (overtime_hours >= 0),
    deducted_hours NUMERIC(5, 2) DEFAULT 0.00 CHECK (deducted_hours >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 7. الحركات المالية للموظفين (Employee Transactions: Advance, Bonus, Deduction)
-- =============================================================================

CREATE TABLE IF NOT EXISTS employee_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('advance', 'bonus', 'deduction')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 8. عمليات صرف وتصفية الرواتب (Payroll Payouts)
-- =============================================================================

CREATE TABLE IF NOT EXISTS payroll_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_code VARCHAR(100) NOT NULL UNIQUE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_hours_worked NUMERIC(6, 2) NOT NULL DEFAULT 0.00 CHECK (total_hours_worked >= 0),
    base_salary_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (base_salary_amount >= 0),
    overtime_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (overtime_amount >= 0),
    bonuses_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (bonuses_amount >= 0),
    deductions_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (deductions_amount >= 0),
    advances_deducted NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (advances_deducted >= 0),
    net_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (net_paid >= 0),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'transfer' CHECK (payment_method IN ('cash', 'transfer', 'cheque')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 9. إعدادات منظومة الإيصال الإلكتروني لمصلحة الضرائب (ETA Tax Settings)
-- =============================================================================

CREATE TABLE IF NOT EXISTS tax_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    eta_sync_enabled BOOLEAN NOT NULL DEFAULT false,
    environment VARCHAR(20) NOT NULL DEFAULT 'preprod' CHECK (environment IN ('preprod', 'production')),
    client_id TEXT,
    client_secret TEXT,
    tax_registration_number VARCHAR(50),
    pos_serial VARCHAR(50),
    branch_code VARCHAR(50) NOT NULL DEFAULT '0',
    pos_os_version VARCHAR(100) DEFAULT 'Windows',
    remote_signer_url TEXT,
    remote_signer_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tax_settings ADD COLUMN IF NOT EXISTS eta_sync_enabled BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- 10. طابور مزامنة الفواتير الضريبية (ETA Sync Queue)
-- =============================================================================

CREATE TABLE IF NOT EXISTS eta_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'synced', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    error_log TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Indexes for High Performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_egs_code ON services(egs_code);
CREATE INDEX IF NOT EXISTS idx_service_recipes_service_id ON service_recipes(service_id);
CREATE INDEX IF NOT EXISTS idx_service_recipes_inventory_id ON service_recipes(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_service_id ON orders(service_id);
CREATE INDEX IF NOT EXISTS idx_orders_employee_id ON orders(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_eta_status ON orders(eta_status);
CREATE INDEX IF NOT EXISTS idx_orders_eta_uuid ON orders(eta_uuid);
CREATE INDEX IF NOT EXISTS idx_eta_sync_queue_status_retry ON eta_sync_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_emp_trans_emp_status ON employee_transactions(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_payouts_emp_period ON payroll_payouts(employee_id, period_start, period_end);

-- =============================================================================
-- Triggers for automatic updated_at
-- =============================================================================

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_services_updated_at ON services;
CREATE TRIGGER trg_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_service_recipes_updated_at ON service_recipes;
CREATE TRIGGER trg_service_recipes_updated_at
    BEFORE UPDATE ON service_recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_tax_settings_updated_at ON tax_settings;
CREATE TRIGGER trg_tax_settings_updated_at
    BEFORE UPDATE ON tax_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_eta_sync_queue_updated_at ON eta_sync_queue;
CREATE TRIGGER trg_eta_sync_queue_updated_at
    BEFORE UPDATE ON eta_sync_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 11. إعدادات النظام ومظهر شاشة الكاشير (System Settings & POS Appearance)
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pos_background_url TEXT,
    pos_background_type VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (pos_background_type IN ('none', 'image', 'video')),
    pos_background_opacity NUMERIC(3, 2) NOT NULL DEFAULT 0.25 CHECK (pos_background_opacity >= 0.0 AND pos_background_opacity <= 1.0),
    primary_color TEXT DEFAULT '#06b6d4',
    secondary_color TEXT DEFAULT '#3b82f6',
    accent_color TEXT DEFAULT '#10b981',
    card_bg_color TEXT DEFAULT 'rgba(15, 23, 42, 0.75)',
    border_color TEXT DEFAULT 'rgba(51, 65, 85, 0.6)',
    app_bg_color TEXT DEFAULT '#090d16',
    header_bg_color TEXT DEFAULT 'rgba(15, 23, 42, 0.85)',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#06b6d4';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#3b82f6';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#10b981';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS card_bg_color TEXT DEFAULT 'rgba(15, 23, 42, 0.75)';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS border_color TEXT DEFAULT 'rgba(51, 65, 85, 0.6)';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS app_bg_color TEXT DEFAULT '#090d16';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS header_bg_color TEXT DEFAULT 'rgba(15, 23, 42, 0.85)';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS admin_pin TEXT DEFAULT '1234';

INSERT INTO system_settings (pos_background_type, pos_background_opacity, primary_color, secondary_color, accent_color, card_bg_color, border_color, app_bg_color, header_bg_color, admin_pin)
SELECT 'none', 0.25, '#06b6d4', '#3b82f6', '#10b981', 'rgba(15, 23, 42, 0.75)', 'rgba(51, 65, 85, 0.6)', '#090d16', 'rgba(15, 23, 42, 0.85)', '1234'
WHERE NOT EXISTS (SELECT 1 FROM system_settings);

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON system_settings;
CREATE TRIGGER trg_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 12. المصروفات التشغيلية والتكاليف الشهرية (Operational Expenses & Costs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'إيجار' CHECK (category IN ('إيجار', 'كهرباء ومياه', 'صيانة ومعدات', 'أدوات ومواد نظافة', 'بوفيه ومصاريف إدارية', 'ضرائب ورسوم', 'أخرى')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer')),
    receipt_reference VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
