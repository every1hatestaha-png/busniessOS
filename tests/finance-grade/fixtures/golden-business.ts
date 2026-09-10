/**
 * Golden Business Scenario: Deterministic seed data for finance-grade QA.
 * This defines a realistic test business with known opening balances.
 * All expected values are independently calculated — BusinessOS is NOT the source of truth.
 */

import type { AccountingOracle } from "../oracle/accounting-oracle";

// ─── SUPPLIERS ──────────────────────────────────────────────────────────────

export interface SupplierSeed {
  name: string;
  companyName: string;
  phone: string;
  city: string;
  openingBalance: number; // what we owe them
}

export const SUPPLIERS: SupplierSeed[] = [
  { name: "Ahmed Textiles", companyName: "Ahmed Textiles Pvt Ltd", phone: "+92-21-3456-7890", city: "Karachi", openingBalance: 50000 },
  { name: "Raza Electronics", companyName: "Raza Electronics", phone: "+92-42-3765-4321", city: "Lahore", openingBalance: 75000 },
  { name: "Khan Foods", companyName: "Khan Foods International", phone: "+92-51-8765-1234", city: "Islamabad", openingBalance: 30000 },
  { name: "Global Materials", companyName: "Global Materials Co", phone: "+92-21-5555-6666", city: "Karachi", openingBalance: 45000 },
  { name: "Pak Stationery", companyName: "Pak Stationery Supplies", phone: "+92-42-3333-7777", city: "Lahore", openingBalance: 0 },
];

// ─── CUSTOMERS ──────────────────────────────────────────────────────────────

export interface CustomerSeed {
  name: string;
  companyName: string;
  phone: string;
  city: string;
  creditDays: number;
  creditLimit: number;
  openingBalance: number; // what they owe us
}

export const CUSTOMERS: CustomerSeed[] = [
  { name: "Bilal Traders", companyName: "Bilal Trading Co", phone: "+92-21-1111-2222", city: "Karachi", creditDays: 30, creditLimit: 200000, openingBalance: 45000 },
  { name: "Sara Enterprises", companyName: "Sara Enterprises", phone: "+92-42-2222-3333", city: "Lahore", creditDays: 15, creditLimit: 150000, openingBalance: 30000 },
  { name: "Hassan & Sons", companyName: "Hassan & Sons Pvt Ltd", phone: "+92-51-3333-4444", city: "Rawalpindi", creditDays: 45, creditLimit: 500000, openingBalance: 60000 },
  { name: "Fatima Mart", companyName: "Fatima Supermart", phone: "+92-21-4444-5555", city: "Karachi", creditDays: 30, creditLimit: 100000, openingBalance: 0 },
  { name: "Usman Corp", companyName: "Usman Corporation", phone: "+92-42-5555-6666", city: "Lahore", creditDays: 30, creditLimit: 300000, openingBalance: 25000 },
  { name: "Ayesha Retail", companyName: "Ayesha Retail Store", phone: "+92-21-6666-7777", city: "Karachi", creditDays: 15, creditLimit: 75000, openingBalance: 15000 },
  { name: "Omar Distributors", companyName: "Omar Distribution", phone: "+92-42-7777-8888", city: "Faisalabad", creditDays: 30, creditLimit: 250000, openingBalance: 40000 },
  { name: "Zain Wholesale", companyName: "Zain Wholesale Market", phone: "+92-51-8888-9999", city: "Islamabad", creditDays: 45, creditLimit: 400000, openingBalance: 55000 },
  { name: "Mehmood Brothers", companyName: "Mehmood Bros Trading", phone: "+92-21-9999-0000", city: "Karachi", creditDays: 30, creditLimit: 180000, openingBalance: 20000 },
  { name: "Nadia Foods", companyName: "Nadia Food Products", phone: "+92-42-1111-0000", city: "Lahore", creditDays: 15, creditLimit: 120000, openingBalance: 10000 },
  { name: "Cash Customer 1", companyName: "", phone: "", city: "Karachi", creditDays: 0, creditLimit: 0, openingBalance: 0 },
  { name: "Cash Customer 2", companyName: "", phone: "", city: "Lahore", creditDays: 0, creditLimit: 0, openingBalance: 0 },
  { name: "Fast Mart", companyName: "Fast Mart Retail", phone: "+92-21-1234-5678", city: "Karachi", creditDays: 30, creditLimit: 100000, openingBalance: 8000 },
  { name: "Blue Sky Traders", companyName: "Blue Sky Trading", phone: "+92-42-5678-1234", city: "Lahore", creditDays: 30, creditLimit: 200000, openingBalance: 12000 },
  { name: "Green Valley", companyName: "Green Valley Supplies", phone: "+92-51-9876-5432", city: "Islamabad", creditDays: 15, creditLimit: 90000, openingBalance: 0 },
  { name: "Prime Solutions", companyName: "Prime Solutions Ltd", phone: "+92-21-3456-7890", city: "Karachi", creditDays: 45, creditLimit: 350000, openingBalance: 0 },
  { name: "City Hardware", companyName: "City Hardware Store", phone: "+92-42-2345-6789", city: "Lahore", creditDays: 30, creditLimit: 150000, openingBalance: 5000 },
  { name: "Royal Suppliers", companyName: "Royal Suppliers", phone: "+92-51-4567-8901", city: "Rawalpindi", creditDays: 30, creditLimit: 200000, openingBalance: 0 },
  { name: "Best Price Store", companyName: "Best Price Store", phone: "+92-21-6789-0123", city: "Karachi", creditDays: 15, creditLimit: 80000, openingBalance: 7000 },
  { name: "Express Trading", companyName: "Express Trading Co", phone: "+92-42-8901-2345", city: "Faisalabad", creditDays: 30, creditLimit: 160000, openingBalance: 13000 },
];

// ─── PRODUCTS ───────────────────────────────────────────────────────────────

export interface ProductSeed {
  name: string;
  sku: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  unit: "PIECE" | "KG" | "BOX" | "CARTON" | "SET" | "LITER" | "METER";
}

// 100 products across various categories
export const PRODUCTS: ProductSeed[] = [
  // Textiles (20 products)
  { name: "Cotton Fabric Roll", sku: "TXT-001", category: "Textiles", costPrice: 800, sellingPrice: 1200, stockQuantity: 50, reorderLevel: 10, unit: "METER" },
  { name: "Silk Fabric Premium", sku: "TXT-002", category: "Textiles", costPrice: 2500, sellingPrice: 3800, stockQuantity: 20, reorderLevel: 5, unit: "METER" },
  { name: "Polyester Blend", sku: "TXT-003", category: "Textiles", costPrice: 450, sellingPrice: 700, stockQuantity: 100, reorderLevel: 20, unit: "METER" },
  { name: "Denim Fabric", sku: "TXT-004", category: "Textiles", costPrice: 600, sellingPrice: 950, stockQuantity: 75, reorderLevel: 15, unit: "METER" },
  { name: "Linen Material", sku: "TXT-005", category: "Textiles", costPrice: 1200, sellingPrice: 1800, stockQuantity: 30, reorderLevel: 8, unit: "METER" },
  { name: "Printed Lawn", sku: "TXT-006", category: "Textiles", costPrice: 350, sellingPrice: 550, stockQuantity: 200, reorderLevel: 30, unit: "METER" },
  { name: "Chiffon Fabric", sku: "TXT-007", category: "Textiles", costPrice: 700, sellingPrice: 1100, stockQuantity: 40, reorderLevel: 10, unit: "METER" },
  { name: "Velvet Material", sku: "TXT-008", category: "Textiles", costPrice: 1500, sellingPrice: 2300, stockQuantity: 25, reorderLevel: 5, unit: "METER" },
  { name: "Fleece Fabric", sku: "TXT-009", category: "Textiles", costPrice: 550, sellingPrice: 850, stockQuantity: 60, reorderLevel: 12, unit: "METER" },
  { name: "Canvas Material", sku: "TXT-010", category: "Textiles", costPrice: 400, sellingPrice: 650, stockQuantity: 80, reorderLevel: 15, unit: "METER" },
  { name: "Embroidered Suit", sku: "TXT-011", category: "Textiles", costPrice: 3500, sellingPrice: 5500, stockQuantity: 15, reorderLevel: 3, unit: "SET" },
  { name: "Unstitched Collection", sku: "TXT-012", category: "Textiles", costPrice: 1800, sellingPrice: 2800, stockQuantity: 35, reorderLevel: 8, unit: "SET" },
  { name: "Bed Sheet Set", sku: "TXT-013", category: "Textiles", costPrice: 1200, sellingPrice: 1900, stockQuantity: 45, reorderLevel: 10, unit: "SET" },
  { name: "Towel Bundle", sku: "TXT-014", category: "Textiles", costPrice: 800, sellingPrice: 1300, stockQuantity: 60, reorderLevel: 12, unit: "SET" },
  { name: "Curtain Fabric", sku: "TXT-015", category: "Textiles", costPrice: 900, sellingPrice: 1400, stockQuantity: 30, reorderLevel: 8, unit: "METER" },
  { name: "Shirting Material", sku: "TXT-016", category: "Textiles", costPrice: 500, sellingPrice: 800, stockQuantity: 120, reorderLevel: 20, unit: "METER" },
  { name: "Suiting Fabric", sku: "TXT-017", category: "Textiles", costPrice: 750, sellingPrice: 1200, stockQuantity: 90, reorderLevel: 15, unit: "METER" },
  { name: "Georgette Fabric", sku: "TXT-018", category: "Textiles", costPrice: 650, sellingPrice: 1000, stockQuantity: 55, reorderLevel: 10, unit: "METER" },
  { name: "Net Fabric", sku: "TXT-019", category: "Textiles", costPrice: 300, sellingPrice: 500, stockQuantity: 150, reorderLevel: 25, unit: "METER" },
  { name: "Jacquard Fabric", sku: "TXT-020", category: "Textiles", costPrice: 1100, sellingPrice: 1700, stockQuantity: 35, reorderLevel: 8, unit: "METER" },

  // Electronics (20 products)
  { name: "LED Bulb 12W", sku: "ELC-001", category: "Electronics", costPrice: 150, sellingPrice: 280, stockQuantity: 200, reorderLevel: 40, unit: "PIECE" },
  { name: "Ceiling Fan", sku: "ELC-002", category: "Electronics", costPrice: 3500, sellingPrice: 5500, stockQuantity: 30, reorderLevel: 8, unit: "PIECE" },
  { name: "Voltage Stabilizer", sku: "ELC-003", category: "Electronics", costPrice: 2800, sellingPrice: 4200, stockQuantity: 25, reorderLevel: 5, unit: "PIECE" },
  { name: "Extension Board 6-Way", sku: "ELC-004", category: "Electronics", costPrice: 450, sellingPrice: 750, stockQuantity: 80, reorderLevel: 15, unit: "PIECE" },
  { name: "Inverter 1000W", sku: "ELC-005", category: "Electronics", costPrice: 18000, sellingPrice: 25000, stockQuantity: 10, reorderLevel: 3, unit: "PIECE" },
  { name: "Battery 12V 100Ah", sku: "ELC-006", category: "Electronics", costPrice: 12000, sellingPrice: 16500, stockQuantity: 15, reorderLevel: 5, unit: "PIECE" },
  { name: "Solar Panel 300W", sku: "ELC-007", category: "Electronics", costPrice: 8000, sellingPrice: 12000, stockQuantity: 20, reorderLevel: 5, unit: "PIECE" },
  { name: "Water Pump", sku: "ELC-008", category: "Electronics", costPrice: 5500, sellingPrice: 8500, stockQuantity: 12, reorderLevel: 3, unit: "PIECE" },
  { name: "Electric Heater", sku: "ELC-009", category: "Electronics", costPrice: 2200, sellingPrice: 3500, stockQuantity: 40, reorderLevel: 10, unit: "PIECE" },
  { name: "LED Tube Light", sku: "ELC-010", category: "Electronics", costPrice: 350, sellingPrice: 600, stockQuantity: 150, reorderLevel: 30, unit: "PIECE" },
  { name: "Switch Board", sku: "ELC-011", category: "Electronics", costPrice: 250, sellingPrice: 450, stockQuantity: 100, reorderLevel: 20, unit: "PIECE" },
  { name: "MCB Circuit Breaker", sku: "ELC-012", category: "Electronics", costPrice: 180, sellingPrice: 320, stockQuantity: 120, reorderLevel: 25, unit: "PIECE" },
  { name: "Wire Bundle 2.5mm", sku: "ELC-013", category: "Electronics", costPrice: 120, sellingPrice: 200, stockQuantity: 300, reorderLevel: 50, unit: "METER" },
  { name: "Cable Ties Pack", sku: "ELC-014", category: "Electronics", costPrice: 80, sellingPrice: 150, stockQuantity: 500, reorderLevel: 100, unit: "SET" },
  { name: "Copper Wire Roll", sku: "ELC-015", category: "Electronics", costPrice: 2500, sellingPrice: 3800, stockQuantity: 20, reorderLevel: 5, unit: "METER" },
  { name: "Transformer 500VA", sku: "ELC-016", category: "Electronics", costPrice: 4500, sellingPrice: 7000, stockQuantity: 8, reorderLevel: 2, unit: "PIECE" },
  { name: "Generator Parts Kit", sku: "ELC-017", category: "Electronics", costPrice: 3000, sellingPrice: 4500, stockQuantity: 15, reorderLevel: 3, unit: "SET" },
  { name: "Power Strip", sku: "ELC-018", category: "Electronics", costPrice: 600, sellingPrice: 1000, stockQuantity: 60, reorderLevel: 15, unit: "PIECE" },
  { name: "Surge Protector", sku: "ELC-019", category: "Electronics", costPrice: 800, sellingPrice: 1300, stockQuantity: 45, reorderLevel: 10, unit: "PIECE" },
  { name: "Digital Timer", sku: "ELC-020", category: "Electronics", costPrice: 500, sellingPrice: 850, stockQuantity: 35, reorderLevel: 8, unit: "PIECE" },

  // Grocery / FMCG (20 products)
  { name: "Basmati Rice 5kg", sku: "GRF-001", category: "Grocery", costPrice: 450, sellingPrice: 650, stockQuantity: 100, reorderLevel: 20, unit: "BOX" },
  { name: "Wheat Flour 10kg", sku: "GRF-002", category: "Grocery", costPrice: 600, sellingPrice: 850, stockQuantity: 150, reorderLevel: 30, unit: "BOX" },
  { name: "Cooking Oil 5L", sku: "GRF-003", category: "Grocery", costPrice: 1100, sellingPrice: 1500, stockQuantity: 80, reorderLevel: 15, unit: "LITER" },
  { name: "Sugar 5kg", sku: "GRF-004", category: "Grocery", costPrice: 350, sellingPrice: 500, stockQuantity: 120, reorderLevel: 25, unit: "BOX" },
  { name: "Tea Pack 1kg", sku: "GRF-005", category: "Grocery", costPrice: 800, sellingPrice: 1200, stockQuantity: 60, reorderLevel: 12, unit: "BOX" },
  { name: "Milk Powder 400g", sku: "GRF-006", category: "Grocery", costPrice: 450, sellingPrice: 680, stockQuantity: 90, reorderLevel: 20, unit: "BOX" },
  { name: "Salt 1kg Pack", sku: "GRF-007", category: "Grocery", costPrice: 50, sellingPrice: 100, stockQuantity: 200, reorderLevel: 40, unit: "BOX" },
  { name: "Spice Mix Box", sku: "GRF-008", category: "Grocery", costPrice: 250, sellingPrice: 400, stockQuantity: 80, reorderLevel: 15, unit: "SET" },
  { name: "Biscuit Carton", sku: "GRF-009", category: "Grocery", costPrice: 600, sellingPrice: 900, stockQuantity: 50, reorderLevel: 10, unit: "CARTON" },
  { name: "Soft Drink Carton", sku: "GRF-010", category: "Grocery", costPrice: 500, sellingPrice: 750, stockQuantity: 40, reorderLevel: 10, unit: "CARTON" },
  { name: "Water Bottle Case", sku: "GRF-011", category: "Grocery", costPrice: 300, sellingPrice: 480, stockQuantity: 60, reorderLevel: 15, unit: "CARTON" },
  { name: "Noodle Pack", sku: "GRF-012", category: "Grocery", costPrice: 80, sellingPrice: 140, stockQuantity: 300, reorderLevel: 50, unit: "BOX" },
  { name: "Cooking Spice Set", sku: "GRF-013", category: "Grocery", costPrice: 350, sellingPrice: 550, stockQuantity: 70, reorderLevel: 15, unit: "SET" },
  { name: "Detergent Powder 3kg", sku: "GRF-014", category: "Grocery", costPrice: 400, sellingPrice: 650, stockQuantity: 85, reorderLevel: 20, unit: "BOX" },
  { name: "Dish Wash Liquid", sku: "GRF-015", category: "Grocery", costPrice: 120, sellingPrice: 200, stockQuantity: 100, reorderLevel: 20, unit: "LITER" },
  { name: "Paper Towel Pack", sku: "GRF-016", category: "Grocery", costPrice: 200, sellingPrice: 350, stockQuantity: 90, reorderLevel: 20, unit: "SET" },
  { name: "Tissue Box", sku: "GRF-017", category: "Grocery", costPrice: 100, sellingPrice: 180, stockQuantity: 150, reorderLevel: 30, unit: "BOX" },
  { name: "Canned Food Carton", sku: "GRF-018", category: "Grocery", costPrice: 800, sellingPrice: 1200, stockQuantity: 45, reorderLevel: 10, unit: "CARTON" },
  { name: "Snack Mix Box", sku: "GRF-019", category: "Grocery", costPrice: 550, sellingPrice: 850, stockQuantity: 55, reorderLevel: 12, unit: "BOX" },
  { name: "Baby Food Pack", sku: "GRF-020", category: "Grocery", costPrice: 900, sellingPrice: 1350, stockQuantity: 30, reorderLevel: 8, unit: "BOX" },

  // Hardware (20 products)
  { name: "PVC Pipe 2 inch", sku: "HRD-001", category: "Hardware", costPrice: 120, sellingPrice: 200, stockQuantity: 200, reorderLevel: 40, unit: "METER" },
  { name: "Cement Bag 50kg", sku: "HRD-002", category: "Hardware", costPrice: 550, sellingPrice: 750, stockQuantity: 100, reorderLevel: 20, unit: "BOX" },
  { name: "Steel Rod 10mm", sku: "HRD-003", category: "Hardware", costPrice: 180, sellingPrice: 280, stockQuantity: 300, reorderLevel: 50, unit: "METER" },
  { name: "Paint Bucket 20L", sku: "HRD-004", category: "Hardware", costPrice: 3500, sellingPrice: 5000, stockQuantity: 25, reorderLevel: 5, unit: "LITER" },
  { name: "Door Lock Set", sku: "HRD-005", category: "Hardware", costPrice: 1500, sellingPrice: 2500, stockQuantity: 40, reorderLevel: 8, unit: "SET" },
  { name: "Hinge Pack", sku: "HRD-006", category: "Hardware", costPrice: 200, sellingPrice: 350, stockQuantity: 100, reorderLevel: 20, unit: "SET" },
  { name: "Screw Box Assortment", sku: "HRD-007", category: "Hardware", costPrice: 300, sellingPrice: 500, stockQuantity: 80, reorderLevel: 15, unit: "BOX" },
  { name: "Drill Bit Set", sku: "HRD-008", category: "Hardware", costPrice: 800, sellingPrice: 1300, stockQuantity: 30, reorderLevel: 8, unit: "SET" },
  { name: "Hammer Standard", sku: "HRD-009", category: "Hardware", costPrice: 400, sellingPrice: 650, stockQuantity: 50, reorderLevel: 10, unit: "PIECE" },
  { name: "Tape Measure 5m", sku: "HRD-010", category: "Hardware", costPrice: 250, sellingPrice: 450, stockQuantity: 60, reorderLevel: 12, unit: "PIECE" },
  { name: "Wrench Set", sku: "HRD-011", category: "Hardware", costPrice: 600, sellingPrice: 1000, stockQuantity: 35, reorderLevel: 8, unit: "SET" },
  { name: "Electrical Tape Roll", sku: "HRD-012", category: "Hardware", costPrice: 80, sellingPrice: 150, stockQuantity: 200, reorderLevel: 40, unit: "PIECE" },
  { name: "Plumbing Kit", sku: "HRD-013", category: "Hardware", costPrice: 1200, sellingPrice: 2000, stockQuantity: 25, reorderLevel: 5, unit: "SET" },
  { name: "Nail Assortment Box", sku: "HRD-014", category: "Hardware", costPrice: 250, sellingPrice: 420, stockQuantity: 90, reorderLevel: 20, unit: "BOX" },
  { name: "Wire Brush", sku: "HRD-015", category: "Hardware", costPrice: 150, sellingPrice: 280, stockQuantity: 70, reorderLevel: 15, unit: "PIECE" },
  { name: "Level Tool", sku: "HRD-016", category: "Hardware", costPrice: 500, sellingPrice: 850, stockQuantity: 20, reorderLevel: 5, unit: "PIECE" },
  { name: "Saw Blade", sku: "HRD-017", category: "Hardware", costPrice: 350, sellingPrice: 600, stockQuantity: 45, reorderLevel: 10, unit: "PIECE" },
  { name: "Glue Tube Pack", sku: "HRD-018", category: "Hardware", costPrice: 180, sellingPrice: 300, stockQuantity: 100, reorderLevel: 20, unit: "SET" },
  { name: "Sandpaper Pack", sku: "HRD-019", category: "Hardware", costPrice: 120, sellingPrice: 220, stockQuantity: 150, reorderLevel: 30, unit: "SET" },
  { name: "Spray Paint Can", sku: "HRD-020", category: "Hardware", costPrice: 300, sellingPrice: 500, stockQuantity: 80, reorderLevel: 15, unit: "LITER" },

  // Stationery (10 products)
  { name: "A4 Paper Carton", sku: "STA-001", category: "Stationery", costPrice: 1200, sellingPrice: 1800, stockQuantity: 50, reorderLevel: 10, unit: "CARTON" },
  { name: "Pen Pack 50", sku: "STA-002", category: "Stationery", costPrice: 400, sellingPrice: 650, stockQuantity: 80, reorderLevel: 15, unit: "SET" },
  { name: "Marker Set", sku: "STA-003", category: "Stationery", costPrice: 250, sellingPrice: 400, stockQuantity: 60, reorderLevel: 12, unit: "SET" },
  { name: "File Folder Box", sku: "STA-004", category: "Stationery", costPrice: 350, sellingPrice: 550, stockQuantity: 70, reorderLevel: 15, unit: "BOX" },
  { name: "Stapler Heavy Duty", sku: "STA-005", category: "Stationery", costPrice: 500, sellingPrice: 800, stockQuantity: 30, reorderLevel: 8, unit: "PIECE" },
  { name: "Notebook Bundle", sku: "STA-006", category: "Stationery", costPrice: 300, sellingPrice: 500, stockQuantity: 100, reorderLevel: 20, unit: "SET" },
  { name: "Calculator Standard", sku: "STA-007", category: "Stationery", costPrice: 600, sellingPrice: 1000, stockQuantity: 40, reorderLevel: 8, unit: "PIECE" },
  { name: "Whiteboard Marker Set", sku: "STA-008", category: "Stationery", costPrice: 200, sellingPrice: 350, stockQuantity: 50, reorderLevel: 10, unit: "SET" },
  { name: "Tape Dispenser", sku: "STA-009", category: "Stationery", costPrice: 150, sellingPrice: 280, stockQuantity: 60, reorderLevel: 12, unit: "PIECE" },
  { name: "Envelopes Pack", sku: "STA-010", category: "Stationery", costPrice: 100, sellingPrice: 180, stockQuantity: 200, reorderLevel: 40, unit: "SET" },

  // Weight-based products (10 products)
  { name: "Bulk Rice per Kg", sku: "WGT-001", category: "Grocery", costPrice: 90, sellingPrice: 130, stockQuantity: 500, reorderLevel: 100, unit: "KG" },
  { name: "Sugar per Kg", sku: "WGT-002", category: "Grocery", costPrice: 70, sellingPrice: 100, stockQuantity: 300, reorderLevel: 60, unit: "KG" },
  { name: "Flour per Kg", sku: "WGT-003", category: "Grocery", costPrice: 60, sellingPrice: 90, stockQuantity: 400, reorderLevel: 80, unit: "KG" },
  { name: "Lentils per Kg", sku: "WGT-004", category: "Grocery", costPrice: 200, sellingPrice: 300, stockQuantity: 200, reorderLevel: 40, unit: "KG" },
  { name: "Copper Wire per Kg", sku: "WGT-005", category: "Electronics", costPrice: 800, sellingPrice: 1200, stockQuantity: 50, reorderLevel: 10, unit: "KG" },
  { name: "Iron Scrap per Kg", sku: "WGT-006", category: "Hardware", costPrice: 80, sellingPrice: 140, stockQuantity: 1000, reorderLevel: 200, unit: "KG" },
  { name: "Brass Fittings per Kg", sku: "WGT-007", category: "Hardware", costPrice: 600, sellingPrice: 950, stockQuantity: 80, reorderLevel: 15, unit: "KG" },
  { name: "Cotton Yarn per Kg", sku: "WGT-008", category: "Textiles", costPrice: 400, sellingPrice: 650, stockQuantity: 150, reorderLevel: 30, unit: "KG" },
  { name: "Spice Mix per Kg", sku: "WGT-009", category: "Grocery", costPrice: 500, sellingPrice: 800, stockQuantity: 100, reorderLevel: 20, unit: "KG" },
  { name: "Detergent per Kg", sku: "WGT-010", category: "Grocery", costPrice: 150, sellingPrice: 250, stockQuantity: 250, reorderLevel: 50, unit: "KG" },
];

// ─── OPENING BALANCES ───────────────────────────────────────────────────────

export const OPENING_CASH_BALANCE = 500000; // PKR 500,000
export const OPENING_BANK_BALANCE = 2000000; // PKR 2,000,000

// Total opening AR = sum of customer opening balances
export const TOTAL_OPENING_AR = CUSTOMERS.reduce((s, c) => s + c.openingBalance, 0); // 360,000
// Total opening AP = sum of supplier opening balances
export const TOTAL_OPENING_AP = SUPPLIERS.reduce((s, p) => s + p.openingBalance, 0); // 200,000

/** Seed the oracle with the golden business scenario. */
export function seedOracle(oracle: AccountingOracle) {
  // Seed suppliers
  for (const s of SUPPLIERS) {
    oracle.seedSupplier({ id: `supplier-${s.name}`, name: s.name, currentBalance: s.openingBalance });
  }

  // Seed customers
  for (const c of CUSTOMERS) {
    oracle.seedCustomer({ id: `customer-${c.name}`, name: c.name, currentBalance: c.openingBalance });
  }

  // Seed products
  for (const p of PRODUCTS) {
    oracle.seedProduct({
      id: `product-${p.sku}`,
      name: p.name,
      sku: p.sku,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      stockQuantity: p.stockQuantity,
      unit: p.unit,
    });
  }

  // Seed cash/bank accounts
  oracle.seedCashBankAccount({
    id: "cash-account",
    accountId: "cash-gl",
    name: "Cash in Hand",
    isBank: false,
    openingBalance: OPENING_CASH_BALANCE,
    currentBalance: OPENING_CASH_BALANCE,
  });
  oracle.seedCashBankAccount({
    id: "bank-account",
    accountId: "bank-gl",
    name: "Bank Account",
    isBank: true,
    openingBalance: OPENING_BANK_BALANCE,
    currentBalance: OPENING_BANK_BALANCE,
  });
}
