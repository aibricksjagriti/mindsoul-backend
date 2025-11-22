import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1️⃣ If running locally AND firebaseAuthKey.json exists → load from file
const localKeyPath = path.resolve(__dirname, "../../firebaseAuthKey.json");
let serviceAccount = null;

if (fs.existsSync(localKeyPath)) {
  serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, "utf8"));
  console.log("Loaded Firebase key from local file");
}

// 2️⃣ If running on Cloud Run → load from environment variable
if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  console.log("Loaded Firebase key from environment variable");
}

// 3️⃣ Initialize Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "mindsoul-backend.firebasestorage.app",
  });
}

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

export { db, auth, storage };
