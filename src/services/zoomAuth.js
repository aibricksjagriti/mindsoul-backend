import axios from "axios";

let cachedToken = null;
let tokenExpiry = 0;

// Helper: get Zoom access token (Server-to-Server OAuth)
export async function getZoomAccessToken() {
  const now = Date.now();

  // If token exists and not expired → return cached token
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const accountId = process.env.ZOOM_ACCOUNT_ID;

  if (!clientId || !clientSecret || !accountId) {
    throw new Error("Missing Zoom credentials in environment variables");
  }

  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;

  const response = await axios.post(tokenUrl, null, {
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
  });

  const { access_token, expires_in } = response.data;

  // Cache the token (Zoom default expiry: 3600 sec)
  cachedToken = access_token;
  tokenExpiry = now + expires_in * 1000 - 5000; // refresh 5s early

  return access_token;
}
