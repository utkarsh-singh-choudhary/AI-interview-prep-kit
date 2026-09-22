import { describe, it, expect } from "vitest";
import { mergeRegeneratedQuestions, mergeRegeneratedFlashcards, markEdited } from "../src/services/editState";
import { q } from "./fixtures";

describe("edit state model", () => {
  it("preserves edited/pinned questions in the category being regenerated", () => {
    const existing = [
      markEdited({ ...q("q1", ["r1"]), category: "technical" as const }),
      { ...q("q2", ["r1"]), category: "technical" as const, editState: "pinned" as const },
      { ...q("q3", ["r1"]), category: "technical" as const, editState: "generated" as const },
    ];
    const fresh = [{ ...q("q9", ["r1"]), category: "technical" as const }];
    const merged = mergeRegeneratedQuestions(existing, "technical", fresh);
    expect(merged.map((x) => x.id).sort()).toEqual(["q1", "q2", "q9"]);
  });
  it("leaves other categories untouched", () => {
    const existing = [{ ...q("q1", ["r1"]), category: "behavioural" as const, editState: "generated" as const }];
    const merged = mergeRegeneratedQuestions(existing, "technical", []);
    expect(merged).toEqual(existing);
  });
  it("flashcards: keeps edited/pinned, drops old generated ones", () => {
    const existing = [
      { id: "f1", front: "a", back: "b", requirement_ids: ["r1"], editState: "edited" as const },
      { id: "f2", front: "a", back: "b", requirement_ids: ["r1"], editState: "generated" as const },
    ];
    const merged = mergeRegeneratedFlashcards(existing, [{ id: "f9", front: "x", back: "y", requirement_ids: ["r1"] }]);
    expect(merged.map((f) => f.id).sort()).toEqual(["f1", "f9"]);
  });
});
