"use client";

import Link from "next/link";
import type { Account } from "@/lib/types";

export default function Header({ account }: { account: Account | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 px-6 py-3 backdrop-blur-xl bg-surface-0/80">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center text-sm shadow-lg shadow-cyan-500/20">
            🫀
          </div>
          <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-slate-100 to-cyan-300 bg-clip-text text-transparent">
            Biopulse
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {account && (
            <>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/15">
                {account.plan === "free" ? `Free · ${3 - account.monthly_uploads}/3` : "Pro ✨"}
              </span>
              <span className="text-xs text-slate-500">
                {account.display_name || account.telegram_username || "—"}
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
