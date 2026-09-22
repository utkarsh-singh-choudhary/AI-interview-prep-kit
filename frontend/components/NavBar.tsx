"use client";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function NavBar({ email }: { email?: string }) {
  const router = useRouter();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <a href="/dashboard" className="font-semibold text-slate-900">AI Interview Prep Kit</a>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          {email && <span>{email}</span>}
          <button className="btn-secondary" onClick={async () => { await api.logout(); router.push("/login"); router.refresh(); }}>
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
