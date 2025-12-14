import express from "express";
import cors from "cors";
import { ENV } from "./config/env";
import apiRouter from "./routes";
import { closePrisma } from "./db/prisma";

export const app = express();

/* =========================
   CORS allowlist
========================= */
app.use(
  cors({
    origin: (origin: any, callback: any) => {
      // Permite requests sin origin (curl/healthchecks)
      if (!origin) return callback(null, true);

      if (ENV.ALLOWED_ORIGINS.includes(String(origin))) {
        return callback(null, true);
      }

      return callback(new Error("CORS_NOT_ALLOWED"));
    },
  })
);

app.use(express.json());

app.use("/api", apiRouter);

// Global error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("UNHANDLED_EXPRESS_ERROR", err);

  const status = err?.message === "CORS_NOT_ALLOWED" ? 403 : 500;

  res.status(status).json({
    error: "INTERNAL_ERROR",
    detail: ENV.NODE_ENV === "development" ? String(err?.message || err) : undefined,
  });
});

const server =
  ENV.NODE_ENV !== "test"
    ? app.listen(ENV.PORT, () => console.log(`API OK on port ${ENV.PORT}`))
    : null;

async function shutdown(signal: string) {
  console.log(`Shutting down (${signal})...`);
  try {
    await closePrisma();
  } catch (e) {
    console.error("closePrisma error:", e);
  }

  if (server) server.close(() => process.exit(0));
  else process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
