import type { Flashcard, Kit, Question } from "../domain/types";

/**
 * generated -> set by the pipeline, safe to overwrite on regeneration.
 * edited    -> the user changed the content; regeneration of that category leaves it alone.
 * pinned    -> the user explicitly locked it; same protection as edited, kept distinct so the
 *              UI can show "pinned" vs "user-edited" differently.
 * Documented in README under "Edit/pinned state model".
 */
export type EditState = "generated" | "edited" | "pinned";

export function markEdited<T extends { editState?: EditState }>(item: T): T {
  return { ...item, editState: item.editState === "pinned" ? "pinned" : "edited" };
}

/**
 * Replaces all `generated` questions in `category` with `freshQuestions`, and appends any
 * freshQuestions whose requirement wasn't previously represented. Questions the user edited
 * or pinned are left untouched and kept in the result regardless of category.
 */
export function mergeRegeneratedQuestions(existing: Question[], category: string, freshQuestions: Question[]): Question[] {
  const kept = existing.filter((q) => q.category !== category || q.editState === "edited" || q.editState === "pinned");
  return [...kept, ...freshQuestions.map((q) => ({ ...q, editState: "generated" as EditState }))];
}

export function mergeRegeneratedFlashcards(existing: Flashcard[], freshCards: Flashcard[]): Flashcard[] {
  const kept = existing.filter((f) => f.editState === "edited" || f.editState === "pinned");
  return [...kept, ...freshCards.map((f) => ({ ...f, editState: "generated" as EditState }))];
}

/** company_brief has no per-field state; only overwrite if the user hasn't edited it. */
export function mergeRegeneratedCompanyBrief(kit: Kit, fresh: Kit["company_brief"], briefEdited: boolean): Kit["company_brief"] {
  return briefEdited ? kit.company_brief : fresh;
}
