/**
 * Decode Gmail API base64 body
 */
export function decodeBody(data) {
  if (!data) return "";
  const buff = Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );
  return buff.toString("utf-8");
}

/**
 * Extract plain text body from Gmail message
 */
export function extractPlainText(message) {
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

/**
 * Parse registration email into structured JSON
 */
export function parseEmailBody(body) {
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
    "Addess": "address", // typo kept because template has it
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
