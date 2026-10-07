"use client";

import { useActionState, useRef, type FormEvent } from "react";
import type { RestaurantV1ActionState } from "./v1-action-state";

export function useRestaurantActionState(action: (state: RestaurantV1ActionState, form: FormData) => Promise<RestaurantV1ActionState>, initialState: RestaurantV1ActionState) {
  const submitted = useRef(false);
  const [state, formAction, pending] = useActionState(async (previous: RestaurantV1ActionState, form: FormData) => {
    try { return await action(previous, form); }
    finally { submitted.current = false; }
  }, initialState);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitted.current || pending) { event.preventDefault(); return; }
    submitted.current = true;
  }
  return [state, formAction, pending, onSubmit] as const;
}
