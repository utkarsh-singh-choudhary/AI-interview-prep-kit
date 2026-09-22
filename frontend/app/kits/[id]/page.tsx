"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { api, ApiError } from "@/lib/api";
import type { KitRecord, QuestionCategory } from "@/lib/types";
import { NavBar } from "@/components/NavBar";
import { GenerationProgress } from "@/components/GenerationProgress";
import { CompanyBriefPanel } from "@/components/CompanyBriefPanel";
import { RolePanel } from "@/components/RolePanel";
import { QuestionsPanel } from "@/components/QuestionsPanel";
import { FlashcardsPanel } from "@/components/FlashcardsPanel";
import { ScheduleView } from "@/components/ScheduleView";
import { CoverageView } from "@/components/CoverageView";
import { ResumeGapPanel } from "@/components/ResumeGapPanel";
import { MockInterviewPanel } from "@/components/MockInterviewPanel";

const TABS = ["Company Brief", "Role", "Questions", "Flashcards", "Schedule", "Coverage", "Resume Fit", "Mock Interview"] as const;
type Tab = (typeof TABS)[number];

export default function KitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { email } = useSession();
  const router = useRouter();
  const [record, setRecord] = useState<KitRecord | null>(null);
  const [tab, setTab] = useState<Tab>("Company Brief");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { kit } = await api.getKit(id);
      setRecord(kit);
      return kit;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load kit");
      return null;
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Poll while generation is in progress so the stepper reflects the current stage.
  useEffect(() => {
    if (record?.status !== "generating") return;
    const t = setInterval(() => { void load(); }, 1500);
    return () => clearInterval(t);
  }, [record?.status, load]);

  async function startGeneration() {
    setRecord((r) => (r ? { ...r, status: "generating" } : r));
    try {
      await api.generateKit(id);
    } catch {
      // orchestrator already persisted the failure; next poll/load picks it up
    }
    void load();
  }

  async function onDelete() {
    if (!confirm("Delete this kit? This cannot be undone.")) return;
    await api.deleteKit(id);
    router.push("/dashboard");
  }

  async function regenerateCompany(briefEdited: boolean) {
    const res = await api.regenerateCompany(id, briefEdited);
    if (res.kit) setRecord((r) => (r ? { ...r, kit: res.kit! } : r));
  }
  async function regenerateQuestions(category: QuestionCategory) {
    const res = await api.regenerateQuestions(id, category);
    if (res.kit) setRecord((r) => (r ? { ...r, kit: res.kit! } : r));
  }
  async function regenerateSchedule() {
    const res = await api.regenerateSchedule(id);
    if (res.kit) setRecord((r) => (r ? { ...r, kit: res.kit! } : r));
  }

  if (error) return <main className="min-h-screen"><NavBar email={email} /><p className="max-w-3xl mx-auto p-8 text-red-600">{error}</p></main>;
  if (!record) {
    return (
      <main className="min-h-screen">
        <NavBar email={email} />
        <div className="max-w-3xl mx-auto p-8"><div className="card h-40 animate-pulse" /></div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <NavBar email={email} />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{record.kit?.source.role || "Untitled kit"}</h1>
            <p className="text-slate-500 text-sm mt-0.5">{record.kit?.source.company || record.companyUrl} · {record.daysAvailable}-day plan</p>
          </div>
          <div className="flex gap-2 shrink-0">
            {record.status === "ready" && <a href={`/kits/${id}/practice`} className="btn-primary">Practice</a>}
            <button className="btn-danger" onClick={onDelete}>Delete</button>
          </div>
        </div>

        {(record.status === "draft" || record.status === "generating" || record.status === "failed") && (
          <div className="space-y-4">
            {record.status === "draft" && (
              <div className="card p-6 flex items-center justify-between">
                <p className="text-slate-700">Ready to generate your prep kit.</p>
                <button className="btn-primary" onClick={startGeneration}>Start generation</button>
              </div>
            )}
            {(record.status === "generating" || record.status === "failed") && (
              <GenerationProgress
                stage={record.stage}
                failed={record.status === "failed"}
                errorMessage={record.error?.message}
                onRetry={startGeneration}
              />
            )}
          </div>
        )}

        {record.status === "ready" && record.kit && (
          <div className="space-y-6">
            <nav className="flex flex-wrap gap-1" role="tablist" aria-label="Kit sections">
              {TABS.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "tab-active" : "tab-inactive"} onClick={() => setTab(t)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    const idx = TABS.indexOf(t);
                    const next = TABS[(idx + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length];
                    setTab(next);
                  }}>
                  {t}
                </button>
              ))}
            </nav>

            {tab === "Company Brief" && <CompanyBriefPanel kit={record.kit} onRegenerate={regenerateCompany} />}
            {tab === "Role" && <RolePanel kit={record.kit} />}
            {tab === "Questions" && (
              <QuestionsPanel
                kitId={id}
                questions={record.kit.questions}
                uncoveredIds={record.kit.coverage.uncovered_requirement_ids}
                onChange={(questions) => setRecord((r) => (r && r.kit ? { ...r, kit: { ...r.kit, questions } } : r))}
                onRegenerate={regenerateQuestions}
              />
            )}
            {tab === "Flashcards" && (
              <FlashcardsPanel
                kitId={id}
                flashcards={record.kit.flashcards}
                onChange={(flashcards) => setRecord((r) => (r && r.kit ? { ...r, kit: { ...r.kit, flashcards } } : r))}
              />
            )}
            {tab === "Schedule" && <ScheduleView days={record.kit.schedule.days} questions={record.kit.questions} onRegenerate={regenerateSchedule} />}
            {tab === "Coverage" && <CoverageView kit={record.kit} />}
            {tab === "Resume Fit" && (
              <ResumeGapPanel
                kitId={id}
                kit={record.kit}
                onChange={(kit) => setRecord((r) => (r ? { ...r, kit } : r))}
              />
            )}
            {tab === "Mock Interview" && <MockInterviewPanel kitId={id} questions={record.kit.questions} />}
          </div>
        )}
      </div>
    </main>
  );
}
