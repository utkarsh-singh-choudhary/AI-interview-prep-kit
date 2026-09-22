export type RequirementKind = "technical" | "behavioural" | "domain";
export type Priority = "must" | "nice";
export type QuestionCategory = "technical" | "behavioural" | "system-design" | "company-fit";
export type EditState = "generated" | "edited" | "pinned";

export interface Requirement { id: string; text: string; kind: RequirementKind; priority: Priority; }
export interface Question {
  id: string; requirement_ids: string[]; category: QuestionCategory;
  prompt: string; answer_outline: string; difficulty: 1 | 2 | 3; editState?: EditState;
}
export interface Flashcard { id: string; front: string; back: string; requirement_ids: string[]; editState?: EditState; }
export interface ScheduleDay { day: number; focus: string; question_ids: string[]; minutes: number; }

export interface Kit {
  source: { company: string; company_url: string; role: string; location: string; jd_chars: number; researched_at: string; pages_used: string[] };
  company_brief: { summary: string; what_they_do: string; sources: string[] };
  role: { title: string; seniority: string; responsibilities: string[]; requirements: Requirement[] };
  questions: Question[];
  flashcards: Flashcard[];
  schedule: { days_available: number; days: ScheduleDay[] };
  coverage: { uncovered_requirement_ids: string[]; passes: number };
  resume_gap?: ResumeGap;
}

export type ResumeMatch = "covered" | "partial" | "missing";
export interface ResumeGapItem { requirement_id: string; match: ResumeMatch; evidence: string; suggestion: string; }
export interface ResumeGap { analyzed_at: string; resume_chars: number; items: ResumeGapItem[]; }

export interface AnswerEvaluation {
  score: 1 | 2 | 3 | 4 | 5;
  strengths: string[];
  gaps: string[];
  model_answer_diff: string;
  follow_up_question: string;
}
export interface MockAttempt { id: string; question_id: string; answer: string; evaluation: AnswerEvaluation; created_at: string; }

export type KitStatus = "draft" | "generating" | "ready" | "failed";
export interface PracticeRecord {
  flashcardId: string; confidence: 1 | 2 | 3 | 4 | 5; lastPracticedAt: string; timesSeen: number;
  easeFactor?: number; intervalDays?: number; repetitions?: number; dueAt?: string;
}
export interface PracticeQueueCard extends Flashcard { dueAt?: string; timesSeen: number; }

export interface KitRecord {
  id: string; status: KitStatus; stage?: string; error?: { code: string; message: string } | null;
  jobDescription: string; companyUrl: string; daysAvailable: number;
  kit: Kit | null; practice: PracticeRecord[]; createdAt: string; updatedAt: string;
}
