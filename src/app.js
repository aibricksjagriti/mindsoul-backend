import express from "express";
import cors from "cors";
import authRoutes from "../src/routes/auth.routes.js"

//app config
const app = express();

//middlewares
app.use(cors());
app.use(express.json());

//routes
app.use("/api/auth", authRoutes)

export default app;
