"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { api, ApiError } from "@/lib/api";
import type { KitRecord } from "@/lib/types";
import { NavBar } from "@/components/NavBar";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";

function daysRemaining(createdAt: string, daysAvailable: number): number {
  const elapsedDays = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  return Math.max(0, daysAvailable - elapsedDays);
}

export default function DashboardPage() {
  const { email, loading: sessionLoading } = useSession();
  const [kits, setKits] = useState<KitRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    api.listKits().then((r) => setKits(r.kits)).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load kits"));
  }, [sessionLoading]);

  return (
    <main className="min-h-screen">
      <NavBar email={email} />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Your prep kits</h1>
          <a href="/kits/new" className="btn-primary">New kit</a>
        </div>

        {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {kits === null ? (
          <div className="grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="card h-20 animate-pulse" />)}</div>
        ) : kits.length === 0 ? (
          <EmptyState title="No kits yet" hint="Create your first interview prep kit to get started." action={<a href="/kits/new" className="btn-primary">Create a kit</a>} />
        ) : (
          <ul className="grid gap-3" aria-label="Your kits">
            {kits.map((k) => (
              <li key={k.id}>
                <a href={`/kits/${k.id}`} className="card block p-5 hover:border-brand-500 transition focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-900">{k.kit?.source.role || "Untitled role"} {k.kit?.source.company ? `at ${k.kit.source.company}` : ""}</p>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Created {new Date(k.createdAt).toLocaleDateString()} · {k.daysAvailable} day plan
                        {k.status === "ready" && ` · ${daysRemaining(k.createdAt, k.daysAvailable)} days left`}
                      </p>
                    </div>
                    <StatusBadge status={k.status} />
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
