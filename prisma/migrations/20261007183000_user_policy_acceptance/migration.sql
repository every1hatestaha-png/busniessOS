ALTER TABLE "users"
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "termsVersion" TEXT,
  ADD COLUMN "privacyAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "privacyVersion" TEXT;
