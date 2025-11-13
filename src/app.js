import express from "express";
import cors from "cors";
import authRoutes from "../src/routes/auth.routes.js"
import counsellorRoutes from "../src/routes/counsellor.routes.js"
import appointmentRoutes from "../src/routes/appointment.routes.js"
import userRoutes from "../src/routes/user.routes.js"


//app config
const app = express();

//middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


//routes
app.use("/api/auth", authRoutes);
app.use("/api/counsellor", counsellorRoutes);
app.use("/api/appointment", appointmentRoutes);
app.use("/api/users", userRoutes);


export default app;
