-- Follow-up to migration 068: its cancellation function still labeled every
-- reversal as source_type 'invoice'. Reversing an invoice_revision must retain
-- that original source type or the immutable-journal guard rejects the insert.

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
    v_original.credit_amount, v_original.debit_amount, v_original.source_type,
    p_invoice_id, v_original.id, 'live', now(), p_actor_id, v_batch_id, v_reason
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

revoke all on function public.cancel_customer_invoice(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_customer_invoice(uuid, uuid, uuid, text)
  to service_role;
