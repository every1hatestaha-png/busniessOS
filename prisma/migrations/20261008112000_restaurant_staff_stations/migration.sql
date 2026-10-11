-- Additive, safe default preserves existing restaurant staff access until
-- an owner explicitly assigns a restricted station.
ALTER TABLE "workspace_members"
  ADD COLUMN "restaurantStation" VARCHAR(12) NOT NULL DEFAULT 'ALL';

ALTER TABLE "workspace_members"
  ADD CONSTRAINT "workspace_members_restaurant_station_check"
  CHECK ("restaurantStation" IN ('ALL', 'POS', 'KITCHEN'));
