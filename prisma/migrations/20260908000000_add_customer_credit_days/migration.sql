-- Preserve the existing 30-day invoice behavior while making each customer's
-- contractual credit period explicit and editable.
ALTER TABLE "customers" ADD COLUMN "creditDays" INTEGER NOT NULL DEFAULT 30;
