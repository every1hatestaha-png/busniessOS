import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen bg-[#06131a] lg:grid-cols-[52%_48%]">
      <section className="relative hidden min-h-screen overflow-hidden lg:block" aria-hidden="true">
        <img
          src="/brand/munshios-login-visual.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#06131a]/10 via-transparent to-[#06131a]/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#031016]/25 via-transparent to-[#08212a]/10" />
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:px-10 xl:px-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_85%,rgba(13,148,136,0.22),transparent_32%),linear-gradient(180deg,#06131a_0%,#07161e_100%)]" />

        <div className="relative w-full max-w-[650px] rounded-[28px] border border-teal-500/55 bg-[#07151d]/82 px-6 py-9 shadow-[0_28px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-10 sm:py-11 lg:px-12 xl:px-16">
          <div className="mb-8">
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-[42px]">Welcome back</h1>
            <p className="mt-2 text-base text-slate-400 sm:text-lg">Sign in to manage your business</p>
          </div>

          <SignIn
            path="/sign-in"
            routing="path"
            signUpUrl="/sign-up"
            appearance={{
              variables: {
                colorPrimary: "#14b8a6",
                colorBackground: "transparent",
                borderRadius: "0.75rem",
              },
              elements: {
                rootBox: "w-full",
                cardBox: "w-full shadow-none",
                card: "w-full bg-transparent p-0 shadow-none border-0",
                header: "hidden",
                main: "gap-5",
                form: "gap-5",
                formFieldLabel: "mb-2 text-sm font-medium text-slate-100",
                formFieldInput: "h-12 rounded-xl border border-slate-600/75 bg-[#0b1921] px-4 text-slate-100 shadow-none placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400",
                formFieldInputShowPasswordButton: "text-slate-400 hover:text-slate-200",
                formButtonPrimary: "h-12 rounded-xl bg-gradient-to-r from-[#13bfa8] to-[#11947f] text-sm font-semibold normal-case text-white shadow-none hover:opacity-95",
                socialButtonsBlockButton: "h-12 rounded-xl border border-slate-700 bg-[#0b1921] text-slate-100 shadow-none hover:bg-[#10232c]",
                socialButtonsBlockButtonText: "font-medium text-slate-100",
                dividerLine: "bg-slate-700/70",
                dividerText: "text-xs text-slate-500",
                identityPreview: "rounded-xl border border-slate-700 bg-[#0b1921]",
                identityPreviewText: "text-slate-200",
                footerAction: "pt-5",
                footerActionText: "text-sm text-slate-400",
                footerActionLink: "text-sm font-medium text-teal-300 hover:text-teal-200",
                formFieldErrorText: "text-rose-300",
                alertText: "text-sm",
              },
            }}
          />
        </div>
      </section>
    </main>
  );
}
