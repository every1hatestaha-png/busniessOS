import RecoveryForm from "@/components/auth/recovery-form";

export default async function ForgotPasswordPage({ searchParams }: {
  searchParams: Promise<{ activation?: string; verified?: string }>;
}) {
  const params = await searchParams;
  return <RecoveryForm activationByOldLink={params.activation === "1"} verifiedByOldLink={params.verified === "1"} />;
}
