import dotenv from "dotenv";
import app from "./app.js";
import { db } from "./config/firebase.js";

dotenv.config();

const PORT = process.env.PORT || 3000;


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
