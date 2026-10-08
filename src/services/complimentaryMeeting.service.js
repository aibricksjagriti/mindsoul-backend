import axios from "axios";
import { getZoomAccessToken } from "./zoomAuth.js";

export const createComplimentaryMeeting = async ({ date, startTime, endTime }) => {
  if (!process.env.ZOOM_HOST_EMAIL) throw new Error("Zoom host is not configured");
  const token = await getZoomAccessToken();
  const start = new Date(`${date}T${startTime}:00+05:30`);
  const end = new Date(`${date}T${endTime}:00+05:30`);
  const response = await axios.post(`https://api.zoom.us/v2/users/${encodeURIComponent(process.env.ZOOM_HOST_EMAIL)}/meetings`, {
    topic: "Counselling Session", type: 2, start_time: start.toISOString(),
    timezone: "Asia/Kolkata", duration: (end - start) / 60000,
    settings: { host_video: true, participant_video: true, waiting_room: true, join_before_host: false, mute_upon_entry: true },
  }, { timeout: 20000, headers: { Authorization: `Bearer ${token}` } });
  return { id: String(response.data.id), joinUrl: response.data.join_url, startUrl: response.data.start_url };
};

export const getComplimentaryHostLink = async (meetingId) => {
  const token = await getZoomAccessToken();
  const response = await axios.get(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    timeout: 15000, headers: { Authorization: `Bearer ${token}` },
  });
  return response.data.start_url;
};

export const deleteComplimentaryMeeting = async (meetingId) => {
  const token = await getZoomAccessToken();
  await axios.delete(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    timeout: 15000, headers: { Authorization: `Bearer ${token}` },
  });
};
