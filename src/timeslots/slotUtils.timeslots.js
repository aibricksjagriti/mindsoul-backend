
/**
 * Check if a timestamp (e.g. "2025-11-20T09:00:00") is in the future.
 */
export const isFutureDateTime = (isoDateTime) => {
  const now = new Date();
  const target = new Date(isoDateTime);
  return target.getTime() > now.getTime();
};

/**
 * Group time slots by time of the day (Morning, Afternoon, Evening)
 * Assumes input is: [{ startTime, endTime, ... }]
 */
export const groupSlotsByPeriod = (slots = []) => {
  const result = {
    morning: [],
    afternoon: [],
    evening: [],
  };

  for (const slot of slots) {
    const hour = Number(slot.startTime.split(":")[0]);

    if (hour >= 6 && hour < 12) result.morning.push(slot);
    else if (hour >= 12 && hour < 17) result.afternoon.push(slot);
    else result.evening.push(slot);
  }

  return result;
};

/**
 * Convert a Firestore date + time fields to a JS Date object
 */
export const toDateTime = (date, time) => {
  return new Date(`${date}T${time}:00`);
};
