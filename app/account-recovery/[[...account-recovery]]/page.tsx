import { SignIn } from "@clerk/nextjs";

export default function AccountRecoveryPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#06131a] px-4 py-10">
      <SignIn
        routing="path"
        path="/account-recovery"
        forceRedirectUrl="/dashboard"
        signUpUrl="/sign-up"
      />
    </main>
  );
}
