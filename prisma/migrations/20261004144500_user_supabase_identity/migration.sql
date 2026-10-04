ALTER TABLE "users"
ADD COLUMN "supabaseId" TEXT;

CREATE UNIQUE INDEX "users_supabaseId_key"
ON "users"("supabaseId")
WHERE "supabaseId" IS NOT NULL;
