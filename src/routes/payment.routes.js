import express from "express";
import { createRazorpayOrder_Test } from "../controllers/payment/createOrderController.js";
import { createRazorpayOrder } from "../controllers/payment/createOrderController.js";
import { authenticate } from "../middlewares/auth.middlewares.js";
import { verifyRazorpayPayment } from "../controllers/payment/verifyPaymentController.js";
import { razorpayWebhook } from "../controllers/payment/webhookController.js";
import {
  getCounsellorPayments,
  getUserPayments,
} from "../controllers/payment/paymentHistoryController.js";
import { paymentRateLimiter } from "../middlewares/rateLimiter.middlewares.js";

const router = express.Router();

router.post("/create-order", authenticate, paymentRateLimiter, createRazorpayOrder);
// router.post("/create-order", createRazorpayOrder_Test);

// user payment history
router.get("/history/user", authenticate, getUserPayments);

// counsellor payment history
router.get("/history/counsellor", authenticate, getCounsellorPayments);

//verify payment
router.post("/verify-payment", verifyRazorpayPayment);

//razorpay webhook
router.post("/webhook", razorpayWebhook);

export default router;