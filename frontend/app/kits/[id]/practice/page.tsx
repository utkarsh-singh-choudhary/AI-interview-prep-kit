"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { api, ApiError } from "@/lib/api";
import type { Flashcard } from "@/lib/types";
import { NavBar } from "@/components/NavBar";
import { EmptyState } from "@/components/EmptyState";

const CONFIDENCE_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = { 1: "Very weak", 2: "Weak", 3: "Okay", 4: "Strong", 5: "Very strong" };

export default function PracticePage() {
  const { id } = useParams<{ id: string }>();
  const { email } = useSession();
  const [queue, setQueue] = useState<Flashcard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [lastReview, setLastReview] = useState<{ intervalDays: number } | null>(null);

  useEffect(() => {
    api.getPracticeQueue(id).then((r: any) => setQueue(r.queue)).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load practice queue"));
  }, [id]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); setRevealed(true); }
    if (revealed && ["1", "2", "3", "4", "5"].includes(e.key)) void onRate(Number(e.key) as 1 | 2 | 3 | 4 | 5);
  }

  async function onRate(confidence: 1 | 2 | 3 | 4 | 5) {
    if (!queue) return;
    const card = queue[index];
    const { nextReview } = await api.recordPractice(id, card.id, confidence);
    setLastReview(nextReview);
    setDone((d) => d + 1);
    setRevealed(false);
    setIndex((i) => (i + 1) % queue.length);
  }

  if (error) return <main className="min-h-screen"><NavBar email={email} /><p className="max-w-xl mx-auto p-8 text-red-600">{error}</p></main>;
  if (!queue) return <main className="min-h-screen"><NavBar email={email} /><div className="max-w-xl mx-auto p-8"><div className="card h-64 animate-pulse" /></div></main>;
  if (queue.length === 0) {
    return (
      <main className="min-h-screen">
        <NavBar email={email} />
        <div className="max-w-xl mx-auto p-8"><EmptyState title="No flashcards to practice yet" hint="Add flashcards from the kit page first." /></div>
      </main>
    );
  }

  const card = queue[index];
  return (
    <main className="min-h-screen">
      <NavBar email={email} />
      <div className="max-w-xl mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <a href={`/kits/${id}`} className="text-sm text-brand-600 hover:underline">← Back to kit</a>
          <p className="text-sm text-slate-500">{done} reviewed this session</p>
        </div>
        {lastReview && (
          <p className="text-xs text-brand-600 text-center">
            Next review in {lastReview.intervalDays} day{lastReview.intervalDays === 1 ? "" : "s"} (spaced repetition)
          </p>
        )}

        <div
          className="card p-10 min-h-[16rem] flex flex-col items-center justify-center text-center gap-4 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
          tabIndex={0}
          role="button"
          aria-label={revealed ? "Answer shown" : "Show answer"}
          onClick={() => setRevealed(true)}
          onKeyDown={onKeyDown}
        >
          <p className="text-lg font-medium text-slate-900">{card.front}</p>
          {revealed ? (
            <p className="text-slate-600 border-t border-slate-200 pt-4 w-full">{card.back}</p>
          ) : (
            <p className="text-sm text-slate-400">Click, tap, or press space to reveal</p>
          )}
        </div>

        {revealed && (
          <div className="card p-4">
            <p className="label mb-2 text-center">How confident are you?</p>
            <div className="grid grid-cols-5 gap-2">
              {([1, 2, 3, 4, 5] as const).map((c) => (
                <button key={c} className="btn-secondary flex-col !py-3 text-xs" onClick={() => onRate(c)}>
                  <span className="block text-base font-semibold">{c}</span>
                  {CONFIDENCE_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
