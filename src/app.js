import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import counsellorRoutes from "./routes/counsellor.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import timeslotRoutes from "./routes/timeslot.routes.js";




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
app.use("/api/timeslots", timeslotRoutes);


//entry route for deployed backend
app.get("/", (req, res)=> {
  res.send("Hello from Mindsoul Backend");
})

export default app;
