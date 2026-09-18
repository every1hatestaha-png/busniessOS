import { describe, expect, it } from "vitest";

import {
  canTransitionKitchenTicket,
  canTransitionServiceJob,
  canTransitionServiceQuote,
  kitchenTicketStatuses,
  nextKitchenTicketStatuses,
  nextServiceJobStatuses,
  nextServiceQuoteStatuses,
  serviceJobStatuses,
  serviceQuoteStatuses,
  type KitchenTicketStatus,
  type ServiceJobStatus,
  type ServiceQuoteStatus,
} from "@/lib/domain/industry-lifecycles";

const kitchenAllowed: Record<KitchenTicketStatus, KitchenTicketStatus[]> = {
  QUEUED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};

const quoteAllowed: Record<ServiceQuoteStatus, ServiceQuoteStatus[]> = {
  DRAFT: ["SENT", "ACCEPTED", "REJECTED", "EXPIRED"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: ["CONVERTED"],
  REJECTED: [],
  EXPIRED: [],
  CONVERTED: [],
};

const jobAllowed: Record<ServiceJobStatus, ServiceJobStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_CUSTOMER", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "COMPLETED", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

describe("industry lifecycle transitions", () => {
  it("enforces every kitchen-ticket transition and keeps terminal states closed", () => {
    for (const from of kitchenTicketStatuses) {
      expect(nextKitchenTicketStatuses(from)).toEqual(kitchenAllowed[from]);
      for (const to of kitchenTicketStatuses) {
        expect(canTransitionKitchenTicket(from, to), `${from} -> ${to}`).toBe(
          from === to || kitchenAllowed[from].includes(to),
        );
      }
    }

    expect(nextKitchenTicketStatuses("SERVED")).toEqual([]);
    expect(nextKitchenTicketStatuses("CANCELLED")).toEqual([]);
  });

  it("enforces every service-quotation transition and prevents reopening final quotes", () => {
    for (const from of serviceQuoteStatuses) {
      expect(nextServiceQuoteStatuses(from)).toEqual(quoteAllowed[from]);
      for (const to of serviceQuoteStatuses) {
        expect(canTransitionServiceQuote(from, to), `${from} -> ${to}`).toBe(
          from === to || quoteAllowed[from].includes(to),
        );
      }
    }

    for (const terminal of ["REJECTED", "EXPIRED", "CONVERTED"] as const) {
      expect(nextServiceQuoteStatuses(terminal)).toEqual([]);
      expect(canTransitionServiceQuote(terminal, "DRAFT")).toBe(false);
    }
  });

  it("enforces every service-job transition and prevents reopening completed/cancelled jobs", () => {
    for (const from of serviceJobStatuses) {
      expect(nextServiceJobStatuses(from)).toEqual(jobAllowed[from]);
      for (const to of serviceJobStatuses) {
        expect(canTransitionServiceJob(from, to), `${from} -> ${to}`).toBe(
          from === to || jobAllowed[from].includes(to),
        );
      }
    }

    expect(nextServiceJobStatuses("COMPLETED")).toEqual([]);
    expect(nextServiceJobStatuses("CANCELLED")).toEqual([]);
    expect(canTransitionServiceJob("COMPLETED", "OPEN")).toBe(false);
    expect(canTransitionServiceJob("CANCELLED", "IN_PROGRESS")).toBe(false);
  });

  it("allows idempotent writes without treating them as lifecycle regressions", () => {
    for (const status of kitchenTicketStatuses) expect(canTransitionKitchenTicket(status, status)).toBe(true);
    for (const status of serviceQuoteStatuses) expect(canTransitionServiceQuote(status, status)).toBe(true);
    for (const status of serviceJobStatuses) expect(canTransitionServiceJob(status, status)).toBe(true);
  });
});
