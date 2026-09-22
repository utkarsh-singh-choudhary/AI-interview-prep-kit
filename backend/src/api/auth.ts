import { Router } from "express";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { SESSION_COOKIE, createSession, destroySession } from "../auth/sessions";
import { asyncHandler } from "../middleware/errors";
import { requireAuth } from "../middleware/auth";

const CredentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });
const cookieOpts = () => ({
  httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/",
});

export const authRouter = Router();

authRouter.post("/register", asyncHandler(async (req, res) => {
  const parsed = CredentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Valid email and password (min 8 chars) required" } });
  const { email, password } = parsed.data;
  const existing = await req.db.collection("users").findOne({ email });
  if (existing) return res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "An account with this email already exists" } });

  const passwordHash = await hashPassword(password);
  const { insertedId } = await req.db.collection("users").insertOne({ email, passwordHash, createdAt: new Date() });
  const session = await createSession(req.db, insertedId);
  res.cookie(SESSION_COOKIE, session.token, { ...cookieOpts(), expires: session.expiresAt });
  res.status(201).json({ user: { id: insertedId.toString(), email } });
}));

authRouter.post("/login", asyncHandler(async (req, res) => {
  const parsed = CredentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Email and password required" } });
  const { email, password } = parsed.data;
  const user = await req.db.collection("users").findOne({ email });
  const ok = user ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok) return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });

  const session = await createSession(req.db, user._id);
  res.cookie(SESSION_COOKIE, session.token, { ...cookieOpts(), expires: session.expiresAt });
  res.json({ user: { id: user._id.toString(), email: user.email } });
}));

authRouter.post("/logout", asyncHandler(async (req, res) => {
  await destroySession(req.db, req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, cookieOpts());
  res.json({ ok: true });
}));

authRouter.get("/me", requireAuth(), asyncHandler(async (req, res) => {
  const user = await req.db.collection("users").findOne({ _id: req.userId });
  if (!user) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } });
  res.json({ user: { id: user._id.toString(), email: user.email } });
}));
