export type Customer = {
  id: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  creditLimit: number;
  currentBalance: number;
  totalSales: number;
  totalPayments: number;
  status: "ACTIVE" | "INACTIVE" | "BLACKLISTED";
  notes?: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  unit: "PIECE" | "SET" | "BOX";
  status: "ACTIVE" | "INACTIVE";
  description: string;
};

export type SaleItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
};

export type Sale = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  date: string;
  status: "DRAFT" | "CONFIRMED" | "PROCESSING" | "COMPLETED" | "CANCELLED";
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  notes: string;
};

export const DEMO_CUSTOMERS: Customer[] = [
  { id: "c-1", name: "Ahmed Ali", companyName: "Ahmed Autos", phone: "0300 1234567", email: "ahmed@ahmedautos.pk", city: "Lahore", address: "Montgomery Road, Lahore", creditLimit: 500000, currentBalance: 125000, totalSales: 860000, totalPayments: 735000, status: "ACTIVE", notes: "Long-term wholesale customer." },
  { id: "c-2", name: "Mian Usman", companyName: "Lahore Auto Traders", phone: "0321 4421090", email: "accounts@lat.pk", city: "Lahore", address: "Badami Bagh, Lahore", creditLimit: 750000, currentBalance: 282000, totalSales: 1240000, totalPayments: 958000, status: "ACTIVE" },
  { id: "c-3", name: "Bilal Khan", companyName: "Bilal Rickshaw Parts", phone: "0333 1234567", email: "bilal@brp.pk", city: "Karachi", address: "Shershah Market, Karachi", creditLimit: 300000, currentBalance: 290000, totalSales: 690000, totalPayments: 400000, status: "ACTIVE" },
  { id: "c-4", name: "Hafiz Salman", companyName: "Madina Auto Store", phone: "0302 7788112", email: "madinaautos@gmail.com", city: "Faisalabad", address: "Jhang Road, Faisalabad", creditLimit: 400000, currentBalance: 76000, totalSales: 525000, totalPayments: 449000, status: "ACTIVE" },
  { id: "c-5", name: "Tariq Mehmood", companyName: "United Spare Parts", phone: "0315 9091188", email: "tariq@unitedspares.pk", city: "Gujranwala", address: "GT Road, Gujranwala", creditLimit: 600000, currentBalance: 0, totalSales: 475000, totalPayments: 475000, status: "ACTIVE" },
  { id: "c-6", name: "Raza Shah", companyName: "Raza Autos", phone: "0301 1234567", email: "raza@razaautos.pk", city: "Rawalpindi", address: "Sultan Ka Khoo, Rawalpindi", creditLimit: 1000000, currentBalance: 180000, totalSales: 980000, totalPayments: 800000, status: "ACTIVE" },
];

export const DEMO_PRODUCTS: Product[] = [
  { id: "p-1", name: "Front Hub 150cc", sku: "HUB-150-STD", category: "Hubs", costPrice: 1200, sellingPrice: 1500, stockQuantity: 5, reorderLevel: 20, unit: "PIECE", status: "ACTIVE", description: "Standard front wheel hub for 150cc motorcycles." },
  { id: "p-2", name: "Front Hub 200cc", sku: "HUB-200-STD", category: "Hubs", costPrice: 1750, sellingPrice: 2200, stockQuantity: 34, reorderLevel: 15, unit: "PIECE", status: "ACTIVE", description: "Heavy-duty front hub for 200cc motorcycles." },
  { id: "p-3", name: "Front Hub Plus", sku: "HUB-PLUS-HD", category: "Hubs", costPrice: 2100, sellingPrice: 2750, stockQuantity: 18, reorderLevel: 12, unit: "PIECE", status: "ACTIVE", description: "Premium hub with reinforced bearing housing." },
  { id: "p-4", name: "Brake Disc Drum 5 Stud", sku: "BDD-5S", category: "Brake Drums", costPrice: 2500, sellingPrice: 3200, stockQuantity: 45, reorderLevel: 15, unit: "PIECE", status: "ACTIVE", description: "Five-stud brake disc drum assembly." },
  { id: "p-5", name: "Brake Disc Drum HD", sku: "BDD-HD", category: "Brake Drums", costPrice: 3100, sellingPrice: 3900, stockQuantity: 8, reorderLevel: 10, unit: "PIECE", status: "ACTIVE", description: "Heavy-duty drum for commercial rickshaws." },
  { id: "p-6", name: "Brake Disc Drum United", sku: "BDD-UNITED", category: "Brake Drums", costPrice: 2800, sellingPrice: 3500, stockQuantity: 0, reorderLevel: 12, unit: "PIECE", status: "ACTIVE", description: "Compatible replacement drum for United models." },
  { id: "p-7", name: "Brake Shoe Set 70cc", sku: "BRK-70-SET", category: "Brake Parts", costPrice: 650, sellingPrice: 900, stockQuantity: 52, reorderLevel: 25, unit: "SET", status: "ACTIVE", description: "Front and rear brake shoe set for 70cc motorcycles." },
  { id: "p-8", name: "Headlight Assembly 125cc", sku: "LGT-125-ASSY", category: "Lights", costPrice: 800, sellingPrice: 1100, stockQuantity: 2, reorderLevel: 10, unit: "SET", status: "ACTIVE", description: "Complete headlight assembly for 125cc motorcycles." },
];

export const DEMO_SALES: Sale[] = [
  { id: "so-1", orderNumber: "SO-1048", customerId: "c-1", customerName: "Ahmed Autos", date: "2026-08-26", status: "COMPLETED", items: [{ productId: "p-1", productName: "Front Hub 150cc", quantity: 50, unitPrice: 1500, discount: 0, total: 75000 }, { productId: "p-4", productName: "Brake Disc Drum 5 Stud", quantity: 20, unitPrice: 3200, discount: 4000, total: 60000 }], subtotal: 139000, discount: 14000, total: 125000, paidAmount: 75000, balanceAmount: 50000, notes: "Dispatch through Bilal Goods Transport." },
  { id: "so-2", orderNumber: "SO-1047", customerId: "c-2", customerName: "Lahore Auto Traders", date: "2026-08-25", status: "PROCESSING", items: [{ productId: "p-2", productName: "Front Hub 200cc", quantity: 80, unitPrice: 2200, discount: 6000, total: 170000 }], subtotal: 176000, discount: 6000, total: 170000, paidAmount: 100000, balanceAmount: 70000, notes: "Partial payment by bank transfer." },
  { id: "so-3", orderNumber: "SO-1046", customerId: "c-3", customerName: "Bilal Rickshaw Parts", date: "2026-08-23", status: "CONFIRMED", items: [{ productId: "p-5", productName: "Brake Disc Drum HD", quantity: 40, unitPrice: 3900, discount: 6000, total: 150000 }], subtotal: 156000, discount: 6000, total: 150000, paidAmount: 50000, balanceAmount: 100000, notes: "Customer pickup." },
  { id: "so-4", orderNumber: "SO-1045", customerId: "c-4", customerName: "Madina Auto Store", date: "2026-08-20", status: "COMPLETED", items: [{ productId: "p-3", productName: "Front Hub Plus", quantity: 30, unitPrice: 2750, discount: 2500, total: 80000 }], subtotal: 82500, discount: 2500, total: 80000, paidAmount: 80000, balanceAmount: 0, notes: "Paid in cash." },
  { id: "so-5", orderNumber: "SO-1044", customerId: "c-6", customerName: "Raza Autos", date: "2026-08-18", status: "COMPLETED", items: [{ productId: "p-7", productName: "Brake Shoe Set 70cc", quantity: 100, unitPrice: 900, discount: 5000, total: 85000 }], subtotal: 90000, discount: 5000, total: 85000, paidAmount: 0, balanceAmount: 85000, notes: "30-day credit." },
  { id: "so-6", orderNumber: "SO-1043", customerId: "c-5", customerName: "United Spare Parts", date: "2026-08-12", status: "CANCELLED", items: [{ productId: "p-6", productName: "Brake Disc Drum United", quantity: 20, unitPrice: 3500, discount: 0, total: 70000 }], subtotal: 70000, discount: 0, total: 70000, paidAmount: 0, balanceAmount: 70000, notes: "Cancelled due to unavailable stock." },
];

export const DEMO_SUPPLIERS = [
  { id: "s-1", name: "Naveed Akram", companyName: "Metro Engineering Works", phone: "0300 8877441", city: "Lahore", totalPurchases: 1580000, currentBalance: 230000, status: "ACTIVE" },
  { id: "s-2", name: "Sohail Qureshi", companyName: "Pak Auto Components", phone: "0322 6609120", city: "Karachi", totalPurchases: 920000, currentBalance: 85000, status: "ACTIVE" },
  { id: "s-3", name: "Kamran Butt", companyName: "Punjab Metal Industries", phone: "0305 1239876", city: "Gujranwala", totalPurchases: 675000, currentBalance: 0, status: "ACTIVE" },
  { id: "s-4", name: "Imran Yousaf", companyName: "United Parts Manufacturing", phone: "0334 5182230", city: "Faisalabad", totalPurchases: 1100000, currentBalance: 175000, status: "ACTIVE" },
];

export const DEMO_PURCHASES = [
  { id: "po-1", orderNumber: "PO-0321", supplierId: "s-1", supplierName: "Metro Engineering Works", date: "2026-08-24", items: 4, total: 420000, paid: 250000, balance: 170000, status: "PARTIALLY_RECEIVED" },
  { id: "po-2", orderNumber: "PO-0320", supplierId: "s-2", supplierName: "Pak Auto Components", date: "2026-08-19", items: 3, total: 285000, paid: 285000, balance: 0, status: "RECEIVED" },
  { id: "po-3", orderNumber: "PO-0319", supplierId: "s-4", supplierName: "United Parts Manufacturing", date: "2026-08-11", items: 2, total: 195000, paid: 100000, balance: 95000, status: "ORDERED" },
  { id: "po-4", orderNumber: "PO-0318", supplierId: "s-3", supplierName: "Punjab Metal Industries", date: "2026-08-04", items: 5, total: 350000, paid: 350000, balance: 0, status: "RECEIVED" },
];

export const DEMO_INVOICES = [
  { id: "inv-1", invoiceNumber: "INV-2088", customerId: "c-1", customerName: "Ahmed Autos", date: "2026-08-26", dueDate: "2026-09-10", total: 125000, paid: 75000, balance: 50000, status: "PARTIALLY_PAID", orderId: "so-1" },
  { id: "inv-2", invoiceNumber: "INV-2087", customerId: "c-2", customerName: "Lahore Auto Traders", date: "2026-08-25", dueDate: "2026-09-09", total: 170000, paid: 100000, balance: 70000, status: "PARTIALLY_PAID", orderId: "so-2" },
  { id: "inv-3", invoiceNumber: "INV-2086", customerId: "c-3", customerName: "Bilal Rickshaw Parts", date: "2026-08-23", dueDate: "2026-08-30", total: 150000, paid: 50000, balance: 100000, status: "OVERDUE", orderId: "so-3" },
  { id: "inv-4", invoiceNumber: "INV-2085", customerId: "c-4", customerName: "Madina Auto Store", date: "2026-08-20", dueDate: "2026-08-20", total: 80000, paid: 80000, balance: 0, status: "PAID", orderId: "so-4" },
  { id: "inv-5", invoiceNumber: "INV-2084", customerId: "c-6", customerName: "Raza Autos", date: "2026-08-18", dueDate: "2026-09-17", total: 85000, paid: 0, balance: 85000, status: "UNPAID", orderId: "so-5" },
];

export const DEMO_PAYMENTS = [
  { id: "pay-1", customerId: "c-1", customerName: "Ahmed Autos", date: "2026-08-26", amount: 75000, method: "Bank transfer", reference: "UBL-8841" },
  { id: "pay-2", customerId: "c-2", customerName: "Lahore Auto Traders", date: "2026-08-25", amount: 100000, method: "Cheque", reference: "CHQ-10922" },
  { id: "pay-3", customerId: "c-3", customerName: "Bilal Rickshaw Parts", date: "2026-08-23", amount: 50000, method: "Cash", reference: "RCPT-448" },
  { id: "pay-4", customerId: "c-4", customerName: "Madina Auto Store", date: "2026-08-20", amount: 80000, method: "Cash", reference: "RCPT-441" },
];

export const DEMO_KHATA_ENTRIES = [
  { id: "k-1", customerId: "c-1", date: "2026-07-31", type: "OPENING_BALANCE", reference: "Opening balance", description: "Balance brought forward", debit: 65000, credit: 0 },
  { id: "k-2", customerId: "c-1", date: "2026-08-10", type: "SALE", reference: "SO-1032", description: "Parts supplied", debit: 85000, credit: 0 },
  { id: "k-3", customerId: "c-1", date: "2026-08-14", type: "PAYMENT_RECEIVED", reference: "RCPT-430", description: "Cash received", debit: 0, credit: 100000 },
  { id: "k-4", customerId: "c-1", date: "2026-08-26", type: "SALE", reference: "SO-1048", description: "Sales order", debit: 125000, credit: 0 },
  { id: "k-5", customerId: "c-1", date: "2026-08-26", type: "PAYMENT_RECEIVED", reference: "UBL-8841", description: "Bank transfer received", debit: 0, credit: 50000 },
];

export const DEMO_STOCK_MOVEMENTS = [
  { id: "sm-1", productId: "p-1", date: "2026-08-24", type: "SALE", quantity: -50, reference: "SO-1048", balance: 5 },
  { id: "sm-2", productId: "p-1", date: "2026-08-19", type: "PURCHASE", quantity: 40, reference: "PO-0320", balance: 55 },
  { id: "sm-3", productId: "p-1", date: "2026-08-10", type: "SALE", quantity: -30, reference: "SO-1032", balance: 15 },
  { id: "sm-4", productId: "p-1", date: "2026-08-01", type: "OPENING_STOCK", quantity: 45, reference: "August opening", balance: 45 },
];

export const DEMO_BUSINESS = { name: "Hassan Auto Parts", ownerName: "Hassan Raza", phone: "0300 5550199", city: "Lahore", address: "Montgomery Road, Lahore", businessType: "Wholesaler", currency: "PKR", invoicePrefix: "INV" };

export function findCustomer(id: string) { return DEMO_CUSTOMERS.find((customer) => customer.id === id); }
export function findProduct(id: string) { return DEMO_PRODUCTS.find((product) => product.id === id); }
export function findSale(id: string) { return DEMO_SALES.find((sale) => sale.id === id); }
