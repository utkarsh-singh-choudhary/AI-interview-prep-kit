"use client";
import type { Kit } from "@/lib/types";

export function CoverageView({ kit }: { kit: Kit }) {
  const uncovered = new Set(kit.coverage.uncovered_requirement_ids);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Coverage checked in {kit.coverage.passes} pass{kit.coverage.passes === 1 ? "" : "es"}.</p>
      <ul className="space-y-2" aria-label="Requirement coverage">
        {kit.role.requirements.map((r) => {
          const qs = kit.questions.filter((q) => q.requirement_ids.includes(r.id));
          const isUncovered = uncovered.has(r.id);
          return (
            <li key={r.id} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-900">{r.text}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.kind} · {r.priority}</p>
                </div>
                <span className={`badge ${isUncovered ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                  {isUncovered ? "uncovered" : `${qs.length} question${qs.length === 1 ? "" : "s"}`}
                </span>
              </div>
            </li>
          );
        })}
        {kit.role.requirements.length === 0 && <li className="text-sm text-slate-500 py-6 text-center">No requirements were extracted from this job description.</li>}
      </ul>
    </div>
  );
}
