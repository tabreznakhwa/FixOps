-- Follow-up hardening for migration 066 after its initial production application.
-- Replaces the issued-invoice merge, revision and cancellation functions with
-- payment-row validation, active-posting validation, credit-note exclusion,
-- preserved source line valuation and synchronized work-order snapshots.

create or replace function public.merge_issued_customer_invoices(
  p_org_id uuid,
  p_actor_id uuid,
  p_invoice_ids uuid[],
  p_invoice_date date,
  p_due_date date default null,
  p_notes text default null,
  p_ref_number text default null,
  p_discount_amount numeric default 0
)
returns table(invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw_date date := (now() at time zone 'Asia/Kuwait')::date;
  v_invoice public.invoices%rowtype;
  v_source public.invoices%rowtype;
  v_original public.accounting_postings%rowtype;
  v_customer_id uuid;
  v_customer_name text;
  v_invoice_number text;
  v_new_invoice_id uuid;
  v_source_invoice_id uuid;
  v_source_work_order_ids uuid[];
  v_reversal_id uuid;
  v_posting_id uuid;
  v_seq bigint;
  v_subtotal numeric(13,3);
  v_discount numeric(13,3) := greatest(coalesce(p_discount_amount, 0), 0);
  v_total numeric(13,3);
  v_source_ids uuid[];
  v_batch_id text := gen_random_uuid()::text;
  v_index integer := 0;
begin
  perform public.assert_accounting_actor(p_org_id, p_actor_id, array['owner', 'admin']);
  perform set_config('fixops.allow_accounting_lifecycle_write', 'true', true);

  select array_agg(distinct source_id order by source_id)
  into v_source_ids
  from unnest(coalesce(p_invoice_ids, array[]::uuid[])) as source_id;

  if coalesce(cardinality(v_source_ids), 0) < 2 then
    raise exception 'Select at least 2 invoices to merge';
  end if;
  if p_invoice_date is null then raise exception 'Invoice date is required'; end if;

  for v_source in
    select i.*
    from public.invoices i
    where i.organization_id = p_org_id and i.id = any(v_source_ids)
    order by i.id
    for update
  loop
    v_index := v_index + 1;
    if v_index = 1 then
      v_customer_id := v_source.customer_id;
    elsif v_source.customer_id is distinct from v_customer_id then
      raise exception 'All selected invoices must be from the same customer';
    end if;

    if v_source.status <> 'issued' or v_source.posting_sequence is null then
      raise exception 'Invoice % is %. Only unpaid issued invoices can be merged',
        v_source.invoice_number, v_source.status;
    end if;
    if v_source.invoice_type = 'credit_note' then
      raise exception 'Credit note % cannot be merged into a debit invoice', v_source.invoice_number;
    end if;
    if coalesce(v_source.amount_paid, 0) <> 0
       or coalesce(v_source.balance_due, 0) <> coalesce(v_source.total_amount, 0)
       or exists (
         select 1 from public.payments p
         where p.organization_id = p_org_id
           and p.invoice_id = v_source.id
           and not p.is_cancelled
       )
       or exists (
         select 1 from public.customer_advance_allocations a
         join public.payments p on p.id = a.payment_id
         where a.organization_id = p_org_id
           and a.invoice_id = v_source.id
           and not p.is_cancelled
       ) then
      raise exception 'Invoice % has payment activity and cannot be merged', v_source.invoice_number;
    end if;
  end loop;

  if v_index <> cardinality(v_source_ids) then
    raise exception 'One or more invoices were not found';
  end if;

  select array_agg(distinct i.work_order_id) filter (where i.work_order_id is not null)
  into v_source_work_order_ids
  from public.invoices i
  where i.organization_id = p_org_id and i.id = any(v_source_ids);

  select coalesce(sum(i.subtotal), 0)
  into v_subtotal
  from public.invoices i
  where i.organization_id = p_org_id and i.id = any(v_source_ids);

  if v_subtotal <= 0 then raise exception 'Source invoices have no positive line items'; end if;
  if v_discount > v_subtotal then raise exception 'Discount cannot exceed the invoice subtotal'; end if;
  v_total := v_subtotal - v_discount;
  if v_total <= 0 then raise exception 'Consolidated invoice total must be positive'; end if;

  select coalesce(nullif(c.company_name, ''), c.full_name, c.id::text)
  into v_customer_name
  from public.customers c
  where c.id = v_customer_id and c.organization_id = p_org_id;
  if not found then raise exception 'Invoice customer does not belong to this organization'; end if;

  v_invoice_number := public.generate_sequence_number(p_org_id, 'invoice', 'INV');
  insert into public.invoices (
    organization_id, customer_id, invoice_number, invoice_type, invoice_date,
    due_date, ref_number, subtotal, discount_amount, tax_rate, tax_amount,
    total_amount, amount_paid, balance_due, status, notes, created_by
  ) values (
    p_org_id, v_customer_id, v_invoice_number, 'service', p_invoice_date,
    p_due_date, nullif(btrim(p_ref_number), ''), v_subtotal, v_discount, 0, 0,
    v_total, 0, v_total, 'draft', nullif(btrim(p_notes), ''), p_actor_id
  ) returning id into v_new_invoice_id;

  insert into public.invoice_items (
    organization_id, invoice_id, description, quantity, unit_price,
    discount_amount, discount_percent, tax_rate, tax_percent, line_total,
    total_price, reference_type, reference_id, sort_order
  )
  select
    p_org_id, v_new_invoice_id, ii.description, ii.quantity, ii.unit_price,
    coalesce(ii.discount_amount, 0), coalesce(ii.discount_percent, 0),
    coalesce(ii.tax_rate, 0), coalesce(ii.tax_percent, 0),
    coalesce(ii.line_total, ii.total_price), ii.total_price,
    'merged_invoice', ii.invoice_id,
    row_number() over (order by i.invoice_date, i.invoice_number, ii.sort_order, ii.id) - 1
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where ii.organization_id = p_org_id and ii.invoice_id = any(v_source_ids)
  order by i.invoice_date, i.invoice_number, ii.sort_order, ii.id;

  foreach v_source_invoice_id in array v_source_ids loop
    select * into v_invoice
    from public.invoices i
    where i.id = v_source_invoice_id and i.organization_id = p_org_id;

    select * into v_original
    from public.accounting_postings j
    where j.id = coalesce(v_invoice.current_posting_id, (
        select j2.id from public.accounting_postings j2
        where j2.organization_id = p_org_id
          and j2.source_type = 'invoice'
          and j2.source_id = v_source_invoice_id
          and j2.reversal_of is null
        order by j2.posting_sequence desc
        limit 1
      ))
      and j.organization_id = p_org_id
      and j.ledger = 'ar'
      and j.source_id = v_source_invoice_id
      and j.source_type in ('invoice', 'invoice_revision')
      and j.reversal_of is null
    for share;
    if not found then raise exception 'Invoice % has no active accounting posting', v_invoice.invoice_number; end if;
    if exists (
      select 1 from public.accounting_postings r where r.reversal_of = v_original.id
    ) then
      raise exception 'Invoice % active posting has already been reversed', v_invoice.invoice_number;
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
      v_original.credit_amount, v_original.debit_amount, 'invoice', v_source_invoice_id,
      v_original.id, 'live', now(), p_actor_id, v_batch_id,
      'Merged into ' || v_invoice_number
    ) returning id into v_reversal_id;

    update public.invoices
    set status = 'cancelled', cancelled_reason = 'Merged into ' || v_invoice_number,
        reversal_posting_id = v_reversal_id, updated_at = now()
    where id = v_source_invoice_id;
  end loop;

  if cardinality(v_source_work_order_ids) is not null then
    update public.work_orders
    set status = case
          when status = 'invoiced' then 'completed'::public.work_order_status
          else status
        end,
        payment_status = case
          when status = 'invoiced' then 'unpaid'::public.payment_status
          else payment_status
        end
    where organization_id = p_org_id and id = any(v_source_work_order_ids);
  end if;

  select i.id into v_new_invoice_id
  from public.invoices i
  where i.organization_id = p_org_id and i.invoice_number = v_invoice_number;

  v_seq := public.next_posting_sequence(p_org_id);
  insert into public.accounting_postings (
    organization_id, ledger, party_id, party_name, posting_date, document_date,
    reference_number, description, posting_sequence, event_type, debit_amount,
    credit_amount, source_type, source_id, provenance, posted_at, posted_by,
    batch_id, notes
  ) values (
    p_org_id, 'ar', v_customer_id, v_customer_name, v_kw_date, p_invoice_date,
    v_invoice_number, 'Invoice ' || v_invoice_number, v_seq, 'invoice', v_total,
    0, 'invoice', v_new_invoice_id, 'live', now(), p_actor_id, v_batch_id,
    nullif(btrim(p_notes), '')
  ) returning id into v_posting_id;

  update public.invoices
  set status = 'issued', posting_date = v_kw_date, posting_sequence = v_seq,
      posted_at = now(), posted_by = p_actor_id, posting_batch_id = v_batch_id,
      posting_provenance = 'live', current_posting_id = v_posting_id,
      updated_at = now()
  where id = v_new_invoice_id;

  return query select v_new_invoice_id, v_invoice_number;
end;
$$;

revoke all on function public.merge_issued_customer_invoices(
  uuid, uuid, uuid[], date, date, text, text, numeric
) from public, anon, authenticated;
grant execute on function public.merge_issued_customer_invoices(
  uuid, uuid, uuid[], date, date, text, text, numeric
) to service_role;

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
  v_original public.accounting_postings%rowtype;
  v_customer_name text;
  v_reversal_id uuid;
  v_posting_id uuid;
  v_seq bigint;
  v_batch_id text := gen_random_uuid()::text;
  v_subtotal numeric(13,3);
  v_discount numeric(13,3) := greatest(coalesce(p_discount_amount, 0), 0);
  v_total numeric(13,3);
  v_item jsonb;
  v_quantity numeric(12,3);
  v_unit_price numeric(13,3);
  v_sort_order integer := 0;
begin
  perform public.assert_accounting_actor(p_org_id, p_actor_id, array['owner', 'admin']);
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
  if p_customer_id is null then raise exception 'Customer is required'; end if;
  if p_invoice_type not in ('service', 'amc', 'parts', 'advance', 'credit_note') then
    raise exception 'Invalid invoice type';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one line item is required';
  end if;

  select coalesce(sum(
    coalesce((item ->> 'quantity')::numeric, 0)
      * coalesce((item ->> 'unit_price')::numeric, 0)
  ), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) item;

  if v_subtotal <= 0 then raise exception 'Invoice total must be positive'; end if;
  if v_discount > v_subtotal then raise exception 'Discount cannot exceed the invoice subtotal'; end if;
  v_total := v_subtotal - v_discount;
  if v_total <= 0 then raise exception 'Invoice total must be positive'; end if;

  select coalesce(nullif(c.company_name, ''), c.full_name, c.id::text)
  into v_customer_name
  from public.customers c
  where c.id = p_customer_id and c.organization_id = p_org_id;
  if not found then raise exception 'Invoice customer does not belong to this organization'; end if;

  if p_work_order_id is not null and not exists (
    select 1 from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.organization_id = p_org_id
      and wo.customer_id = p_customer_id
      and wo.status <> 'cancelled'
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
    v_original.credit_amount, v_original.debit_amount, 'invoice', p_invoice_id,
    v_original.id, 'live', now(), p_actor_id, v_batch_id,
    'Revised invoice ' || v_invoice.invoice_number
  ) returning id into v_reversal_id;

  delete from public.invoice_items where invoice_id = p_invoice_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := coalesce((v_item ->> 'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
    if nullif(btrim(v_item ->> 'description'), '') is null then
      raise exception 'Every line item requires a description';
    end if;
    if v_quantity <= 0 then raise exception 'Line-item quantity must be positive'; end if;
    if v_unit_price < 0 then raise exception 'Line-item price cannot be negative'; end if;

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
      tax_rate = 0,
      tax_amount = 0,
      total_amount = v_total,
      amount_paid = 0,
      balance_due = v_total,
      notes = nullif(btrim(p_notes), ''),
      terms_and_conditions = nullif(btrim(p_terms_and_conditions), ''),
      posting_date = v_kw_date,
      posting_sequence = v_seq,
      posted_at = now(),
      posted_by = p_actor_id,
      posting_batch_id = v_batch_id,
      posting_provenance = 'live',
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
    update public.work_orders
    set status = 'invoiced'::public.work_order_status,
        payment_status = 'unpaid'::public.payment_status
    where id = p_work_order_id and organization_id = p_org_id;
  end if;

  return query select p_invoice_id;
end;
$$;

-- Cancellation must reverse the invoice's current posting, which may be an
-- invoice_revision after an Owner/Admin correction rather than the original
-- invoice posting created when the document was first issued.
create or replace function public.cancel_customer_invoice(
  p_org_id uuid,
  p_actor_id uuid,
  p_invoice_id uuid,
  p_reason text
)
returns table(cancelled boolean, posting_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw_date date := (now() at time zone 'Asia/Kuwait')::date;
  v_invoice public.invoices%rowtype;
  v_original public.accounting_postings%rowtype;
  v_posting_id uuid;
  v_seq bigint;
  v_reason text := nullif(btrim(p_reason), '');
  v_batch_id text := gen_random_uuid()::text;
begin
  perform public.assert_accounting_actor(p_org_id, p_actor_id, array['owner', 'admin', 'manager']);
  perform set_config('fixops.allow_accounting_lifecycle_write', 'true', true);
  if v_reason is null then raise exception 'Cancellation reason is required'; end if;

  select * into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = p_org_id
  for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'draft' then raise exception 'Draft invoices must be deleted, not reversed'; end if;
  if v_invoice.status = 'written_off' then
    raise exception 'Written-off invoices require a dedicated write-off reversal workflow';
  end if;
  if v_invoice.status = 'cancelled' or v_invoice.reversal_posting_id is not null then
    raise exception 'Invoice is already cancelled';
  end if;
  if coalesce(v_invoice.amount_paid, 0) <> 0
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
    raise exception 'Cancel or reallocate invoice payments first';
  end if;

  select * into v_original
  from public.accounting_postings j
  where j.id = coalesce(v_invoice.current_posting_id, (
      select j2.id
      from public.accounting_postings j2
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
  if exists (
    select 1 from public.accounting_postings r where r.reversal_of = v_original.id
  ) then
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
    v_original.credit_amount, v_original.debit_amount, 'invoice', p_invoice_id,
    v_original.id, 'live', now(), p_actor_id, v_batch_id, v_reason
  ) returning id into v_posting_id;

  update public.invoices
  set status = 'cancelled', cancelled_reason = v_reason,
      reversal_posting_id = v_posting_id,
      updated_at = now()
  where id = p_invoice_id;

  if v_invoice.work_order_id is not null then
    update public.work_orders
    set status = case
          when status = 'invoiced' then 'completed'::public.work_order_status
          else status
        end,
        payment_status = case
          when status = 'invoiced' then 'unpaid'::public.payment_status
          else payment_status
        end
    where id = v_invoice.work_order_id and organization_id = p_org_id;
  end if;

  return query select true, v_posting_id;
end;
$$;

revoke all on function public.revise_issued_customer_invoice(
  uuid, uuid, uuid, uuid, text, date, date, uuid, text, numeric, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.revise_issued_customer_invoice(
  uuid, uuid, uuid, uuid, text, date, date, uuid, text, numeric, text, text, jsonb
) to service_role;
revoke all on function public.cancel_customer_invoice(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_customer_invoice(uuid, uuid, uuid, text)
  to service_role;
