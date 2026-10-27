-- Restaurant-only staff station assignment. All three existing legacy workspaces
-- and their financial records remain untouched. STAFF is fail-closed until assigned.
CREATE TABLE "restaurant_staff_stations" (
  "workspaceId" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "station" TEXT NOT NULL,
  "assignedByUserId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_staff_stations_pkey" PRIMARY KEY ("workspaceId", "userId"),
  CONSTRAINT "restaurant_staff_stations_valid_station_check" CHECK ("station" IN ('CASHIER','KITCHEN'))
);
CREATE INDEX "restaurant_staff_stations_by_user_idx"
  ON "restaurant_staff_stations" ("userId");
