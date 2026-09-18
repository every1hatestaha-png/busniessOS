export const kitchenTicketStatuses = ["QUEUED", "PREPARING", "READY", "SERVED", "CANCELLED"] as const;
export type KitchenTicketStatus = (typeof kitchenTicketStatuses)[number];

export const productionRunStatuses = ["DRAFT", "APPROVED", "POSTED", "CANCELLED"] as const;
export type ProductionRunStatus = (typeof productionRunStatuses)[number];

export const serviceQuoteStatuses = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"] as const;
export type ServiceQuoteStatus = (typeof serviceQuoteStatuses)[number];

export const serviceJobStatuses = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "COMPLETED", "CANCELLED"] as const;
export type ServiceJobStatus = (typeof serviceJobStatuses)[number];

const kitchenTicketTransitions: Record<KitchenTicketStatus, readonly KitchenTicketStatus[]> = {
  QUEUED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};

const productionRunTransitions: Record<ProductionRunStatus, readonly ProductionRunStatus[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["POSTED", "CANCELLED"],
  POSTED: [],
  CANCELLED: [],
};

const serviceQuoteTransitions: Record<ServiceQuoteStatus, readonly ServiceQuoteStatus[]> = {
  DRAFT: ["SENT", "ACCEPTED", "REJECTED", "EXPIRED"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: ["CONVERTED"],
  REJECTED: [],
  EXPIRED: [],
  CONVERTED: [],
};

const serviceJobTransitions: Record<ServiceJobStatus, readonly ServiceJobStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_CUSTOMER", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "COMPLETED", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionKitchenTicket(from: KitchenTicketStatus, to: KitchenTicketStatus) {
  return from === to || kitchenTicketTransitions[from].includes(to);
}

export function canTransitionProductionRun(from: ProductionRunStatus, to: ProductionRunStatus) {
  return from === to || productionRunTransitions[from].includes(to);
}

export function canTransitionServiceQuote(from: ServiceQuoteStatus, to: ServiceQuoteStatus) {
  return from === to || serviceQuoteTransitions[from].includes(to);
}

export function canTransitionServiceJob(from: ServiceJobStatus, to: ServiceJobStatus) {
  return from === to || serviceJobTransitions[from].includes(to);
}

export function nextKitchenTicketStatuses(from: KitchenTicketStatus): readonly KitchenTicketStatus[] {
  return kitchenTicketTransitions[from];
}

export function nextProductionRunStatuses(from: ProductionRunStatus): readonly ProductionRunStatus[] {
  return productionRunTransitions[from];
}

export function nextServiceQuoteStatuses(from: ServiceQuoteStatus): readonly ServiceQuoteStatus[] {
  return serviceQuoteTransitions[from];
}

export function nextServiceJobStatuses(from: ServiceJobStatus): readonly ServiceJobStatus[] {
  return serviceJobTransitions[from];
}
