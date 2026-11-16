-- Fix SQLSTATE 42702 when revising an issued invoice. The function's
-- `returns table(invoice_id uuid)` output variable collides with unqualified
-- invoice_id columns in DELETE and aggregate statements. Qualify those columns
-- explicitly while preserving the lifecycle behavior installed by migration 068.

create or replace function public.revise_issued_customer_invoice(
  p_org_id uuid,
  p_actor_id uuid,
  p_invoice_id uuid,
  p_customer_id uuid,
  p_invoice_type text,
  p_invoice_date date,
  p_due_date date,
  p_work_order_id uuid,
  p_ref_number text,
  p_discount_amount numeric,
  p_notes text,
  p_terms_and_conditions text,
  p_items jsonb
)
returns table(invoice_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw_date date := (now() at time zone 'Asia/Kuwait')::date;
  v_invoice public.invoices%rowtype;
  v_original_work_order_id uuid;
  v_customer_name text;
  v_original public.accounting_postings%rowtype;
  v_reversal_id uuid;
  v_posting_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_seq bigint;
  v_subtotal numeric(13,3) := 0;
  v_discount numeric(13,3) := greatest(coalesce(p_discount_amount, 0), 0);
  v_total numeric(13,3);
  v_existing_paid numeric(13,3) := 0;
  v_item jsonb;
  v_quantity numeric;
  v_unit_price numeric;
  v_sort_order integer := 0;
begin
  perform public.assert_accounting_actor(p_org_id, p_actor_id, array['owner', 'admin']::text[]);
  perform set_config('fixops.allow_accounting_lifecycle_write', 'true', true);

  select * into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = p_org_id
  for update;
  if not found then raise exception 'Invoice not found'; end if;
  v_original_work_order_id := v_invoice.work_order_id;
  if v_invoice.status <> 'issued' or v_invoice.posting_sequence is null then
    raise exception 'Only unpaid issued invoices can be revised';
  end if;
  if coalesce(v_invoice.amount_paid, 0) <> 0
     or coalesce(v_invoice.balance_due, 0) <> coalesce(v_invoice.total_amount, 0)
     or exists (
       select 1 from public.payments p
       where p.organization_id = p_org_id
         and p.invoice_id = p_invoice_id
         and not p.is_cancelled
     )
     or exists (
       select 1 from public.customer_advance_allocations a
       join public.payments p on p.id = a.payment_id
       where a.organization_id = p_org_id
         and a.invoice_id = p_invoice_id
         and not p.is_cancelled
     ) then
    raise exception 'Invoices with payment activity cannot be revised';
  end if;
  if p_invoice_date is null then raise exception 'Invoice date is required'; end if;
  if p_discount_amount = 'NaN'::numeric or p_discount_amount < 0 then
    raise exception 'Discount must be a non-negative number';
  end if;
  if p_customer_id is null then raise exception 'Customer is required'; end if;
  if p_invoice_type not in ('service', 'amc', 'parts', 'advance', 'credit_note') then
    raise exception 'Invalid invoice type';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one line item is required';
  end if;

  select c.full_name into v_customer_name
  from public.customers c
  where c.id = p_customer_id and c.organization_id = p_org_id;
  if not found then raise exception 'Customer not found'; end if;

  if p_work_order_id is not null and not exists (
    select 1 from public.work_orders w
    where w.id = p_work_order_id
      and w.organization_id = p_org_id
      and w.customer_id = p_customer_id
  ) then
    raise exception 'Work order does not belong to the selected customer';
  end if;
  if p_work_order_id is not null and exists (
    select 1 from public.invoices other
    where other.organization_id = p_org_id
      and other.work_order_id = p_work_order_id
      and other.id <> p_invoice_id
      and other.status <> 'cancelled'
  ) then
    raise exception 'Work order is already linked to another active invoice';
  end if;

  select * into v_original
  from public.accounting_postings j
  where j.id = coalesce(v_invoice.current_posting_id, (
      select j2.id from public.accounting_postings j2
      where j2.organization_id = p_org_id
        and j2.source_type = 'invoice'
        and j2.source_id = p_invoice_id
        and j2.reversal_of is null
      order by j2.posting_sequence desc
      limit 1
    ))
    and j.organization_id = p_org_id
    and j.ledger = 'ar'
    and j.source_id = p_invoice_id
    and j.source_type in ('invoice', 'invoice_revision')
    and j.reversal_of is null
  for share;
  if not found then raise exception 'Invoice has no active accounting posting'; end if;
  if exists (select 1 from public.accounting_postings r where r.reversal_of = v_original.id) then
    raise exception 'Invoice active posting has already been reversed';
  end if;

  v_seq := public.next_posting_sequence(p_org_id);
  insert into public.accounting_postings (
    organization_id, ledger, party_id, party_name, posting_date, document_date,
    reference_number, description, posting_sequence, event_type, debit_amount,
    credit_amount, source_type, source_id, reversal_of, provenance, posted_at,
    posted_by, batch_id, notes
  ) values (
    p_org_id, 'ar', v_original.party_id, v_original.party_name, v_kw_date,
    v_original.document_date, v_original.reference_number,
    'Reversal — ' || v_original.description, v_seq, 'reversal',
    v_original.credit_amount, v_original.debit_amount, v_original.source_type,
    p_invoice_id, v_original.id, 'live', now(), p_actor_id, v_batch_id,
    'Revised invoice ' || v_invoice.invoice_number
  ) returning id into v_reversal_id;

  delete from public.invoice_items ii where ii.invoice_id = p_invoice_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := coalesce((v_item ->> 'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
    if nullif(btrim(v_item ->> 'description'), '') is null then
      raise exception 'Every line item requires a description';
    end if;
    if v_quantity = 'NaN'::numeric or v_quantity <= 0 then
      raise exception 'Line-item quantity must be a positive number';
    end if;
    if v_unit_price = 'NaN'::numeric or v_unit_price < 0 then
      raise exception 'Line-item price must be a non-negative number';
    end if;

    insert into public.invoice_items (
      organization_id, invoice_id, description, quantity, unit_price,
      discount_amount, discount_percent, tax_rate, tax_percent, line_total,
      total_price, sort_order
    ) values (
      p_org_id, p_invoice_id, btrim(v_item ->> 'description'), v_quantity,
      v_unit_price, 0, 0, 0, 0, v_quantity * v_unit_price,
      v_quantity * v_unit_price, v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  end loop;

  select coalesce(sum(ii.line_total), 0) into v_subtotal
  from public.invoice_items ii
  where ii.invoice_id = p_invoice_id;
  if v_discount > v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  v_total := v_subtotal - v_discount;

  v_seq := public.next_posting_sequence(p_org_id);
  insert into public.accounting_postings (
    organization_id, ledger, party_id, party_name, posting_date, document_date,
    reference_number, description, posting_sequence, event_type, debit_amount,
    credit_amount, source_type, source_id, provenance, posted_at, posted_by,
    batch_id, notes
  ) values (
    p_org_id, 'ar', p_customer_id, v_customer_name, v_kw_date, p_invoice_date,
    v_invoice.invoice_number, 'Invoice revision ' || v_invoice.invoice_number,
    v_seq, case when p_invoice_type = 'credit_note' then 'credit_note' else 'invoice' end,
    case when p_invoice_type = 'credit_note' then 0 else v_total end,
    case when p_invoice_type = 'credit_note' then v_total else 0 end,
    'invoice_revision', p_invoice_id, 'live', now(), p_actor_id, v_batch_id,
    nullif(btrim(p_notes), '')
  ) returning id into v_posting_id;

  update public.invoices
  set customer_id = p_customer_id,
      invoice_type = p_invoice_type,
      invoice_date = p_invoice_date,
      due_date = p_due_date,
      work_order_id = p_work_order_id,
      ref_number = nullif(btrim(p_ref_number), ''),
      subtotal = v_subtotal,
      discount_amount = v_discount,
      total_amount = v_total,
      amount_paid = 0,
      balance_due = v_total,
      notes = nullif(btrim(p_notes), ''),
      terms_and_conditions = nullif(btrim(p_terms_and_conditions), ''),
      current_posting_id = v_posting_id,
      updated_at = now()
  where id = p_invoice_id;

  if v_original_work_order_id is distinct from p_work_order_id
     and v_original_work_order_id is not null then
    update public.work_orders
    set status = case
          when status = 'invoiced' then 'completed'::public.work_order_status
          else status
        end,
        payment_status = case
          when status = 'invoiced' then 'unpaid'::public.payment_status
          else payment_status
        end
    where id = v_original_work_order_id and organization_id = p_org_id;
  end if;

  if p_work_order_id is not null then
    update public.payments p
    set invoice_id = p_invoice_id
    where p.organization_id = p_org_id
      and p.work_order_id = p_work_order_id
      and p.customer_id = p_customer_id
      and p.invoice_id is null
      and p.is_cancelled = false
      and p.is_advance = false;

    select coalesce(sum(p.amount_received + coalesce(p.discount_amount, 0)), 0)
    into v_existing_paid
    from public.payments p
    where p.invoice_id = p_invoice_id and p.is_cancelled = false;

    if v_existing_paid < 0 or v_existing_paid > v_total then
      raise exception 'Work-order receipts exceed the revised invoice total';
    end if;

    update public.invoices
    set amount_paid = v_existing_paid,
        balance_due = v_total - v_existing_paid,
        status = case
          when v_existing_paid = v_total then 'paid'::public.invoice_status
          when v_existing_paid > 0 then 'partial'::public.invoice_status
          else 'issued'::public.invoice_status
        end,
        updated_at = now()
    where id = p_invoice_id;

    update public.work_orders
    set status = case
          when v_existing_paid = v_total then 'paid'::public.work_order_status
          else 'invoiced'::public.work_order_status
        end,
        payment_status = case
          when v_existing_paid = v_total then 'paid'::public.payment_status
          when v_existing_paid > 0 then 'partial'::public.payment_status
          else 'unpaid'::public.payment_status
        end
    where id = p_work_order_id and organization_id = p_org_id;
  end if;

  return query select p_invoice_id;
end;
$$;

revoke all on function public.revise_issued_customer_invoice(
  uuid, uuid, uuid, uuid, text, date, date, uuid, text, numeric, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.revise_issued_customer_invoice(
  uuid, uuid, uuid, uuid, text, date, date, uuid, text, numeric, text, text, jsonb
) to service_role;
