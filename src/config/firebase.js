import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

//Resolve service account key
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccountPath = path.resolve(
  __dirname,
  "../../firebaseAuthKey.json"
);

// Read and parse JSON (Admin SDK key)
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

/* Initialize Firebase Admin SDK (server side)    Used for Firestore + Auth + any secure operations like OTP storage */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Export both Firestore and Auth instances
const db = admin.firestore();
const auth = admin.auth();

//Alias admindb (for clarity in controllers)
const adminDb = db;

export { db, auth, adminDb };
