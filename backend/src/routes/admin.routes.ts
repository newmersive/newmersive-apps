import { Router } from "express";
import { authRequired, adminOnly } from "../middleware/auth.middleware";
import { getAllUsers } from "../services/auth.service";
import { getDemoModerationEvents } from "../ia/moderation.service";

const router=Router();

router.get("/dashboard", authRequired, adminOnly,(req,res)=>res.json({admin:true}));
router.get("/users", authRequired, adminOnly,(req,res)=>res.json({users:getAllUsers()}));
router.get("/ai/activity", authRequired, adminOnly,(req,res)=>res.json({events:getDemoModerationEvents()}));

export default router;