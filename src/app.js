import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import bodyParser from "body-parser";

import authRoutes from "./routes/auth.routes.js";
import counsellorRoutes from "./routes/counsellor.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import timeslotRoutes from "./routes/timeslot.routes.js";
import quoteRoutes from "./routes/quote.routes.js";
import userRoutes from "./routes/user.routes.js";
import paymentRoutes from "./routes/payment.routes.js";


//app config
const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://mindsoul-frontend.netlify.app",
  "https://mindsoul-wellness.vercel.app/"
];

// GLOBAL CORS (must be before routes)
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));


//middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


//routes
app.use("/api/auth", authRoutes);
app.use("/api/counsellor", counsellorRoutes);
app.use("/api/appointment", appointmentRoutes);
app.use("/api/timeslots", timeslotRoutes);
app.use("/api", quoteRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payment", paymentRoutes)


//entry route for deployed backend
app.get("/", (req, res)=> {
  res.send("Hello from Mindsoul Backend");
})

export default app;
