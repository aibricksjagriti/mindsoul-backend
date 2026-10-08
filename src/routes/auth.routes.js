import express from "express";
import { signup, login } from "../controllers/auth.controllers.js";
import { googleSignIn, openSession } from "../controllers/auth.controllers.js";
import { logout } from "../controllers/logout.controllers.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);

//google sign-in
router.post("/google", googleSignIn);

//firebase session for verified email/password users and google
router.post("/session", openSession);

export default router;
