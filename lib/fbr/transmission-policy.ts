import { assertFbrExpectedEnvironment, type FbrEnvironment } from "@/lib/fbr/digital-invoicing";

// A production build alone is not production authorization: Preview and the
// Restaurant staging project must never transmit fiscal production invoices.
export function isFbrProductionTransmissionAllowed() {
  return process.env.FBR_DI_PRODUCTION_TRANSMISSION_ENABLED === "1"
    && process.env.VERCEL_ENV === "production"
    && process.env.VERCEL_PROJECT_ID === "prj_iSQ7PaTAwiQMYasVAEBGJZTSjTk2"
    && process.env.MUNSHIOS_DEPLOYMENT_ENVIRONMENT !== "staging";
}

export function assertFbrTransmissionAllowed(environment: FbrEnvironment) {
  assertFbrExpectedEnvironment(environment);
  if (environment === "PRODUCTION" && !isFbrProductionTransmissionAllowed()) {
    throw new Error("Production FBR transmission is disabled or this is not the authorized production deployment.");
  }
}
