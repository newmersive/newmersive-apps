import { Router } from "express";
import {
  getProfile,
  postForgotPassword,
  postLogin,
  postRegister,
  postResetPassword,
} from "../controllers/auth.controller";
import { authRequired } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", postRegister);
router.post("/login", postLogin);
router.get("/me", authRequired, getProfile);
router.post("/forgot-password", postForgotPassword);
router.post("/reset-password", postResetPassword);

export default router;
