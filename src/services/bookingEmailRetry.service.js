export const createBookingEmailRetry = ({ db, notifyFree, notifyPaid, now = () => Date.now() }) => async () => {
  const outcomes = [];
  for (const [collection, notify] of [["complimentaryNotifications", notifyFree], ["bookingNotifications", notifyPaid]]) {
    const snapshot = await db.collection(collection).where("status", "in", ["pending", "failed", "sending"]).limit(100).get();
    const ids = [...new Set(snapshot.docs.map(doc => doc.data()).filter(record =>
      record.appointmentId && (record.status !== "sending" || record.leaseUntil <= now()) && (!record.nextAttemptAt || record.nextAttemptAt <= now())
    ).map(record => record.appointmentId))].slice(0, 2);
    // Small batches keep the handler within the Cloud Run request deadline.
    await Promise.all(ids.map(async id => {
      try { const result = await notify(id); outcomes.push({ appointmentId: id, complete: Object.values(result).every(status => status === "sent") }); }
      catch { outcomes.push({ appointmentId: id, complete: false }); }
    }));
  }
  return { processed: outcomes.length, completed: outcomes.filter(result => result.complete).length };
};
