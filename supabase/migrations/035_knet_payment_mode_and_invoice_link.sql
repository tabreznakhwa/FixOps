-- KNET purchase invoices have always been accepted at the invoice level
-- (purchase_invoices.payment_mode allows it), but the shared payment_mode
-- ENUM that supplier_payments/salary_slips use does not — so every KNET
-- purchase invoice's ledger entry has been silently failing to insert
-- since the payment_mode column was introduced. Confirmed live on
-- PINV00120: invoice saved fine, current_stock updated fine, but no
-- supplier_payments row was ever created.
alter type payment_mode add value if not exists 'knet';

-- supplier_payments has never referenced the purchase_invoices row that
-- generated it — only a free-text notes string ("Purchase Invoice
-- PINV00120"). That made it impossible for an invoice edit to find and
-- correct its own ledger row. Add a real link, nullable for old rows.
alter table supplier_payments
  add column if not exists purchase_invoice_id uuid references purchase_invoices(id);
