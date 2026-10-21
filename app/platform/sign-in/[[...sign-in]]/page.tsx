import { redirect } from "next/navigation";

// One sign-in system for both customer web and platform owner access.
export default function PlatformSignInPage() {
  redirect("/platform/login");
}
