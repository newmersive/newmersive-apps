import express from "express";
import cors from "cors";
import { ENV } from "./config/env";
import apiRouter from "./routes";

const app=express();
app.use(cors());
app.use(express.json());
app.use("/api",apiRouter);
app.listen(ENV.PORT,()=>console.log("API OK"));