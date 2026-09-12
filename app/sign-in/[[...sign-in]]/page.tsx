import Image from "next/image";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-950 px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] p-2">
          <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={48} height={48} priority className="size-full" />
        </div>
        <div>
          <p className="text-xl font-semibold tracking-[-0.03em] text-white">MunshiOS</p>
          <p className="text-xs text-slate-500">Har karobar ka digital system</p>
        </div>
      </div>
      <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" />
    </main>
  );
}
