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
const start_time = new Date(`${date}T${cleanTime}:00+05:30`).toISOString();
  const endTime = time.split("-")[1]?.trim();
  const duration = endTime ? (new Date(`${date}T${endTime}:00+05:30`) - new Date(start_time)) / 60000 : 45;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid session duration");

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
    duration,
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: false,
      mute_upon_entry: true,
      waiting_room: true,
    },
  };

  const res = await axios.post(url, payload, {
    timeout: 20000,
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

export async function deleteZoomMeeting(meetingId) {
  const token = await getZoomAccessToken();
  await axios.delete(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, { timeout: 15000, headers: { Authorization: `Bearer ${token}` } });
}

