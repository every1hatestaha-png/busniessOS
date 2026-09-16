export type CollectionLanguage = "roman-urdu" | "english";
export type CollectionStatus = "CURRENT" | "DUE" | "OVERDUE" | "CRITICAL" | "REVIEW";

export type CollectionDocument = {
  documentNumber: string;
  outstandingAmount: number;
  ageDays: number;
};

export type CollectionCustomerInput = {
  customerId: string;
  customerName: string;
  phone: string;
  creditDays: number;
  currentBalance: number;
  oldestAgeDays: number | null;
  items: CollectionDocument[];
};

export type SmartCollectionRow = {
  customerId: string;
  customerName: string;
  phone: string;
  whatsappPhone: string | null;
  currentBalance: number;
  creditDays: number;
  oldestAgeDays: number | null;
  daysPastTerms: number | null;
  status: CollectionStatus;
  pendingReferences: string[];
  needsContact: boolean;
};

export type SmartCollectionsSummary = {
  totalOpen: number;
  dueNow: number;
  criticalAmount: number;
  contactCount: number;
  criticalCount: number;
  missingPhoneCount: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeWhatsAppPhone(phone: string, defaultCountryCode = "92") {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  else if (!trimmed.startsWith("+") && digits.startsWith("0")) digits = `${defaultCountryCode}${digits.slice(1)}`;
  else if (!trimmed.startsWith("+") && defaultCountryCode === "92" && digits.length === 10 && digits.startsWith("3")) digits = `92${digits}`;

  return /^\d{10,15}$/.test(digits) ? digits : null;
}

export function getCollectionStatus(oldestAgeDays: number | null, creditDays: number) {
  if (oldestAgeDays === null) return { status: "REVIEW" as const, daysPastTerms: null };
  const terms = Math.max(0, creditDays);
  const daysPastTerms = Math.max(0, oldestAgeDays - terms);
  if (daysPastTerms >= 30) return { status: "CRITICAL" as const, daysPastTerms };
  if (daysPastTerms > 0) return { status: "OVERDUE" as const, daysPastTerms };
  if (oldestAgeDays >= terms) return { status: "DUE" as const, daysPastTerms: 0 };
  return { status: "CURRENT" as const, daysPastTerms: 0 };
}

export function buildSmartCollectionRows(customers: CollectionCustomerInput[]) {
  const priority: Record<CollectionStatus, number> = { CRITICAL: 0, OVERDUE: 1, DUE: 2, REVIEW: 3, CURRENT: 4 };
  return customers
    .filter((customer) => customer.currentBalance > 0)
    .map<SmartCollectionRow>((customer) => {
      const { status, daysPastTerms } = getCollectionStatus(customer.oldestAgeDays, customer.creditDays);
      const pendingReferences = [...new Set(customer.items.map((item) => item.documentNumber).filter(Boolean))].slice(0, 4);
      return {
        customerId: customer.customerId,
        customerName: customer.customerName,
        phone: customer.phone,
        whatsappPhone: normalizeWhatsAppPhone(customer.phone),
        currentBalance: roundMoney(customer.currentBalance),
        creditDays: Math.max(0, customer.creditDays),
        oldestAgeDays: customer.oldestAgeDays,
        daysPastTerms,
        status,
        pendingReferences,
        needsContact: status === "DUE" || status === "OVERDUE" || status === "CRITICAL",
      };
    })
    .sort((a, b) => priority[a.status] - priority[b.status] || (b.daysPastTerms ?? -1) - (a.daysPastTerms ?? -1) || b.currentBalance - a.currentBalance);
}

export function summarizeSmartCollections(rows: SmartCollectionRow[]): SmartCollectionsSummary {
  const dueRows = rows.filter((row) => row.needsContact);
  const criticalRows = rows.filter((row) => row.status === "CRITICAL");
  return {
    totalOpen: roundMoney(rows.reduce((sum, row) => sum + row.currentBalance, 0)),
    dueNow: roundMoney(dueRows.reduce((sum, row) => sum + row.currentBalance, 0)),
    criticalAmount: roundMoney(criticalRows.reduce((sum, row) => sum + row.currentBalance, 0)),
    contactCount: dueRows.length,
    criticalCount: criticalRows.length,
    missingPhoneCount: dueRows.filter((row) => !row.whatsappPhone).length,
  };
}

function formatRupees(amount: number) {
  return `Rs ${amount.toLocaleString("en-PK", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function referenceLine(row: SmartCollectionRow, language: CollectionLanguage) {
  if (!row.pendingReferences.length) return "";
  const references = row.pendingReferences.join(", ");
  return language === "english" ? ` Pending reference(s): ${references}.` : ` Pending reference(s): ${references}.`;
}

export function buildCollectionMessage(row: SmartCollectionRow, workspaceName: string, language: CollectionLanguage = "roman-urdu") {
  const amount = formatRupees(row.currentBalance);
  const refs = referenceLine(row, language);

  if (language === "english") {
    const timing = row.status === "CRITICAL" || row.status === "OVERDUE"
      ? ` This is ${row.daysPastTerms} day${row.daysPastTerms === 1 ? "" : "s"} past the agreed payment terms.`
      : row.status === "DUE"
        ? " The payment is now due according to the account terms."
        : "";
    return `Assalam-o-Alaikum ${row.customerName}, our records show an outstanding balance of ${amount}.${timing}${refs} Kindly confirm the payment status or expected payment date. Thank you.\n— ${workspaceName}`;
  }

  const timing = row.status === "CRITICAL" || row.status === "OVERDUE"
    ? ` Ye payment terms se ${row.daysPastTerms} din overdue hai.`
    : row.status === "DUE"
      ? " Ye payment ab account terms ke mutabiq due hai."
      : "";
  return `Assalam-o-Alaikum ${row.customerName}, aapke account mein ${amount} outstanding show ho raha hai.${timing}${refs} Kindly payment status ya expected payment date confirm kar dein. Shukriya.\n— ${workspaceName}`;
}

export function buildWhatsAppUrl(row: SmartCollectionRow, workspaceName: string, language: CollectionLanguage = "roman-urdu") {
  if (!row.whatsappPhone) return null;
  return `https://wa.me/${row.whatsappPhone}?text=${encodeURIComponent(buildCollectionMessage(row, workspaceName, language))}`;
}
