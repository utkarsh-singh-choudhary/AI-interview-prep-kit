"use client";
import { api } from "@/lib/api";
import { useDebouncedSave } from "@/lib/useDebouncedSave";
import type { Flashcard } from "@/lib/types";

export function FlashcardsPanel({ kitId, flashcards, onChange }: { kitId: string; flashcards: Flashcard[]; onChange: (fs: Flashcard[]) => void }) {
  const { schedule, flush } = useDebouncedSave();

  function update(id: string, patch: Partial<Flashcard>) {
    onChange(flashcards.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    schedule(() => { void api.patchFlashcard(kitId, id, patch); });
  }

  async function remove(id: string) {
    onChange(flashcards.filter((f) => f.id !== id));
    await api.deleteFlashcard(kitId, id);
  }

  async function add() {
    const res: any = await api.addFlashcard(kitId, { front: "New term", back: "New answer" });
    if (res?.kit?.flashcards) onChange(res.kit.flashcards);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button className="btn-secondary" onClick={add}>Add flashcard</button></div>
      <ul className="grid sm:grid-cols-2 gap-3" aria-label="Flashcards">
        {flashcards.map((f) => (
          <li key={f.id} className="card p-4 space-y-2">
            <div className="flex justify-between items-center">
              {f.editState && f.editState !== "generated" && <span className={`badge ${f.editState === "pinned" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{f.editState}</span>}
              <button aria-label="Delete flashcard" className="btn-danger !px-2 !py-1 ml-auto" onClick={() => remove(f.id)}>Delete</button>
            </div>
            <textarea className="input" rows={2} value={f.front} onBlur={flush} placeholder="Front" aria-label="Flashcard front" onChange={(e) => update(f.id, { front: e.target.value })} />
            <textarea className="input text-slate-600" rows={2} value={f.back} onBlur={flush} placeholder="Back" aria-label="Flashcard back" onChange={(e) => update(f.id, { back: e.target.value })} />
          </li>
        ))}
        {flashcards.length === 0 && <li className="text-sm text-slate-500 py-6 text-center col-span-2">No flashcards yet.</li>}
      </ul>
    </div>
  );
}
