import { z } from "zod";
import type { Flashcard, Question, Requirement } from "../domain/types";
import { callLlmJson } from "../llm/client";

const GeneratedSchema = z.object({ front: z.string().min(1), back: z.string().min(1), requirement_ids: z.array(z.string()) });
const ResponseSchema = z.object({ flashcards: z.array(GeneratedSchema) });

let counter = 0;
const nextId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`;

/** One flashcard per must-have requirement plus a few for the strongest questions. */
export async function generateFlashcards(requirements: Requirement[], questions: Question[]): Promise<Flashcard[]> {
  if (requirements.length === 0) return [];
  const validIds = new Set(requirements.map((r) => r.id));
  const reqList = requirements.map((r) => `${r.id}: [${r.priority}] ${r.text}`).join("\n");
  const sample = questions.slice(0, 12).map((q) => `${q.id} (${q.category}): ${q.prompt}`).join("\n") || "(none)";

  const system = [
    "You create concise interview-prep flashcards (front = prompt/term, back = crisp answer, a few sentences max).",
    "Cover every requirement listed, prioritizing must-have ones. Ground cards in the requirements and sample questions given.",
    "Each card's requirement_ids must reference the given requirement ids; do not invent ids.",
    'Respond with JSON only: {"flashcards":[{"front":"...","back":"...","requirement_ids":["r1"]}]}',
  ].join(" ");
  const user = `Requirements:\n${reqList}\n\nSample questions:\n${sample}`;

  const result = await callLlmJson({ system, user, schema: ResponseSchema });
  return result.flashcards
    .map((f) => ({ ...f, requirement_ids: f.requirement_ids.filter((id) => validIds.has(id)) }))
    .filter((f) => f.requirement_ids.length > 0)
    .map((f) => ({ id: nextId(), ...f }));
}
