import { Router } from "express";
import { getProfile, postLogin, postRegister } from "../controllers/auth.controller";
import { authRequired } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", postRegister);
router.post("/login", postLogin);
router.get("/me", authRequired, getProfile);

export default router;
