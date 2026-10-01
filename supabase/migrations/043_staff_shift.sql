-- Winter (Oct–Feb) runs two fixed shifts, assigned per employee:
--   Morning  08:30–17:30 — 8 worked hours plus a 1-hour lunch, so overtime
--                          only starts after 17:30.
--   Evening  14:00–22:00 — a straight 8 hours with no break, so overtime
--                          only starts after 22:00.
--
-- Everyone defaults to Morning, which is the existing company default; HR
-- moves the evening staff over on their staff profile. The column is used
-- only by the Oct–Feb duty rules — March–September ignores it.
alter table staff add column if not exists shift text not null default 'morning';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_shift_check'
  ) then
    alter table staff add constraint staff_shift_check
      check (shift in ('morning', 'evening'));
  end if;
end $$;
