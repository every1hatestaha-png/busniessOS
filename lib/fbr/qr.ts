import qrcode from "qrcode-generator";

export const FBR_QR_VERSION = 2;
export const FBR_QR_MODULE_COUNT = 25;
export const FBR_QR_PRINT_SIZE_MM = 7;

export class FbrQrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FbrQrError";
  }
}

export function normalizeFbrInvoiceNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new FbrQrError("An authoritative FBR invoice number is required to generate the QR code.");
  if (normalized.length > 64) throw new FbrQrError("The FBR invoice number is unexpectedly long.");
  return normalized;
}

export function buildFbrInvoiceQrSvg(fbrInvoiceNumber: string) {
  const payload = normalizeFbrInvoiceNumber(fbrInvoiceNumber);
  const qr = qrcode(FBR_QR_VERSION, "L");
  qr.addData(payload, "Byte");

  try {
    qr.make();
  } catch {
    throw new FbrQrError("The FBR invoice number cannot be encoded in the required Version 2 QR code.");
  }

  if (qr.getModuleCount() !== FBR_QR_MODULE_COUNT) {
    throw new FbrQrError("The generated FBR QR code does not match Version 2 (25x25 modules).");
  }

  return {
    payload,
    moduleCount: qr.getModuleCount(),
    svg: qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true }),
  };
}
