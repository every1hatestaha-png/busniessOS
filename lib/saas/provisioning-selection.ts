export const PROVISIONING_MODULE_KEYS = [
  "inventory",
  "restaurant",
  "wholesale",
  "manufacturing",
  "accounting",
  "multiBranch",
  "payroll",
  "integrations",
  "services",
] as const;

export type ProvisioningModuleKey = (typeof PROVISIONING_MODULE_KEYS)[number];
export type BuilderBusinessType = "retail" | "restaurant" | "wholesale" | "manufacturing" | "services";
export type ProvisioningBilling = "monthly" | "annual";

const moduleSet = new Set<string>(PROVISIONING_MODULE_KEYS);

const businessTypeMap: Record<BuilderBusinessType, "WHOLESALER" | "MANUFACTURER" | "RETAILER" | "OTHER"> = {
  retail: "RETAILER",
  restaurant: "OTHER",
  wholesale: "WHOLESALER",
  manufacturing: "MANUFACTURER",
  services: "OTHER",
};

export const DEFAULT_MODULES_BY_BUSINESS: Record<BuilderBusinessType, ProvisioningModuleKey[]> = {
  retail: ["inventory"],
  restaurant: ["inventory", "restaurant"],
  wholesale: ["inventory", "wholesale", "accounting"],
  manufacturing: ["inventory", "wholesale", "manufacturing", "accounting"],
  services: ["services", "accounting"],
};

export function isBuilderBusinessType(value: string | null | undefined): value is BuilderBusinessType {
  return value === "retail" || value === "restaurant" || value === "wholesale" || value === "manufacturing" || value === "services";
}

export function sanitizeProvisioningModules(value: string | string[] | null | undefined): ProvisioningModuleKey[] {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(raw.map((item) => item.trim()).filter((item): item is ProvisioningModuleKey => moduleSet.has(item)))];
}

export function sanitizeBilling(value: string | null | undefined): ProvisioningBilling {
  return value === "annual" ? "annual" : "monthly";
}

export function onboardingBusinessTypeForBuilder(value: BuilderBusinessType | null | undefined) {
  return value ? businessTypeMap[value] : "WHOLESALER";
}

export function buildProvisioningQuery(input: {
  businessType: BuilderBusinessType;
  modules: ProvisioningModuleKey[];
  billing: ProvisioningBilling;
}) {
  const params = new URLSearchParams();
  params.set("business", input.businessType);
  params.set("modules", sanitizeProvisioningModules(input.modules).join(","));
  params.set("billing", sanitizeBilling(input.billing));
  return params.toString();
}
