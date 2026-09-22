"use client";
import { useRef } from "react";
import type { Kit } from "@/lib/types";

export function CompanyBriefPanel({ kit, onRegenerate }: { kit: Kit; onRegenerate: (briefEdited: boolean) => void }) {
  const edited = useRef(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-secondary" onClick={() => onRegenerate(edited.current)}>Regenerate company brief</button>
      </div>
      <div className="card p-4 space-y-3">
        <div>
          <label className="label">Summary</label>
          <textarea className="input" rows={3} defaultValue={kit.company_brief.summary} onChange={() => { edited.current = true; }} />
        </div>
        <div>
          <label className="label">What they do</label>
          <textarea className="input" rows={2} defaultValue={kit.company_brief.what_they_do} onChange={() => { edited.current = true; }} />
        </div>
        {kit.company_brief.sources.length > 0 && (
          <div>
            <p className="label mb-1">Sources</p>
            <ul className="text-xs text-slate-500 space-y-0.5">
              {kit.company_brief.sources.map((s) => <li key={s} className="truncate">{s}</li>)}
            </ul>
          </div>
        )}
        {kit.company_brief.sources.length === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">No company pages could be researched — this brief may be incomplete.</p>
        )}
      </div>
    </div>
  );
}
