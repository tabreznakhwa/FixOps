-- ============================================================================
-- 061_customer_payment_settlement_discount.sql
-- Customer per-invoice settlement discount: lets a cash receipt against an
-- invoice carry a nonnegative settlement discount component, mirroring the
-- existing supplier settlement discount model (record_supplier_payment /
-- cancel_supplier_payment) on the AR side.
--
-- payments.discount_amount is a new protected posting-metadata-adjacent
-- column. A settlement can now post up to two AR credit events for one
-- payment row: the cash receipt (source_type 'payment') and the discount
-- adjustment (source_type 'customer_payment_discount'), exactly as a supplier
-- settlement posts 'supplier_payment' and 'supplier_payment_discount'. Both
-- components share the payment row's posting_batch_id; the first component
-- created carries the payment row's own posting_sequence.
--
-- record_customer_payment gains a 12th parameter, p_discount_amount, placed
-- after p_is_advance and defaulted to zero so existing 11-input calls can resolve
-- to the new signature during a coordinated migration/application rollout. The
-- old 11-input overload is dropped explicitly rather than left callable.
-- Every other validation, lock order, technician rule and work-order rule
-- from migration 060 is preserved unchanged.
--
-- apply_customer_advance and cancel_customer_payment are replaced in place
-- (unchanged signatures) so every invoice-paid recompute sums cash plus
-- discount, and so cancellation reverses whichever one or two live posting
-- components a settlement actually created, validated exactly against their
-- recorded amounts the same way cancel_supplier_payment already does.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. payments.discount_amount
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists discount_amount numeric(13,3) not null default 0;

alter table public.payments
  drop constraint if exists payments_discount_amount_check,
  add constraint payments_discount_amount_check check (
    discount_amount <> 'NaN'::numeric
    and discount_amount >= 0
    and scale(discount_amount) <= 3
  );

-- ---------------------------------------------------------------------------
-- 2. Recreate the posted-payment guard trigger, now also protecting discount
-- ---------------------------------------------------------------------------

drop trigger if exists trg_guard_posted_payment on public.payments;
create trigger trg_guard_posted_payment before update or delete on public.payments
  for each row execute function public.guard_posted_accounting_source(
    'customer_id', 'invoice_id', 'work_order_id', 'opening_receivable_id',
    'payment_date', 'amount_received', 'discount_amount', 'payment_mode',
    'reference_number', 'notes', 'is_advance', 'advance_used_amount',
    'is_cancelled', 'cancelled_reason', 'cancelled_by', 'cancelled_at',
    'reversal_posting_id'
  );

-- ---------------------------------------------------------------------------
-- 3. record_customer_payment: drop the old 11-input overload, add discount
-- ---------------------------------------------------------------------------

drop function if exists public.record_customer_payment(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, text, boolean
);

create or replace function public.record_customer_payment(
  p_org_id uuid,
  p_actor_id uuid,
  p_customer_id uuid,
  p_invoice_id uuid,
  p_work_order_id uuid,
  p_payment_date date,
  p_amount_received numeric,
  p_payment_mode text,
  p_reference_number text,
  p_notes text,
  p_is_advance boolean,
  p_discount_amount numeric default 0
)
returns table(payment_id uuid, payment_number text, posting_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw_date date := (now() at time zone 'Asia/Kuwait')::date;
  v_payment_number text;
  v_payment_id uuid;
  v_posting_id uuid;
  v_discount_posting_id uuid;
  v_seq bigint;
  v_source_seq bigint;
  v_discount_seq bigint;
  v_batch_id text := gen_random_uuid()::text;
  v_customer_ok boolean;
  v_customer_name text;
  v_invoice invoices%rowtype;
  v_total_paid numeric;
  v_new_status public.invoice_status;
  v_work_order_id uuid := p_work_order_id;
  v_work_order work_orders%rowtype;
  v_actor_role text;
  v_discount numeric := coalesce(p_discount_amount, 0);
  v_settlement numeric;
begin
  select u.role::text
  into v_actor_role
  from public.users u
  where u.id = p_actor_id
    and u.organization_id = p_org_id
    and u.status = 'active';

  if not found then
    raise exception 'Only an authorized organization member can perform this action';
  end if;

  -- Validate the numeric inputs before any role-specific comparison. PostgreSQL
  -- treats NaN as greater than ordinary numeric values, so these explicit checks
  -- prevent NaN from bypassing nonnegative/balance guards or reaching postings.
  if p_amount_received is null
     or p_amount_received = 'NaN'::numeric
     or p_amount_received < 0
     or scale(p_amount_received) > 3 then
    raise exception 'Cash amount must be nonnegative with at most 3 decimal places';
  end if;
  if v_discount = 'NaN'::numeric
     or v_discount < 0
     or scale(v_discount) > 3 then
    raise exception 'Discount must be nonnegative with at most 3 decimal places';
  end if;

  if v_actor_role = 'technician' then
    if p_payment_mode is distinct from 'cash' then
      raise exception 'Technicians may only collect cash payments';
    end if;
    if coalesce(p_is_advance, false) then
      raise exception 'Technicians cannot record customer advances';
    end if;
    if p_work_order_id is null then
      raise exception 'Technician payments must be linked to a work order';
    end if;
    if v_discount > 0 then
      raise exception 'Technicians cannot record a settlement discount';
    end if;
  else
    perform public.assert_accounting_actor(
      p_org_id, p_actor_id, array['owner', 'admin', 'manager', 'accounts']
    );
  end if;

  perform set_config('fixops.allow_accounting_lifecycle_write', 'true', true);

  if p_customer_id is null then
    raise exception 'Customer is required';
  end if;
  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;
  if p_invoice_id is null and p_work_order_id is null
     and not coalesce(p_is_advance, false) then
    raise exception 'Unallocated customer receipts must be recorded as advances';
  end if;
  if coalesce(p_is_advance, false)
     and (p_invoice_id is not null or p_work_order_id is not null) then
    raise exception 'Customer advances must be recorded without an invoice or work order allocation';
  end if;
  if p_payment_date > v_kw_date then
    raise exception 'Payment date cannot be in the future';
  end if;
  v_settlement := p_amount_received + v_discount;
  if v_settlement <= 0 then
    raise exception 'Amount must be greater than zero with at most 3 decimal places';
  end if;
  if p_payment_mode is null
     or p_payment_mode not in ('cash', 'bank_transfer', 'card', 'pos', 'cheque', 'online', 'other', 'knet') then
    raise exception 'Payment mode is invalid';
  end if;

  -- A settlement discount only ever reduces a specific posted invoice's
  -- balance; it is forbidden for advances and for any invoice-less receipt
  -- (a work order without an invoice, or any other unallocated/opening-style
  -- receipt this function does not accept an opening-source argument for).
  if v_discount > 0 then
    if coalesce(p_is_advance, false) then
      raise exception 'Customer advances cannot include a settlement discount';
    end if;
    if p_invoice_id is null then
      raise exception 'A settlement discount requires an invoice';
    end if;
  end if;

  select coalesce(nullif(c.company_name, ''), c.full_name, c.id::text)
  into v_customer_name
  from public.customers c
  where c.id = p_customer_id
    and c.organization_id = p_org_id;

  v_customer_ok := found;
  if not v_customer_ok then
    raise exception 'Customer does not belong to this organization';
  end if;

  -- Shared lock order for customer settlement workflows: invoice, work order,
  -- then the posting-sequence advisory lock.
  if p_invoice_id is not null then
    select * into v_invoice
    from public.invoices i
    where i.id = p_invoice_id and i.organization_id = p_org_id
    for update;

    if not found then
      raise exception 'Invoice does not belong to this organization';
    end if;
    if v_invoice.customer_id <> p_customer_id then
      raise exception 'Invoice does not belong to this customer';
    end if;
    if v_invoice.posting_sequence is null
       or v_invoice.status in ('draft', 'cancelled', 'written_off', 'paid') then
      raise exception 'Payments require a posted invoice with an outstanding balance';
    end if;
    if v_settlement > v_invoice.balance_due then
      raise exception 'Payment exceeds invoice balance; record any excess separately as an advance';
    end if;
    if p_work_order_id is not null and v_invoice.work_order_id is distinct from p_work_order_id then
      raise exception 'Invoice does not belong to this work order';
    end if;
    v_work_order_id := v_invoice.work_order_id;
  end if;

  if v_work_order_id is not null then
    select * into v_work_order
    from public.work_orders wo
    where wo.id = v_work_order_id and wo.organization_id = p_org_id
    for update;

    if not found then
      raise exception 'Work order does not belong to this organization';
    end if;
    if v_work_order.customer_id is distinct from p_customer_id then
      raise exception 'Work order does not belong to this customer';
    end if;
    if v_actor_role = 'technician'
       and v_work_order.assigned_to is distinct from p_actor_id
       and not exists (
         select 1
         from public.staff s
         where s.id = v_work_order.assigned_staff_id
           and s.organization_id = p_org_id
           and s.user_id = p_actor_id
           and s.employment_status = 'active'
       ) then
      raise exception 'Technician is not assigned to this work order';
    end if;

    if p_invoice_id is null then
      if coalesce(v_work_order.final_amount, 0) <= 0 then
        raise exception 'Set a positive work order total before collecting payment';
      end if;

      select coalesce(sum(p.amount_received), 0)
      into v_total_paid
      from public.payments p
      where p.organization_id = p_org_id
        and p.work_order_id = v_work_order_id
        and p.invoice_id is null
        and p.is_cancelled = false
        and p.is_advance = false;

      if v_total_paid + p_amount_received > v_work_order.final_amount then
        raise exception 'Payment exceeds the work order amount';
      end if;
    end if;
  end if;

  v_payment_number := public.generate_sequence_number(p_org_id, 'payment', 'PMT');
  v_source_seq := public.next_posting_sequence(p_org_id);
  v_seq := v_source_seq;

  insert into public.payments (
    organization_id, payment_number, customer_id, invoice_id, work_order_id,
    payment_date, amount_received, discount_amount, payment_mode,
    reference_number, notes, is_advance, advance_used_amount, is_cancelled,
    received_by, posting_date, posting_sequence, posted_at, posted_by,
    posting_batch_id, posting_provenance
  ) values (
    p_org_id, v_payment_number, p_customer_id, p_invoice_id, v_work_order_id,
    p_payment_date, p_amount_received, v_discount, p_payment_mode::public.payment_mode,
    nullif(btrim(p_reference_number), ''), nullif(btrim(p_notes), ''),
    coalesce(p_is_advance, false), 0, false, p_actor_id,
    v_kw_date, v_source_seq, now(), p_actor_id, v_batch_id, 'live'
  )
  returning id into v_payment_id;

  -- Cash and discount are separate AR credit events for the same settlement.
  -- The first component created carries the payment row's own sequence.
  if p_amount_received > 0 then
    insert into public.accounting_postings (
      organization_id, ledger, party_id, party_name, posting_date, document_date,
      reference_number, description, posting_sequence, event_type, debit_amount,
      credit_amount, source_type, source_id, provenance, posted_at, posted_by,
      batch_id, notes
    ) values (
      p_org_id, 'ar', p_customer_id, v_customer_name, v_kw_date, p_payment_date,
      v_payment_number,
      case when coalesce(p_is_advance, false) then 'Advance ' else 'Payment ' end || v_payment_number,
      v_seq, case when coalesce(p_is_advance, false) then 'advance' else 'payment' end,
      0, p_amount_received, 'payment', v_payment_id, 'live', now(), p_actor_id,
      v_batch_id, nullif(btrim(p_notes), '')
    )
    returning id into v_posting_id;
  end if;

  if v_discount > 0 then
    v_discount_seq := case
      when p_amount_received > 0 then public.next_posting_sequence(p_org_id)
      else v_seq
    end;
    insert into public.accounting_postings (
      organization_id, ledger, party_id, party_name, posting_date, document_date,
      reference_number, description, posting_sequence, event_type, debit_amount,
      credit_amount, source_type, source_id, provenance, posted_at, posted_by,
      batch_id, notes
    ) values (
      p_org_id, 'ar', p_customer_id, v_customer_name, v_kw_date, p_payment_date,
      v_payment_number, 'Settlement Discount — Payment ' || v_payment_number,
      v_discount_seq, 'adjustment', 0, v_discount, 'customer_payment_discount',
      v_payment_id, 'live', now(), p_actor_id, v_batch_id, nullif(btrim(p_notes), '')
    )
    returning id into v_discount_posting_id;
    if v_posting_id is null then
      v_posting_id := v_discount_posting_id;
    end if;
  end if;

  -- Recompute every invoice snapshot from active allocations. Do not trust or
  -- increment the prior snapshot: it is a cache of the source rows, not truth.
  -- The snapshot is cash plus discount for every active direct payment, plus
  -- active advance allocations.
  if p_invoice_id is not null then
    select coalesce(sum(pp.amount_received + coalesce(pp.discount_amount, 0)), 0)
      + coalesce((
          select sum(a.amount)
          from public.customer_advance_allocations a
          join public.payments advance_payment on advance_payment.id = a.payment_id
          where a.invoice_id = p_invoice_id
            and advance_payment.is_cancelled = false
        ), 0)
    into v_total_paid
    from public.payments pp
    where pp.invoice_id = p_invoice_id
      and pp.is_cancelled = false;

    if v_total_paid < 0 or v_total_paid > v_invoice.total_amount then
      raise exception 'Invoice allocations do not reconcile to the invoice total';
    end if;

    v_new_status := case
      when v_total_paid = v_invoice.total_amount then 'paid'::public.invoice_status
      when v_total_paid > 0 then 'partial'::public.invoice_status
      else 'issued'::public.invoice_status
    end;

    update public.invoices
    set amount_paid = v_total_paid,
        balance_due = v_invoice.total_amount - v_total_paid,
        status = v_new_status,
        updated_at = now()
    where id = p_invoice_id;

    if v_work_order_id is not null then
      update public.work_orders
      set status = case when v_new_status = 'paid' then 'paid'::public.work_order_status else 'invoiced'::public.work_order_status end,
          payment_status = case
            when v_new_status = 'paid' then 'paid'::public.payment_status
            when v_new_status = 'partial' then 'partial'::public.payment_status
            else 'unpaid'::public.payment_status
          end
      where id = v_work_order_id;
    end if;
  elsif v_work_order_id is not null then
    select coalesce(sum(p.amount_received), 0)
    into v_total_paid
    from public.payments p
    where p.organization_id = p_org_id
      and p.work_order_id = v_work_order_id
      and p.invoice_id is null
      and p.is_cancelled = false
      and p.is_advance = false;

    update public.work_orders
    set payment_status = case
          when final_amount > 0 and v_total_paid >= final_amount then 'paid'::public.payment_status
          else 'partial'::public.payment_status
        end,
        updated_at = now()
    where id = v_work_order_id
      and organization_id = p_org_id;
  end if;

  return query select v_payment_id, v_payment_number, v_posting_id;
end;
$$;

revoke all on function public.record_customer_payment(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, text, boolean, numeric
) from public, anon, authenticated;
grant execute on function public.record_customer_payment(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, text, boolean, numeric
) to service_role;

-- ---------------------------------------------------------------------------
-- 4. apply_customer_advance: include discount in the invoice-paid recompute
-- ---------------------------------------------------------------------------

create or replace function public.apply_customer_advance(
  p_org_id uuid,
  p_actor_id uuid,
  p_payment_id uuid,
  p_invoice_id uuid
)
returns table(applied_amount numeric, balance_due numeric, invoice_status public.invoice_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments%rowtype;
  v_invoice invoices%rowtype;
  v_applied numeric;
  v_total_paid numeric;
  v_balance numeric;
  v_status public.invoice_status;
  v_existing_allocation uuid;
begin
  perform public.assert_accounting_actor(
    p_org_id, p_actor_id, array['owner', 'admin', 'manager']
  );
  perform set_config('fixops.allow_accounting_lifecycle_write', 'true', true);

  select * into v_payment
  from public.payments p
  where p.id = p_payment_id and p.organization_id = p_org_id
  for update;
  if not found then raise exception 'Advance payment not found'; end if;
  if v_payment.is_cancelled or not v_payment.is_advance then
    raise exception 'Payment is not an available customer advance';
  end if;

  select * into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = p_org_id
  for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.customer_id <> v_payment.customer_id then
    raise exception 'Advance and invoice customer do not match';
  end if;
  if v_payment.invoice_id is not null or v_payment.work_order_id is not null then
    raise exception 'Only an unallocated customer advance can be applied';
  end if;
  if v_invoice.posting_sequence is null
     or v_invoice.status in ('draft', 'cancelled', 'written_off') then
    raise exception 'Advance requires a posted, active invoice';
  end if;
  if v_invoice.balance_due <= 0 then raise exception 'Invoice is already fully paid'; end if;

  select a.id into v_existing_allocation
  from public.customer_advance_allocations a
  where a.organization_id = p_org_id
    and a.payment_id = p_payment_id
    and a.invoice_id = p_invoice_id
  limit 1;
  if found then raise exception 'This customer advance is already applied to the invoice'; end if;

  v_applied := least(
    v_payment.amount_received - coalesce(v_payment.advance_used_amount, 0),
    v_invoice.balance_due
  );
  if v_applied <= 0 then raise exception 'Advance has no unallocated balance'; end if;

  -- Allocation is normalized instead of linking the full receipt to one invoice.
  -- The original cash posting/classification stays immutable and partial residue
  -- remains available for another invoice.
  insert into public.customer_advance_allocations (
    organization_id, payment_id, invoice_id, amount, allocated_by
  ) values (p_org_id, p_payment_id, p_invoice_id, v_applied, p_actor_id);

  update public.payments
  set advance_used_amount = coalesce(advance_used_amount, 0) + v_applied
  where id = p_payment_id;

  -- The snapshot is cash plus discount for every active direct (non-advance)
  -- payment, plus active advance allocations.
  select coalesce((
    select sum(p.amount_received + coalesce(p.discount_amount, 0)) from public.payments p
    where p.invoice_id = p_invoice_id and not p.is_cancelled and not p.is_advance
  ), 0) + coalesce((
    select sum(a.amount) from public.customer_advance_allocations a
    join public.payments p on p.id = a.payment_id
    where a.invoice_id = p_invoice_id and not p.is_cancelled
  ), 0)
  into v_total_paid;
  if v_total_paid < 0 or v_total_paid > v_invoice.total_amount then
    raise exception 'Invoice allocations do not reconcile to the invoice total';
  end if;
  v_balance := v_invoice.total_amount - v_total_paid;
  v_status := case
    when v_balance = 0 then 'paid'::public.invoice_status
    when v_total_paid > 0 then 'partial'::public.invoice_status
    else 'issued'::public.invoice_status
  end;

  update public.invoices
  set amount_paid = v_total_paid, balance_due = v_balance,
      status = v_status, updated_at = now()
  where id = p_invoice_id;

  if v_invoice.work_order_id is not null then
    update public.work_orders
    set status = case when v_status = 'paid' then 'paid'::public.work_order_status else 'invoiced'::public.work_order_status end,
        payment_status = case
          when v_status = 'paid' then 'paid'::public.payment_status
          when v_status = 'partial' then 'partial'::public.payment_status
          else 'unpaid'::public.payment_status
        end
    where id = v_invoice.work_order_id;
  end if;

  return query select v_applied, v_balance, v_status;
end;
$$;

revoke all on function public.apply_customer_advance(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_customer_advance(uuid, uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. cancel_customer_payment: dynamic one-or-two posting reversal (cash and/or
--    discount), mirroring cancel_supplier_payment; invoice recomputes include
--    discount.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_customer_payment(
  p_org_id uuid,
  p_actor_id uuid,
  p_payment_id uuid,
  p_reason text
)
returns table(cancelled boolean, posting_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments%rowtype;
  v_invoice invoices%rowtype;
  v_opening_receivable record;
  v_total_paid numeric;
  v_new_status public.invoice_status;
  v_advance_used numeric;
  v_reason text := nullif(btrim(p_reason), '');
  v_seq bigint;
  v_batch_id text := gen_random_uuid()::text;
  v_posting_id uuid;
  v_first_reversal_id uuid;
  v_reversal_id uuid;
  v_reversed integer := 0;
  v_expected_postings integer;
  v_actual_postings integer;
  v_original accounting_postings%rowtype;
  v_kw_date date := (now() at time zone 'Asia/Kuwait')::date;
begin
  perform public.assert_accounting_actor(
    p_org_id, p_actor_id, array['owner', 'admin', 'manager']
  );
  perform set_config('fixops.allow_accounting_lifecycle_write', 'true', true);

  if p_payment_id is null then
    raise exception 'Payment is required';
  end if;
  if v_reason is null then
    raise exception 'Cancellation reason is required';
  end if;

  -- Lock the source first. For an allocated advance, lock every affected invoice
  -- in stable ID order before changing any allocation rows.
  select * into v_payment
  from public.payments p
  where p.id = p_payment_id and p.organization_id = p_org_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;
  if v_payment.is_cancelled or v_payment.reversal_posting_id is not null then
    raise exception 'Payment is already cancelled';
  end if;

  if v_payment.is_advance then
    perform i.id
    from public.invoices i
    join public.customer_advance_allocations a on a.invoice_id = i.id
    where a.payment_id = p_payment_id
      and a.organization_id = p_org_id
      and i.organization_id = p_org_id
    order by i.id
    for update of i;
  elsif v_payment.invoice_id is not null then
    select * into v_invoice
    from public.invoices i
    where i.id = v_payment.invoice_id and i.organization_id = p_org_id
    for update;
    if not found then raise exception 'Linked invoice not found'; end if;
  elsif v_payment.work_order_id is not null then
    -- Keep cancellation lock ordering aligned with record_customer_payment:
    -- work order before the global posting-sequence lock. The no-invoice receipt
    -- snapshot is recomputed below after this payment is marked cancelled.
    perform wo.id
    from public.work_orders wo
    where wo.id = v_payment.work_order_id
      and wo.organization_id = p_org_id
    for update;
    if not found then raise exception 'Linked work order not found'; end if;
  elsif v_payment.opening_receivable_id is not null then
    select o.id, o.amount, o.balance_due, o.reversal_posting_id
    into v_opening_receivable
    from public.opening_receivables o
    where o.id = v_payment.opening_receivable_id
      and o.organization_id = p_org_id
    for update;
    if not found then raise exception 'Linked opening receivable not found'; end if;
  end if;

  -- Validate the recorded settlement against exactly its posting components
  -- (cash and/or discount) before reversing anything, mirroring
  -- cancel_supplier_payment's dynamic one-or-two posting check.
  v_expected_postings := case when v_payment.amount_received > 0 then 1 else 0 end
    + case when coalesce(v_payment.discount_amount, 0) > 0 then 1 else 0 end;

  select count(*) into v_actual_postings
  from public.accounting_postings j
  where j.organization_id = p_org_id
    and j.ledger = 'ar'
    and j.party_id = v_payment.customer_id
    and j.source_id = p_payment_id
    and j.source_type in ('payment', 'customer_payment_discount')
    and j.reversal_of is null
    and j.batch_id is not distinct from v_payment.posting_batch_id
    and (
      (j.source_type = 'payment'
        and j.event_type = case when v_payment.is_advance then 'advance' else 'payment' end
        and j.debit_amount = 0
        and j.credit_amount = v_payment.amount_received)
      or
      (j.source_type = 'customer_payment_discount'
        and j.event_type = 'adjustment'
        and j.debit_amount = 0
        and j.credit_amount = coalesce(v_payment.discount_amount, 0))
    )
    and not exists (
      select 1 from public.accounting_postings r where r.reversal_of = j.id
    );

  -- One source_type may appear at most once for a settlement. Count equality by
  -- itself would not detect two matching cash rows and a missing discount row.
  if exists (
    select 1
    from public.accounting_postings j
    where j.organization_id = p_org_id
      and j.ledger = 'ar'
      and j.party_id = v_payment.customer_id
      and j.source_id = p_payment_id
      and j.source_type in ('payment', 'customer_payment_discount')
      and j.reversal_of is null
    group by j.source_type
    having count(*) <> 1
  ) then
    raise exception 'Payment accounting postings do not match the recorded receipt';
  end if;

  if v_expected_postings = 0
     or v_actual_postings <> v_expected_postings
     or (v_payment.amount_received > 0 and not exists (
       select 1 from public.accounting_postings j
       where j.organization_id = p_org_id
         and j.ledger = 'ar'
         and j.party_id = v_payment.customer_id
         and j.source_id = p_payment_id
         and j.source_type = 'payment'
         and j.event_type = case when v_payment.is_advance then 'advance' else 'payment' end
         and j.debit_amount = 0
         and j.credit_amount = v_payment.amount_received
         and j.reversal_of is null
         and j.batch_id is not distinct from v_payment.posting_batch_id
         and not exists (
           select 1 from public.accounting_postings r where r.reversal_of = j.id
         )
     ))
     or (coalesce(v_payment.discount_amount, 0) > 0 and not exists (
       select 1 from public.accounting_postings j
       where j.organization_id = p_org_id
         and j.ledger = 'ar'
         and j.party_id = v_payment.customer_id
         and j.source_id = p_payment_id
         and j.source_type = 'customer_payment_discount'
         and j.event_type = 'adjustment'
         and j.debit_amount = 0
         and j.credit_amount = coalesce(v_payment.discount_amount, 0)
         and j.reversal_of is null
         and j.batch_id is not distinct from v_payment.posting_batch_id
         and not exists (
           select 1 from public.accounting_postings r where r.reversal_of = j.id
         )
     ))
     or exists (
       select 1
       from public.accounting_postings j
       where j.organization_id = p_org_id
         and j.ledger = 'ar'
         and j.source_id = p_payment_id
         and j.reversal_of is null
         and (
           j.party_id is distinct from v_payment.customer_id
           or j.source_type not in ('payment', 'customer_payment_discount')
           or j.batch_id is distinct from v_payment.posting_batch_id
           or exists (
             select 1 from public.accounting_postings r where r.reversal_of = j.id
           )
         )
     ) then
    raise exception 'Payment accounting postings do not match the recorded receipt';
  end if;

  update public.payments
  set is_cancelled = true,
      cancelled_reason = v_reason,
      cancelled_by = p_actor_id,
      cancelled_at = now()
  where id = p_payment_id;

  -- Re-derive linked invoice snapshots deterministically instead of subtracting
  -- from cached values. Remove normalized advance allocations only after every
  -- affected invoice has already been locked in stable order above.
  if v_payment.is_advance and exists (
    select 1
    from public.customer_advance_allocations a
    where a.payment_id = p_payment_id and a.organization_id = p_org_id
  ) then
    for v_invoice in
      select i.*
      from public.invoices i
      join public.customer_advance_allocations a on a.invoice_id = i.id
      where a.payment_id = p_payment_id
        and a.organization_id = p_org_id
        and i.organization_id = p_org_id
      order by i.id
    loop
      delete from public.customer_advance_allocations
      where organization_id = p_org_id
        and payment_id = p_payment_id
        and invoice_id = v_invoice.id;
      select coalesce((select sum(pp.amount_received + coalesce(pp.discount_amount, 0)) from public.payments pp
        where pp.invoice_id = v_invoice.id and not pp.is_cancelled and not pp.is_advance), 0)
        + coalesce((select sum(a.amount) from public.customer_advance_allocations a
          join public.payments pp on pp.id = a.payment_id
          where a.invoice_id = v_invoice.id and not pp.is_cancelled), 0)
      into v_total_paid;
      if v_total_paid < 0 or v_total_paid > v_invoice.total_amount then
        raise exception 'Invoice allocations do not reconcile to the invoice total';
      end if;
      v_new_status := case
        when v_total_paid = v_invoice.total_amount then 'paid'::public.invoice_status
        when v_total_paid > 0 then 'partial'::public.invoice_status
        else 'issued'::public.invoice_status end;
      update public.invoices set amount_paid = v_total_paid,
        balance_due = v_invoice.total_amount - v_total_paid,
        status = v_new_status, updated_at = now() where id = v_invoice.id;
      if v_invoice.work_order_id is not null then
        update public.work_orders
        set status = case when v_new_status = 'paid' then 'paid'::public.work_order_status else 'invoiced'::public.work_order_status end,
            payment_status = case
              when v_new_status = 'paid' then 'paid'::public.payment_status
              when v_new_status = 'partial' then 'partial'::public.payment_status
              else 'unpaid'::public.payment_status
            end
        where id = v_invoice.work_order_id;
      end if;
    end loop;

    select coalesce(sum(a.amount), 0)
    into v_advance_used
    from public.customer_advance_allocations a
    where a.organization_id = p_org_id
      and a.payment_id = p_payment_id;

    if v_advance_used <> 0 then
      raise exception 'Cancelled customer advance still has active allocations';
    end if;

    update public.payments
    set advance_used_amount = 0
    where id = p_payment_id;
  end if;

  if v_payment.invoice_id is not null then
    -- The linked invoice was locked before the payment source changed.
    select coalesce(sum(pp.amount_received + coalesce(pp.discount_amount, 0)), 0)
        + coalesce((
            select sum(a.amount)
            from public.customer_advance_allocations a
            join public.payments advance_payment on advance_payment.id = a.payment_id
            where a.invoice_id = v_payment.invoice_id
              and advance_payment.is_cancelled = false
          ), 0)
      into v_total_paid
      from public.payments pp
      where pp.invoice_id = v_payment.invoice_id
        and pp.is_cancelled = false;

      if v_total_paid < 0 or v_total_paid > v_invoice.total_amount then
        raise exception 'Invoice allocations do not reconcile to the invoice total';
      end if;

      v_new_status := case
        when v_total_paid = v_invoice.total_amount then 'paid'::public.invoice_status
        when v_total_paid > 0 then 'partial'::public.invoice_status
        else 'issued'::public.invoice_status
      end;

      update public.invoices
      set amount_paid = v_total_paid,
          balance_due = v_invoice.total_amount - v_total_paid,
          status = v_new_status,
          updated_at = now()
      where id = v_payment.invoice_id;

      if v_invoice.work_order_id is not null then
        update public.work_orders
        set status = case when v_new_status = 'paid' then 'paid'::public.work_order_status else 'invoiced'::public.work_order_status end,
            payment_status = case
              when v_new_status = 'paid' then 'paid'::public.payment_status
              when v_new_status = 'partial' then 'partial'::public.payment_status
              else 'unpaid'::public.payment_status
            end
        where id = v_invoice.work_order_id;
      end if;
  elsif v_payment.work_order_id is not null then
    select coalesce(sum(p.amount_received), 0)
    into v_total_paid
    from public.payments p
    where p.organization_id = p_org_id
      and p.work_order_id = v_payment.work_order_id
      and p.invoice_id is null
      and p.is_cancelled = false
      and p.is_advance = false;

    update public.work_orders
    set payment_status = case
          when v_total_paid <= 0 then 'unpaid'::public.payment_status
          when final_amount > 0 and v_total_paid >= final_amount then 'paid'::public.payment_status
          else 'partial'::public.payment_status
        end,
        updated_at = now()
    where id = v_payment.work_order_id
      and organization_id = p_org_id;
  elsif v_payment.opening_receivable_id is not null then
    if v_opening_receivable.reversal_posting_id is not null then
      raise exception 'Cannot cancel payment for a reversed opening receivable';
    end if;

    select coalesce(sum(p.amount_received), 0)
    into v_total_paid
    from public.payments p
    where p.organization_id = p_org_id
      and p.opening_receivable_id = v_payment.opening_receivable_id
      and p.id <> p_payment_id
      and p.is_cancelled = false;

    if v_total_paid < 0 or v_total_paid > v_opening_receivable.amount then
      raise exception 'Opening receivable allocations do not reconcile to the opening amount';
    end if;

    update public.opening_receivables
    set balance_due = amount - v_total_paid
    where id = v_payment.opening_receivable_id;
  end if;

  -- Acquire the global sequence only after every invoice/work-order lock so
  -- recording and cancellation cannot hold these resources in opposite order.
  -- Reverse every live posting component (cash and/or discount) exactly, in
  -- posting-sequence order, exactly inverting each original.
  for v_original in
    select j.*
    from public.accounting_postings j
    where j.organization_id = p_org_id
      and j.ledger = 'ar'
      and j.source_id = p_payment_id
      and j.source_type in ('payment', 'customer_payment_discount')
      and j.reversal_of is null
    order by j.posting_sequence
    for share
  loop
    v_seq := public.next_posting_sequence(p_org_id);
    insert into public.accounting_postings (
      organization_id, ledger, party_id, party_name, posting_date, document_date,
      reference_number, description, posting_sequence, event_type, debit_amount,
      credit_amount, source_type, source_id, reversal_of, provenance,
      posted_at, posted_by, batch_id, notes
    ) values (
      p_org_id, 'ar', v_original.party_id, v_original.party_name, v_kw_date,
      v_original.document_date, v_original.reference_number,
      'Reversal — ' || v_original.description, v_seq, 'reversal',
      v_original.credit_amount, v_original.debit_amount, v_original.source_type,
      p_payment_id, v_original.id, 'live', now(), p_actor_id, v_batch_id,
      'Reversal of cancelled payment ' || v_payment.payment_number || ' — ' || v_reason
    ) returning id into v_reversal_id;
    v_first_reversal_id := coalesce(v_first_reversal_id, v_reversal_id);
    v_reversed := v_reversed + 1;
  end loop;

  if v_reversed = 0 then
    raise exception 'Payment has no accounting posting and cannot be reversed';
  end if;

  v_posting_id := v_first_reversal_id;

  update public.payments
  set reversal_posting_id = v_posting_id
  where id = p_payment_id;

  return query select true, v_posting_id;
end;
$$;

revoke all on function public.cancel_customer_payment(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.cancel_customer_payment(
  uuid, uuid, uuid, text
) to service_role;
