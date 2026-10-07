"use client";

import { Button } from "@/components/ui/button";

export default function RestaurantError({ reset }: { reset: () => void }) {
  return <div role="alert" className="mx-auto max-w-xl space-y-3 rounded-lg border p-6">
    <h2 className="font-semibold">Restaurant page could not finish this request.</h2>
    <p className="text-sm text-muted-foreground">Refresh the page and check order, payment or return history before submitting again.</p>
    <Button type="button" onClick={reset}>Reload restaurant page</Button>
  </div>;
}
