import express from "express";
import { createQuoteRequest } from "../controllers/quote.controllers.js";

const router = express.Router();

router.post("/quote", createQuoteRequest);

export default router;