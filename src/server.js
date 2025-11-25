import dotenv from "dotenv";
import app from "./app.js";
import { db } from "./config/firebase.js";
import cors from "cors";


dotenv.config();

const PORT = process.env.PORT || 8080;

const allowedOrigins = [
  "http://localhost:5173",
  "https://mindsoul-frontend.netlify.app" // add your prod domain later
];

// CORS
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

//connect to firestore
async function testFirestore() {
  await db
    .collection("test")
    .doc("check")
    .set({ status: "connected", time: new Date() });
  console.log("Firestore connection successful");
}
testFirestore();

//entry route for deployed backend
app.get("/", (req, res)=> {
  res.send("Hello from Mindsoul Backend");
})

app.listen(PORT,"0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
