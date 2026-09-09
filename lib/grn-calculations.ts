export type GrnValueInput = {
  isWeightPriced: boolean;
  acceptedQuantity: string | number;
  actualUnitCost: string | number;
  acceptedWeightKg: string | number;
  ratePerKg: string | number;
};

export function calculateAcceptedValue(input: GrnValueInput): number | null {
  const rawBasis = input.isWeightPriced ? input.acceptedWeightKg : input.acceptedQuantity;
  const rawRate = input.isWeightPriced ? input.ratePerKg : input.actualUnitCost;
  if (rawBasis === "" || rawRate === "") return null;
  const basis = Number(rawBasis);
  const rate = Number(rawRate);
  if (!Number.isFinite(basis) || !Number.isFinite(rate)) return null;
  if (basis < 0 || rate < 0) return null;
  return Math.round((basis * rate + Number.EPSILON) * 100) / 100;
}

export function expectedWeightKg(quantity: string | number, unit: string, unitWeight: number | null) {
  const numericQuantity = Number(quantity);
  if (!Number.isFinite(numericQuantity) || numericQuantity < 0) return "";
  const weightPerUnit = unit === "KG" ? 1 : unitWeight;
  if (weightPerUnit == null || weightPerUnit <= 0) return "";
  return String(Math.round((numericQuantity * weightPerUnit + Number.EPSILON) * 1000) / 1000);
}
