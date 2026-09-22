import type { NextFunction, Request, Response } from "express";
import type { Db, ObjectId } from "mongodb";
import { SESSION_COOKIE, getSessionUserId } from "../auth/sessions";

declare module "express-serve-static-core" {
  interface Request { userId?: ObjectId; db: Db; }
}

export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const userId = await getSessionUserId(req.db, token);
    if (!userId) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } });
    req.userId = userId;
    next();
  };
}
