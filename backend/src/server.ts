import express from "express";
// @ts-ignore - type definitions for cors are not available in this environment
import cors from "cors";
import { ENV } from "./config/env";
import apiRouter from "./routes";

export const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);

// Global error handler (por si algo revienta fuera de try/catch)
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("UNHANDLED_EXPRESS_ERROR", err);
  res.status(500).json({
    error: "INTERNAL_ERROR",
    detail: ENV.NODE_ENV === "development" ? String(err?.message || err) : undefined,
  });
});

if (ENV.NODE_ENV !== "test") {
  app.listen(ENV.PORT, () => console.log("API OK"));
}

export default app;
