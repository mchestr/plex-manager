-- AlterTable
-- IF NOT EXISTS: this migration first shipped as 20270119000002_add_user_role,
-- which an install on main's image may already have applied.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT;
