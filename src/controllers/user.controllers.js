import { db } from "../config/firebase.js";

//POST/PATCH for updating user profile
export const updateUserProfile = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Extract form-data fields
    let { age, gender, phone, medications, medicalHistory } = req.body;

    // Required fields check
    if (!age || !gender || !phone) {
      return res.status(400).json({
        success: false,
        message: "Age, gender, and phone are required.",
      });
    }

    const userRef = db.collection("users").doc(user.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Convert incoming form-data strings → arrays
    // Postman / frontend will send CSV format: "med1,med2,med3"
    // Convert to arrays safely
    let parsedMedications = [];
    if (Array.isArray(medications)) {
      parsedMedications = medications.map((m) => m.trim()).filter(Boolean);
    } else if (typeof medications === "string") {
      parsedMedications = medications
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
    }

    let parsedMedicalHistory = [];
    if (Array.isArray(medicalHistory)) {
      parsedMedicalHistory = medicalHistory
        .map((m) => m.trim())
        .filter(Boolean);
    } else if (typeof medicalHistory === "string") {
      parsedMedicalHistory = medicalHistory
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
    }

    const updatePayload = {
      age,
      gender,
      phone,
      medications: parsedMedications,
      medicalHistory: parsedMedicalHistory,
      profileCompleted: true,
      updatedAt: new Date(),
    };

    await userRef.update(updatePayload);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        ...updatePayload,
        isUser: true,
        profileCompleted: true,
      },
    });
  } catch (error) {
    console.error("updateUserProfile error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

//GET api for fetching user details on dashboard
export const getUserProfile = async (req, res) => {
  try {
    const user = req.user; // from auth middleware

    if (!user || !user.uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const userRef = db.collection("users").doc(user.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userData = userSnap.data();

    // Final response payload for dashboard
    const profile = {
      id: user.uid,
      name: userData.name || null,
      email: userData.email || null,

      age: userData.age || null,
      gender: userData.gender || null,
      phone: userData.phone || null,
      medications: userData.medications || null,
      medicalHistory: userData.medicalHistory || null,

      isUser: userData.isUser ?? true,
      profileCompleted: userData.profileCompleted ?? false,

      createdAt: userData.createdAt || null,
      updatedAt: userData.updatedAt || null,
    };

    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully.",
      data: profile,
    });
  } catch (error) {
    console.error("getUserProfile error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

//get api for user appointments
export const getUserAppointments = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.uid) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userAppointmentsRef = db
      .collection("users")
      .doc(user.uid)
      .collection("appointments");

    const snapshot = await userAppointmentsRef.get();

    const appointments = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        counsellorId: data.counsellorId || null,
        counsellorName: data.counsellorName || null,
        date: data.date || null,
        timeSlot: data.timeSlot || null,
        status: data.status || null,
        meetingLink: data.zoomLink || null,
        createdAt: data.createdAt || null,
      };
    });

    return res.status(200).json({
      success: true,
      message: "User appointments fetched successfully",
      data: appointments,
    });
  } catch (error) {
    console.error("getUserAppointments Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
