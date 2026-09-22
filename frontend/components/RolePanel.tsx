"use client";
import type { Kit } from "@/lib/types";

export function RolePanel({ kit }: { kit: Kit }) {
  return (
    <div className="space-y-4">
      <div className="card p-4 grid sm:grid-cols-2 gap-3">
        <div><p className="label">Title</p><p className="text-slate-900">{kit.role.title || "—"}</p></div>
        <div><p className="label">Seniority</p><p className="text-slate-900">{kit.role.seniority || "—"}</p></div>
      </div>
      <div className="card p-4">
        <p className="label mb-2">Responsibilities</p>
        {kit.role.responsibilities.length ? (
          <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
            {kit.role.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        ) : <p className="text-sm text-slate-500">None extracted.</p>}
      </div>
      <div className="card p-4">
        <p className="label mb-2">Requirements</p>
        <ul className="space-y-1.5">
          {kit.role.requirements.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="badge bg-slate-100 text-slate-600">{r.kind}</span>
              <span className={`badge ${r.priority === "must" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>{r.priority}</span>
              <span className="text-slate-800">{r.text}</span>
            </li>
          ))}
          {kit.role.requirements.length === 0 && <li className="text-sm text-slate-500">No requirements extracted from this job description.</li>}
        </ul>
      </div>
    </div>
  );
}
