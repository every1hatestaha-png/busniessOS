import { SignIn } from "@clerk/nextjs";

export default function AccountRecoveryPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#06131a] px-4 py-10">
      <SignIn
        routing="path"
        path="/account-recovery"
        forceRedirectUrl="/dashboard"
        signUpUrl="/sign-up"
        appearance={{
          variables: {
            colorPrimary: "#18c4ad",
            colorBackground: "#07151d",
            colorText: "#ffffff",
            colorTextSecondary: "#94a3b8",
          },
        }}
      />
    </main>
  );
}
