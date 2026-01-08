import { google } from "googleapis";
import { config } from "../config";

const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = {
  GMAIL_CLIENT_ID: config.clientId,
  GMAIL_CLIENT_SECRET: config.clientSecret,
  GMAIL_REFRESH_TOKEN: config.refreshToken,
};

export function getGmailClient() {
    

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error("⚠️ Missing Gmail credentials in .env");
  }

  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    "http://localhost:3000/oauth2callback" // not actually used after token
  );

  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

  return google.gmail({ version: "v1", auth: oauth2Client });
}
