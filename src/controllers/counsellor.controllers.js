import { adminDb, storage } from "../config/firebase.js";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import { getOtpEmailHtml } from "../utils/emailTemplate.js";

//This is helper function to encode email for firestore
const encodeEmail = (email) => email.replace(/\./g, "_");

// Controller for sending OTP (Rate Limiter Removed)
export const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const normalizedEmail = email.trim().toLowerCase();

    // Clean old/expired OTPs before creating a new one
    const now = Date.now();
    const expiredDocs = await adminDb
      .collection("counsellor_otps")
      .where("expiresAt", "<=", admin.firestore.Timestamp.fromMillis(now))
      .get();

    if (!expiredDocs.empty) {
      const batch = adminDb.batch();
      expiredDocs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      console.log(`Cleaned up ${expiredDocs.size} expired OTPs`);
    }

    // Generate new 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in Firestore with server timestamp
    await adminDb.collection("counsellor_otps").add({
      email: normalizedEmail,
      otp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(
        Date.now() + 5 * 60 * 1000
      ), // expires in 5 minutes
    });

    // Nodemailer transporter setup
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    // Send OTP email with retry & cleanup on failure
    try {
      await transporter.sendMail({
        from: `"MINDSOUL Team" <${process.env.MAIL_USER}>`,
        to: normalizedEmail,
        subject: "MINDSOUL Counsellor Verification Code",
        html: getOtpEmailHtml(otp),
      });
      console.log(`OTP email sent to ${normalizedEmail}`);
    } catch (mailErr) {
      console.error(`Failed to send OTP email to ${normalizedEmail}:`, mailErr);

      // Retry once after 2 seconds
      try {
        console.log("Retrying email send...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await transporter.sendMail({
          from: `"MINDSOUL Team" <${process.env.MAIL_USER}>`,
          to: normalizedEmail,
          subject: "MINDSOUL Counsellor Verification Code",
          html: `<p>Your OTP is ${otp}. It expires in 5 minutes.</p>`,
        });
        console.log(`Retry succeeded for ${normalizedEmail}`);
      } catch (retryErr) {
        console.error("Retry failed. Cleaning up OTP document...");

        // Delete OTP from Firestore if email never delivered
        const otpDocs = await adminDb
          .collection("counsellor_otps")
          .where("email", "==", normalizedEmail)
          .orderBy("createdAt", "desc")
          .limit(1)
          .get();

        if (!otpDocs.empty) {
          await otpDocs.docs[0].ref.delete();
          console.log("Undelivered OTP removed from Firestore.");
        }

        return res.status(500).json({
          message: "Email delivery failed. Please try again later.",
        });
      }
    }

    return res
      .status(200)
      .json({ message: "OTP sent successfully", success: true });
  } catch (error) {
    console.error("Error sending OTP:", error);
    return res
      .status(500)
      .json({ message: "Failed to send OTP", error: error.message });
  }
};

// Controller for verifying OTP and managing counsellor status
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Fetch latest OTP record
    const otpQuery = await adminDb
      .collection("counsellor_otps")
      .where("email", "==", normalizedEmail)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (otpQuery.empty) {
      return res.status(404).json({ message: "No OTP found for this email" });
    }

    const otpDoc = otpQuery.docs[0];
    const otpData = otpDoc.data();
    const { otp: storedOtp, expiresAt } = otpData;

    // Validate expiration
    if (Date.now() > expiresAt.toMillis()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Validate match
    if (storedOtp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP valid: check if counsellor already exists
    const counsellorRef = adminDb
      .collection("counsellors")
      .doc(normalizedEmail);
    const counsellorSnap = await counsellorRef.get();

    let isNewCounsellor = false;

    if (!counsellorSnap.exists) {
      // First-time verification → create new counsellor record
      await counsellorRef.set({
        email: normalizedEmail,
        isCounsellor: true,
        isVerified: true,
        profileCompleted: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      isNewCounsellor = true;
    } else {
      // Existing counsellor → just mark verified
      await counsellorRef.update({
        isCounsellor: true,
        isVerified: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Mark OTP verified & cleanup
    await otpDoc.ref.update({ verified: true });
    await otpDoc.ref.delete();

    return res.status(200).json({
      message: "OTP verified successfully.",
      success: true,
      isCounsellor: true,
      isVerified: true,
      profileCompleted: isNewCounsellor
        ? false
        : counsellorSnap.data().profileCompleted || false,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res
      .status(500)
      .json({ message: "OTP verification failed", error: error.message });
  }
};

//Controller for update profile COUNSELLOR
// export const updateProfile = async (req, res) => {
//   try {
//     const {
//       email, // required (use same email used for OTP)
//       firstName,
//       lastName,
//       phoneNumber,
//       description,
//       expertise,
//       workingHours,
//       workingDays, // expected array of strings
//     } = req.body;

//     if (!email) {
//       return res.status(400).json({ message: "Email is required" });
//     }

//     const normalizedEmail = email.trim().toLowerCase();
//     const counsellorRef = adminDb
//       .collection("counsellors")
//       .doc(normalizedEmail);
//     const counsellorSnap = await counsellorRef.get();

//     // Require existing verified counsellor
//     if (!counsellorSnap.exists) {
//       return res.status(404).json({ message: "Counsellor record not found" });
//     }

//     const counsellorData = counsellorSnap.data();
//     if (!counsellorData.isVerified) {
//       return res.status(403).json({
//         message: "Counsellor not verified. Complete OTP verification first.",
//       });
//     }

//     // Build profileData object only with provided values
//     const profileData = {};
//     if (firstName !== undefined) profileData.firstName = firstName;
//     if (lastName !== undefined) profileData.lastName = lastName;
//     if (phoneNumber !== undefined) profileData.phoneNumber = phoneNumber;
//     if (description !== undefined) profileData.description = description;
//     if (expertise !== undefined) profileData.expertise = expertise;
//     if (workingHours !== undefined) profileData.workingHours = workingHours;
//     if (workingDays !== undefined) {
//       if (!Array.isArray(workingDays)) {
//         return res
//           .status(400)
//           .json({ message: "workingDays must be an array" });
//       }
//       profileData.workingDays = workingDays;
//     }

//     // At minimum require names before marking profileCompleted (optional rule)
//     // If you want to enforce required fields, uncomment below:
//     // if (!profileData.firstName || !profileData.lastName) {
//     //   return res.status(400).json({ message: "First name and last name are required." });
//     // }

//     // Update counsellor document (merge)
//     const updatePayload = {
//       profileCompleted: true,
//       profileData,
//       updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//       // remove deleteAt so it won't be auto-deleted by any cleanup logic
//       deleteAt: admin.firestore.FieldValue.delete(),
//     };

//     await counsellorRef.set(updatePayload, { merge: true });

//     // Return the fresh document
//     const updatedSnap = await counsellorRef.get();
//     return res.status(200).json({
//       message: "Profile updated successfully",
//       success: true,
//       counsellor: updatedSnap.data(),
//     });
//   } catch (error) {
//     console.error("Error updating counsellor profile:", error);
//     return res
//       .status(500)
//       .json({ message: "Failed to update profile", error: error.message });
//   }
// };
export const updateProfile = async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      phoneNumber,
      description,
      expertise,
      workingHours,
      workingDays,
    } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const counsellorRef = adminDb.collection("counsellors").doc(normalizedEmail);
    const counsellorSnap = await counsellorRef.get();

    if (!counsellorSnap.exists) {
      return res.status(404).json({ success: false, message: "Counsellor record not found" });
    }

    const counsellorData = counsellorSnap.data();

    if (!counsellorData.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Counsellor not verified. Complete OTP verification first.",
      });
    }

    // ------------------ BUILD PROFILE DATA ---------------------
    const profileData = {};

    if (firstName) profileData.firstName = firstName;
    if (lastName) profileData.lastName = lastName;
    if (phoneNumber) profileData.phoneNumber = phoneNumber;
    if (description) profileData.description = description;
    if (expertise) profileData.expertise = expertise;
    if (workingHours) profileData.workingHours = workingHours;

    if (workingDays) {
      if (!Array.isArray(workingDays)) {
        return res.status(400).json({
          success: false,
          message: "workingDays must be an array",
        });
      }
      profileData.workingDays = workingDays;
    }

    // ------------------ IMAGE UPLOAD LOGIC ---------------------
    if (req.file) {
      const bucket = storage.bucket();
      const fileName = `counsellor-images/${normalizedEmail}-${Date.now()}`;
      const file = bucket.file(fileName);

      await file.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype },
        public: true,
      });

      const imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      profileData.imageUrl = imageUrl;
    }

    // ------------------ FINAL FIRESTORE UPDATE -----------------
    const updatePayload = {
      profileData,
      profileCompleted: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      deleteAt: admin.firestore.FieldValue.delete(),
    };

    await counsellorRef.set(updatePayload, { merge: true });

    const updatedSnap = await counsellorRef.get();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      counsellor: updatedSnap.data(),
    });

  } catch (error) {
    console.error("Error updating counsellor profile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};



