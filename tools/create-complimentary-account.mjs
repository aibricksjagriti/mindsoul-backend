import dotenv from "dotenv";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";

dotenv.config({ quiet: true });
const { db } = await import("../src/config/firebase.js");
const email = process.argv[2] || "freebooking-test@example.invalid";
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Provide a valid account email");
const credentialsFile = "complimentary-account.private.json";
if (existsSync(credentialsFile)) throw new Error("Credentials file already exists. Review the existing account before creating another");
const password = randomBytes(24).toString("base64url");
const passwordHash = await argon2.hash(password);
const ref = db.collection("users").doc();
await db.runTransaction(async (transaction) => {
  const duplicates = await transaction.get(db.collection("users").where("email", "==", email));
  if (!duplicates.empty) throw new Error("This email already has an account. Grant access to that user instead of overwriting their password");
  transaction.create(ref, {
    name: "Free Booking Test User", email, password: passwordHash, role: "user", authProvider: "email", isUser: true, profileCompleted: false, createdAt: new Date(),
  });
  transaction.create(db.collection("complimentaryAccess").doc(ref.id), {
    active: true, allowance: "unlimited", grantedBy: "workspace-owner", createdAt: new Date(),
  });
});
writeFileSync(credentialsFile, JSON.stringify({ userId: ref.id, email, password, allowance: "unlimited" }, null, 2), { flag: "wx", mode: 0o600 });
console.log("Created user ID:", ref.id);
console.log("Unlimited complimentary access enabled. Credentials saved privately to", credentialsFile);
process.exit(0);
