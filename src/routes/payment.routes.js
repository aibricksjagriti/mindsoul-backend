import express from "express";
// import {  createRazorpayOrder_Test } from "../controllers/payment/createOrderController.js";
import { createRazorpayOrder } from "../controllers/payment/createOrderController.js";
import { authenticate } from "../middlewares/auth.middlewares.js";
import { verifyRazorpayPayment } from "../controllers/payment/verifyPaymentController.js";
import { razorpayWebhook } from "../controllers/payment/webhookController.js";

const router = express.Router();

router.post("/create-order", authenticate, createRazorpayOrder);

// router.post("/create-order", createRazorpayOrder_Test);  

router.post("/verify-payment", authenticate, verifyRazorpayPayment);

router.post("/webhook", razorpayWebhook);

export default router;
