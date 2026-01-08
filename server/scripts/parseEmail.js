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

/**
 * Helper: decode Gmail body from base64
 */
function decodeBody(message) {
  const data = message.data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(data, "base64").toString("utf8");
}

/**
 * Helper: parse email text into structured JSON
 */
function parseEmailBody(body) {
  const result = {
    studentName: "",
    dob: "",
    parentName: "",
    email: "",
    phone: "",
    alternatePhone: "",
    alternateEmail: "",
    address: "",
    skillLevel: "",
    referredBy: "",
  };

  // Split body into lines and trim whitespace
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);

  // Map of label → key in result object
  const fieldMap = {
    "Student Name": "studentName",
    "Student Date Of Birth": "dob",
    "Parent Name": "parentName",
    "Email": "email",
    "Phone": "phone",
    "Alternate Phone": "alternatePhone",
    "Alternate Email": "alternateEmail",
    "Addess": "address", // keeping typo since email uses it
    "Skill Level": "skillLevel",
    "Referred By / Promo Code": "referredBy",
  };

  for (const line of lines) {
    for (const [label, key] of Object.entries(fieldMap)) {
      if (line.startsWith(label + ":")) {
        const value = line.replace(label + ":", "").trim();
        result[key] = value;
      }
    }
  }

  return result;
}


async function main() {
  // search emails from sender
  const sender = "rrnagar@chessklub.net"; // 👈 change to real sender
  const res = await gmail.users.messages.list({
    userId: "me",
    q: `from:${sender}`,
    maxResults: 10,
  });

  const messages = res.data.messages || [];
  if (messages.length === 0) {
    console.log("📭 No messages found.");
    return;
  }

  const parsedResults = [];

  for (const msg of messages) {
    const fullMsg = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    // email body (might be nested in parts)
    let body = "";
    const payload = fullMsg.data.payload;

    if (payload.parts) {
      const part = payload.parts.find(
        (p) => p.mimeType === "text/plain"
      );
      if (part && part.body?.data) {
        body = decodeBody(part.body);
      }
    } else if (payload.body?.data) {
      body = decodeBody(payload.body);
    }

    // parse
    const parsed = parseEmailBody(body);
    parsedResults.push(parsed);

    console.log("✅ Parsed:", parsed);
  }

  // here you can insert into DB
  // e.g. await db.insert(parsedResults)

  console.log("\n📦 Final JSON:", JSON.stringify(parsedResults, null, 2));
}

main().catch(console.error);
