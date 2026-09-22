"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { AnswerEvaluation, MockAttempt, Question } from "@/lib/types";

const SCORE_STYLE: Record<number, string> = {
  1: "bg-red-100 text-red-700", 2: "bg-orange-100 text-orange-700", 3: "bg-amber-100 text-amber-700",
  4: "bg-lime-100 text-lime-700", 5: "bg-green-100 text-green-700",
};

function EvaluationCard({ evaluation }: { evaluation: AnswerEvaluation }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`badge ${SCORE_STYLE[evaluation.score]}`}>Score: {evaluation.score}/5</span>
      </div>
      {evaluation.strengths.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-700 mb-1">Strengths</p>
          <ul className="text-sm text-slate-600 list-disc list-inside space-y-0.5">
            {evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {evaluation.gaps.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-700 mb-1">Gaps</p>
          <ul className="text-sm text-slate-600 list-disc list-inside space-y-0.5">
            {evaluation.gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}
      {evaluation.model_answer_diff && (
        <p className="text-sm text-slate-600"><span className="font-medium text-slate-700">A stronger answer would add:</span> {evaluation.model_answer_diff}</p>
      )}
      {evaluation.follow_up_question && (
        <p className="text-sm text-brand-700"><span className="font-medium">Follow-up:</span> {evaluation.follow_up_question}</p>
      )}
    </div>
  );
}

export function MockInterviewPanel({ kitId, questions }: { kitId: string; questions: Question[] }) {
  const [questionId, setQuestionId] = useState(questions[0]?.id ?? "");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<MockAttempt | null>(null);
  const [history, setHistory] = useState<MockAttempt[]>([]);

  useEffect(() => {
    api.getMockHistory(kitId).then((r) => setHistory(r.attempts)).catch(() => {});
  }, [kitId]);

  const question = questions.find((q) => q.id === questionId);

  async function submit() {
    if (!questionId) return setError("Pick a question first.");
    if (!answer.trim()) return setError("Type an answer before submitting.");
    setError(null);
    setBusy(true);
    try {
      const { attempt } = await api.submitMockAnswer(kitId, questionId, answer);
      setLastAttempt(attempt);
      setHistory((h) => [attempt, ...h]);
      setAnswer("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not score this answer right now.");
    } finally {
      setBusy(false);
    }
  }

  if (questions.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">Generate questions first, then come back here to practice answering them out loud (or typed) and get scored feedback.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="card p-6 space-y-3">
        <div>
          <label className="label" htmlFor="mock-question">Question</label>
          <select id="mock-question" className="input" value={questionId} onChange={(e) => { setQuestionId(e.target.value); setLastAttempt(null); }}>
            {questions.map((q) => <option key={q.id} value={q.id}>{q.category} · {q.prompt.slice(0, 80)}</option>)}
          </select>
        </div>
        {question && <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{question.prompt}</p>}
        <div>
          <label className="label" htmlFor="mock-answer">Your answer</label>
          <textarea id="mock-answer" rows={6} className="input" placeholder="Type your answer as you'd say it in the interview…" value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? "Scoring…" : "Submit answer"}</button>
      </div>

      {lastAttempt && <EvaluationCard evaluation={lastAttempt.evaluation} />}

      {history.length > 0 && (
        <details className="card p-4">
          <summary className="text-sm font-medium text-slate-700 cursor-pointer">Attempt history ({history.length})</summary>
          <ul className="space-y-3 mt-3">
            {history.map((a) => {
              const q = questions.find((qq) => qq.id === a.question_id);
              return (
                <li key={a.id} className="border-t border-slate-100 pt-3 space-y-1">
                  <p className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString()} · {q?.category ?? "question"}</p>
                  <p className="text-sm text-slate-700">{q?.prompt ?? a.question_id}</p>
                  <p className="text-xs text-slate-500 italic">&ldquo;{a.answer.slice(0, 140)}{a.answer.length > 140 ? "…" : ""}&rdquo;</p>
                  <span className={`badge ${SCORE_STYLE[a.evaluation.score]}`}>Score: {a.evaluation.score}/5</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
