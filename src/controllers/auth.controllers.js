import jwt from "jsonwebtoken";
import argon2 from "argon2";

import { db, auth } from "../config/firebase.js";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn(
    "Warning: JWT_SECRET is not set. Using fallback secret (unsafe for production)."
  );
}

//Signup code - firebase DB
export const signup = async (req, res) => {
  try { 
    const { name, email, password } = req.body;

    //Validate input
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }

    //Check if user already exists
    const usersRef = db.collection("users");
    const existingUser = await usersRef.where("email", "==", email).get();
    if (!existingUser.empty) {
      return res
        .status(409)
        .json({ success: false, message: "User already exists." });
    }

    //Hash password
    const hashedPassword = await argon2.hash(password);

    //create user document in firestore
    const userRef = usersRef.doc(); //firestore auto-generates unique ID
    await userRef.set({
      name,
      email,
      password: hashedPassword,
      authProvider: "email",
      createdAt: new Date(),
    });

    //Generate JWT
    const token = jwt.sign(
      { id: userRef.id, email },
      JWT_SECRET || "fallback_secret",
      {
        expiresIn: "1h",
      }
    );

    res.status(201).json({
      success: true,
      message: "Signup successful.",
      data: { token },
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

//Login - firebase db
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // Find user in Firestore
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("email", "==", email).get();

    if (snapshot.empty) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    // Verify password
    const valid = await argon2.verify(userData.password, password);
    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: userDoc.id, email },
      JWT_SECRET || "fallback_secret",
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token,
        user: {
          id: userDoc.id,
          name: userData.name,
          email: userData.email,
          authProvider: userData.authProvider || "email",
        },
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

//google signin controller
export const googleSignIn = async (req, res) => {
  try {
    const { idToken } = req.body; // Token from frontend
    if (!idToken) {
      return res
        .status(400)
        .json({ success: false, message: "ID token is required." });
    }

    // Verify Google ID token using Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    // Reference to Firestore users collection
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Create new user record
      await userRef.set({
        name: name || "",
        email,
        picture: picture || "",
        authProvider: "google",
        createdAt: new Date(),
      });
    } else {
      // Optionally update existing profile info
      await userRef.update({
        name: name || userDoc.data().name,
        picture: picture || userDoc.data().picture,
      });
    }

    // Generate custom JWT for backend
    const token = jwt.sign({ uid, email }, JWT_SECRET, { expiresIn: "1h" });

    return res.status(200).json({
      success: true,
      message: "Google Sign-In successful.",
      data: { token, email, name, picture },
    });
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication failed.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const openSession = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Missing Firebase ID token",
      });
    }

    // Verify Firebase ID token
    const decoded = await auth.verifyIdToken(idToken);
    const provider = decoded.firebase?.sign_in_provider;
    const emailVerified = decoded.email_verified;

    // Block unverified email/password users
    if (provider === "password" && !emailVerified) {
      return res.status(403).json({
        success: false,
        message:
          "Email not verified. Please verify your email before signing in.",
      });
    }

    const { uid, email, name, picture } = decoded;

    // Sync user to Firestore
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        uid,
        name: name || "",
        email,
        photoURL: picture || "",
        authProvider: provider === "password" ? "email" : provider,
        emailVerified: !!emailVerified,
        createdAt: new Date(),
        lastLogin: new Date(),
      });
    } else {
      await userRef.update({
        name: name || userDoc.data().name,
        photoURL: picture || userDoc.data().photoURL,
        emailVerified: !!emailVerified,
        lastLogin: new Date(),
      });
    }

    // Generate custom backend JWT
    const token = jwt.sign(
      { uid, email, name },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      success: true,
      message: "Firebase session verified successfully",
      data: { token, uid, email, name, emailVerified },
    });
  } catch (error) {
    console.error("openSession Error: ", error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired Firebase ID token",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
