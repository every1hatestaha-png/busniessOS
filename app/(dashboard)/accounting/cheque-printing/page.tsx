import { requirePermission } from "@/lib/server/authorization";
import { StandaloneChequePrinter } from "@/components/cheques/standalone-cheque-printer";

export default async function ChequePrintingPage() {
  await requirePermission("financial.manage");
  return <StandaloneChequePrinter />;
}
