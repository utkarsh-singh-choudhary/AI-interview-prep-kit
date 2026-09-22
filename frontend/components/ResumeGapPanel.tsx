"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Kit, ResumeMatch } from "@/lib/types";

const MATCH_STYLE: Record<ResumeMatch, string> = {
  covered: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
  missing: "bg-red-100 text-red-700",
};
const MATCH_LABEL: Record<ResumeMatch, string> = { covered: "Covered", partial: "Partial", missing: "Missing" };

export function ResumeGapPanel({ kitId, kit, onChange }: { kitId: string; kit: Kit; onChange: (kit: Kit) => void }) {
  const [resumeText, setResumeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!resumeText.trim()) return setError("Paste your resume text first.");
    setError(null);
    setBusy(true);
    try {
      const { kit: next } = await api.analyzeResumeGap(kitId, resumeText);
      if (next) onChange(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not analyze the resume right now.");
    } finally {
      setBusy(false);
    }
  }

  const reqById = new Map(kit.role.requirements.map((r) => [r.id, r]));
  const gap = kit.resume_gap;

  return (
    <div className="space-y-4">
      <div className="card p-6 space-y-3">
        <p className="label">Paste your resume</p>
        <p className="text-sm text-slate-500">
          Compares your resume against every requirement extracted from the job description, and suggests what to add or emphasize. Your resume text isn't stored — only this report is.
        </p>
        <textarea
          rows={8}
          className="input"
          placeholder="Paste your resume text here…"
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
        />
        {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button className="btn-primary" onClick={analyze} disabled={busy}>{busy ? "Analyzing…" : gap ? "Re-analyze" : "Analyze"}</button>
      </div>

      {gap && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            Last analyzed {new Date(gap.analyzed_at).toLocaleString()} · {gap.items.filter((i) => i.match === "covered").length}/{gap.items.length} requirements covered
          </p>
          <ul className="space-y-2" aria-label="Resume gap report">
            {gap.items.map((item) => {
              const req = reqById.get(item.requirement_id);
              return (
                <li key={item.requirement_id} className="card p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-900">{req?.text ?? item.requirement_id}</p>
                    <span className={`badge ${MATCH_STYLE[item.match]}`}>{MATCH_LABEL[item.match]}</span>
                  </div>
                  {item.evidence && <p className="text-xs text-slate-600"><span className="font-medium">From your resume:</span> {item.evidence}</p>}
                  {item.suggestion && <p className="text-xs text-brand-700"><span className="font-medium">Suggestion:</span> {item.suggestion}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
