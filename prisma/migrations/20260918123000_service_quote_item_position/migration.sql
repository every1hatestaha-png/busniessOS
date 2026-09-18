-- Preserve service quotation line-entry order for deterministic review and printing.
ALTER TABLE "service_quote_items"
  ADD COLUMN IF NOT EXISTS "position" integer;

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "serviceQuoteId"
      ORDER BY "createdAt" ASC, "id" ASC
    )::integer AS "position"
  FROM "service_quote_items"
)
UPDATE "service_quote_items" AS sqi
SET "position" = ranked."position"
FROM ranked
WHERE ranked."id" = sqi."id"
  AND sqi."position" IS NULL;

ALTER TABLE "service_quote_items"
  ALTER COLUMN "position" SET NOT NULL;

ALTER TABLE "service_quote_items"
  ADD CONSTRAINT "service_quote_items_quote_position_unique"
  UNIQUE ("serviceQuoteId", "position");

ALTER TABLE "service_quote_items"
  ADD CONSTRAINT "service_quote_items_position_positive"
  CHECK ("position" > 0);
