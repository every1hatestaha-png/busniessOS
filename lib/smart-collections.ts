import { splitContactPhones } from "@/lib/contact-phones";

export type CollectionLanguage = "roman-urdu" | "english";
export type CollectionStatus = "CURRENT" | "DUE" | "OVERDUE" | "CRITICAL" | "REVIEW";
export type CollectionPriority = "URGENT" | "HIGH" | "NORMAL" | "REVIEW" | "NONE";

export type CollectionDocument = {
  documentNumber: string;
  outstandingAmount: number;
  ageDays: number;
  isOpeningBalance?: boolean;
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

export type WhatsAppContact = {
  raw: string;
  normalized: string;
  isPrimary: boolean;
};

export type SmartCollectionRow = {
  customerId: string;
  customerName: string;
  phone: string;
  phoneNumbers: string[];
  whatsappPhone: string | null;
  whatsappPhones: WhatsAppContact[];
  currentBalance: number;
  creditDays: number;
  oldestAgeDays: number | null;
  daysPastTerms: number | null;
  status: CollectionStatus;
  priority: CollectionPriority;
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

export function getCollectionPriority(status: CollectionStatus): CollectionPriority {
  if (status === "CRITICAL") return "URGENT";
  if (status === "OVERDUE") return "HIGH";
  if (status === "DUE") return "NORMAL";
  if (status === "REVIEW") return "REVIEW";
  return "NONE";
}

export function buildSmartCollectionRows(customers: CollectionCustomerInput[]) {
  const priority: Record<CollectionStatus, number> = { CRITICAL: 0, OVERDUE: 1, DUE: 2, REVIEW: 3, CURRENT: 4 };
  return customers
    .filter((customer) => customer.currentBalance > 0)
    .map<SmartCollectionRow>((customer) => {
      // Opening balances do not preserve the original invoice/due date. Never
      // invent overdue days from the date the opening balance was entered.
      const datedItems = customer.items.filter((item) => !item.isOpeningBalance);
      const ageForTerms = datedItems.length
        ? Math.max(...datedItems.map((item) => item.ageDays))
        : customer.items.some((item) => item.isOpeningBalance)
          ? null
          : customer.oldestAgeDays;
      const { status, daysPastTerms } = getCollectionStatus(ageForTerms, customer.creditDays);
      const pendingReferences = [...new Set(customer.items
        .filter((item) => !item.isOpeningBalance)
        .map((item) => item.documentNumber)
        .filter(Boolean))].slice(0, 4);
      const phoneNumbers = splitContactPhones(customer.phone);
      const whatsappPhones = phoneNumbers.flatMap<WhatsAppContact>((raw, index) => {
        const normalized = normalizeWhatsAppPhone(raw);
        return normalized ? [{ raw, normalized, isPrimary: index === 0 }] : [];
      });
      return {
        customerId: customer.customerId,
        customerName: customer.customerName,
        phone: phoneNumbers[0] ?? "",
        phoneNumbers,
        whatsappPhone: whatsappPhones[0]?.normalized ?? null,
        whatsappPhones,
        currentBalance: roundMoney(customer.currentBalance),
        creditDays: Math.max(0, customer.creditDays),
        oldestAgeDays: ageForTerms,
        daysPastTerms,
        status,
        priority: getCollectionPriority(status),
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
    missingPhoneCount: dueRows.filter((row) => row.whatsappPhones.length === 0).length,
  };
}

function formatRupees(amount: number) {
  return `Rs ${amount.toLocaleString("en-PK", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function referenceText(row: SmartCollectionRow) {
  return row.pendingReferences.length ? row.pendingReferences.join(", ") : "Account balance";
}

function englishReminderMeta(row: SmartCollectionRow) {
  if (row.status === "CRITICAL") return {
    title: "IMPORTANT PAYMENT FOLLOW-UP",
    statusLine: `${row.daysPastTerms} days past payment terms`,
    action: "Please prioritize settlement and confirm the expected payment date.",
  };
  if (row.status === "OVERDUE") return {
    title: "PAYMENT FOLLOW-UP",
    statusLine: `${row.daysPastTerms} day${row.daysPastTerms === 1 ? "" : "s"} past payment terms`,
    action: "Kindly confirm the payment status or expected payment date.",
  };
  if (row.status === "DUE") return {
    title: "PAYMENT REMINDER",
    statusLine: "Payment is due according to the account terms",
    action: "Kindly confirm the payment status or expected payment date.",
  };
  if (row.status === "REVIEW") return {
    title: "ACCOUNT BALANCE CONFIRMATION",
    statusLine: "Balance date requires manual confirmation",
    action: "Kindly confirm the current balance and expected payment plan.",
  };
  return {
    title: "ACCOUNT BALANCE UPDATE",
    statusLine: "Within current payment terms",
    action: "This is an account balance update for your records.",
  };
}

function romanUrduReminderMeta(row: SmartCollectionRow) {
  if (row.status === "CRITICAL") return {
    title: "IMPORTANT PAYMENT FOLLOW-UP",
    statusLine: `${row.daysPastTerms} din payment terms se late`,
    action: "Meherbani karke payment ko priority dein aur expected payment date confirm kar dein.",
  };
  if (row.status === "OVERDUE") return {
    title: "PAYMENT FOLLOW-UP",
    statusLine: `${row.daysPastTerms} din payment terms se late`,
    action: "Meherbani karke payment status ya expected payment date confirm kar dein.",
  };
  if (row.status === "DUE") return {
    title: "PAYMENT REMINDER",
    statusLine: "Payment account terms ke mutabiq due hai",
    action: "Meherbani karke payment status ya expected payment date confirm kar dein.",
  };
  if (row.status === "REVIEW") return {
    title: "ACCOUNT BALANCE CONFIRMATION",
    statusLine: "Balance ki date manual confirmation chahti hai",
    action: "Meherbani karke current balance aur expected payment plan confirm kar dein.",
  };
  return {
    title: "ACCOUNT BALANCE UPDATE",
    statusLine: "Payment abhi current terms ke andar hai",
    action: "Ye sirf aapke record ke liye account balance update hai.",
  };
}

export function buildCollectionMessage(row: SmartCollectionRow, workspaceName: string, language: CollectionLanguage = "roman-urdu") {
  const amount = formatRupees(row.currentBalance);
  const references = referenceText(row);

  if (language === "english") {
    const meta = englishReminderMeta(row);
    return `*${meta.title}*\n*${workspaceName}*\n\nAssalam-o-Alaikum ${row.customerName},\n\nThis is a reminder regarding your account with us.\n\n*Outstanding:* ${amount}\n*Status:* ${meta.statusLine}\n*Reference(s):* ${references}\n\n${meta.action}\n\nIf payment has already been made, please share the payment reference so we can update our records.\n\nThank you,\n*Accounts — ${workspaceName}*`;
  }

  const meta = romanUrduReminderMeta(row);
  return `*${meta.title}*\n*${workspaceName}*\n\nAssalam-o-Alaikum ${row.customerName},\n\nAapke account ke hawale se payment reminder share kar rahe hain.\n\n*Outstanding:* ${amount}\n*Status:* ${meta.statusLine}\n*Reference(s):* ${references}\n\n${meta.action}\n\nAgar payment ho chuki hai to payment reference share kar dein taake hum record update kar saken.\n\nShukriya,\n*Accounts — ${workspaceName}*`;
}

export function buildWhatsAppUrlForMessage(phone: string, message: string) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppUrl(row: SmartCollectionRow, workspaceName: string, language: CollectionLanguage = "roman-urdu", phone?: string) {
  const target = phone ?? row.whatsappPhones[0]?.raw ?? row.whatsappPhone;
  if (!target) return null;
  return buildWhatsAppUrlForMessage(target, buildCollectionMessage(row, workspaceName, language));
}
