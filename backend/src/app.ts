import express from "express";
import cookieParser from "cookie-parser";
import type { Db } from "mongodb";
import { authRouter } from "./api/auth";
import { kitsRouter } from "./api/kits";
import { errorHandler, notFound } from "./middleware/errors";
import { globalLimiter } from "./middleware/rateLimit";

export function createApp(db: Db) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // needed for req.ip to reflect the real client behind a reverse proxy/load balancer
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use((req, _res, next) => { req.db = db; next(); });

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", globalLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api/kits", kitsRouter);

  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}
