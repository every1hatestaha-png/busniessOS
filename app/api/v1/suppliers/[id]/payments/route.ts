import { z } from "zod";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { recordSupplierPayment, SupplierDomainError } from "@/lib/server/suppliers";
import { supplierPaymentSchema } from "@/lib/validation/supplier";
export const POST = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => { const context = await requireApiContext("payments.record"); const { id } = z.object({ id: z.uuid() }).parse(await params); try { return apiData(await recordSupplierPayment({ ...context, userId: context.user.id }, id, await parseApiBody(request, supplierPaymentSchema)), 201); } catch (error) { if (error instanceof SupplierDomainError) throw new ApiError(422, "SUPPLIER_PAYMENT_ERROR", error.message); throw error; } });
