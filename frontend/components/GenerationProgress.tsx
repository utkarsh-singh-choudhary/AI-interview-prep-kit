"use client";
const STAGES: Array<{ key: string; label: string }> = [
  { key: "validating_input", label: "Analyzing job description" },
  { key: "extracting_requirements", label: "Analyzing job description" },
  { key: "researching_company", label: "Researching company" },
  { key: "finding_hiring_info", label: "Finding hiring information" },
  { key: "researching_interview_process", label: "Researching interview process" },
  { key: "generating_role_analysis", label: "Generating role analysis" },
  { key: "generating_questions", label: "Generating questions" },
  { key: "checking_coverage", label: "Checking coverage" },
  { key: "closing_coverage_gaps", label: "Closing coverage gaps" },
  { key: "creating_flashcards", label: "Creating flashcards" },
  { key: "building_schedule", label: "Building schedule" },
  { key: "validating_kit", label: "Validating kit" },
  { key: "saving", label: "Saving" },
];

export function GenerationProgress({ stage, failed, errorMessage, onRetry }: { stage?: string; failed?: boolean; errorMessage?: string; onRetry?: () => void }) {
  const activeIndex = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="card p-6" aria-live="polite">
      <h2 className="font-medium text-slate-900 mb-4">{failed ? "Generation failed" : "Generating your prep kit…"}</h2>
      {failed ? (
        <div className="space-y-3">
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorMessage ?? "Something went wrong during generation."}</p>
          {onRetry && <button className="btn-primary" onClick={onRetry}>Retry</button>}
        </div>
      ) : (
        <ol className="space-y-2">
          {STAGES.map((s, i) => {
            const state = activeIndex < 0 ? "pending" : i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
            return (
              <li key={s.key + i} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden
                  className={
                    state === "done" ? "w-4 h-4 rounded-full bg-green-500" :
                    state === "active" ? "w-4 h-4 rounded-full bg-brand-500 animate-pulse" :
                    "w-4 h-4 rounded-full bg-slate-200"
                  }
                />
                <span className={state === "pending" ? "text-slate-400" : "text-slate-800"}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
