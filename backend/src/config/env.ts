import dotenv from "dotenv";
dotenv.config();
export const ENV = {
  PORT: process.env.PORT || "4000",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
  NODE_ENV: process.env.NODE_ENV || "development",
  DEMO_MODE: process.env.DEMO_MODE === "true"
};