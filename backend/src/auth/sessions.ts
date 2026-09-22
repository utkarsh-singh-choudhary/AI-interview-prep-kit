import { randomBytes } from "node:crypto";
import type { Db, ObjectId } from "mongodb";

export const SESSION_COOKIE = "session_token";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(db: Db, userId: ObjectId): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.collection("sessions").insertOne({ token, userId, createdAt: now, expiresAt });
  return { token, expiresAt };
}

export async function getSessionUserId(db: Db, token: string | undefined): Promise<ObjectId | null> {
  if (!token) return null;
  const session = await db.collection("sessions").findOne({ token, expiresAt: { $gt: new Date() } });
  return session ? (session.userId as ObjectId) : null;
}

export async function destroySession(db: Db, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.collection("sessions").deleteOne({ token });
}
