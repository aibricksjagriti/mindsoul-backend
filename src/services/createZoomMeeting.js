import axios from "axios";
import { getZoomAccessToken } from "./zoomAuth.js";

/**
 * Create a Zoom meeting for a counsellor.
 *
 * @param {string} counsellorZoomEmail - Zoom email of the counsellor
 * @param {string} date - YYYY-MM-DD
 * @param {string} time - HH:MM (24h)
 * @param {string} topic - Meeting topic/title
 */



export async function createZoomMeeting(counsellorZoomEmail, date, time, topic = "Counselling Session") {
  if (!counsellorZoomEmail) {
    throw new Error("Missing counsellorZoomEmail");
  }
  

  // Combine date + time into Zoom format (ISO)
  const cleanTime = time.trim().substring(0,5); // HH:MM
const start_time = new Date(`${date}T${cleanTime}:00`).toISOString();

  // Get Zoom access token
  const token = await getZoomAccessToken();

  const url = `https://api.zoom.us/v2/users/${encodeURIComponent(
    counsellorZoomEmail
  )}/meetings`;

  const payload = {
    topic,
    type: 2, // scheduled meeting
    start_time,
    timezone: "Asia/Kolkata",
    duration: 45, // minutes (adjust if needed)
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: false,
      mute_upon_entry: true,
      waiting_room: true,
    },
  };

  const res = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  return {
    meetingId: res.data.id,
    joinUrl: res.data.join_url,
    startUrl: res.data.start_url,
  };
}

