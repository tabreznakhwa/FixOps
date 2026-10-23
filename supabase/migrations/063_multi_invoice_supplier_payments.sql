-- ============================================================================
-- 063_multi_invoice_supplier_payments.sql
-- Restores multi-invoice Vendor Payment without restoring the legacy direct-
-- table allocation route. One request creates one independently reversible
-- supplier_payments source row per selected posted purchase invoice, together
-- with its canonical AP cash/discount postings, in one all-or-nothing database
-- transaction.
-- ============================================================================

begin;

create or replace function public.record_supplier_payment_batch(
  p_org_id uuid,
  p_actor_id uuid,
  p_supplier_id uuid,
  p_settlements jsonb,
  p_payment_date date,
  p_payment_mode text,
  p_reference_number text,
  p_notes text
)
returns table(
  settlement_position integer,
  supplier_payment_id uuid,
  purchase_invoice_id uuid,
  posting_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw_date date := (now() at time zone 'Asia/Kuwait')::date;
  v_supplier_name text;
  v_entry jsonb;
  v_invoice public.purchase_invoices%rowtype;
  v_position integer;
  v_invoice_id uuid;
  v_expected_balance numeric;
  v_amount_paid numeric;
  v_discount numeric;
  v_settlement numeric;
  v_count integer;
  v_distinct_count integer;
  v_locked_count integer;
  v_payment_id uuid;
  v_posting_id uuid;
  v_discount_posting_id uuid;
  v_source_seq bigint;
  v_discount_seq bigint;
  v_batch_id text;
  v_new_paid numeric;
begin
  perform public.assert_accounting_actor(
    p_org_id,
    p_actor_id,
    array['owner', 'admin', 'manager', 'accounts']
  );
  perform set_config('fixops.allow_accounting_lifecycle_write', 'true', true);

  if p_payment_date is null or p_payment_date > v_kw_date then
    raise exception 'A non-future payment date is required';
  end if;
  if p_payment_mode is null or p_payment_mode not in (
    'cash', 'bank_transfer', 'card', 'pos', 'cheque', 'online', 'other', 'knet'
  ) then
    raise exception 'Payment mode is invalid';
  end if;
  if p_reference_number is not null and char_length(btrim(p_reference_number)) > 1000 then
    raise exception 'Reference cannot exceed 1,000 characters';
  end if;
  if p_notes is not null and char_length(btrim(p_notes)) > 1000 then
    raise exception 'Notes cannot exceed 1,000 characters';
  end if;

  select s.supplier_name
  into v_supplier_name
  from public.suppliers s
  where s.id = p_supplier_id
    and s.organization_id = p_org_id;
  if not found then
    raise exception 'Supplier does not belong to this organization';
  end if;

  if jsonb_typeof(p_settlements) is distinct from 'array' then
    raise exception 'Supplier payment settlements must be an array';
  end if;
  v_count := jsonb_array_length(p_settlements);
  if v_count < 1 or v_count > 100 then
    raise exception 'A vendor payment must contain between 1 and 100 invoice settlements';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_settlements) as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or not (item.value ?& array[
        'position', 'purchase_invoice_id', 'expected_balance_due',
        'amount_paid', 'discount_amount'
      ])
      or exists (
        select 1
        from jsonb_object_keys(item.value) as key(name)
        where key.name not in (
          'position', 'purchase_invoice_id', 'expected_balance_due',
          'amount_paid', 'discount_amount'
        )
      )
      or jsonb_typeof(item.value->'position') is distinct from 'number'
      or (item.value->>'position') !~ '^[0-9]+$'
      or (item.value->>'position')::integer < 1
      or (item.value->>'position')::integer > v_count
      or coalesce(item.value->>'purchase_invoice_id', '')
        !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or jsonb_typeof(item.value->'expected_balance_due') not in ('number', 'string')
      or jsonb_typeof(item.value->'amount_paid') not in ('number', 'string')
      or jsonb_typeof(item.value->'discount_amount') not in ('number', 'string')
      or coalesce(item.value->>'expected_balance_due', '')
        !~ '^([0-9]{1,9})(\.[0-9]{1,3})?$'
      or coalesce(item.value->>'amount_paid', '')
        !~ '^([0-9]{1,9})(\.[0-9]{1,3})?$'
      or coalesce(item.value->>'discount_amount', '')
        !~ '^([0-9]{1,9})(\.[0-9]{1,3})?$'
  ) then
    raise exception 'A supplier payment settlement is malformed';
  end if;

  select
    count(distinct (item.value->>'position')::integer),
    count(distinct (item.value->>'purchase_invoice_id')::uuid)
  into v_distinct_count, v_locked_count
  from jsonb_array_elements(p_settlements) as item(value);
  if v_distinct_count <> v_count or v_locked_count <> v_count then
    raise exception 'Settlement positions and purchase invoices must be unique';
  end if;

  -- Lock every target in UUID order before any write. This exact-set query also
  -- rejects cross-tenant, cross-supplier, cancelled/draft/cash and already-paid
  -- invoices without leaking their details.
  perform pi.id
  from public.purchase_invoices pi
  join (
    select (item.value->>'purchase_invoice_id')::uuid as invoice_id
    from jsonb_array_elements(p_settlements) as item(value)
  ) requested on requested.invoice_id = pi.id
  where pi.organization_id = p_org_id
    and pi.supplier_id = p_supplier_id
    and pi.status = 'confirmed'
    and pi.payment_type = 'credit'
    and pi.posting_sequence is not null
    and pi.balance_due > 0
  order by pi.id
  for update of pi;

  get diagnostics v_locked_count = row_count;
  if v_locked_count <> v_count then
    raise exception 'One or more purchase invoices do not belong to this supplier or are no longer open posted credit invoices';
  end if;

  -- Revalidate every amount against the locked balance before the first insert.
  for v_entry in
    select item.value
    from jsonb_array_elements(p_settlements) as item(value)
    order by (item.value->>'position')::integer
  loop
    v_position := (v_entry->>'position')::integer;
    v_invoice_id := (v_entry->>'purchase_invoice_id')::uuid;
    v_expected_balance := (v_entry->>'expected_balance_due')::numeric;
    v_amount_paid := (v_entry->>'amount_paid')::numeric;
    v_discount := (v_entry->>'discount_amount')::numeric;
    v_settlement := v_amount_paid + v_discount;

    if v_expected_balance::text in ('NaN', 'Infinity', '-Infinity')
       or v_amount_paid::text in ('NaN', 'Infinity', '-Infinity')
       or v_discount::text in ('NaN', 'Infinity', '-Infinity')
       or v_expected_balance <= 0
       or v_amount_paid < 0
       or v_discount < 0
       or scale(v_expected_balance) > 3
       or scale(v_amount_paid) > 3
       or scale(v_discount) > 3
       or v_settlement <= 0 then
      raise exception 'Settlement % contains an invalid KWD amount', v_position;
    end if;

    select *
    into strict v_invoice
    from public.purchase_invoices pi
    where pi.id = v_invoice_id
      and pi.organization_id = p_org_id;

    if v_invoice.balance_due <> v_expected_balance then
      raise exception 'Purchase invoice % balance changed; reload and try again', v_invoice.invoice_number;
    end if;
    if v_settlement > v_invoice.balance_due then
      raise exception 'Settlement for purchase invoice % exceeds its balance', v_invoice.invoice_number;
    end if;
    if v_count > 1 and v_settlement <> v_invoice.balance_due then
      raise exception 'Every invoice in a multi-invoice payment must be settled in full';
    end if;
  end loop;

  for v_entry in
    select item.value
    from jsonb_array_elements(p_settlements) as item(value)
    order by (item.value->>'position')::integer
  loop
    v_position := (v_entry->>'position')::integer;
    v_invoice_id := (v_entry->>'purchase_invoice_id')::uuid;
    v_amount_paid := (v_entry->>'amount_paid')::numeric;
    v_discount := (v_entry->>'discount_amount')::numeric;
    v_batch_id := gen_random_uuid()::text;
    v_posting_id := null;
    v_discount_posting_id := null;

    select *
    into strict v_invoice
    from public.purchase_invoices pi
    where pi.id = v_invoice_id
      and pi.organization_id = p_org_id;

    v_source_seq := public.next_posting_sequence(p_org_id);
    insert into public.supplier_payments (
      organization_id, supplier_id, purchase_invoice_id, payment_date,
      amount_paid, discount_amount, payment_mode, reference_number, notes, paid_by,
      posting_date, posting_sequence, posted_at, posted_by, posting_batch_id,
      posting_provenance
    ) values (
      p_org_id, p_supplier_id, v_invoice_id, p_payment_date,
      v_amount_paid, v_discount, p_payment_mode::public.payment_mode,
      nullif(btrim(p_reference_number), ''), nullif(btrim(p_notes), ''), p_actor_id,
      v_kw_date, v_source_seq, now(), p_actor_id, v_batch_id, 'live'
    ) returning id into v_payment_id;

    if v_amount_paid > 0 then
      insert into public.accounting_postings (
        organization_id, ledger, party_id, party_name, posting_date, document_date,
        reference_number, description, posting_sequence, event_type, debit_amount,
        credit_amount, source_type, source_id, provenance, posted_at, posted_by,
        batch_id, notes
      ) values (
        p_org_id, 'ap', p_supplier_id, v_supplier_name, v_kw_date, p_payment_date,
        nullif(btrim(p_reference_number), ''),
        coalesce(nullif(btrim(p_notes), ''), 'Supplier Payment'),
        v_source_seq, 'payment', v_amount_paid, 0, 'supplier_payment', v_payment_id,
        'live', now(), p_actor_id, v_batch_id, nullif(btrim(p_notes), '')
      ) returning id into v_posting_id;
    end if;

    if v_discount > 0 then
      v_discount_seq := case
        when v_amount_paid > 0 then public.next_posting_sequence(p_org_id)
        else v_source_seq
      end;
      insert into public.accounting_postings (
        organization_id, ledger, party_id, party_name, posting_date, document_date,
        reference_number, description, posting_sequence, event_type, debit_amount,
        credit_amount, source_type, source_id, provenance, posted_at, posted_by,
        batch_id, notes
      ) values (
        p_org_id, 'ap', p_supplier_id, v_supplier_name, v_kw_date, p_payment_date,
        nullif(btrim(p_reference_number), ''),
        coalesce(nullif(btrim(p_notes), ''), 'Supplier Settlement') || ' — Discount',
        v_discount_seq, 'adjustment', v_discount, 0,
        'supplier_payment_discount', v_payment_id, 'live', now(), p_actor_id,
        v_batch_id, nullif(btrim(p_notes), '')
      ) returning id into v_discount_posting_id;
      v_posting_id := coalesce(v_posting_id, v_discount_posting_id);
    end if;

    select coalesce(sum(
      coalesce(sp.amount_paid, 0) + coalesce(sp.discount_amount, 0)
    ), 0)
    into v_new_paid
    from public.supplier_payments sp
    where sp.organization_id = p_org_id
      and sp.purchase_invoice_id = v_invoice_id
      and sp.is_cancelled = false;

    if v_new_paid < 0 or v_new_paid > v_invoice.total_amount then
      raise exception 'Purchase invoice allocations do not reconcile to the invoice total';
    end if;

    update public.purchase_invoices
    set amount_paid = v_new_paid,
        balance_due = total_amount - v_new_paid,
        payment_status = case
          when v_new_paid = total_amount then 'paid'
          when v_new_paid > 0 then 'partial'
          else 'unpaid'
        end,
        updated_at = now()
    where id = v_invoice_id;

    settlement_position := v_position;
    supplier_payment_id := v_payment_id;
    purchase_invoice_id := v_invoice_id;
    posting_id := v_posting_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.record_supplier_payment_batch(
  uuid, uuid, uuid, jsonb, date, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_supplier_payment_batch(
  uuid, uuid, uuid, jsonb, date, text, text, text
) to service_role;

commit;
