"use client";
import type { Question, ScheduleDay } from "@/lib/types";

export function ScheduleView({ days, questions, onRegenerate }: { days: ScheduleDay[]; questions: Question[]; onRegenerate: () => void }) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button className="btn-secondary" onClick={onRegenerate}>Regenerate schedule</button></div>
      <div className="grid gap-3">
        {days.map((d) => (
          <div key={d.day} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-slate-900">Day {d.day}</h3>
              <span className="text-sm text-slate-500">{d.minutes} min</span>
            </div>
            <p className="text-sm text-slate-600 mb-2">{d.focus}</p>
            {d.question_ids.length > 0 && (
              <ul className="text-sm text-slate-700 list-disc list-inside space-y-0.5">
                {d.question_ids.map((id) => <li key={id}>{byId.get(id)?.prompt ?? id}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
