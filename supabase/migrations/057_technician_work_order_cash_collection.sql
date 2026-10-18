-- Allow an active technician to record only a cash receipt against a work order
-- assigned to their login or linked staff profile. The application route makes
-- the same checks first; this SECURITY DEFINER function repeats them at the
-- accounting trust boundary so another service-role caller cannot bypass them.

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
  p_is_advance boolean
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
  v_seq bigint;
  v_batch_id text := gen_random_uuid()::text;
  v_customer_ok boolean;
  v_customer_name text;
  v_invoice invoices%rowtype;
  v_total_paid numeric;
  v_new_status public.invoice_status;
  v_work_order_id uuid := p_work_order_id;
  v_work_order work_orders%rowtype;
  v_actor_role text;
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
  if p_amount_received is null or p_amount_received <= 0 or scale(p_amount_received) > 3 then
    raise exception 'Amount must be greater than zero with at most 3 decimal places';
  end if;
  if p_payment_mode is null
     or p_payment_mode not in ('cash', 'bank_transfer', 'card', 'pos', 'cheque', 'online', 'other', 'knet') then
    raise exception 'Payment mode is invalid';
  end if;

  select exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.organization_id = p_org_id
  ) into v_customer_ok;

  if not v_customer_ok then
    raise exception 'Customer does not belong to this organization';
  end if;

  select coalesce(nullif(c.company_name, ''), c.full_name, c.id::text)
  into v_customer_name
  from public.customers c where c.id = p_customer_id;

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
    if p_amount_received > v_invoice.balance_due then
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
  end if;

  v_payment_number := public.generate_sequence_number(p_org_id, 'payment', 'PMT');
  v_seq := public.next_posting_sequence(p_org_id);

  insert into public.payments (
    organization_id, payment_number, customer_id, invoice_id, work_order_id,
    payment_date, amount_received, payment_mode, reference_number, notes,
    is_advance, advance_used_amount, is_cancelled, received_by,
    posting_date, posting_sequence, posted_at, posted_by, posting_batch_id,
    posting_provenance
  ) values (
    p_org_id, v_payment_number, p_customer_id, p_invoice_id, v_work_order_id,
    p_payment_date, p_amount_received, p_payment_mode::public.payment_mode,
    nullif(btrim(p_reference_number), ''), nullif(btrim(p_notes), ''),
    coalesce(p_is_advance, false), 0, false, p_actor_id,
    v_kw_date, v_seq, now(), p_actor_id, v_batch_id, 'live'
  )
  returning id into v_payment_id;

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

  -- Recompute every invoice snapshot from active allocations. Do not trust or
  -- increment the prior snapshot: it is a cache of the source rows, not truth.
  if p_invoice_id is not null then
    select coalesce(sum(pp.amount_received), 0)
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
  end if;

  return query select v_payment_id, v_payment_number, v_posting_id;
end;
$$;

revoke all on function public.record_customer_payment(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, text, boolean
) from public;
revoke all on function public.record_customer_payment(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, text, boolean
) from anon;
revoke all on function public.record_customer_payment(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, text, boolean
) from authenticated;
grant execute on function public.record_customer_payment(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, text, boolean
) to service_role;
