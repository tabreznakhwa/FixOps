-- Make direct authenticated work-order reads follow both assignment models used
-- by the application: users.id in assigned_to, or an active staff row linked to
-- the login in assigned_staff_id. Browser-role work-order writes are revoked;
-- every mutation goes through an explicitly authorized application route using
-- the service-role client.
--
-- Also close the serialized stock-deduction race in the latest production
-- definition from migration 037. The application pre-check remains useful for a
-- friendly error, but only this check can prevent two concurrent issues from
-- taking current_stock below zero.

create or replace function public.adjust_inventory_stock_logged(
  p_item_id uuid,
  p_delta numeric,
  p_org_id uuid,
  p_transaction_type public.inventory_transaction_type,
  p_unit_cost numeric default 0,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default null,
  p_created_by uuid default null
)
returns table(stock_before numeric, stock_after numeric)
language plpgsql
as $$
declare
  v_before numeric;
  v_after numeric;
begin
  perform set_config('fixops.allow_stock_write', 'true', true);

  update public.inventory_items
  set current_stock = current_stock + p_delta, updated_at = now()
  where id = p_item_id
    and organization_id = p_org_id
    and current_stock + p_delta >= 0
  returning current_stock - p_delta, current_stock into v_before, v_after;

  if not found then
    if not exists (
      select 1
      from public.inventory_items
      where id = p_item_id and organization_id = p_org_id
    ) then
      raise exception 'inventory item % not found in organization', p_item_id;
    end if;
    raise exception 'insufficient stock for item %', p_item_id;
  end if;

  insert into public.inventory_transactions (
    organization_id, item_id, transaction_type, quantity, unit_cost, total_cost,
    stock_before, stock_after, reference_type, reference_id, notes, created_by
  ) values (
    p_org_id, p_item_id, p_transaction_type, abs(p_delta), p_unit_cost,
    abs(p_delta) * p_unit_cost, v_before, v_after, p_reference_type, p_reference_id,
    p_notes, p_created_by
  );

  return query select v_before, v_after;
end;
$$;

revoke all on function public.adjust_inventory_stock_logged(
  uuid, numeric, uuid, public.inventory_transaction_type, numeric, text, uuid, text, uuid
) from public, anon;
grant execute on function public.adjust_inventory_stock_logged(
  uuid, numeric, uuid, public.inventory_transaction_type, numeric, text, uuid, text, uuid
) to authenticated, service_role;

-- This helper runs as its owner so the work_orders policy can resolve an active
-- linked staff assignment without depending on the caller's separate staff RLS
-- visibility. It returns only a boolean and fixes its search path.
create or replace function public.is_work_order_assigned_to_current_technician(
  p_organization_id uuid,
  p_assigned_staff_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff s
    where s.id = p_assigned_staff_id
      and s.organization_id = p_organization_id
      and s.user_id = auth.uid()
      and s.employment_status = 'active'
  );
$$;

revoke all on function public.is_work_order_assigned_to_current_technician(uuid, uuid)
  from public, anon;
grant execute on function public.is_work_order_assigned_to_current_technician(uuid, uuid)
  to authenticated, service_role;

alter table public.work_orders enable row level security;

-- Direct browser clients need work-order reads, but mutations must pass through
-- the server routes that validate role, tenant, assignment, fields and status.
revoke all privileges on table public.work_orders from public;
revoke all privileges on table public.work_orders from anon;
revoke all privileges on table public.work_orders from authenticated;
grant select on table public.work_orders to authenticated;
grant select, insert, update, delete on table public.work_orders to service_role;

drop policy if exists "work_orders_org_isolation" on public.work_orders;
drop policy if exists "work_orders_select_org_or_assignment" on public.work_orders;

create policy "work_orders_select_org_or_assignment"
  on public.work_orders
  for select
  using (
    public.is_user_active()
    and organization_id = public.get_user_organization_id()
    and (
      public.get_user_role() <> 'technician'
      or assigned_to = auth.uid()
      or public.is_work_order_assigned_to_current_technician(
        organization_id,
        assigned_staff_id
      )
    )
  );
