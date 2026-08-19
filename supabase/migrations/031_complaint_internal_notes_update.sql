-- Allow editing a complaint internal note.
--
-- complaint_internal_notes was created with select/insert only — no UPDATE
-- grant and no UPDATE policy — so there was no way to fix a typo or correct
-- a handover note once posted.

alter table complaint_internal_notes add column if not exists updated_at timestamptz;

grant update on complaint_internal_notes to authenticated;

drop policy if exists "org members can update internal notes" on complaint_internal_notes;

-- Author can edit their own note; owner/admin/manager can edit any note in
-- their org (same role gating already used for inventory adjustments).
create policy "org members can update internal notes"
  on complaint_internal_notes for update
  using (
    organization_id = (select organization_id from users where id = auth.uid())
    and (
      created_by = auth.uid()
      or (select role from users where id = auth.uid()) in ('owner', 'admin', 'manager')
    )
  )
  with check (
    organization_id = (select organization_id from users where id = auth.uid())
  );
