import type { WorkspaceVertical } from "@prisma/client";

export type NavigationSection = { label: string; routes: readonly string[] };

const overview = ["/dashboard"];
const tradingOperations = ["/sales", "/purchases", "/goods-receipts", "/inventory", "/customers", "/suppliers", "/supplier-returns"];
const finance = ["/khata", "/invoices", "/collections", "/receivables", "/accounting/cash-bank", "/accounting/expenses", "/accounting/notes", "/payables", "/reports"];
const workspace = ["/ai", "/settings"];

const navigation: Record<WorkspaceVertical, readonly NavigationSection[]> = {
  TRADING: [
    { label: "Overview", routes: overview },
    { label: "Trading", routes: tradingOperations },
    { label: "Optional modules", routes: ["/manufacturing", "/restaurant", "/services"] },
    { label: "Finance", routes: finance },
    { label: "Workspace", routes: workspace },
  ],
  MANUFACTURING: [
    { label: "Overview", routes: overview },
    { label: "Production", routes: ["/manufacturing", "/inventory"] },
    { label: "Trade flows", routes: ["/purchases", "/goods-receipts", "/suppliers", "/sales", "/customers", "/supplier-returns"] },
    { label: "Optional modules", routes: ["/restaurant", "/services"] },
    { label: "Finance", routes: finance },
    { label: "Workspace", routes: workspace },
  ],
  LEGACY: [
    { label: "Overview", routes: overview },
    { label: "Operations", routes: tradingOperations },
    { label: "Industry", routes: ["/restaurant", "/manufacturing", "/services"] },
    { label: "Finance", routes: finance },
    { label: "Workspace", routes: workspace },
  ],
  RESTAURANT: [
    { label: "Restaurant", routes: ["/restaurant", "/restaurant/pos", "/restaurant/orders", "/restaurant/kitchen", "/restaurant/menu", "/restaurant/whatsapp"] },
    { label: "Stock & purchasing", routes: ["/inventory", "/purchases", "/goods-receipts", "/suppliers", "/supplier-returns"] },
    { label: "Finance", routes: ["/accounting/cash-bank", "/accounting/expenses", "/reports"] },
    { label: "Workspace", routes: ["/settings"] },
  ],
  PROPERTY: [],
  SERVICES: [],
};

export type DashboardComposition = { title: string; lead: "trade" | "production" | "restaurant"; sharedErpPanels: boolean };
const dashboards: Record<WorkspaceVertical, DashboardComposition | null> = {
  TRADING: { title: "Trading overview", lead: "trade", sharedErpPanels: true },
  MANUFACTURING: { title: "Manufacturing overview", lead: "production", sharedErpPanels: true },
  LEGACY: { title: "Dashboard", lead: "trade", sharedErpPanels: true },
  RESTAURANT: { title: "Restaurant overview", lead: "restaurant", sharedErpPanels: false },
  PROPERTY: null,
  SERVICES: null,
};

const reportOrders: Record<WorkspaceVertical, readonly string[]> = {
  TRADING: ["Financial", "Sales & Purchasing", "Accounts", "Inventory"],
  MANUFACTURING: ["Inventory", "Sales & Purchasing", "Financial", "Accounts"],
  LEGACY: ["Financial", "Sales & Purchasing", "Accounts", "Inventory"],
  RESTAURANT: ["Restaurant", "Financial", "Inventory"],
  PROPERTY: [],
  SERVICES: [],
};

const searchTypes: Record<WorkspaceVertical, readonly string[]> = {
  TRADING: ["Customer", "Product", "Order", "Invoice"],
  MANUFACTURING: ["Product", "Order", "Customer", "Invoice"],
  LEGACY: ["Customer", "Product", "Order", "Invoice"],
  RESTAURANT: ["Order", "Product"],
  PROPERTY: [],
  SERVICES: [],
};

export function getVerticalNavigation(vertical: WorkspaceVertical) { return navigation[vertical]; }
export function getDashboardComposition(vertical: WorkspaceVertical) { return dashboards[vertical]; }
export function getReportSectionOrder(vertical: WorkspaceVertical) { return reportOrders[vertical]; }
export function getSearchTypes(vertical: WorkspaceVertical) { return searchTypes[vertical]; }
