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
// import paymentRoutes from "./routes/payment.routes.js";


//app config
const app = express();

// Allowed frontend domains
const allowedOrigins = [
  "http://localhost:5173",
  "https://mindsoul-wellness.vercel.app"
];

//CORS config(must be before routes)
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow mobile/postman
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS blocked: " + origin), false);
  },
  credentials: true,
};

// GLOBAL CORS
app.use(cors(corsOptions));


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
// app.use("/api/payment", paymentRoutes)


//entry route for deployed backend
app.get("/", (req, res)=> {
  res.send("Hello from Mindsoul Backend");
})

export default app;
