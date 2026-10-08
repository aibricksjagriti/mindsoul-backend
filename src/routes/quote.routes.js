import express from "express";
import { createQuoteRequest } from "../controllers/quote.controllers.js";
import { validateQuoteRequest } from "../middlewares/validateQuoteRequest.js";

const router = express.Router();

router.post("/quote", validateQuoteRequest, createQuoteRequest);

export default router;
