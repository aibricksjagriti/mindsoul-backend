import { adminDb, storage, db } from "../config/firebase.js";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import { getOtpEmailHtml } from "../utils/emailTemplate.js";
import jwt from "jsonwebtoken";
import { filterCounsellorsService } from "../services/counsellorFilter.service.js";

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


export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Fetch latest OTP
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

    if (Date.now() > expiresAt.toMillis()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    if (storedOtp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    //  Fetch counsellor BY EMAIL (not by docId)
    const existingQuery = await adminDb
      .collection("counsellors")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    let counsellorRef;
    let counsellorId; //store counsellorId centrally
    let isNewCounsellor = false;

    if (existingQuery.empty) {
      counsellorRef = adminDb.collection("counsellors").doc(); // auto-id
      counsellorId = counsellorRef.id;

      await counsellorRef.set({
        counsellorId, // field
        email: normalizedEmail,
        isCounsellor: true,
        isVerified: true,
        profileCompleted: false,
        role: "counsellor",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      isNewCounsellor = true;
    } else {
      counsellorRef = existingQuery.docs[0].ref;
      counsellorId = counsellorRef.id;

      await counsellorRef.update({
        isCounsellor: true,
        isVerified: true,
        role: "counsellor",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Correct JWT payload — include counsellorId (NOT email)

    const token = jwt.sign(
      {
        counsellorId, //(was undefined earlier)
        email: normalizedEmail,
        role: "counsellor",
      },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    // Set secure cookie
    res.cookie("mindsoul_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Clear OTP
    await otpDoc.ref.update({ verified: true });
    await otpDoc.ref.delete();

    return res.status(200).json({
      message: "OTP verified successfully.",
      success: true,
      isCounsellor: true,
      isVerified: true,
      counsellorId,
      profileCompleted: isNewCounsellor
        ? false
        : existingQuery.docs[0].data().profileCompleted || false,
      role: "counsellor",
    });
  } catch (error) {
    console.error("Error jverifying OTP:", error);
    return res
      .status(500)
      .json({ message: "OTP verification failed", error: error.message });
  }
};

//helperfucntion
const toArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value]; // convert single string → array
};

export const updateProfile = async (req, res) => {
  try {
    // Extract incoming fields from form-data body
    const {
      email,
      counsellorId,
      firstName,
      lastName,
      phoneNumber,
      description,
      languages,
      sessionPrice,
      focusAreas,
      expertise,
      experience,
      workingHours,
      workingDays,

      slotDuration,
    } = req.body;

    if (!counsellorId) {
      return res.status(400).json({
        success: false,
        message: "counsellorId is required", //  NEW
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const counsellorRef = adminDb.collection("counsellors").doc(counsellorId); //  NEW changed from doc(normalizedEmail)
    const counsellorSnap = await counsellorRef.get();

    if (!counsellorSnap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Counsellor record not found" });
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
    if (typeof expertise !== "undefined") {
      profileData.expertise = toArray(expertise);
    }

    if (experience) profileData.experience = experience;

    // --- NEW FOR TIMESLOTS: Validate + assign workingHours ---
    if (workingHours) {
      try {
        // change #1 — always treat workingHours as a JSON string
        const parsedWH = JSON.parse(workingHours);
        // change #2 — assign parsed object to Firestore
        profileData.workingHours = parsedWH;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message:
            'workingHours must be valid JSON. Example: { "morning": {"start":"09:00","end":"12:00"} }',
        });
      }
    }

    // --- NEW FOR TIMESLOTS: slotDuration (integer minutes) ---
    if (typeof slotDuration !== "undefined") {
      const parsed = Number(slotDuration);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({
          success: false,
          message: "slotDuration must be a positive number (minutes)",
        });
      }
      profileData.slotDuration = parsed;
    }

    // WORKING DAYS
    if (workingDays) {
      if (!Array.isArray(workingDays)) {
        return res.status(400).json({
          success: false,
          message: "workingDays must be an array",
        });
      }
      profileData.workingDays = workingDays;
    }

    //LANGUAGES
    if (typeof languages !== "undefined") {
      profileData.languages = toArray(languages).map((s) => s.trim());
    }

    // Session Price
    if (typeof sessionPrice !== "undefined") {
      const parsed = Number(sessionPrice);
      profileData.sessionPrice = Number.isFinite(parsed)
        ? parsed
        : sessionPrice; // fallback to string if not numeric
    }

    // ------------------ NEW: focusAreas -------------------------
    if (typeof focusAreas !== "undefined") {
      profileData.focusAreas = toArray(focusAreas).map((s) => s.trim());
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

    //Default schedulePreferences should match workingHours periods only
if (!counsellorData.schedulePreferences) {

  // Use the incoming workingHours from profileData FIRST
  const wh = profileData.workingHours || counsellorData.profileData?.workingHours;

  const hasMorning = wh?.morning ? true : false;
  const hasAfternoon = wh?.afternoon ? true : false;
  const hasEvening = wh?.evening ? true : false;

  const defaultDay = {
    morning: hasMorning,
    afternoon: hasAfternoon,
    evening: hasEvening,
  };

  profileData.schedulePreferences = {
    Monday:    { ...defaultDay },
    Tuesday:   { ...defaultDay },
    Wednesday: { ...defaultDay },
    Thursday:  { ...defaultDay },
    Friday:    { ...defaultDay },
    Saturday:  { ...defaultDay },
    Sunday:    { ...defaultDay }
  };
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

// fetch counsellors---------------- for FRONTEND ---------------
export const getAllCounsellors = async (req, res) => {
  try {
    const snapshot = await adminDb
      .collection("counsellors")
      .where("profileCompleted", "==", true)
      .get();

    const counsellors = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        counsellorId: doc.id,
        imageUrl: data.profileData?.imageUrl || "",
        firstName: data.profileData?.firstName || "",
        lastName: data.profileData?.lastName || "",
        experience: data.profileData?.experience || "",
        expertise: data.profileData?.expertise || "",
        languages: data.profileData?.languages || [],
        sessionPrice: data.profileData?.sessionPrice || "",
        focusAreas: data.profileData?.focusAreas || [],
        description: data.profileData?.description || "",
        phoneNumber: data.profileData?.phoneNumber || "",
        email: data.email,
        workingDays: data.profileData?.workingDays || [],
        workingHours: data.profileData?.workingHours || {},
      };
    });

    return res.status(200).json({
      success: true,
      counsellors,
    });
  } catch (error) {
    console.error("getAllCounsellors error:", err);
    return res.status(500).json({ message: "Failed to fetch counsellors" });
  }
};

// fetch counsellor by Id -------------for FRONTEND -------------
export const getAllCounsellorsById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Counsellor email is required",
      });
    }

    const docSnap = await adminDb.collection("counsellors").doc(id).get();

    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        message: "Counsellor not found",
      });
    }

    const data = docSnap.data();

    const counsellor = {
      counsellorId: id,
      imageUrl: data.profileData?.imageUrl || "",
      firstName: data.profileData?.firstName || "",
      lastName: data.profileData?.lastName || "",
      experience: data.profileData?.experience || "",
      expertise: data.profileData?.expertise || [],
      languages: data.profileData?.languages || [],
      sessionPrice: data.profileData?.sessionPrice || "",
      focusAreas: data.profileData?.focusAreas || [],
      description: data.profileData?.description || "",
      phoneNumber: data.profileData?.phoneNumber || "",
      email: data.email || email,
      workingDays: data.profileData?.workingDays || [],
      workingHours: data.profileData?.workingHours || {},
    };

    return res.status(200).json({
      success: true,
      counsellor,
    });
  } catch (error) {
    console.error("getCounsellorById error: ", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch counsellor",
    });
  }
};

//filter controller
export const filterCounsellors = async (req, res) => {
  try {
    // Normalizes languages/expertise into clean arrays
    const normalizeQueryArray = (value) => {
      if (!value) return [];

      // If Express parsed repeated query params -> array
      if (Array.isArray(value)) {
        return value
          .flatMap((v) => v.split(",")) // split comma groups
          .map((s) => s.trim()) // remove spaces
          .filter((s) => s.length > 0); // remove empty
      }

      // If single string: split by comma
      if (typeof value === "string") {
        return value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }

      return [];
    };

    const filters = {
      languages: normalizeQueryArray(req.query.languages),
      expertise: normalizeQueryArray(req.query.expertise),
    };

    const data = await filterCounsellorsService(filters);

    return res.status(200).json({
      success: true,
      count: data.length,
      counsellors: data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to filter counsellors",
      error: error.message,
    });
  }
};

//fetch counsellor appointments
export const getCounsellorAppointments = async (req, res) => {
  try {
    const counsellor = req.user;

    // Counsellor must be logged in & verified
    if (!counsellor || !counsellor.counsellorId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const counsellorId = counsellor.counsellorId; // extracted from JWT

    // Fetch appointments from counsellor subcollection
    const ref = db
      .collection("counsellors")
      .doc(counsellorId)
      .collection("appointments");

    const snapshot = await ref.get();

    const appointments = snapshot.docs.map((doc) => {
      const data = doc.data();

      // Build student name (fallback to email)
      const studentName =
        data.studentName ||
        (data.studentProfileSnapshot
          ? `${data.studentProfileSnapshot.firstName || ""} ${
              data.studentProfileSnapshot.lastName || ""
            }`.trim()
          : data.studentEmail);

      return {
        id: doc.id,
        date: data.date || null,
        timeSlot: data.timeSlot || null,
        status: data.status || null,

        // Counsellor sees HOST/START URL (not join URL)
        startUrl: data.zoomStartUrl || data.zoomLink || null, // fallback

        // Student Info
        studentEmail: data.studentEmail || null,
        studentName: studentName,

        createdAt: data.createdAt || null,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Counsellor appointments fetched successfully",
      data: appointments,
    });
  } catch (error) {
    console.error("getCounsellorAppointments Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch counsellor appointments",
      error: error.message,
    });
  }
};
