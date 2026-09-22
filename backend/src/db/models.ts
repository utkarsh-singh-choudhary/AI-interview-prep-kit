import type { ObjectId } from "mongodb";
import type { Kit, MockAttempt } from "../domain/types";
import type { PipelineStage } from "../pipeline/orchestrator";

export interface UserDoc {
  _id?: ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface SessionDoc {
  _id?: ObjectId;
  token: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

export type KitStatus = "draft" | "generating" | "ready" | "failed";

export interface PracticeRecord {
  flashcardId: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  lastPracticedAt: Date;
  timesSeen: number;
  // SM-2 spaced-repetition state (see services/spacedRepetition.ts). Optional so old
  // records written before v2 still load; they're treated as "never reviewed" by SM-2
  // until the next grade fills these in.
  easeFactor?: number;
  intervalDays?: number;
  repetitions?: number;
  dueAt?: Date;
}

export interface KitDoc {
  _id?: ObjectId;
  userId: ObjectId;
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  inputHash: string;
  status: KitStatus;
  stage?: PipelineStage;
  error?: { code: string; message: string };
  kit?: Kit;
  practice: PracticeRecord[];
  // v2: mock-interview attempt history, kept separate from the validated Kit document
  // itself since attempts accumulate over time and aren't part of the generated kit shape.
  mockAttempts?: MockAttempt[];
  createdAt: Date;
  updatedAt: Date;
}
