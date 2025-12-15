import express from "express";
import { cronGenerateNext7Days } from "../controllers/timeslot.controllers.js";
import { verifyCronSecret } from "../middlewares/cronAuth.js";

const router = express.Router();

// Internal-only cron endpoint
router.post(
  "/generate-slots",
  verifyCronSecret,
  cronGenerateNext7Days
);

export default router;
