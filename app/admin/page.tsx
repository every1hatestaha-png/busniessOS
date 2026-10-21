import { AdminLoginForm } from "@/components/admin/admin-login-form";

// Public entry point. Authorization is checked after login by the protected
// /admin/security and /admin/dashboard routes.
export default function AdminEntryPage() {
  return <AdminLoginForm />;
}
