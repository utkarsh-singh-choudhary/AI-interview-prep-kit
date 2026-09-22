"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { api, ApiError } from "@/lib/api";
import { NavBar } from "@/components/NavBar";

export default function NewKitPage() {
  const { email } = useSession();
  const router = useRouter();
  const [jobDescription, setJobDescription] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [daysAvailable, setDaysAvailable] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): string | null {
    if (!jobDescription.trim()) return "Job description cannot be empty.";
    try { new URL(companyUrl); } catch { return "Company website must be a valid URL (include https://)."; }
    if (!Number.isInteger(daysAvailable) || daysAvailable < 1) return "Days until interview must be at least 1.";
    if (daysAvailable > 90) return "Days until interview must be 90 or fewer.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setBusy(true);
    try {
      const { kit } = await api.createKit(jobDescription, companyUrl, daysAvailable);
      router.push(`/kits/${kit.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create kit");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <NavBar email={email} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">New prep kit</h1>
        <form onSubmit={onSubmit} className="card p-6 space-y-5">
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="label" htmlFor="jd">Job description</label>
            <textarea id="jd" required rows={10} className="input" placeholder="Paste the full job description…" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="url">Company website</label>
            <input id="url" type="url" required placeholder="https://example.com" className="input" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="days">Days until interview</label>
            <input id="days" type="number" min={1} max={90} required className="input max-w-[8rem]" value={daysAvailable} onChange={(e) => setDaysAvailable(Number(e.target.value))} />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="btn-primary">{busy ? "Creating…" : "Create kit"}</button>
            <a href="/dashboard" className="btn-secondary">Cancel</a>
          </div>
        </form>
      </div>
    </main>
  );
}
