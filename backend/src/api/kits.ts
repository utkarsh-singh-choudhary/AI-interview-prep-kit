import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errors";
import { generationLimiter, regenerationLimiter, llmActionLimiter } from "../middleware/rateLimit";
import type { KitDoc } from "../db/models";
import { generateKit, PipelineError } from "../pipeline/orchestrator";
import { normalizedInputHash } from "../pipeline/dedupe";
import { generateQuestionsForCategory } from "../pipeline/questions";
import { generateFlashcards } from "../pipeline/flashcards";
import { generateCompanyBrief } from "../pipeline/companyResearch";
import { analyzeResumeGap } from "../pipeline/resumeGap";
import { evaluateAnswer } from "../pipeline/mockInterview";
import { crawlCompany } from "../crawl/crawler";
import { buildSchedule } from "../services/schedule";
import { closeCoverageGaps, findUncovered } from "../services/coverage";
import { validateKit } from "../services/validation";
import { mergeRegeneratedCompanyBrief, mergeRegeneratedFlashcards, mergeRegeneratedQuestions } from "../services/editState";
import { confidenceToQuality, gradeCard, sortByDue } from "../services/spacedRepetition";
import { enqueue, getJobStatus } from "../jobs/queue";
import { QUESTION_CATEGORIES, type Question, type Flashcard, type MockAttempt } from "../domain/types";

export const kitsRouter = Router();
kitsRouter.use(requireAuth());

const CreateKitSchema = z.object({
  jobDescription: z.string().trim().min(1, "Job description cannot be empty").max(20000),
  companyUrl: z.string().url("Company URL must be a valid URL"),
  daysAvailable: z.number().int().min(1, "Must be at least 1 day").max(90, "Must be 90 days or fewer"),
});

function toPublic(doc: KitDoc) {
  return {
    id: doc._id!.toString(), status: doc.status, stage: doc.stage, error: doc.error,
    jobDescription: doc.jobDescription, companyUrl: doc.companyUrl, daysAvailable: doc.daysAvailable,
    kit: doc.kit ?? null, practice: doc.practice, createdAt: doc.createdAt, updatedAt: doc.updatedAt,
  };
}

async function loadOwnedKit(req: Request, res: Response): Promise<KitDoc | null> {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found" } }); return null; }
  // userId scoping here is what guarantees users can only ever reach their own kits.
  const doc = await req.db.collection<KitDoc>("kits").findOne({ _id: new ObjectId(id), userId: req.userId });
  if (!doc) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found" } }); return null; }
  return doc;
}

// GET /api/kits — list only the caller's kits
kitsRouter.get("/", asyncHandler(async (req, res) => {
  const docs = await req.db.collection<KitDoc>("kits").find({ userId: req.userId }).sort({ createdAt: -1 }).toArray();
  res.json({ kits: docs.map(toPublic) });
}));

// POST /api/kits — create (or reuse a duplicate) and kick off generation
kitsRouter.post("/", generationLimiter, asyncHandler(async (req, res) => {
  const parsed = CreateKitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  const { jobDescription, companyUrl, daysAvailable } = parsed.data;
  const inputHash = normalizedInputHash(jobDescription, companyUrl);

  const dup = await req.db.collection<KitDoc>("kits").findOne({ userId: req.userId, inputHash, status: "ready" });
  if (dup) return res.status(200).json({ kit: toPublic(dup), reused: true });

  const now = new Date();
  const doc: KitDoc = { userId: req.userId!, jobDescription, companyUrl, daysAvailable, inputHash, status: "draft", practice: [], createdAt: now, updatedAt: now };
  const { insertedId } = await req.db.collection<KitDoc>("kits").insertOne(doc);
  res.status(201).json({ kit: toPublic({ ...doc, _id: insertedId }), reused: false });
}));

kitsRouter.get("/:id", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc) return;
  res.json({ kit: toPublic(doc) });
}));

kitsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc) return;
  await req.db.collection("kits").deleteOne({ _id: doc._id });
  res.json({ ok: true });
}));

// POST /api/kits/:id/generate — enqueues the full pipeline as a background job and
// returns immediately (202). Poll GET /:id for `status`/`stage`, or watch the kit's
// job status via GET /:id/generate. Generation used to run inline on this request,
// which meant a slow reverse-proxy timeout could kill a perfectly good, still-running
// pipeline; queuing it decouples "the HTTP request is done" from "the work is done".
kitsRouter.post("/:id/generate", generationLimiter, asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc) return;
  if (doc.status === "generating") return res.status(409).json({ error: { code: "ALREADY_GENERATING", message: "Generation already in progress" } });

  const kitId = doc._id!;
  await req.db.collection<KitDoc>("kits").updateOne({ _id: kitId }, { $set: { status: "generating", stage: "validating_input", updatedAt: new Date() } });

  const db = req.db; // captured for the background closure — the request's own req/res are gone by the time this runs
  enqueue(kitId.toString(), async () => {
    try {
      const kit = await generateKit({
        jobDescription: doc.jobDescription,
        companyUrl: doc.companyUrl,
        daysAvailable: doc.daysAvailable,
        onStage: (stage) => {
          void db.collection<KitDoc>("kits").updateOne({ _id: kitId }, { $set: { stage, updatedAt: new Date() } });
        },
      });
      await db.collection<KitDoc>("kits").updateOne(
        { _id: kitId },
        { $set: { status: "ready", kit, stage: "saving", updatedAt: new Date() }, $unset: { error: "" } },
      );
    } catch (err) {
      const code = err instanceof PipelineError ? err.code : "GENERATION_FAILED";
      const message = err instanceof Error ? err.message : "Generation failed";
      await db.collection<KitDoc>("kits").updateOne({ _id: kitId }, { $set: { status: "failed", error: { code, message }, updatedAt: new Date() } });
    }
  });

  res.status(202).json({ kit: toPublic({ ...doc, status: "generating" }), jobStatus: "queued" });
}));

// GET /api/kits/:id/generate — lightweight poll of just the background job's status,
// for clients that want to know "queued vs actually running" without refetching the kit.
kitsRouter.get("/:id/generate", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc) return;
  res.json({ jobStatus: getJobStatus(doc._id!.toString()) ?? null, status: doc.status, stage: doc.stage });
}));

function requireReadyKit(doc: KitDoc, res: Response): doc is KitDoc & { kit: NonNullable<KitDoc["kit"]> } {
  if (!doc.kit) { res.status(409).json({ error: { code: "NOT_READY", message: "Kit has not finished generating" } }); return false; }
  return true;
}

async function saveAndValidate(req: Request, res: Response, doc: KitDoc, nextKit: KitDoc["kit"]) {
  const validated = validateKit(nextKit);
  if (!validated.ok) return res.status(422).json({ error: { code: "INVALID_KIT", message: validated.errors.join("; ") } });
  await req.db.collection<KitDoc>("kits").updateOne({ _id: doc._id }, { $set: { kit: validated.kit, updatedAt: new Date() } });
  res.json({ kit: validated.kit });
}

// POST /api/kits/:id/regenerate/company — preserves the brief if the user edited it
kitsRouter.post("/:id/regenerate/company", regenerationLimiter, asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const crawl = await crawlCompany(doc.kit.source.company_url);
  const fresh = await generateCompanyBrief(crawl);
  const briefEdited = req.body?.briefEdited === true;
  const company_brief = mergeRegeneratedCompanyBrief(doc.kit, fresh, briefEdited);
  await saveAndValidate(req, res, doc, { ...doc.kit, company_brief });
}));

const RegenerateQuestionsSchema = z.object({ category: z.enum(QUESTION_CATEGORIES) });

// POST /api/kits/:id/regenerate/questions — regenerates one category; edited/pinned kept
kitsRouter.post("/:id/regenerate/questions", regenerationLimiter, asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const parsed = RegenerateQuestionsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_INPUT", message: "category is required" } });
  const { category } = parsed.data;

  const relevantReqs = doc.kit.role.requirements.filter((r) =>
    category === "behavioural" ? r.kind === "behavioural" : category === "company-fit" ? true : r.kind === "technical",
  );
  const fresh = await generateQuestionsForCategory(category, relevantReqs, doc.kit.company_brief);
  const questions = mergeRegeneratedQuestions(doc.kit.questions, category, fresh);
  const uncovered_requirement_ids = findUncovered(doc.kit.role.requirements, questions);
  await saveAndValidate(req, res, doc, { ...doc.kit, questions, coverage: { ...doc.kit.coverage, uncovered_requirement_ids } });
}));

// POST /api/kits/:id/regenerate/schedule — deterministic, so this is pure recomputation
kitsRouter.post("/:id/regenerate/schedule", regenerationLimiter, asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const days = buildSchedule(doc.kit.role.requirements, doc.kit.questions, doc.kit.schedule.days_available);
  await saveAndValidate(req, res, doc, { ...doc.kit, schedule: { ...doc.kit.schedule, days } });
}));

// ---- Question sub-resource ----
const QuestionInputSchema = z.object({
  requirement_ids: z.array(z.string()).default([]),
  category: z.enum(QUESTION_CATEGORIES),
  prompt: z.string().min(1),
  answer_outline: z.string().default(""),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
});

kitsRouter.post("/:id/questions", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const parsed = QuestionInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid question" } });
  const newQ: Question = { id: `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...parsed.data, editState: "edited" };
  const questions = [...doc.kit.questions, newQ];
  const uncovered_requirement_ids = findUncovered(doc.kit.role.requirements, questions);
  await saveAndValidate(req, res, doc, { ...doc.kit, questions, coverage: { ...doc.kit.coverage, uncovered_requirement_ids } });
}));

kitsRouter.patch("/:id/questions/:questionId", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const patch = QuestionInputSchema.partial().parse(req.body);
  let found = false;
  const questions = doc.kit.questions.map((q) => {
    if (q.id !== req.params.questionId) return q;
    found = true;
    return { ...q, ...patch, editState: q.editState === "pinned" ? "pinned" as const : "edited" as const };
  });
  if (!found) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Question not found" } });
  const uncovered_requirement_ids = findUncovered(doc.kit.role.requirements, questions);
  await saveAndValidate(req, res, doc, { ...doc.kit, questions, coverage: { ...doc.kit.coverage, uncovered_requirement_ids } });
}));

kitsRouter.delete("/:id/questions/:questionId", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const questions = doc.kit.questions.filter((q) => q.id !== req.params.questionId);
  const schedule = { ...doc.kit.schedule, days: doc.kit.schedule.days.map((d) => ({ ...d, question_ids: d.question_ids.filter((id) => id !== req.params.questionId) })) };
  const uncovered_requirement_ids = findUncovered(doc.kit.role.requirements, questions);
  await saveAndValidate(req, res, doc, { ...doc.kit, questions, schedule, coverage: { ...doc.kit.coverage, uncovered_requirement_ids } });
}));

// ---- Flashcard sub-resource ----
const FlashcardInputSchema = z.object({ front: z.string().min(1), back: z.string().min(1), requirement_ids: z.array(z.string()).default([]) });

kitsRouter.post("/:id/flashcards", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const parsed = FlashcardInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid flashcard" } });
  const newCard: Flashcard = { id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...parsed.data, editState: "edited" };
  await saveAndValidate(req, res, doc, { ...doc.kit, flashcards: [...doc.kit.flashcards, newCard] });
}));

kitsRouter.patch("/:id/flashcards/:flashcardId", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const patch = FlashcardInputSchema.partial().parse(req.body);
  let found = false;
  const flashcards = doc.kit.flashcards.map((f) => {
    if (f.id !== req.params.flashcardId) return f;
    found = true;
    return { ...f, ...patch, editState: f.editState === "pinned" ? "pinned" as const : "edited" as const };
  });
  if (!found) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found" } });
  await saveAndValidate(req, res, doc, { ...doc.kit, flashcards });
}));

kitsRouter.delete("/:id/flashcards/:flashcardId", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const flashcards = doc.kit.flashcards.filter((f) => f.id !== req.params.flashcardId);
  await saveAndValidate(req, res, doc, { ...doc.kit, flashcards });
}));

// ---- Practice (SM-2 spaced repetition — see services/spacedRepetition.ts) ----
const PracticeInputSchema = z.object({ flashcardId: z.string(), confidence: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]) });

kitsRouter.get("/:id/practice", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const byId = new Map(doc.practice.map((p) => [p.flashcardId, p]));
  const withDueInfo = doc.kit.flashcards.map((f) => {
    const p = byId.get(f.id);
    return { ...f, dueAt: p?.dueAt, timesSeen: p?.timesSeen ?? 0 };
  });
  const queue = sortByDue(withDueInfo);
  res.json({ queue, practice: doc.practice });
}));

kitsRouter.post("/:id/practice", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const parsed = PracticeInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_INPUT", message: "flashcardId and confidence (1-5) required" } });
  if (!doc.kit.flashcards.some((f) => f.id === parsed.data.flashcardId))
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found" } });

  const now = new Date();
  const existing = doc.practice.find((p) => p.flashcardId === parsed.data.flashcardId);
  const quality = confidenceToQuality(parsed.data.confidence);
  const sm2 = gradeCard(
    existing?.dueAt && existing.easeFactor !== undefined
      ? { easeFactor: existing.easeFactor, intervalDays: existing.intervalDays ?? 1, repetitions: existing.repetitions ?? 0, dueAt: existing.dueAt }
      : undefined,
    quality,
    now,
  );
  const record = {
    flashcardId: parsed.data.flashcardId,
    confidence: parsed.data.confidence,
    lastPracticedAt: now,
    timesSeen: (existing?.timesSeen ?? 0) + 1,
    easeFactor: sm2.easeFactor,
    intervalDays: sm2.intervalDays,
    repetitions: sm2.repetitions,
    dueAt: sm2.dueAt,
  };
  const practice = existing
    ? doc.practice.map((p) => (p.flashcardId === parsed.data.flashcardId ? record : p))
    : [...doc.practice, record];

  await req.db.collection<KitDoc>("kits").updateOne({ _id: doc._id }, { $set: { practice, updatedAt: now } });
  res.json({ practice, nextReview: sm2 });
}));

// ---- Resume gap analysis (v2) ----
const ResumeGapInputSchema = z.object({ resumeText: z.string().trim().min(1, "Resume text cannot be empty").max(30000) });

// POST /api/kits/:id/resume-gap — compares the pasted resume against every requirement
// and stores the report on the kit; resume text itself is never persisted, only the report.
kitsRouter.post("/:id/resume-gap", llmActionLimiter, asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const parsed = ResumeGapInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid input" } });

  const resume_gap = await analyzeResumeGap(parsed.data.resumeText, doc.kit.role.requirements);
  await saveAndValidate(req, res, doc, { ...doc.kit, resume_gap });
}));

// ---- Mock interview mode (v2) ----
const MockInterviewInputSchema = z.object({ questionId: z.string().min(1), answer: z.string().trim().max(8000) });

// POST /api/kits/:id/mock-interview — scores one answer with the LLM and appends the
// attempt (with its evaluation) to this kit's history.
kitsRouter.post("/:id/mock-interview", llmActionLimiter, asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc || !requireReadyKit(doc, res)) return;
  const parsed = MockInterviewInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid input" } });

  const question = doc.kit.questions.find((q) => q.id === parsed.data.questionId);
  if (!question) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Question not found" } });

  let evaluation;
  try {
    evaluation = await evaluateAnswer(question, parsed.data.answer, doc.kit.role.requirements);
  } catch {
    return res.status(422).json({ error: { code: "EVALUATION_FAILED", message: "Could not score this answer right now — please try again." } });
  }

  const attempt: MockAttempt = {
    id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    question_id: parsed.data.questionId,
    answer: parsed.data.answer,
    evaluation,
    created_at: new Date().toISOString(),
  };
  const mockAttempts = [...(doc.mockAttempts ?? []), attempt];
  await req.db.collection<KitDoc>("kits").updateOne({ _id: doc._id }, { $set: { mockAttempts, updatedAt: new Date() } });
  res.json({ attempt });
}));

// GET /api/kits/:id/mock-interview — full attempt history, most recent first.
kitsRouter.get("/:id/mock-interview", asyncHandler(async (req, res) => {
  const doc = await loadOwnedKit(req, res);
  if (!doc) return;
  const attempts = [...(doc.mockAttempts ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ attempts });
}));
