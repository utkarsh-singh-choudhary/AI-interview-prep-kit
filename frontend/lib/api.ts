import type { KitRecord, PracticeQueueCard, PracticeRecord, ResumeGap, MockAttempt } from "./types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? "UNKNOWN", body?.error?.message ?? "Request failed");
  return body as T;
}

export const api = {
  register: (email: string, password: string) => request<{ user: { id: string; email: string } }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => request<{ user: { id: string; email: string } }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<{ user: { id: string; email: string } }>("/auth/me"),

  listKits: () => request<{ kits: KitRecord[] }>("/kits"),
  createKit: (jobDescription: string, companyUrl: string, daysAvailable: number) =>
    request<{ kit: KitRecord; reused: boolean }>("/kits", { method: "POST", body: JSON.stringify({ jobDescription, companyUrl, daysAvailable }) }),
  getKit: (id: string) => request<{ kit: KitRecord }>(`/kits/${id}`),
  deleteKit: (id: string) => request<{ ok: true }>(`/kits/${id}`, { method: "DELETE" }),
  generateKit: (id: string) => request<{ kit: KitRecord; jobStatus: string }>(`/kits/${id}/generate`, { method: "POST" }),
  getGenerateStatus: (id: string) => request<{ jobStatus: string | null; status: string; stage?: string }>(`/kits/${id}/generate`),

  regenerateCompany: (id: string, briefEdited: boolean) =>
    request<{ kit: KitRecord["kit"] }>(`/kits/${id}/regenerate/company`, { method: "POST", body: JSON.stringify({ briefEdited }) }),
  regenerateQuestions: (id: string, category: string) =>
    request<{ kit: KitRecord["kit"] }>(`/kits/${id}/regenerate/questions`, { method: "POST", body: JSON.stringify({ category }) }),
  regenerateSchedule: (id: string) => request<{ kit: KitRecord["kit"] }>(`/kits/${id}/regenerate/schedule`, { method: "POST" }),

  addQuestion: (id: string, q: Partial<{ requirement_ids: string[]; category: string; prompt: string; answer_outline: string; difficulty: 1 | 2 | 3 }>) =>
    request(`/kits/${id}/questions`, { method: "POST", body: JSON.stringify(q) }),
  patchQuestion: (id: string, qid: string, patch: Record<string, unknown>) =>
    request(`/kits/${id}/questions/${qid}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteQuestion: (id: string, qid: string) => request(`/kits/${id}/questions/${qid}`, { method: "DELETE" }),

  addFlashcard: (id: string, f: { front: string; back: string; requirement_ids?: string[] }) =>
    request(`/kits/${id}/flashcards`, { method: "POST", body: JSON.stringify(f) }),
  patchFlashcard: (id: string, fid: string, patch: Record<string, unknown>) =>
    request(`/kits/${id}/flashcards/${fid}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteFlashcard: (id: string, fid: string) => request(`/kits/${id}/flashcards/${fid}`, { method: "DELETE" }),

  getPracticeQueue: (id: string) => request<{ queue: PracticeQueueCard[]; practice: PracticeRecord[] }>(`/kits/${id}/practice`),
  recordPractice: (id: string, flashcardId: string, confidence: 1 | 2 | 3 | 4 | 5) =>
    request<{ practice: PracticeRecord[]; nextReview: { easeFactor: number; intervalDays: number; repetitions: number; dueAt: string } }>(
      `/kits/${id}/practice`, { method: "POST", body: JSON.stringify({ flashcardId, confidence }) },
    ),

  analyzeResumeGap: (id: string, resumeText: string) =>
    request<{ kit: KitRecord["kit"] }>(`/kits/${id}/resume-gap`, { method: "POST", body: JSON.stringify({ resumeText }) }),

  submitMockAnswer: (id: string, questionId: string, answer: string) =>
    request<{ attempt: MockAttempt }>(`/kits/${id}/mock-interview`, { method: "POST", body: JSON.stringify({ questionId, answer }) }),
  getMockHistory: (id: string) => request<{ attempts: MockAttempt[] }>(`/kits/${id}/mock-interview`),
};
