-- Child-side tenant guards cannot protect links when a referenced Product moves.
-- Preserve Product identity/ownership while Restaurant operational or immutable
-- history references exist. Ordinary Product edits and unlinked rows are unchanged.
CREATE OR REPLACE FUNCTION enforce_restaurant_product_parent_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."workspaceId" IS NOT DISTINCT FROM OLD."workspaceId" THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM "restaurant_menu_items" WHERE "productId"=OLD."id")
     OR EXISTS (SELECT 1 FROM "recipes" WHERE "finishedProductId"::text=OLD."id")
     OR EXISTS (SELECT 1 FROM "recipe_items" WHERE "ingredientProductId"::text=OLD."id")
     OR EXISTS (SELECT 1 FROM "restaurant_inventory_consumptions" WHERE "productId"=OLD."id")
     OR EXISTS (SELECT 1 FROM "restaurant_return_inventory_movements" WHERE "productId"=OLD."id") THEN
    RAISE EXCEPTION 'Restaurant-linked product identity and workspace are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_restaurant_parent_identity_guard
BEFORE UPDATE OF "id", "workspaceId" ON "products"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_product_parent_identity();
