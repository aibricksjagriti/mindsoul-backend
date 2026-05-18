import { adminDb, storage } from "../config/firebase.js";
import jwt from "jsonwebtoken";

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    if (
      email !== process.env.ADMIN_EMAIL ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid admin credentials" });
    }

    const token = jwt.sign(
      { email, role: "admin" },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "24h" }
    );

    return res.status(200).json({
      success: true,
      message: "Admin login successful",
      token,
    });
  } catch (error) {
    console.error("adminLogin error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export const getAllCounsellorsAdmin = async (req, res) => {
  try {
    const snapshot = await adminDb.collection("counsellors").get();

    const counsellors = snapshot.docs.map((doc) => {
      const data = doc.data();
      const pd = data.profileData || {};
      return {
        id: doc.id,
        email: data.email || "",
        role: data.role || "counsellor",
        isVerified: data.isVerified || false,
        profileCompleted: data.profileCompleted || false,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        firstName: pd.firstName || "",
        lastName: pd.lastName || "",
        phoneNumber: pd.phoneNumber || "",
        description: pd.description || "",
        experience: pd.experience || "",
        expertise: pd.expertise || [],
        languages: pd.languages || [],
        sessionPrice: pd.sessionPrice || 0,
        basePrice: pd.basePrice || 0,
        platformFee: pd.platformFee || 0,
        focusAreas: pd.focusAreas || [],
        imageUrl: pd.imageUrl || "",
        workingDays: pd.workingDays || [],
        workingHours: pd.workingHours || {},
        slotDuration: pd.slotDuration || 60,
      };
    });

    return res.status(200).json({ success: true, counsellors });
  } catch (error) {
    console.error("getAllCounsellorsAdmin error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch counsellors" });
  }
};

export const updateCounsellorAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Counsellor ID is required" });
    }

    const counsellorRef = adminDb.collection("counsellors").doc(id);
    const snap = await counsellorRef.get();

    if (!snap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Counsellor not found" });
    }

    // FormData sends booleans/arrays as strings — normalise them
    const parseField = (val) => {
      if (typeof val !== "string") return val;
      if (val === "true") return true;
      if (val === "false") return false;
      try { return JSON.parse(val); } catch { return val; }
    };

    const updates = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [k, parseField(v)])
    );

    const directFields = ["email", "isVerified", "profileCompleted", "role"];
    const profileFields = [
      "firstName", "lastName", "phoneNumber", "description",
      "experience", "expertise", "languages", "sessionPrice",
      "basePrice", "platformFee", "focusAreas", "imageUrl",
      "workingDays", "workingHours", "slotDuration",
    ];

    const updatePayload = { updatedAt: new Date() };

    for (const field of directFields) {
      if (typeof updates[field] !== "undefined") {
        updatePayload[field] = updates[field];
      }
    }

    const profileUpdates = {};
    for (const field of profileFields) {
      if (typeof updates[field] !== "undefined") {
        profileUpdates[field] = updates[field];
      }
    }

    if (req.file) {
      const bucket = storage.bucket();
      const fileName = `counsellor-images/admin-${id}-${Date.now()}`;
      const file = bucket.file(fileName);
      await file.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype },
        public: true,
      });
      profileUpdates.imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    if (Object.keys(profileUpdates).length > 0) {
      const existingPd = snap.data().profileData || {};
      updatePayload.profileData = { ...existingPd, ...profileUpdates };
    }

    await counsellorRef.update(updatePayload);
    const updated = await counsellorRef.get();

    return res.status(200).json({
      success: true,
      message: "Counsellor updated successfully",
      counsellor: updated.data(),
    });
  } catch (error) {
    console.error("updateCounsellorAdmin error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update counsellor" });
  }
};

export const deleteCounsellorAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const counsellorRef = adminDb.collection("counsellors").doc(id);
    const snap = await counsellorRef.get();

    if (!snap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Counsellor not found" });
    }

    await counsellorRef.delete();

    return res
      .status(200)
      .json({ success: true, message: "Counsellor deleted successfully" });
  } catch (error) {
    console.error("deleteCounsellorAdmin error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete counsellor" });
  }
};

export const getAllUsersAdmin = async (req, res) => {
  try {
    const snapshot = await adminDb.collection("users").get();

    const users = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || "",
        email: data.email || "",
        authProvider: data.authProvider || "email",
        role: data.role || "user",
        isUser: data.isUser ?? true,
        profileCompleted: data.profileCompleted ?? false,
        createdAt: data.createdAt || null,
        phone: data.phone || "",
        photoURL: data.photoURL || "",
      };
    });

    return res.status(200).json({ success: true, users });
  } catch (error) {
    console.error("getAllUsersAdmin error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch users" });
  }
};

export const getAllAppointmentsAdmin = async (req, res) => {
  try {
    const counsellorsSnap = await adminDb.collection("counsellors").get();
    const allAppointments = [];

    for (const counsellorDoc of counsellorsSnap.docs) {
      const cd = counsellorDoc.data();
      const pd = cd.profileData || {};
      const counsellorName =
        pd.firstName || pd.lastName
          ? `${pd.firstName || ""} ${pd.lastName || ""}`.trim()
          : cd.email || "";

      const appointmentsSnap = await adminDb
        .collection("counsellors")
        .doc(counsellorDoc.id)
        .collection("appointments")
        .get();

      for (const apptDoc of appointmentsSnap.docs) {
        const data = apptDoc.data();
        allAppointments.push({
          id: apptDoc.id,
          counsellorId: counsellorDoc.id,
          counsellorName,
          counsellorEmail: cd.email || "",
          studentEmail: data.studentEmail || "",
          studentName: data.studentName || "",
          date: data.date || null,
          timeSlot: data.timeSlot || null,
          status: data.status || "",
          amount: data.amount || 0,
          createdAt: data.createdAt || null,
        });
      }
    }

    allAppointments.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });

    return res.status(200).json({ success: true, appointments: allAppointments });
  } catch (error) {
    console.error("getAllAppointmentsAdmin error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch appointments" });
  }
};

export const getStatsAdmin = async (req, res) => {
  try {
    const [counsellorsSnap, usersSnap] = await Promise.all([
      adminDb.collection("counsellors").get(),
      adminDb.collection("users").get(),
    ]);

    let totalAppointments = 0;
    let completedAppointments = 0;
    let totalRevenue = 0;

    for (const counsellorDoc of counsellorsSnap.docs) {
      const appointmentsSnap = await adminDb
        .collection("counsellors")
        .doc(counsellorDoc.id)
        .collection("appointments")
        .get();

      totalAppointments += appointmentsSnap.size;

      for (const apptDoc of appointmentsSnap.docs) {
        const data = apptDoc.data();
        if (data.status === "completed" || data.status === "confirmed") {
          completedAppointments++;
        }
        if (data.amount) {
          totalRevenue += Number(data.amount) || 0;
        }
      }
    }

    return res.status(200).json({
      success: true,
      stats: {
        totalCounsellors: counsellorsSnap.size,
        activeCounsellors: counsellorsSnap.docs.filter(
          (d) => d.data().profileCompleted
        ).length,
        totalUsers: usersSnap.size,
        totalAppointments,
        completedAppointments,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error("getStatsAdmin error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch stats" });
  }
};
