-- Internal notes log for complaints (staff-only, handover use)
create table if not exists complaint_internal_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  complaint_id uuid not null references complaints(id) on delete cascade,
  note text not null,
  author_name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists complaint_internal_notes_complaint_id_idx
  on complaint_internal_notes(complaint_id, created_at desc);

alter table complaint_internal_notes enable row level security;

-- All authenticated users in the org can read and insert
-- Drop first so this script can be safely rerun from Supabase SQL Editor.
drop policy if exists "org members can read internal notes" on complaint_internal_notes;
drop policy if exists "org members can insert internal notes" on complaint_internal_notes;

create policy "org members can read internal notes"
  on complaint_internal_notes for select
  using (
    organization_id = (
      select organization_id from users where id = auth.uid()
    )
  );

create policy "org members can insert internal notes"
  on complaint_internal_notes for insert
  with check (
    organization_id = (
      select organization_id from users where id = auth.uid()
    )
  );

-- Grant to authenticated users and the server-side service-role client.
-- Supabase service_role bypasses RLS, but still needs table privileges for admin-client reads/inserts.
grant select, insert on complaint_internal_notes to authenticated;
grant select, insert on complaint_internal_notes to service_role;
