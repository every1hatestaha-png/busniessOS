"use client";

import { type ReactNode } from "react";
import { initialRestaurantV1ActionState, type RestaurantV1ActionState } from "./v1-action-state";
import { useRestaurantActionState } from "./use-restaurant-action-state";

export function RestaurantMutationForm({ action, workspaceId, className, children }: {
  action: (form: FormData) => Promise<RestaurantV1ActionState>;
  workspaceId?: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction, pending, onSubmit] = useRestaurantActionState(async (_previous: RestaurantV1ActionState, form: FormData) => action(form), initialRestaurantV1ActionState);
  return <form action={formAction} className={className} aria-busy={pending} onSubmit={onSubmit}>
    {workspaceId ? <input type="hidden" name="formWorkspaceId" value={workspaceId} /> : null}
    <fieldset disabled={pending} className="contents">{children}</fieldset>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} aria-live="polite" className={state.status === "error" ? "basis-full text-xs text-destructive" : "basis-full text-xs text-emerald-700"}>{state.message}</p> : null}
  </form>;
}
