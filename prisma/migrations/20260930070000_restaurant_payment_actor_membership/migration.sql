-- Restaurant payment actors supplied by authenticated application flows must
-- belong to the same workspace as the payment. Historical and compatibility
-- rows with a NULL createdById remain valid, while forged foreign actor IDs
-- fail closed at the database boundary.

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_creator_membership()
RETURNS trigger AS $$
BEGIN
  IF NEW."createdById" IS NOT NULL
     AND NOT restaurant_actor_is_workspace_member(NEW."workspaceId", NEW."createdById") THEN
    RAISE EXCEPTION 'Restaurant payment creator must be a member of the same workspace';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_payments_creator_membership_guard" ON "restaurant_payments";
CREATE TRIGGER "restaurant_payments_creator_membership_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "createdById"
ON "restaurant_payments"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_payment_creator_membership();