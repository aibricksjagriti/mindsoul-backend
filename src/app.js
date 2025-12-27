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
import scheduleRoutes from "./routes/schedule.routes.js";
import cronRoutes from "./routes/cron.routes.js";
import adminRoutes from "./routes/admin.routes.js";



//app config
const app = express();

// Allowed frontend domains
const allowedOrigins = [
  "http://localhost:5173",
  "https://mindsoul-wellness.vercel.app",

  // local payment testing (delete later)
    "http://localhost:5173", 
  "http://localhost:3000",
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

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Reflect allowed origin so cookies are accepted
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});




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
app.use("/api/schedule", scheduleRoutes);
app.use("/internal/cron", cronRoutes);
app.use("/api/admin", adminRoutes);




//entry route for deployed backend
app.get("/", (req, res)=> {
  res.send("Hello from Mindsoul Backend");
})

export default app;
