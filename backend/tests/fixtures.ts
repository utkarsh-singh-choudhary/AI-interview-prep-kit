import type { Kit, Question, Requirement } from "../src/domain/types";
export const req = (id: string, priority: "must" | "nice" = "must"): Requirement => ({ id, text: `Requirement ${id}`, kind: "technical", priority });
export const q = (id: string, ids: string[], difficulty: 1 | 2 | 3 = 2): Question =>
  ({ id, requirement_ids: ids, category: "technical", prompt: `Prompt ${id}`, answer_outline: "outline", difficulty });
export function validKit(): Kit {
  return {
    source: { company: "Acme", company_url: "http://x", role: "Eng", location: "", jd_chars: 10, researched_at: new Date().toISOString(), pages_used: [] },
    company_brief: { summary: "s", what_they_do: "w", sources: [] },
    role: { title: "Eng", seniority: "senior", responsibilities: [], requirements: [req("r1"), req("r2")] },
    questions: [q("q1", ["r1"]), q("q2", ["r2"])],
    flashcards: [{ id: "f1", front: "a", back: "b", requirement_ids: ["r1"] }],
    schedule: { days_available: 2, days: [{ day: 1, focus: "f", question_ids: ["q1"], minutes: 30 }, { day: 2, focus: "f", question_ids: ["q2"], minutes: 30 }] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}
