import { describe, expect, it } from "vitest";
import {
  canTransitionRestaurantOrder,
  canUseRestaurantStation,
  isRestaurantManager,
} from "@/lib/restaurant/station-policy";

describe("Restaurant station policy", () => {
  it("gives managers explicit oversight without granting staff finance roles", () => {
    for (const role of ["OWNER","ADMIN","MANAGER"]) {
      expect(isRestaurantManager(role)).toBe(true);
      expect(canUseRestaurantStation(role,null,"MANAGER")).toBe(true);
      expect(canUseRestaurantStation(role,null,"CASHIER")).toBe(true);
      expect(canUseRestaurantStation(role,null,"KITCHEN")).toBe(true);
    }
    expect(isRestaurantManager("STAFF")).toBe(false);
  });
  it("fails closed for unassigned and cross-station staff", () => {
    for(const station of [null, "CASHIER", "KITCHEN"] as const) {
      expect(canUseRestaurantStation("STAFF",station,"MANAGER")).toBe(false);
    }
    expect(canUseRestaurantStation("STAFF",null,"CASHIER")).toBe(false);
    expect(canUseRestaurantStation("STAFF",null,"KITCHEN")).toBe(false);
    expect(canUseRestaurantStation("STAFF","CASHIER","CASHIER")).toBe(true);
    expect(canUseRestaurantStation("STAFF","CASHIER","KITCHEN")).toBe(false);
    expect(canUseRestaurantStation("STAFF","KITCHEN","KITCHEN")).toBe(true);
    expect(canUseRestaurantStation("STAFF","KITCHEN","CASHIER")).toBe(false);
  });
  it("isolates kitchen preparation from cashier settlement and manager cancellation", () => {
    for(const status of ["COMPLETED","CANCELLED","CONFIRMED","PENDING_REVIEW"]) {
      expect(canTransitionRestaurantOrder("KITCHEN",status)).toBe(false);
    }
    expect(canTransitionRestaurantOrder("KITCHEN","PREPARING")).toBe(true);
    expect(canTransitionRestaurantOrder("KITCHEN","READY")).toBe(true);
    expect(canTransitionRestaurantOrder("CASHIER","COMPLETED")).toBe(true);
    expect(canTransitionRestaurantOrder("CASHIER","CANCELLED")).toBe(false);
    expect(canTransitionRestaurantOrder("MANAGER","CANCELLED")).toBe(true);
  });
});
