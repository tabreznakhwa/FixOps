-- ============================================================
-- FixOps Maintenance Management System
-- Complete Multi-Tenant Database Schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
  'owner', 'admin', 'manager', 'call_center', 'technician', 'accounts', 'hr', 'store'
);

CREATE TYPE user_status AS ENUM ('pending', 'active', 'inactive', 'rejected');

CREATE TYPE customer_type AS ENUM ('individual', 'company', 'amc', 'one_time', 'credit');

CREATE TYPE customer_status AS ENUM ('active', 'inactive', 'blacklisted');

CREATE TYPE complaint_source AS ENUM ('customer_portal', 'phone', 'whatsapp', 'email', 'admin_entry', 'walk_in');

CREATE TYPE service_category AS ENUM ('ac_maintenance', 'plumbing', 'electrical', 'general', 'emergency', 'amc_visit', 'installation', 'inspection', 'quotation');

CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'emergency');

CREATE TYPE complaint_status AS ENUM (
  'new', 'under_review', 'assigned', 'accepted', 'on_the_way',
  'work_started', 'waiting_parts', 'waiting_approval', 'completed',
  'verified', 'invoiced', 'paid', 'cancelled', 'reopened'
);

CREATE TYPE work_order_status AS ENUM (
  'new', 'assigned', 'accepted', 'on_the_way', 'work_started',
  'waiting_parts', 'waiting_approval', 'completed', 'verified',
  'invoiced', 'paid', 'cancelled'
);

CREATE TYPE payment_status AS ENUM ('unpaid', 'partial', 'paid', 'overdue', 'written_off');

CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled', 'written_off');

CREATE TYPE payment_mode AS ENUM ('cash', 'bank_transfer', 'card', 'pos', 'cheque', 'online', 'other');

CREATE TYPE amc_contract_status AS ENUM ('active', 'expired', 'cancelled', 'pending_renewal');

CREATE TYPE billing_frequency AS ENUM ('monthly', 'quarterly', 'half_yearly', 'yearly');

CREATE TYPE inventory_transaction_type AS ENUM ('purchase', 'issued', 'returned', 'damaged', 'adjustment', 'transfer');

CREATE TYPE purchase_order_status AS ENUM ('draft', 'submitted', 'received', 'partial', 'cancelled');

CREATE TYPE asset_condition AS ENUM ('excellent', 'good', 'fair', 'poor', 'out_of_service');

CREATE TYPE asset_status AS ENUM ('available', 'assigned', 'maintenance', 'disposed');

CREATE TYPE employment_status AS ENUM ('active', 'on_leave', 'terminated', 'resigned');

CREATE TYPE salary_run_status AS ENUM ('draft', 'approved', 'paid');

CREATE TYPE eos_status AS ENUM ('pending', 'approved', 'paid');

CREATE TYPE ledger_entry_type AS ENUM ('invoice', 'payment', 'credit_note', 'advance', 'refund', 'write_off', 'adjustment');

CREATE TYPE subscription_plan_name AS ENUM ('starter', 'professional', 'enterprise');

CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'cancelled', 'expired');

-- ============================================================
-- ORGANIZATIONS (Multi-Tenant Core)
-- ============================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'UAE',
  currency TEXT DEFAULT 'AED',
  timezone TEXT DEFAULT 'Asia/Dubai',
  vat_number TEXT,
  vat_rate DECIMAL(5,2) DEFAULT 5.00,
  language TEXT DEFAULT 'en',
  working_days TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBSCRIPTION PLANS
-- ============================================================

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name subscription_plan_name NOT NULL,
  display_name TEXT NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2) NOT NULL,
  max_users INTEGER,
  max_complaints_per_month INTEGER,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status subscription_status DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role user_role DEFAULT 'call_center',
  status user_status DEFAULT 'pending',
  avatar_url TEXT,
  language TEXT DEFAULT 'en',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_code TEXT NOT NULL,
  customer_type customer_type DEFAULT 'individual',
  full_name TEXT NOT NULL,
  company_name TEXT,
  contact_person TEXT,
  mobile_number TEXT NOT NULL,
  whatsapp_number TEXT,
  email TEXT,
  address TEXT,
  building_number TEXT,
  area TEXT,
  city TEXT,
  map_location_url TEXT,
  vat_number TEXT,
  payment_terms INTEGER DEFAULT 0,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  advance_balance DECIMAL(12,2) DEFAULT 0,
  status customer_status DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, customer_code)
);

-- ============================================================
-- COMPLAINTS / SERVICE REQUESTS
-- ============================================================

CREATE TABLE complaints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  complaint_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  complaint_source complaint_source DEFAULT 'admin_entry',
  service_category service_category NOT NULL,
  priority priority_level DEFAULT 'medium',
  description TEXT NOT NULL,
  preferred_date DATE,
  preferred_time TIME,
  location TEXT,
  status complaint_status DEFAULT 'new',
  assigned_to UUID REFERENCES users(id),
  work_order_id UUID,
  resolution_notes TEXT,
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, complaint_number)
);

CREATE TABLE complaint_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE complaint_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  old_status complaint_status,
  new_status complaint_status NOT NULL,
  notes TEXT,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SERVICE CATALOG
-- ============================================================

CREATE TABLE service_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_category service_category NOT NULL,
  service_name TEXT NOT NULL,
  description TEXT,
  default_price DECIMAL(10,2) DEFAULT 0,
  minimum_charge DECIMAL(10,2) DEFAULT 0,
  labour_charge DECIMAL(10,2) DEFAULT 0,
  visit_charge DECIMAL(10,2) DEFAULT 0,
  estimated_hours DECIMAL(4,2),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WORK ORDERS
-- ============================================================

CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_number TEXT NOT NULL,
  complaint_id UUID REFERENCES complaints(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  service_category service_category,
  assigned_to UUID REFERENCES users(id),
  scheduled_date DATE,
  scheduled_time TIME,
  priority priority_level DEFAULT 'medium',
  job_description TEXT,
  estimated_amount DECIMAL(12,2) DEFAULT 0,
  labour_charge DECIMAL(12,2) DEFAULT 0,
  visit_charge DECIMAL(12,2) DEFAULT 0,
  parts_charge DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  final_amount DECIMAL(12,2) DEFAULT 0,
  status work_order_status DEFAULT 'new',
  payment_status payment_status DEFAULT 'unpaid',
  completion_notes TEXT,
  customer_signature_url TEXT,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  invoice_id UUID,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, work_order_number)
);

CREATE TABLE work_order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  old_status work_order_status,
  new_status work_order_status NOT NULL,
  notes TEXT,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE work_order_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('before', 'after', 'during', 'other')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  notes TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVENTORY
-- ============================================================

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  unit_of_measure TEXT DEFAULT 'pcs',
  current_stock DECIMAL(12,3) DEFAULT 0,
  minimum_stock_level DECIMAL(12,3) DEFAULT 0,
  purchase_price DECIMAL(12,2) DEFAULT 0,
  selling_price DECIMAL(12,2) DEFAULT 0,
  storage_location TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, item_code)
);

CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  transaction_type inventory_transaction_type NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,2) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  stock_before DECIMAL(12,3) DEFAULT 0,
  stock_after DECIMAL(12,3) DEFAULT 0,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE work_order_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) DEFAULT 0,
  total_price DECIMAL(12,2) DEFAULT 0,
  issued_by UUID REFERENCES users(id),
  used_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUPPLIERS
-- ============================================================

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_code TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  contact_person TEXT,
  mobile_number TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  vat_number TEXT,
  payment_terms INTEGER DEFAULT 0,
  opening_balance DECIMAL(12,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, supplier_code)
);

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  status purchase_order_status DEFAULT 'draft',
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  balance_due DECIMAL(12,2) DEFAULT 0,
  payment_status payment_status DEFAULT 'unpaid',
  supplier_invoice_number TEXT,
  notes TEXT,
  attachment_url TEXT,
  received_by UUID REFERENCES users(id),
  received_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, po_number)
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES inventory_items(id),
  description TEXT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  total_cost DECIMAL(12,2) NOT NULL,
  quantity_received DECIMAL(12,3) DEFAULT 0
);

CREATE TABLE supplier_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_paid DECIMAL(12,2) NOT NULL,
  payment_mode payment_mode DEFAULT 'bank_transfer',
  reference_number TEXT,
  notes TEXT,
  paid_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AMC CONTRACTS
-- ============================================================

CREATE TABLE amc_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  contract_type TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  contract_amount DECIMAL(12,2) NOT NULL,
  billing_frequency billing_frequency DEFAULT 'yearly',
  services_included TEXT[],
  visits_included INTEGER DEFAULT 0,
  visits_used INTEGER DEFAULT 0,
  parts_included BOOLEAN DEFAULT false,
  payment_terms INTEGER DEFAULT 0,
  status amc_contract_status DEFAULT 'active',
  renewal_reminder_date DATE,
  document_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, contract_number)
);

-- ============================================================
-- ASSETS
-- ============================================================

CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_code TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  category TEXT NOT NULL,
  serial_number TEXT,
  purchase_date DATE,
  purchase_cost DECIMAL(12,2) DEFAULT 0,
  assigned_to UUID REFERENCES users(id),
  location TEXT,
  condition asset_condition DEFAULT 'good',
  warranty_expiry DATE,
  service_due_date DATE,
  status asset_status DEFAULT 'available',
  notes TEXT,
  document_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, asset_code)
);

-- ============================================================
-- STAFF / HR
-- ============================================================

CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  staff_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  mobile_number TEXT,
  emergency_contact TEXT,
  department TEXT,
  designation TEXT,
  joining_date DATE NOT NULL,
  employment_status employment_status DEFAULT 'active',
  basic_salary DECIMAL(12,2) DEFAULT 0,
  housing_allowance DECIMAL(12,2) DEFAULT 0,
  transport_allowance DECIMAL(12,2) DEFAULT 0,
  other_allowance DECIMAL(12,2) DEFAULT 0,
  overtime_eligible BOOLEAN DEFAULT true,
  overtime_rate DECIMAL(5,2) DEFAULT 1.5,
  labour_card_number TEXT,
  emirates_id TEXT,
  passport_number TEXT,
  visa_expiry_date DATE,
  bank_name TEXT,
  bank_account_number TEXT,
  iban TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, staff_code)
);

CREATE TABLE overtime_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  overtime_date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL,
  rate DECIMAL(10,2),
  amount DECIMAL(12,2),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE salary_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  salary_month INTEGER NOT NULL CHECK (salary_month BETWEEN 1 AND 12),
  salary_year INTEGER NOT NULL,
  status salary_run_status DEFAULT 'draft',
  total_basic DECIMAL(12,2) DEFAULT 0,
  total_allowances DECIMAL(12,2) DEFAULT 0,
  total_overtime DECIMAL(12,2) DEFAULT 0,
  total_deductions DECIMAL(12,2) DEFAULT 0,
  total_net DECIMAL(12,2) DEFAULT 0,
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, salary_month, salary_year)
);

CREATE TABLE salary_slips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  salary_run_id UUID NOT NULL REFERENCES salary_runs(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  basic_salary DECIMAL(12,2) DEFAULT 0,
  housing_allowance DECIMAL(12,2) DEFAULT 0,
  transport_allowance DECIMAL(12,2) DEFAULT 0,
  other_allowance DECIMAL(12,2) DEFAULT 0,
  overtime_amount DECIMAL(12,2) DEFAULT 0,
  gross_salary DECIMAL(12,2) DEFAULT 0,
  deductions DECIMAL(12,2) DEFAULT 0,
  advance_deduction DECIMAL(12,2) DEFAULT 0,
  net_salary DECIMAL(12,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  payment_mode payment_mode,
  payment_date DATE,
  slip_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE end_of_service (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  joining_date DATE NOT NULL,
  last_working_date DATE NOT NULL,
  basic_salary DECIMAL(12,2) NOT NULL,
  service_years DECIMAL(5,2),
  gratuity_amount DECIMAL(12,2) DEFAULT 0,
  leave_encashment DECIMAL(12,2) DEFAULT 0,
  deductions DECIMAL(12,2) DEFAULT 0,
  final_settlement_amount DECIMAL(12,2) DEFAULT 0,
  status eos_status DEFAULT 'pending',
  notes TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FINANCE - QUOTATIONS
-- ============================================================

CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quotation_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  work_order_id UUID REFERENCES work_orders(id),
  quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'converted')),
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  terms_and_conditions TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, quotation_number)
);

-- ============================================================
-- FINANCE - INVOICES
-- ============================================================

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  work_order_id UUID REFERENCES work_orders(id),
  amc_contract_id UUID REFERENCES amc_contracts(id),
  quotation_id UUID REFERENCES quotations(id),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  invoice_type TEXT DEFAULT 'service' CHECK (invoice_type IN ('service', 'amc', 'parts', 'advance', 'credit_note')),
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  balance_due DECIMAL(12,2) DEFAULT 0,
  status invoice_status DEFAULT 'draft',
  terms_and_conditions TEXT,
  notes TEXT,
  cancelled_reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, invoice_number)
);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(12,3) DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  total_price DECIMAL(12,2) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  sort_order INTEGER DEFAULT 0
);

-- ============================================================
-- FINANCE - PAYMENTS
-- ============================================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_id UUID REFERENCES invoices(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_received DECIMAL(12,2) NOT NULL,
  payment_mode payment_mode NOT NULL,
  reference_number TEXT,
  is_advance BOOLEAN DEFAULT false,
  advance_used_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  is_cancelled BOOLEAN DEFAULT false,
  cancelled_reason TEXT,
  cancelled_by UUID REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  received_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, payment_number)
);

-- ============================================================
-- CUSTOMER LEDGER
-- ============================================================

CREATE TABLE customer_ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type ledger_entry_type NOT NULL,
  debit_amount DECIMAL(12,2) DEFAULT 0,
  credit_amount DECIMAL(12,2) DEFAULT 0,
  running_balance DECIMAL(12,2) DEFAULT 0,
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  module_name TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEQUENCES FOR NUMBERING
-- ============================================================

CREATE TABLE organization_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sequence_type TEXT NOT NULL,
  prefix TEXT DEFAULT '',
  last_number INTEGER DEFAULT 0,
  UNIQUE(organization_id, sequence_type)
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_customers_org ON customers(organization_id);
CREATE INDEX idx_customers_mobile ON customers(mobile_number);
CREATE INDEX idx_complaints_org ON complaints(organization_id);
CREATE INDEX idx_complaints_customer ON complaints(customer_id);
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_created ON complaints(created_at DESC);
CREATE INDEX idx_work_orders_org ON work_orders(organization_id);
CREATE INDEX idx_work_orders_customer ON work_orders(customer_id);
CREATE INDEX idx_work_orders_assigned ON work_orders(assigned_to);
CREATE INDEX idx_work_orders_status ON work_orders(status);
CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_ledger_customer ON customer_ledger_entries(customer_id);
CREATE INDEX idx_ledger_org ON customer_ledger_entries(organization_id);
CREATE INDEX idx_inventory_org ON inventory_items(organization_id);
CREATE INDEX idx_inventory_txn_item ON inventory_transactions(item_id);
CREATE INDEX idx_audit_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_amc_customer ON amc_contracts(customer_id);
CREATE INDEX idx_amc_status ON amc_contracts(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE end_of_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_sequences ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS HELPER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_user_active()
RETURNS BOOLEAN AS $$
  SELECT status = 'active' FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- RLS POLICIES - Organization isolation
-- ============================================================

-- Users can see members of their own organization
CREATE POLICY "users_org_isolation" ON users
  FOR ALL USING (organization_id = get_user_organization_id());

-- Customers isolated by org
CREATE POLICY "customers_org_isolation" ON customers
  FOR ALL USING (organization_id = get_user_organization_id());

-- Complaints isolated by org; technician sees only assigned
CREATE POLICY "complaints_org_isolation" ON complaints
  FOR ALL USING (
    organization_id = get_user_organization_id()
    AND (
      get_user_role() != 'technician'
      OR assigned_to = auth.uid()
    )
  );

CREATE POLICY "complaint_attachments_org" ON complaint_attachments
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "complaint_history_org" ON complaint_status_history
  FOR ALL USING (organization_id = get_user_organization_id());

-- Work orders isolated by org; technician sees only assigned
CREATE POLICY "work_orders_org_isolation" ON work_orders
  FOR ALL USING (
    organization_id = get_user_organization_id()
    AND (
      get_user_role() != 'technician'
      OR assigned_to = auth.uid()
    )
  );

CREATE POLICY "work_order_history_org" ON work_order_status_history
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "work_order_photos_org" ON work_order_photos
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "work_order_parts_org" ON work_order_parts
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "service_catalog_org" ON service_catalog
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "inventory_items_org" ON inventory_items
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "inventory_txn_org" ON inventory_transactions
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "suppliers_org" ON suppliers
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "purchase_orders_org" ON purchase_orders
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "purchase_order_items_org" ON purchase_order_items
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "supplier_payments_org" ON supplier_payments
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "amc_contracts_org" ON amc_contracts
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "assets_org" ON assets
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "staff_org" ON staff
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "overtime_org" ON overtime_entries
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "salary_runs_org" ON salary_runs
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "salary_slips_org" ON salary_slips
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "eos_org" ON end_of_service
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "quotations_org" ON quotations
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "invoices_org" ON invoices
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "invoice_items_org" ON invoice_items
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "payments_org" ON payments
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "ledger_org" ON customer_ledger_entries
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "audit_logs_org" ON audit_logs
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "sequences_org" ON organization_sequences
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY "org_self" ON organizations
  FOR ALL USING (id = get_user_organization_id());

-- ============================================================
-- FUNCTIONS - Auto-generate sequential numbers
-- ============================================================

CREATE OR REPLACE FUNCTION generate_sequence_number(
  p_org_id UUID,
  p_type TEXT,
  p_prefix TEXT DEFAULT ''
) RETURNS TEXT AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO organization_sequences (organization_id, sequence_type, prefix, last_number)
  VALUES (p_org_id, p_type, p_prefix, 1)
  ON CONFLICT (organization_id, sequence_type)
  DO UPDATE SET last_number = organization_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN p_prefix || LPAD(v_next::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTIONS - Customer ledger trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_customer_ledger_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_prev_balance DECIMAL(12,2) DEFAULT 0;
BEGIN
  SELECT COALESCE(running_balance, 0) INTO v_prev_balance
  FROM customer_ledger_entries
  WHERE customer_id = NEW.customer_id
    AND organization_id = NEW.organization_id
    AND created_at < NEW.created_at
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  NEW.running_balance := v_prev_balance + NEW.debit_amount - NEW.credit_amount;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_balance
BEFORE INSERT ON customer_ledger_entries
FOR EACH ROW EXECUTE FUNCTION update_customer_ledger_balance();

-- ============================================================
-- FUNCTIONS - Invoice payment balance
-- ============================================================

CREATE OR REPLACE FUNCTION update_invoice_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET
    amount_paid = (
      SELECT COALESCE(SUM(amount_received), 0)
      FROM payments
      WHERE invoice_id = NEW.invoice_id
        AND is_cancelled = false
    ),
    balance_due = total_amount - (
      SELECT COALESCE(SUM(amount_received), 0)
      FROM payments
      WHERE invoice_id = NEW.invoice_id
        AND is_cancelled = false
    ),
    status = CASE
      WHEN total_amount <= (
        SELECT COALESCE(SUM(amount_received), 0)
        FROM payments WHERE invoice_id = NEW.invoice_id AND is_cancelled = false
      ) THEN 'paid'
      WHEN (
        SELECT COALESCE(SUM(amount_received), 0)
        FROM payments WHERE invoice_id = NEW.invoice_id AND is_cancelled = false
      ) > 0 THEN 'partial'
      ELSE status
    END
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_balance
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW
WHEN (NEW.invoice_id IS NOT NULL)
EXECUTE FUNCTION update_invoice_balance();

-- ============================================================
-- FUNCTIONS - Inventory stock update
-- ============================================================

CREATE OR REPLACE FUNCTION update_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory_items
  SET current_stock = (
    SELECT COALESCE(
      SUM(CASE
        WHEN transaction_type IN ('purchase', 'returned', 'adjustment') THEN quantity
        WHEN transaction_type IN ('issued', 'damaged', 'transfer') THEN -quantity
        ELSE 0
      END), 0
    )
    FROM inventory_transactions
    WHERE item_id = NEW.item_id
  ),
  updated_at = NOW()
  WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_stock
AFTER INSERT ON inventory_transactions
FOR EACH ROW EXECUTE FUNCTION update_inventory_stock();

-- ============================================================
-- SEED DATA - Subscription Plans
-- ============================================================

INSERT INTO subscription_plans (name, display_name, price_monthly, price_yearly, max_users, max_complaints_per_month, features) VALUES
('starter', 'Starter', 149.00, 1490.00, 5, 200, '{"modules": ["complaints", "customers", "work_orders"]}'),
('professional', 'Professional', 399.00, 3990.00, 20, NULL, '{"modules": ["complaints", "customers", "work_orders", "finance", "inventory", "amc", "reports"]}'),
('enterprise', 'Enterprise', 999.00, 9990.00, NULL, NULL, '{"modules": ["all"], "custom_domain": true, "api_access": true, "priority_support": true}');
