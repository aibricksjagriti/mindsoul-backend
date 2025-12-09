export const generateSlotsForDate = async ({
  counsellorId,
  date,
  workingHours,
  slotDuration,
}) => {
  try {
    if (!counsellorId || !date || !workingHours || !slotDuration) {
      throw new Error("Missing required fields for slot generation");
    }

    let createdCount = 0;
    const operations = []; // we collect all write operations here

    const periods = Object.keys(workingHours); // morning, afternoon, evening

    for (const period of periods) {
      const periodData = workingHours[period];
      if (!periodData?.start || !periodData?.end) continue;

      const start = periodData.start;
      const end = periodData.end;

      let [sh, sm] = start.split(":").map(Number);
      let [eh, em] = end.split(":").map(Number);

      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;

      for (let t = startMinutes; t < endMinutes; t += slotDuration) {
        const slotStartH = Math.floor(t / 60);
        const slotStartM = t % 60;
        const slotEndMinutes = t + slotDuration;

        if (slotEndMinutes > endMinutes) break;

        const slotEndH = Math.floor(slotEndMinutes / 60);
        const slotEndM = slotEndMinutes % 60;

        const startTime = `${String(slotStartH).padStart(2, "0")}:${String(
          slotStartM
        ).padStart(2, "0")}`;

        const endTime = `${String(slotEndH).padStart(2, "0")}:${String(
          slotEndM
        ).padStart(2, "0")}`;

        const fullTimestamp = `${date}T${startTime}:00`;

        if (!isFutureDateTime(fullTimestamp)) continue;

        const docId = `${counsellorId}_${date}_${startTime}`;

        // Instead of doing batch.set() here,
        // we SAVE this operation in an array:
        operations.push({
          docId,
          data: {
            counsellorId,
            date,
            period,
            startTime,
            endTime,
            isBooked: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        });

        createdCount++;
      }
    }

    // Now safely commit in chunks of 400
    const chunkSize = 400;
    for (let i = 0; i < operations.length; i += chunkSize) {
      const batch = db.batch();
      const chunk = operations.slice(i, i + chunkSize);

      chunk.forEach((op) => {
        const ref = db.collection("timeSlots").doc(op.docId);
        batch.set(ref, op.data);
      });

      await batch.commit();
    }

    return {
      success: true,
      created: createdCount,
      message: "Slots generated successfully",
    };
  } catch (err) {
    console.error("Slot Generation Error:", err);
    return { success: false, message: err.message };
  }
};
