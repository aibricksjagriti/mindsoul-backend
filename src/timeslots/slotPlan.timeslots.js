const timeToMinutes = (value) => {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Working hours must use HH:MM times");
  }
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const minutesToTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const buildSlotPlan = ({ counsellorId, date, workingHours, slotDuration }) => {
  if (typeof counsellorId !== "string" || !counsellorId ||
      typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00+05:30`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date ||
      !workingHours || typeof workingHours !== "object" ||
      !Number.isInteger(slotDuration) || slotDuration <= 0 || slotDuration > 1440) {
    throw new Error("Invalid slot generation configuration");
  }
  const slots = [];
  for (const period of ["morning", "afternoon", "evening"]) {
    const hours = workingHours[period];
    if (!hours?.start || !hours?.end) continue;
    const start = timeToMinutes(hours.start);
    const end = timeToMinutes(hours.end);
    if (end <= start) throw new Error("Working hours must end after they start");
    for (let t = start; t + slotDuration <= end; t += slotDuration + 15) {
      const startTime = minutesToTime(t);
      const slot = {
        id: `${counsellorId}_${date}_${period}_${startTime}`,
        counsellorId, date, period, startTime,
        endTime: minutesToTime(t + slotDuration),
      };
      if (slots.some((other) => slotsOverlap(slot, other))) {
        throw new Error("Working periods must not overlap");
      }
      slots.push(slot);
    }
  }
  return slots;
};

export const slotsOverlap = (a, b) =>
  a.startTime < b.endTime && b.startTime < a.endTime;

export const buildCounsellorSlotPlan = ({ counsellorId, date, counsellor }) => {
  const day = new Date(`${date}T00:00:00+05:30`).toLocaleDateString("en-US", {
    weekday: "long", timeZone: "Asia/Kolkata",
  });
  const weekly = counsellor.weeklySchedule?.[day] || {};
  const exception = counsellor.scheduleExceptions?.[date];
  const profile = counsellor.profileData || {};
  const workingHours = {};
  for (const period of ["morning", "afternoon", "evening"]) {
    const enabled = exception?.off === true ? false : exception?.[period] ?? weekly[period];
    if (enabled && profile.workingHours?.[period]) workingHours[period] = profile.workingHours[period];
  }
  return buildSlotPlan({ counsellorId, date, workingHours, slotDuration: profile.slotDuration ?? 30 });
};
