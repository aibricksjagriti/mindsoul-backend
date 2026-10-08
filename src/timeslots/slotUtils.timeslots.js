
/**
 * Check if a timestamp (e.g. "2025-11-20T09:00:00") is in the future.
 */
export const isFutureDateTime = (isoDateTime) => {
  const now = new Date();
  const target = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(isoDateTime)
    ? isoDateTime : `${isoDateTime}+05:30`);
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
  return new Date(`${date}T${time}:00+05:30`);
};

export const indiaDateString = (date = new Date()) =>
  new Date(date.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);

export const isDateString = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
