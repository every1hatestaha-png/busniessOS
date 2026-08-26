export type SearchResult = {
  id: string;
  type: "Customer" | "Product" | "Order" | "Invoice";
  title: string;
  detail: string;
  href: string;
};
