import express from "express";
// @ts-ignore - type definitions unavailable in offline environment
import cors from "cors";
import { ENV } from "./config/env";
import apiRouter from "./routes";

export const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);

if (ENV.NODE_ENV !== "test") {
  app.listen(ENV.PORT, () => console.log("API OK"));
}

export default app;