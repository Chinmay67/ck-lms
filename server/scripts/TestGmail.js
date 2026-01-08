import { google } from "googleapis";
import { config } from "../config";

const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = {
  GMAIL_CLIENT_ID: config.clientId,
  GMAIL_CLIENT_SECRET: config.clientSecret,
  GMAIL_REFRESH_TOKEN: config.refreshToken,
};

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
  throw new Error("⚠️ Missing credentials in .env");
}

const oauth2Client = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  "http://localhost:3000/oauth2callback"
);

oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

async function main() {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults: 5,
  });

  const messages = res.data.messages || [];
  if (messages.length === 0) {
    console.log("📭 No unread messages.");
    return;
  }

  for (const m of messages) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "metadata",
      metadataHeaders: ["From", "Subject"],
    });

    const headers = msg.data.payload?.headers || [];
    const from = headers.find((h) => h.name === "From")?.value;
    const subject = headers.find((h) => h.name === "Subject")?.value;

    console.log(`📩 From: ${from} | Subject: ${subject}`);
  }
}

main().catch(console.error);
