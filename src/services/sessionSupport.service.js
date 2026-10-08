import { createHash } from "node:crypto";
import { isDateString, toDateTime } from "../timeslots/slotUtils.timeslots.js";

const failure = (message,statusCode) => Object.assign(new Error(message),{statusCode});
export const createSessionSupport = ({db,now = () => Date.now()}) => ({
  async request(user,appointmentId,input) {
    const {type,reason="",preferredDate,preferredTime} = input || {};
    if(!["cancel","reschedule"].includes(type) || typeof reason !== "string" || reason.length > 1000) throw failure("Choose cancellation or rescheduling and a short reason",400);
    if(type === "reschedule" && (!isDateString(preferredDate) || typeof preferredTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(preferredTime) || toDateTime(preferredDate,preferredTime).getTime() <= now())) throw failure("Choose a valid upcoming preferred date and time",400);
    const ref = db.collection("appointments").doc(appointmentId);
    const id = createHash("sha256").update(`${user.uid || user.counsellorId}:${appointmentId}:${type}`).digest("hex");
    const requestRef = db.collection("sessionChangeRequests").doc(id);
    return db.runTransaction(async tx => {
      const appointment = await tx.get(ref);
      const previous = await tx.get(requestRef);
      if(!appointment.exists) throw failure("Appointment not found",404);
      const record = appointment.data();
      if(!(user.role === "user" && record.studentId === user.uid) && !(user.role === "counsellor" && record.counsellorId === user.counsellorId)) throw failure("You cannot manage this appointment",403);
      if(record.status !== "scheduled" || toDateTime(record.date,record.timeSlot.split("-")[0]).getTime() <= now()) throw failure("Only upcoming scheduled appointments can be changed",409);
      if(previous.exists && previous.data().status === "pending") return {success:true,requestId:id,status:"pending",message:"Your request is already awaiting review. Your session remains scheduled until confirmed."};
      tx.set(requestRef,{appointmentId,requestorId:user.uid || user.counsellorId,requestorRole:user.role,type,reason:reason.trim(),preferredDate:type === "reschedule" ? preferredDate : null,preferredTime:type === "reschedule" ? preferredTime : null,status:"pending",createdAt:new Date(now()),notificationStatus:"pending"});
      return {success:true,requestId:id,status:"pending",message:"Your request has been saved for review. Your session remains scheduled until confirmed. Refunds are not processed automatically."};
    });
  },
});
