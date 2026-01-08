/**
 * Script to sync all emails from Gmail to MongoDB
 * This will fetch all unread emails and insert them into the database
 */

import { google } from "googleapis";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import Student from '../src/models/Student.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, "../.env") });

// Gmail Configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
const gmail = google.gmail({ version: "v1", auth: oauth2Client });

// Helper: Decode Gmail base64 body
function decodeBody(data) {
  if (!data) return "";
  const buff = Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );
  return buff.toString("utf-8");
}

// Helper: Extract plain text from email
function extractPlainText(message) {
  const payload = message.payload;
  let body = "";

  if (payload.parts) {
    const part = payload.parts.find((p) => p.mimeType === "text/plain");
    if (part && part.body?.data) {
      body = decodeBody(part.body.data);
    }
  } else if (payload.body?.data) {
    body = decodeBody(payload.body.data);
  }

  return body;
}

// Helper: Parse email body into student data
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

  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const fieldMap = {
    "Student Name": "studentName",
    "Student Date Of Birth": "dob",
    "Parent Name": "parentName",
    "Email": "email",
    "Phone": "phone",
    "Alternate Phone": "alternatePhone",
    "Alternate Email": "alternateEmail",
    "Addess": "address", // typo in email template
    "Skill Level": "skillLevel",
    "Referred By / Promo Code": "referredBy",
  };

  for (const line of lines) {
    for (const [label, key] of Object.entries(fieldMap)) {
      if (line.startsWith(label + ":")) {
        let value = line.replace(label + ":", "").trim();
        if (key === "referredBy" && value.toLowerCase().startsWith("all the best")) {
          value = ""; // prevent false capture
        }
        result[key] = value;
      }
    }
  }

  return result;
}

// Helper: Parse skill string
function parseSkillString(skillString) {
  if (!skillString) {
    return { category: null, level: null };
  }

  const cleaned = skillString.trim().toLowerCase();
  const skillRegex = /^(beginner|intermediate|advanced)\s*level\s*-?\s*([1-3])$/;
  const match = cleaned.match(skillRegex);

  if (match && match[1] && match[2]) {
    return {
      category: match[1],
      level: parseInt(match[2])
    };
  }

  return { category: null, level: null };
}

// Main sync function
async function syncEmailsToDatabase() {
  let connection;

  try {
    // Connect to MongoDB
    console.log("🔌 Connecting to MongoDB...");
    connection = await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Fetch emails from Gmail
    const sender = process.env.SENDER_EMAIL || "rrnagar@chessklub.net";
    console.log(`\n📧 Fetching emails from: ${sender}`);

    const response = await gmail.users.messages.list({
      userId: "me",
      q: `from:${sender}`,
      maxResults: 100 // Adjust as needed
    });

    const messages = response.data.messages || [];
    console.log(`📬 Found ${messages.length} emails`);

    if (messages.length === 0) {
      console.log("ℹ️  No emails found. Exiting.");
      return;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process each email
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      try {
        console.log(`\n[${i + 1}/${messages.length}] Processing email ${message.id}...`);

        const fullMessage = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "full"
        });

        const body = extractPlainText(fullMessage.data);
        const parsed = parseEmailBody(body);

        // Skip if missing required fields
        if (!parsed.email || !parsed.studentName) {
          console.log(`⚠️  Skipped: Missing required fields`);
          skipped++;
          continue;
        }

        // Parse skill information
        const parsedSkill = parseSkillString(parsed.skillLevel);

        // Prepare student data
        const studentData = {
          studentName: parsed.studentName,
          dob: parsed.dob || undefined,
          parentName: parsed.parentName || undefined,
          email: parsed.email.toLowerCase(),
          phone: parsed.phone || undefined,
          alternatePhone: parsed.alternatePhone || undefined,
          alternateEmail: parsed.alternateEmail || undefined,
          address: parsed.address || undefined,
          combinedSkill: parsed.skillLevel || undefined,
          skillCategory: parsedSkill.category || undefined,
          skillLevel: parsedSkill.level || undefined,
          referredBy: parsed.referredBy || undefined,
          emailId: message.id
        };

        // Upsert student (create or update)
        const existingStudent = await Student.findOne({ email: studentData.email });

        if (existingStudent) {
          await Student.findByIdAndUpdate(existingStudent._id, studentData);
          console.log(`🔄 Updated: ${studentData.studentName} (${studentData.email})`);
          updated++;
        } else {
          await Student.create(studentData);
          console.log(`✅ Created: ${studentData.studentName} (${studentData.email})`);
          created++;
        }

      } catch (error) {
        console.error(`❌ Error processing email ${message.id}:`, error.message);
        errors++;
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 SYNC SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total emails processed: ${messages.length}`);
    console.log(`✅ Created: ${created}`);
    console.log(`🔄 Updated: ${updated}`);
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log("=".repeat(60));

    // Get total student count
    const totalStudents = await Student.countDocuments();
    console.log(`\n📚 Total students in database: ${totalStudents}\n`);

  } catch (error) {
    console.error("❌ Fatal error:", error);
    throw error;
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log("🔌 Disconnected from MongoDB");
    }
  }
}

// Run the script
syncEmailsToDatabase()
  .then(() => {
    console.log("✅ Sync completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Sync failed:", error);
    process.exit(1);
  });
