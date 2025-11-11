import { adminDb } from "../config/firebase.js";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import { getOtpEmailHtml } from "../utils/emailTemplate.js";

//This is helper function to encode email for firestore
const encodeEmail = (email) => email.replace(/\./g, "_");

// Controller for sending OTP (with rate limiter)
// export const sendOtp = async (req, res) => {
//   try {
//     const { email } = req.body;
//     if (!email) return res.status(400).json({ message: "Email is required" });

//     const normalizedEmail = email.trim().toLowerCase();

//     // clean old/expired otps before creating a new one
//     const now = Date.now();
//     const expiredDocs = await adminDb
//       .collection("counsellor_otps")
//       .where("expiresAt", "<=", admin.firestore.Timestamp.fromMillis(now))
//       .get();

//     if (!expiredDocs.empty) {
//       const batch = adminDb.batch();
//       expiredDocs.forEach((doc) => batch.delete(doc.ref));
//       await batch.commit();
//       console.log(`Cleaned up ${expiredDocs.size} expired OTPs}`);
//     }

//     //Rate limiting check (max 3 OTPs per hour)
//     const oneHourAgo = admin.firestore.Timestamp.fromMillis(
//       Date.now() - 60 * 60 * 1000
//     );

//     const recentOtps = await adminDb
//       .collection("counsellor_otps")
//       .where("email", "==", normalizedEmail)
//       .where("createdAt", ">=", oneHourAgo)
//       .get();

//     //check size
//     if (recentOtps.size >= 3) {
//       return res.status(429).json({
//         message: "Rate limited exceeded. Try again in an hour.",
//       });
//     }

//     // Generate new 6-digit OTP
//     const otp = Math.floor(100000 + Math.random() * 900000).toString();

//     // Store OTP in Firestore with server timestamp
//     await adminDb.collection("counsellor_otps").add({
//       email: normalizedEmail,
//       otp,
//       createdAt: admin.firestore.FieldValue.serverTimestamp(),
//       expiresAt: admin.firestore.Timestamp.fromMillis(
//         Date.now() + 5 * 60 * 1000
//       ), // 5 minutes
//     });

//     // Nodemailer transporter
//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: process.env.MAIL_USER,
//         pass: process.env.MAIL_PASS,
//       },
//     });

//     // Send OTP email with retry & fail-safe cleanup
//     try {
//       await transporter.sendMail({
//         from: `"MINDSOUL Team" <${process.env.MAIL_USER}>`,
//         to: normalizedEmail,
//         subject: "MINDSOUL Counsellor Verification Code",
//         html: getOtpEmailHtml(otp),
//       });
//       console.log(`OTP email sent to ${normalizedEmail}`);
//     } catch (mailErr) {
//       console.error(`Failed to send OTP email to ${normalizedEmail}:`, mailErr);

//       // Retry once (e.g., in case of transient Gmail issue)
//       try {
//         console.log("Retrying email send...");
//         await new Promise((resolve) => setTimeout(resolve, 2000)); // wait 2s
//         await transporter.sendMail({
//           from: `"MINDSOUL Team" <${process.env.MAIL_USER}>`,
//           to: normalizedEmail,
//           subject: "MINDSOUL Counsellor Verification Code",
//           html: `<p>Your OTP is ${otp}. It expires in 5 minutes.</p>`,
//         });
//         console.log(`Retry succeeded for ${normalizedEmail}`);
//       } catch (retryErr) {
//         console.error("Retry failed. Cleaning up OTP document...");

//         // Delete OTP from Firestore since email never delivered
//         const otpDocs = await adminDb
//           .collection("counsellor_otps")
//           .where("email", "==", normalizedEmail)
//           .orderBy("createdAt", "desc")
//           .limit(1)
//           .get();

//         if (!otpDocs.empty) {
//           await otpDocs.docs[0].ref.delete();
//           console.log("Undelivered OTP removed from Firestore.");
//         }

//         return res.status(500).json({
//           message: "Email delivery failed. Please try again later.",
//         });
//       }
//     }

//     return res
//       .status(200)
//       .json({ message: "OTP sent successfully", success: true });
//   } catch (error) {
//     console.error("Error sending OTP:", error);
//     return res
//       .status(500)
//       .json({ message: "Failed to send OTP", error: error.message });
//   }
// };

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

// //controller for verifing otp
// export const verifyOtp = async (req, res) => {
//   try {
//     const { email, otp } = req.body;

//     if (!email || !otp) {
//       return res.status(400).json({ message: "Email and OTP are required" });
//     }

//     // Fetch the latest OTP record for this email
//     const normalizedEmail = email.trim().toLowerCase();

//     const otpQuery = await adminDb
//       .collection("counsellor_otps")
//       .where("email", "==", normalizedEmail)
//       .orderBy("createdAt", "desc")
//       .limit(1)
//       .get();

//     if (otpQuery.empty) {
//       return res.status(404).json({ message: "No OTP found for this email" });
//     }

//     const otpDoc = otpQuery.docs[0];
//     const otpData = otpDoc.data();
//     const { otp: storedOtp, expiresAt } = otpData;

//     // Check expiry
//     if (Date.now() > expiresAt.toMillis()) {
//       return res.status(400).json({ message: "OTP has expired" });
//     }

//     // Check match
//     if (storedOtp !== otp) {
//       return res.status(400).json({ message: "Invalid OTP" });
//     }

//     // Mark counsellor verified in Firestore
//     await adminDb.collection("counsellors").doc(normalizedEmail).set(
//       {
//         email: normalizedEmail,
//         verified: true,
//         verifiedAt: new Date().toISOString(),
//       },
//       { merge: true }
//     );

//     // Delete OTP record (cleanup)
//     await adminDb.collection("counsellor_otps").doc(otpDoc.id).delete();

//     return res.status(200).json({
//       message: "OTP verified successfully. Counsellor marked as verified.",
//       verified: true,
//     });
//   } catch (error) {
//     console.error("Error verifying OTP:", error);
//     return res
//       .status(500)
//       .json({ message: "OTP verification failed", error: error.message });
//   }
// };

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
export const updateProfile = async (req, res) => {
  try {
    const {
      email, // required (use same email used for OTP)
      firstName,
      lastName,
      phoneNumber,
      description,
      expertise,
      workingHours,
      workingDays, // expected array of strings
    } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const counsellorRef = adminDb
      .collection("counsellors")
      .doc(normalizedEmail);
    const counsellorSnap = await counsellorRef.get();

    // Require existing verified counsellor
    if (!counsellorSnap.exists) {
      return res.status(404).json({ message: "Counsellor record not found" });
    }

    const counsellorData = counsellorSnap.data();
    if (!counsellorData.isVerified) {
      return res.status(403).json({
        message: "Counsellor not verified. Complete OTP verification first.",
      });
    }

    // Build profileData object only with provided values
    const profileData = {};
    if (firstName !== undefined) profileData.firstName = firstName;
    if (lastName !== undefined) profileData.lastName = lastName;
    if (phoneNumber !== undefined) profileData.phoneNumber = phoneNumber;
    if (description !== undefined) profileData.description = description;
    if (expertise !== undefined) profileData.expertise = expertise;
    if (workingHours !== undefined) profileData.workingHours = workingHours;
    if (workingDays !== undefined) {
      if (!Array.isArray(workingDays)) {
        return res
          .status(400)
          .json({ message: "workingDays must be an array" });
      }
      profileData.workingDays = workingDays;
    }

    // At minimum require names before marking profileCompleted (optional rule)
    // If you want to enforce required fields, uncomment below:
    // if (!profileData.firstName || !profileData.lastName) {
    //   return res.status(400).json({ message: "First name and last name are required." });
    // }

    // Update counsellor document (merge)
    const updatePayload = {
      profileCompleted: true,
      profileData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // remove deleteAt so it won't be auto-deleted by any cleanup logic
      deleteAt: admin.firestore.FieldValue.delete(),
    };

    await counsellorRef.set(updatePayload, { merge: true });

    // Return the fresh document
    const updatedSnap = await counsellorRef.get();
    return res.status(200).json({
      message: "Profile updated successfully",
      success: true,
      counsellor: updatedSnap.data(),
    });
  } catch (error) {
    console.error("Error updating counsellor profile:", error);
    return res
      .status(500)
      .json({ message: "Failed to update profile", error: error.message });
  }
};

//controller for creating appointment
export const createAppointment = async (req, res) => {
  try {
    const {
      counsellorEmail, // required, normalized email (string)
      date, // required, ISO date string 'YYYY-MM-DD'
      time, // required, 'HH:MM' or any agreed format
      studentId = null, // optional
      zoomLink = null, // optional
      meta = {}, // optional extra fields
    } = req.body;

    if (!counsellorEmail || !date || !time) {
      return res
        .status(400)
        .json({ message: "counsellorEmail, date and time are required" });
    }

    const normalizedEmail = String(counsellorEmail).trim().toLowerCase();
    const counsellorRef = adminDb
      .collection("counsellors")
      .doc(normalizedEmail);
    const counsellorSnap = await counsellorRef.get();

    if (!counsellorSnap.exists) {
      return res.status(404).json({ message: "Counsellor not found" });
    }

    const counsellor = counsellorSnap.data();
    if (!counsellor.isVerified) {
      return res.status(403).json({ message: "Counsellor not verified" });
    }

    // Optionally require completed profile for booking:
    // if (!counsellor.profileCompleted) {
    //   return res.status(403).json({ message: "Counsellor profile incomplete" });
    // }

    // Create appointment doc under subcollection
    const appointmentsCol = counsellorRef.collection("appointments");
    const newDocRef = appointmentsCol.doc(); // auto id
    const appointmentId = newDocRef.id;

    const appointmentPayload = {
      id: appointmentId,
      date, // store as string for simple queries; can use Timestamp if preferred
      time,
      counsellorId: normalizedEmail,
      studentId,
      zoomLink,
      meta,
      status: "scheduled", // scheduled | completed | cancelled
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await newDocRef.set(appointmentPayload);

    const createdSnap = await newDocRef.get();
    return res.status(201).json({
      message: "Appointment created",
      success: true,
      appointment: createdSnap.data(),
    });
  } catch (error) {
    console.error("Error creating appointment:", error);
    return res
      .status(500)
      .json({ message: "Failed to create appointment", error: error.message });
  }
};

//controller for listing appointments
export const listAppointments = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const counsellorRef = adminDb
      .collection("counsellors")
      .doc(normalizedEmail);
    const counsellorSnap = await counsellorRef.get();

    if (!counsellorSnap.exists) {
      return res.status(404).json({ message: "Counsellor not found" });
    }

    const appointmentsRef = counsellorRef.collection("appointments");
    const snapshot = await appointmentsRef.orderBy("createdAt", "desc").get();

    if (snapshot.empty) {
      return res
        .status(200)
        .json({ message: "No appointments found", appointments: [] });
    }

    const appointments = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({
      message: "Appointments fetched successfully",
      success: true,
      count: appointments.length,
      appointments,
    });
  } catch (error) {
    console.error("Error listing appointments:", error);
    return res
      .status(500)
      .json({ message: "Failed to list appointments", error: error.message });
  }
};

//controller for getting appointment by id
export const getAppointment = async (req, res) => {
  try {
    const { email, appointmentId } = req.query;

    if (!email || !appointmentId) {
      return res
        .status(400)
        .json({ message: "Email and appointmentId are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const counsellorRef = adminDb
      .collection("counsellors")
      .doc(normalizedEmail);
    const counsellorSnap = await counsellorRef.get();

    if (!counsellorSnap.exists) {
      return res.status(404).json({ message: "Counsellor not found" });
    }

    const appointmentRef = counsellorRef
      .collection("appointments")
      .doc(appointmentId);

    const appointmentSnap = await appointmentRef.get();

    if (!appointmentSnap.exists) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    return res.status(200).json({
      message: "Appointment fetched successfully",
      success: true,
      appointment: appointmentSnap.data(),
    });
  } catch (error) {
    console.error("Error fetching appointment:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch appointment", error: error.message });
  }
};
