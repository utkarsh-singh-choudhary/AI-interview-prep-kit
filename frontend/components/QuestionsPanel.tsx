"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useDebouncedSave } from "@/lib/useDebouncedSave";
import type { Question, QuestionCategory } from "@/lib/types";

const CATEGORIES: QuestionCategory[] = ["technical", "behavioural", "system-design", "company-fit"];
const DIFFICULTY_LABEL = { 1: "Easy", 2: "Medium", 3: "Hard" } as const;

function EditBadge({ state }: { state?: string }) {
  if (!state || state === "generated") return null;
  return <span className={`badge ${state === "pinned" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{state}</span>;
}

export function QuestionsPanel({
  kitId, questions, onChange, uncoveredIds, onRegenerate,
}: {
  kitId: string; questions: Question[]; onChange: (qs: Question[]) => void;
  uncoveredIds: string[]; onRegenerate: (category: QuestionCategory) => void;
}) {
  const { schedule, flush } = useDebouncedSave();
  const [filter, setFilter] = useState<QuestionCategory | "all">("all");
  const visible = filter === "all" ? questions : questions.filter((q) => q.category === filter);

  function update(id: string, patch: Partial<Question>, persist = true) {
    const next = questions.map((q) => (q.id === id ? { ...q, ...patch } : q));
    onChange(next);
    if (persist) schedule(() => { void api.patchQuestion(kitId, id, patch); });
  }

  function move(id: string, dir: -1 | 1) {
    const idx = questions.findIndex((q) => q.id === id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= questions.length) return;
    const next = [...questions];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    onChange(next);
  }

  async function remove(id: string) {
    onChange(questions.filter((q) => q.id !== id));
    await api.deleteQuestion(kitId, id);
  }

  async function addQuestion() {
    const draft: Question = { id: `local-${Date.now()}`, requirement_ids: [], category: filter === "all" ? "technical" : filter, prompt: "New question", answer_outline: "", difficulty: 2, editState: "edited" };
    onChange([...questions, draft]);
    const res: any = await api.addQuestion(kitId, { category: draft.category, prompt: draft.prompt, answer_outline: "", difficulty: 2, requirement_ids: [] });
    if (res?.kit?.questions) onChange(res.kit.questions);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by category">
          <button className={filter === "all" ? "tab-active" : "tab-inactive"} onClick={() => setFilter("all")}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c} className={filter === c ? "tab-active" : "tab-inactive"} onClick={() => setFilter(c)}>{c}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={addQuestion}>Add question</button>
          {filter !== "all" && <button className="btn-secondary" onClick={() => onRegenerate(filter)}>Regenerate {filter}</button>}
        </div>
      </div>

      <ul className="space-y-3" aria-label="Questions">
        {visible.map((q) => (
          <li key={q.id} className="card p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge bg-slate-100 text-slate-600">{q.category}</span>
                <EditBadge state={q.editState} />
                {q.requirement_ids.some((id) => uncoveredIds.includes(id)) && <span className="badge bg-amber-100 text-amber-700">uncovered</span>}
              </div>
              <div className="flex items-center gap-1">
                <button aria-label="Move up" className="btn-secondary !px-2 !py-1" onClick={() => move(q.id, -1)}>↑</button>
                <button aria-label="Move down" className="btn-secondary !px-2 !py-1" onClick={() => move(q.id, 1)}>↓</button>
                <button aria-label="Delete question" className="btn-danger !px-2 !py-1" onClick={() => remove(q.id)}>Delete</button>
              </div>
            </div>
            <textarea
              className="input" rows={2} value={q.prompt} onBlur={flush}
              onChange={(e) => update(q.id, { prompt: e.target.value })}
              aria-label="Question prompt"
            />
            <textarea
              className="input text-slate-600" rows={2} value={q.answer_outline} onBlur={flush}
              placeholder="Answer outline…"
              onChange={(e) => update(q.id, { answer_outline: e.target.value })}
              aria-label="Answer outline"
            />
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                Category
                <select className="input !w-auto" value={q.category} onChange={(e) => update(q.id, { category: e.target.value as QuestionCategory })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2">
                Difficulty
                <select className="input !w-auto" value={q.difficulty} onChange={(e) => update(q.id, { difficulty: Number(e.target.value) as 1 | 2 | 3 })}>
                  {[1, 2, 3].map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d as 1 | 2 | 3]}</option>)}
                </select>
              </label>
            </div>
          </li>
        ))}
        {visible.length === 0 && <li className="text-sm text-slate-500 py-6 text-center">No questions in this category yet.</li>}
      </ul>
    </div>
  );
}
