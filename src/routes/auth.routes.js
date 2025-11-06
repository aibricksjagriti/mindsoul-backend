import express from "express";
import { signup, login } from "../controllers/auth.controllers.js";
import { googleSignIn } from "../controllers/auth.controllers.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);

//google sign-in
router.post("/google", googleSignIn);

export default router;
