import express from "express";
import { db } from "../config/firebase.js";
import { authenticate } from "../middlewares/auth.middlewares.js";
import { requireAdmin } from "../middlewares/requireAdmin.middlewares.js";
import { createSessionSupport } from "../services/sessionSupport.service.js";

const router = express.Router();
const service = createSessionSupport({db});
router.use(authenticate);
router.post("/appointments/:id/requests",async(req,res,next) => { try { res.status(201).json(await service.request(req.user,req.params.id,req.body)); } catch(error) { next(error); } });
router.get("/requests",requireAdmin,async(req,res,next) => { try { const records=await db.collection("sessionChangeRequests").orderBy("createdAt","desc").limit(100).get(); res.json({success:true,requests:records.docs.map(doc=>({id:doc.id,...doc.data()}))}); } catch(error) { next(error); } });
router.use((error,req,res,next) => { if(res.headersSent) return next(error); res.status(error.statusCode || 500).json({success:false,message:error.statusCode ? error.message : "We couldn't save your request. Please try again."}); });
export default router;
