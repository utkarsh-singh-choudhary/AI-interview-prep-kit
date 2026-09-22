import { KitSchema, type Kit } from "../domain/types";
import { findUncovered } from "./coverage";

export type ValidationResult = { ok: true; kit: Kit } | { ok: false; errors: string[] };

/** Schema validation plus cross-reference checks. Run before every persistence. */
export function validateKit(input: unknown): ValidationResult {
  const parsed = KitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const kit = parsed.data;
  const errors: string[] = [];
  const reqIds = new Set(kit.role.requirements.map((r) => r.id));
  const qIds = new Set(kit.questions.map((q) => q.id));

  if (reqIds.size !== kit.role.requirements.length) errors.push("duplicate requirement ids");
  if (qIds.size !== kit.questions.length) errors.push("duplicate question ids");
  if (new Set(kit.flashcards.map((f) => f.id)).size !== kit.flashcards.length) errors.push("duplicate flashcard ids");

  for (const q of kit.questions)
    for (const id of q.requirement_ids) if (!reqIds.has(id)) errors.push(`question ${q.id} references unknown requirement ${id}`);
  for (const f of kit.flashcards)
    for (const id of f.requirement_ids) if (!reqIds.has(id)) errors.push(`flashcard ${f.id} references unknown requirement ${id}`);
  for (const d of kit.schedule.days)
    for (const id of d.question_ids) if (!qIds.has(id)) errors.push(`schedule day ${d.day} references unknown question ${id}`);

  if (kit.schedule.days.length !== kit.schedule.days_available)
    errors.push(`schedule has ${kit.schedule.days.length} days, expected ${kit.schedule.days_available}`);

  const expected = findUncovered(kit.role.requirements, kit.questions);
  if (JSON.stringify(expected) !== JSON.stringify(kit.coverage.uncovered_requirement_ids))
    errors.push("coverage.uncovered_requirement_ids does not match recomputed coverage");

  return errors.length ? { ok: false, errors } : { ok: true, kit };
}
