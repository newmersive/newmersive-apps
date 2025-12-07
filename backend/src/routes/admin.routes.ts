import { Router } from "express";
import { authRequired, adminOnly } from "../middleware/auth.middleware";
import { getPublicUsers } from "../services/auth.service";
import { listAllSponsorStats } from "../services/allwain.service";
import { getDemoModerationEvents } from "../ia/moderation.service";

const router=Router();

router.get("/dashboard", authRequired, adminOnly,(req,res)=>res.json({admin:true}));
router.get("/users", authRequired, adminOnly,(req,res)=>res.json({users:getPublicUsers()}));
router.get("/ai/activity", authRequired, adminOnly,(req,res)=>res.json({events:getDemoModerationEvents()}));
router.get(
  "/allwain/sponsors",
  authRequired,
  adminOnly,
  (_req, res) => res.json({ stats: listAllSponsorStats() })
);

export default router;
