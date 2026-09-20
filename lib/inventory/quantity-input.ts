const FRACTIONAL_QUANTITY_UNITS = new Set(["KG", "LITER", "METER"]);

export function quantityInputConstraints(unit?: string | null) {
  const fractional = Boolean(unit && FRACTIONAL_QUANTITY_UNITS.has(unit));
  return fractional
    ? { min: "0.0001", step: "0.0001" }
    : { min: "1", step: "1" };
}
