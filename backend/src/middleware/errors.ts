import type { NextFunction, Request, Response } from "express";

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
}

// Centralized error handler: no stack traces or internals leak to the client.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  const anyErr = err as { status?: number; code?: string; message?: string };
  const status = anyErr.status && anyErr.status >= 400 && anyErr.status < 600 ? anyErr.status : 500;
  console.error(`[error] ${req.method} ${req.path}:`, err);
  res.status(status).json({ error: { code: anyErr.code ?? "INTERNAL_ERROR", message: status === 500 ? "Internal server error" : anyErr.message ?? "Error" } });
}

export const asyncHandler = <T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
