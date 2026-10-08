import express from "express";
import argon2 from "argon2";
import nodemailer from "nodemailer";
import { db } from "../config/firebase.js";
import { createAccountRecovery } from "../services/accountRecovery.service.js";

const router = express.Router();
const transport = () => nodemailer.createTransport({service:"gmail",connectionTimeout:10000,socketTimeout:15000,auth:{user:process.env.MAIL_USER,pass:process.env.MAIL_PASS}});
const service = createAccountRecovery({ db, frontendUrl:process.env.FRONTEND_URL || "https://www.themindsoul.com", hashPassword:argon2.hash,
  verifyMail:() => transport().verify(),
  sendMail:(email,url) => transport().sendMail({from:{name:"MindSoul",address:process.env.MAIL_USER},to:email,subject:"Reset your MindSoul password",text:`Use this link within 15 minutes to reset your password:\n${url}\nIf you did not request this, ignore this email.`}),
});
router.post("/forgot-password",async(req,res,next) => { try { res.json(await service.request(req.body?.email)); } catch(error) { next(error); } });
router.post("/reset-password",async(req,res,next) => { try { res.json(await service.reset(req.body?.token,req.body?.password)); } catch(error) { next(error); } });
router.use((error,req,res,next) => { if(res.headersSent) return next(error); res.status(error.statusCode || 500).json({success:false,message:error.statusCode ? error.message : "We couldn't complete account recovery. Please try again."}); });
export default router;
