import { createHash, randomUUID } from "node:crypto";
import { isDateString, toDateTime } from "../timeslots/slotUtils.timeslots.js";

const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });
export const complimentaryBookingId = (uid, requestId) => "complimentary_" + createHash("sha256").update(`${uid}:${requestId}`).digest("hex").slice(0, 32);

export const createComplimentaryBookingService = ({ db, fieldValue, createMeeting, deleteMeeting = async () => {}, now = () => Date.now() }) => {
  const eligibility = async (user) => {
    if (user?.role !== "user" || !user.uid) throw failure("User sign-in required", 403);
    const access = await db.collection("complimentaryAccess").doc(user.uid).get();
    return { eligible: access.exists && access.data().active === true && access.data().allowance === "unlimited" };
  };

  const book = async (user, input) => {
    if (user?.role !== "user" || !user.uid) throw failure("User sign-in required", 403);
    const { counsellorId, date, timeSlot, requestId } = input || {};
    if (typeof counsellorId !== "string" || !counsellorId || counsellorId.includes("/") ||
        !isDateString(date) || typeof timeSlot !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(timeSlot) ||
        typeof requestId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) {
      throw failure("Valid counsellor, date, time slot and request ID are required", 400);
    }
    const [startTime, endTime] = timeSlot.split("-");
    if (endTime <= startTime || toDateTime(date, startTime).getTime() <= now()) throw failure("Choose an upcoming time slot", 400);
    const id = complimentaryBookingId(user.uid, requestId);
    const appointmentRef = db.collection("appointments").doc(id);
    const userRef = db.collection("users").doc(user.uid);
    const counsellorRef = db.collection("counsellors").doc(counsellorId);
    const accessRef = db.collection("complimentaryAccess").doc(user.uid);
    const attemptId = randomUUID();
    let slotRef;
    const reservation = await db.runTransaction(async (transaction) => {
      const access = await transaction.get(accessRef);
      const existing = await transaction.get(appointmentRef);
      const account = await transaction.get(userRef);
      const counsellor = await transaction.get(counsellorRef);
      if (!access.exists || access.data().active !== true || access.data().allowance !== "unlimited") throw failure("Complimentary access is not enabled for this account", 403);
      if (!account.exists) throw failure("User account not found", 404);
      if (existing.exists) {
        const record = existing.data();
        if (record.studentId !== user.uid || record.counsellorId !== counsellorId || record.date !== date || record.timeSlot !== timeSlot) throw failure("Request ID belongs to another booking", 409);
        if (record.status === "scheduled") return { existing: record };
        if (record.status === "preparing" && now() - record.reservationStartedAt < 180000) throw failure("This booking is still being prepared. Check its status before trying again", 409);
      }
      if (!counsellor.exists || counsellor.data().isVerified !== true || counsellor.data().profileCompleted !== true) throw failure("Counsellor is unavailable", 404);
      const slots = await transaction.get(db.collection("timeSlots").where("counsellorId", "==", counsellorId).where("date", "==", date).where("startTime", "==", startTime));
      const slot = slots.docs.find((doc) => doc.data().endTime === endTime);
      if (!slot) throw failure("This time slot is unavailable", 409);
      if (slot.data().isBooked && !(existing.exists && existing.data().status === "preparing" &&
          now() - existing.data().reservationStartedAt >= 180000 && slot.data().bookedAppointmentId === id)) throw failure("This time slot is already booked", 409);
      slotRef = slot.ref;
      const profile = counsellor.data().profileData || {};
      const payload = {
        appointmentId: id, id, counsellorId, studentId: user.uid,
        studentName: account.data().name || user.name || "User", studentEmail: account.data().email || user.email || null,
        counsellorProfileSnapshot: { firstName: profile.firstName || "", lastName: profile.lastName || "", expertise: profile.expertise || [] },
        date, timeSlot, bookingType: "complimentary", amount: 0, status: "preparing",
        requestId, createdAt: fieldValue.serverTimestamp(), updatedAt: fieldValue.serverTimestamp(),
        bookingAttemptId: attemptId, reservationStartedAt: now(),
      };
      transaction.set(appointmentRef, payload);
      transaction.set(userRef.collection("appointments").doc(id), payload);
      transaction.set(counsellorRef.collection("appointments").doc(id), payload);
      transaction.update(slotRef, { isBooked: true, bookedBy: user.uid, bookedAppointmentId: id, bookedAttemptId: attemptId, bookedAt: fieldValue.serverTimestamp() });
      return { payload };
    });
    if (reservation.existing) return reservation.existing;
    const release = () => db.runTransaction(async (transaction) => {
      const slot = await transaction.get(slotRef);
      const record = await transaction.get(appointmentRef);
      if (record.data()?.bookingAttemptId !== attemptId || record.data()?.status === "scheduled") return;
      if (slot.exists && slot.data().bookedAttemptId === attemptId) transaction.update(slotRef, {
        isBooked: false, bookedBy: fieldValue.delete(), bookedAppointmentId: fieldValue.delete(), bookedAttemptId: fieldValue.delete(), bookedAt: fieldValue.delete(),
      });
      const update = { status: "booking_failed", updatedAt: fieldValue.serverTimestamp() };
      transaction.update(appointmentRef, update);
      transaction.update(userRef.collection("appointments").doc(id), update);
      transaction.update(counsellorRef.collection("appointments").doc(id), update);
    });
    let meeting;
    try {
      meeting = await createMeeting({ date, startTime, endTime });
    } catch {
      await release();
      throw failure("We couldn't create the online session. Your slot has been released; please try again", 502);
    }
    const update = { status: "scheduled", zoomLink: meeting.joinUrl, zoomMeetingId: meeting.id, updatedAt: fieldValue.serverTimestamp() };
    try {
      await db.runTransaction(async (transaction) => {
        const slot = await transaction.get(slotRef);
        const record = await transaction.get(appointmentRef);
        if (record.data()?.bookingAttemptId !== attemptId || record.data()?.status !== "preparing" ||
            slot.data()?.bookedAttemptId !== attemptId) throw failure("This reservation changed while the meeting was being prepared", 409);
        transaction.update(appointmentRef, update);
        transaction.update(userRef.collection("appointments").doc(id), update);
        transaction.update(counsellorRef.collection("appointments").doc(id), update);
        transaction.set(db.collection("complimentaryMeetingHosts").doc(id), { counsellorId, meetingId: meeting.id });
      });
    } catch (error) {
      const current = await appointmentRef.get();
      if (current.data()?.status === "scheduled") {
        if (current.data().zoomMeetingId !== meeting.id) await deleteMeeting(meeting.id).catch(() => {});
        return current.data();
      }
      await deleteMeeting(meeting.id).catch(() => {});
      await release();
      throw error;
    }
    return { ...reservation.payload, ...update };
  };
  return { eligibility, book };
};
