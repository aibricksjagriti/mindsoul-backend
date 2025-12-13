
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
    if (result[slot.period]) {
      result[slot.period].push(slot);
    }
  }

  return result;
};


/**
 * Convert a Firestore date + time fields to a JS Date object
 */
export const toDateTime = (date, time) => {
  return new Date(`${date}T${time}:00`);
};
