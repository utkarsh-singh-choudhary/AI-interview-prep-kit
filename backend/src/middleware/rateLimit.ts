import rateLimit from "express-rate-limit";
import type { Request } from "express";

// Per-user (falls back to IP if unauthenticated) key, so one user hammering the API
// can't starve others, and one shared office IP doesn't get punished for many users.
const keyByUser = (req: Request) => req.userId?.toString() ?? req.ip ?? "anonymous";

const handler = (req: Request, res: any) =>
  res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests — please slow down and try again shortly." } });

/** Kit creation and full-pipeline generation: several LLM + crawl calls each. */
export const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUser,
  handler,
});

/** Single-section regeneration (one or two LLM calls): a bit more headroom than full generation. */
export const regenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUser,
  handler,
});

/** Mock-interview answer grading and resume-gap analysis: cheap per call, but easy to spam. */
export const llmActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUser,
  handler,
});

/** Coarse global limiter for all /api routes, mainly to blunt credential-stuffing on auth. */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "anonymous",
  handler,
});
