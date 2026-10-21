import { redirect } from "next/navigation";

// One sign-in system for both customer web and platform owner access.
export default function PlatformSignInPage() {
  redirect("/sign-in?redirect_url=%2Fplatform");
}
