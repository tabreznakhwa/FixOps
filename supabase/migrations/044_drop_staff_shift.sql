-- Reverses migration 043. The shift field was added so Oct–Feb overtime could
-- start at a fixed time per shift, but staff move between morning and evening
-- constantly, so a value stored per employee would be wrong most of the time.
--
-- The lunch hour now detects itself instead: it is deducted only when the
-- working window actually covers 1–2 PM, so a morning shift (08:30–17:30)
-- always loses the hour and an evening shift (from 2 PM) never does, without
-- the system needing to know which shift anyone is on. Overtime then simply
-- begins after 8 WORKED hours. For anyone on their normal shift this matches
-- fixed 17:30 / 22:00 boundaries exactly.
--
-- Safe to drop: the column was only ever written with its 'morning' default and
-- nothing read it outside the code removed alongside this migration.
alter table staff drop constraint if exists staff_shift_check;
alter table staff drop column if exists shift;
