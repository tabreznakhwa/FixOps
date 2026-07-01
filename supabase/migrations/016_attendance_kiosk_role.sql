-- Add attendance_kiosk to the user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'attendance_kiosk';
