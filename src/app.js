import express from "express";
import cors from "cors";
import authRoutes from "../src/routes/auth.routes.js"
import counsellorRoutes from "../src/routes/counsellor.routes.js"
import appointmentRoutes from "../src/routes/appointment.routes.js"
import userRoutes from "../src/routes/user.routes.js"
import timeslotRoutes from "../src/routes/timeslot.routes.js";
import cookieParser from "cookie-parser";


//app config
const app = express();

//middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


//routes
app.use("/api/auth", authRoutes);
app.use("/api/counsellor", counsellorRoutes);
app.use("/api/appointment", appointmentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/timeslots", timeslotRoutes);


export default app;
