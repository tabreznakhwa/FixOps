-- staff_advance_repayments (migration 036) was created without ever enabling
-- RLS, adding an org policy, or granting table privileges — every other
-- table added since migration 008 does all three, this one was missed.
-- Result: "permission denied for table staff_advance_repayments" the first
-- time a repayment was recorded (record_staff_advance_repayment is a plain
-- SECURITY INVOKER function, so its INSERT runs with the calling role's own
-- privileges — and that role had none on this table at all).

alter table staff_advance_repayments enable row level security;

create policy "staff_advance_repayments_org" on staff_advance_repayments
  for all using (organization_id = get_user_organization_id());

grant select, insert on staff_advance_repayments to authenticated;
grant select, insert on staff_advance_repayments to service_role;
