"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";

import {
  transferWarehouseStockAction,
  type WarehouseTransferState,
} from "@/app/(dashboard)/inventory/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ProductOption = { id: string; name: string; sku: string };
type WarehouseOption = { id: string; name: string; code: string };
type WarehouseBalance = {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  productId: string;
  quantity: number;
};

const initialState: WarehouseTransferState = {};

export function WarehouseTransfer({
  products,
  warehouses,
  balances,
}: {
  products: ProductOption[];
  warehouses: WarehouseOption[];
  balances: WarehouseBalance[];
}) {
  const [state, action, pending] = useActionState(transferWarehouseStockAction, initialState);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const productBalances = useMemo(
    () => balances.filter((row) => row.productId === productId),
    [balances, productId],
  );
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");

  useEffect(() => {
    const available = productBalances.filter((row) => row.quantity > 0);
    setFromWarehouseId((current) => available.some((row) => row.warehouseId === current) ? current : (available[0]?.warehouseId ?? ""));
    setToWarehouseId((current) => warehouses.some((warehouse) => warehouse.id === current && warehouse.id !== available[0]?.warehouseId)
      ? current
      : (warehouses.find((warehouse) => warehouse.id !== available[0]?.warehouseId)?.id ?? ""));
  }, [productBalances, warehouses]);

  const sourceBalance = productBalances.find((row) => row.warehouseId === fromWarehouseId)?.quantity ?? 0;

  if (products.length === 0 || warehouses.length < 2) return null;

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="size-4 text-neutral-500" />
          <div>
            <h2 className="font-semibold">Transfer stock</h2>
            <p className="text-xs text-neutral-500">Move quantity between warehouses without changing total inventory.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <form action={action} className="grid gap-3 lg:grid-cols-[minmax(180px,1.4fr)_1fr_1fr_140px_auto] lg:items-end">
          <label className="space-y-1.5 text-xs font-medium">
            <span>Product</span>
            <select name="productId" value={productId} onChange={(event) => setProductId(event.target.value)} className={selectClass} required>
              {products.map((product) => <option key={product.id} value={product.id}>{product.sku ? product.sku + " · " : ""}{product.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            <span>From warehouse</span>
            <select name="fromWarehouseId" value={fromWarehouseId} onChange={(event) => setFromWarehouseId(event.target.value)} className={selectClass} required>
              <option value="" disabled>Select source</option>
              {productBalances.filter((row) => row.quantity > 0).map((row) => <option key={row.warehouseId} value={row.warehouseId}>{row.warehouseCode} · {row.warehouseName} ({row.quantity})</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            <span>To warehouse</span>
            <select name="toWarehouseId" value={toWarehouseId} onChange={(event) => setToWarehouseId(event.target.value)} className={selectClass} required>
              <option value="" disabled>Select destination</option>
              {warehouses.filter((warehouse) => warehouse.id !== fromWarehouseId).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            <span>Quantity</span>
            <Input name="quantity" type="number" min="0.0001" step="0.0001" max={sourceBalance || undefined} required />
            <span className="block text-[11px] font-normal text-neutral-500">Available: {sourceBalance.toLocaleString("en-PK")}</span>
          </label>
          <Button type="submit" disabled={pending || !fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId}>
            {pending ? "Transferring..." : "Transfer"}
          </Button>
        </form>
        {state.message && <p className={`mt-3 text-xs ${state.status === "error" ? "text-destructive" : "text-emerald-700"}`}>{state.message}</p>}
      </CardContent>
    </Card>
  );
}

const selectClass = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";
