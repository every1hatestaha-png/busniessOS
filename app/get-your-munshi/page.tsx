import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { MunshiBuilder } from "./munshi-builder";

export default function GetYourMunshiPage() {
  return (
    <main className="min-h-screen bg-[#fafaf8] text-slate-950">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={38} height={38} priority />
            <span className="text-lg">MunshiOS</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" /> Back to website
          </Link>
        </div>
      </header>
      <MunshiBuilder />
    </main>
  );
}
