import {
  DEMO_CUSTOMERS,
  DEMO_INVOICES,
  DEMO_PAYMENTS,
  DEMO_PRODUCTS,
  DEMO_SALES,
} from "@/lib/demo-data";

export type ProposedAction = {
  type: "RECORD_PAYMENT";
  customerId: string;
  customerName: string;
  amount: number;
};

export type AssistantResponse = {
  message: string;
  proposedAction?: ProposedAction;
};

export interface BusinessAssistantService {
  ask(question: string): Promise<AssistantResponse>;
}

const formatRupees = (amount: number) => `Rs ${amount.toLocaleString("en-PK")}`;
const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function customerInQuestion(question: string) {
  const normalized = normalize(question);
  return DEMO_CUSTOMERS.find((customer) =>
    [customer.companyName, customer.name].some((name) =>
      normalized.includes(normalize(name)),
    ),
  );
}

function productInQuestion(question: string) {
  const words = new Set(normalize(question).split(" "));
  return DEMO_PRODUCTS.map((product) => ({
    product,
    matches: normalize(`${product.name} ${product.sku}`)
      .split(" ")
      .filter((word) => word.length > 2 && words.has(word)).length,
  })).sort((a, b) => b.matches - a.matches)[0];
}

export class MockBusinessAssistantService implements BusinessAssistantService {
  async ask(question: string): Promise<AssistantResponse> {
    const intent = normalize(question);
    const customer = customerInQuestion(question);

    if (
      customer &&
      /(payment|paise|raqm)/.test(intent) &&
      /(record|darj|jama)/.test(intent)
    ) {
      const amountMatch = question.match(/(?:rs\.?|pkr)?\s*([\d,]+)(?:\s*(?:rupees|rupay))?/i);
      const amount = amountMatch
        ? Number(amountMatch[1].replaceAll(",", ""))
        : 0;

      if (amount > 0) {
        return {
          message: `Main ${customer.companyName} ki ${formatRupees(amount)} payment record karne ka proposal tayyar kar sakta hoon. Pehle details confirm karein.`,
          proposedAction: {
            type: "RECORD_PAYMENT",
            customerId: customer.id,
            customerName: customer.companyName,
            amount,
          },
        };
      }
    }

    if (/(aaj|aj|today)/.test(intent) && /(sale|sales|farokht)/.test(intent)) {
      const latestDate = DEMO_SALES.map((sale) => sale.date).sort().at(-1);
      const sales = DEMO_SALES.filter(
        (sale) => sale.date === latestDate && sale.status !== "CANCELLED",
      );
      const total = sales.reduce((sum, sale) => sum + sale.total, 0);
      return {
        message: `Aaj ki total sales ${formatRupees(total)} hain, ${sales.length} order${sales.length === 1 ? "" : "s"} mein.`,
      };
    }

    if (/(overdue|late|der|baqi)/.test(intent) && /(payment|invoice|customer)/.test(intent)) {
      const overdue = DEMO_INVOICES.filter((invoice) => invoice.status === "OVERDUE");
      return {
        message: overdue.length
          ? `Overdue payment: ${overdue.map((invoice) => `${invoice.customerName} ki ${formatRupees(invoice.balance)} (${invoice.invoiceNumber})`).join(", ")}.`
          : "Kisi customer ki payment overdue nahi hai.",
      };
    }

    if (/(stock|inventory|quantity|kitn)/.test(intent)) {
      const match = productInQuestion(question);
      if (match && match.matches > 0) {
        return {
          message: `${match.product.name} ka available stock ${match.product.stockQuantity} ${match.product.unit.toLowerCase()} hai.${match.product.stockQuantity <= match.product.reorderLevel ? " Yeh reorder level par ya us se neeche hai." : ""}`,
        };
      }
      if (/(low|kam|khatam|reorder)/.test(intent)) {
        const lowStock = DEMO_PRODUCTS.filter((product) => product.stockQuantity <= product.reorderLevel);
        return { message: `Low stock products: ${lowStock.map((product) => `${product.name} (${product.stockQuantity})`).join(", ")}.` };
      }
    }

    if (customer && /(balance|baqi|khata|hisab)/.test(intent)) {
      return {
        message: `${customer.companyName} ka current balance ${formatRupees(customer.currentBalance)} hai. Credit limit ${formatRupees(customer.creditLimit)} hai.`,
      };
    }

    if (/(month|mahina|mahine)/.test(intent) && /(payment|receive|wasool)/.test(intent)) {
      const total = DEMO_PAYMENTS.reduce((sum, payment) => sum + payment.amount, 0);
      return { message: `Is month ${formatRupees(total)} payments receive hui hain, ${DEMO_PAYMENTS.length} entries mein.` };
    }

    if (/(month|mahina|mahine)/.test(intent) && /(zyada|highest|most|top)/.test(intent) && /(customer|purchase|kharid)/.test(intent)) {
      const totals = DEMO_SALES.filter((sale) => sale.status !== "CANCELLED").reduce<Record<string, number>>((result, sale) => {
        result[sale.customerName] = (result[sale.customerName] ?? 0) + sale.total;
        return result;
      }, {});
      const [name, total] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
      return { message: `Is month sab se zyada ${name} ne purchase kiya: ${formatRupees(total)}.` };
    }

    return {
      message: "Main demo data se sales, overdue payments, customer balance aur product stock bata sakta hoon. Aap Roman Urdu ya English mein pooch sakte hain.",
    };
  }
}

export const businessAssistant: BusinessAssistantService =
  new MockBusinessAssistantService();
