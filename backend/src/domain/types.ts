import { z } from "zod";

export const REQUIREMENT_KINDS = ["technical", "behavioural", "domain"] as const;
export const PRIORITIES = ["must", "nice"] as const;
export const QUESTION_CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"] as const;

export const RequirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(REQUIREMENT_KINDS),
  priority: z.enum(PRIORITIES),
});

// editState implements the generated/edited/pinned model (see README). Optional so
// the exact public kit shape stays valid; the persistence layer sets it.
export const EditStateSchema = z.enum(["generated", "edited", "pinned"]).optional();

export const QuestionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string()),
  category: z.enum(QUESTION_CATEGORIES),
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  editState: EditStateSchema,
});

export const FlashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string()),
  editState: EditStateSchema,
});

export const ScheduleDaySchema = z.object({
  day: z.number().int().min(1),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().min(0),
});

// --- v2: resume-to-requirement gap analysis ---
export const RESUME_MATCH_LEVELS = ["covered", "partial", "missing"] as const;
export const ResumeGapItemSchema = z.object({
  requirement_id: z.string().min(1),
  match: z.enum(RESUME_MATCH_LEVELS),
  evidence: z.string(), // quote/paraphrase from the resume, or "" when missing
  suggestion: z.string(), // what to add/emphasize to close the gap
});
export const ResumeGapSchema = z.object({
  analyzed_at: z.string(),
  resume_chars: z.number().int().min(0),
  items: z.array(ResumeGapItemSchema),
});
export type ResumeGapItem = z.infer<typeof ResumeGapItemSchema>;
export type ResumeGap = z.infer<typeof ResumeGapSchema>;

// --- v2: mock interview answer evaluation ---
export const AnswerEvaluationSchema = z.object({
  score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  model_answer_diff: z.string(), // what a stronger answer would add, not a full rewrite
  follow_up_question: z.string(),
});
export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

export const MockAttemptSchema = z.object({
  id: z.string().min(1),
  question_id: z.string().min(1),
  answer: z.string(),
  evaluation: AnswerEvaluationSchema,
  created_at: z.string(),
});
export type MockAttempt = z.infer<typeof MockAttemptSchema>;

export const KitSchema = z.object({
  source: z.object({
    company: z.string(), company_url: z.string(), role: z.string(), location: z.string(),
    jd_chars: z.number().int().min(0), researched_at: z.string(), pages_used: z.array(z.string()),
  }),
  company_brief: z.object({ summary: z.string(), what_they_do: z.string(), sources: z.array(z.string()) }),
  role: z.object({
    title: z.string(), seniority: z.string(), responsibilities: z.array(z.string()),
    requirements: z.array(RequirementSchema),
  }),
  questions: z.array(QuestionSchema),
  flashcards: z.array(FlashcardSchema),
  schedule: z.object({ days_available: z.number().int().min(1), days: z.array(ScheduleDaySchema) }),
  coverage: z.object({ uncovered_requirement_ids: z.array(z.string()), passes: z.number().int().min(0) }),
  // Optional v2 sections: absent until the user opts in, never generated eagerly.
  resume_gap: ResumeGapSchema.optional(),
});

export type Requirement = z.infer<typeof RequirementSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;
export type Kit = z.infer<typeof KitSchema>;
