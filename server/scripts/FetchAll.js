import { getGmailClient } from "./gmail.js";
import { extractPlainText, parseEmailBody } from "./mailParser.js";

async function fetchAllEmails(sender) {
  const gmail = getGmailClient();

  const res = await gmail.users.messages.list({
    userId: "me",
    q: `from:${sender}`,
  });

  const messages = res.data.messages || [];
  const results = [];

  for (const m of messages) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "full",
    });

    const body = extractPlainText(msg.data);
    const parsed = parseEmailBody(body);

    results.push(parsed);
  }

  console.log("📦 All parsed emails:", JSON.stringify(results, null, 2));
}

const sender = "rrnagar@chessklub.net"; // 👈 change this
fetchAllEmails(sender).catch(console.error);
