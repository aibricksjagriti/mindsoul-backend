import dotenv from "dotenv";
import app from "./app.js";
import db from "./config/firestore.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

//connect to firestore
async function testFirestore() {
  await db.collection("test").doc("check").set({ status: "connected", time: new Date() });
  console.log("Firestore connection successful");
}

testFirestore();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
