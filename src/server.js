import dotenv from "dotenv";
dotenv.config();

console.log("BOOT: server.js loaded");

import app from "./app.js";
import { db } from "./config/firebase.js";

const PORT = process.env.PORT || 8080;

async function testFirestore() {
  try {
    await db.collection("health").doc("startup").set({
      status: "ok",
      time: new Date(),
    });
    console.log("Firestore connection OK");
  } catch (error) {
    console.error("Firestore test failed:", error.message);
  }
}
testFirestore();

//Health check endpoint 
app.get("/", (req, res)=> {
  res.send("Hello from Mindsoul Backend");
})

app.listen(PORT,"0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
