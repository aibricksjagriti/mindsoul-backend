import { randomBytes, createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const error = (message,statusCode) => Object.assign(new Error(message),{statusCode});
export const createAccountRecovery = ({ db, verifyMail, sendMail, hashPassword, now = () => Date.now(), frontendUrl }) => {
  const request = async (email) => {
    if(typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw error("Enter a valid email address",400);
    const normalized = email.trim().toLowerCase();
    const throttle = db.collection("accountRecoveryThrottle").doc(hash(normalized));
    await db.runTransaction(async tx => {
      const snapshot = await tx.get(throttle); const previous = snapshot.data();
      const count = previous && now() - previous.windowStart < 900000 ? previous.count : 0;
      if(count >= 5) throw error("Please wait before requesting another reset email",429);
      tx.set(throttle,{windowStart: count ? previous.windowStart : now(),count:count+1});
    });
    try { await verifyMail(); } catch { throw error("Email delivery is temporarily unavailable. Please contact support",503); }
    const users = await db.collection("users").where("email","==",normalized).limit(2).get();
    const generic = { success:true, message:"If an email/password account exists, a reset link has been sent. Check your inbox and spam folder." };
    if(users.docs.length !== 1 || users.docs[0].data().role !== "user" || typeof users.docs[0].data().password !== "string") return generic;
    const user = users.docs[0];
    const token = randomBytes(32).toString("hex");
    const ref = db.collection("accountRecoveryTokens").doc(hash(token));
    await ref.set({userId:user.id,passwordFingerprint:hash(user.data().password),expiresAt:now()+900000,used:false});
    try { await sendMail(normalized,`${frontendUrl.replace(/\/$/,"")}/reset-password?token=${token}`); }
    catch { await ref.delete(); console.error("Account recovery email delivery failed; request a new link or contact support."); }
    return generic;
  };
  const reset = async (token,password) => {
    if(typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) || typeof password !== "string" || password.length < 12 || password.length > 128) throw error("Use a valid reset link and a password of 12–128 characters",400);
    const ref = db.collection("accountRecoveryTokens").doc(hash(token));
    const passwordHash = await hashPassword(password);
    await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref); const record = snapshot.data();
      if(!snapshot.exists || record.used || record.expiresAt <= now()) throw error("This reset link has expired or has already been used",400);
      const userRef = db.collection("users").doc(record.userId); const user = await tx.get(userRef);
      if(!user.exists || hash(user.data().password) !== record.passwordFingerprint) throw error("Request a new reset link",400);
      tx.update(userRef,{password:passwordHash,updatedAt:new Date(now())});
      tx.update(ref,{used:true});
    });
    return {success:true,message:"Password updated. Sign in with your new password."};
  };
  return { request, reset };
};
