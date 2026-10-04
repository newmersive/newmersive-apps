import { Router } from "express";
import { postGrantEntitlement } from "../controllers/entitlements.controller";
import { serviceScopeRequired } from "../middleware/service-auth.middleware";

const router = Router();

router.post("/grant", serviceScopeRequired("entitlements:grant"), postGrantEntitlement);

export default router;
