CREATE TYPE "WorkspaceVertical" AS ENUM ('TRADING', 'MANUFACTURING', 'LEGACY', 'RESTAURANT', 'PROPERTY', 'SERVICES');

ALTER TABLE "workspaces" ADD COLUMN "vertical" "WorkspaceVertical" NOT NULL DEFAULT 'LEGACY';

-- OTHER remains LEGACY. Module flags do not establish vertical identity.
UPDATE "workspaces" SET "vertical" = CASE
  WHEN "businessType" = 'MANUFACTURER' THEN 'MANUFACTURING'::"WorkspaceVertical"
  WHEN "businessType" IN ('WHOLESALER', 'DISTRIBUTOR', 'RETAILER') THEN 'TRADING'::"WorkspaceVertical"
  ELSE 'LEGACY'::"WorkspaceVertical"
END;
