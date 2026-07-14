-- ============================================================
-- 025: Supplier Advances
-- ============================================================

-- Extend the payment_mode enum to include 'advance' for traceability rows
ALTER TYPE payment_mode ADD VALUE IF NOT EXISTS 'advance';

-- Supplier advances table
CREATE TABLE public.supplier_advances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  advance_number TEXT NOT NULL,
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(12,3) NOT NULL CHECK (amount > 0),
  amount_utilized DECIMAL(12,3) NOT NULL DEFAULT 0,
  balance DECIMAL(12,3) NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'bank_transfer',
  reference_number TEXT,
  notes TEXT,
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  paid_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, advance_number)
);

CREATE INDEX ON public.supplier_advances(organization_id, supplier_id);

GRANT SELECT, INSERT, UPDATE ON public.supplier_advances TO authenticated;

-- Link supplier_payments to supplier_advances for traceability
ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS supplier_advance_id UUID REFERENCES public.supplier_advances(id);
