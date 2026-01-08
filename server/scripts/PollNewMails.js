import { getGmailClient } from "./gmail.js";
import { extractPlainText, parseEmailBody } from "./mailParser.js";

async function pollEmails(sender, intervalMs = 60000) {
  const gmail = getGmailClient();
  let seenIds = new Set();

  console.log(`👀 Polling for new emails from ${sender} every ${intervalMs / 1000}s...`);

  setInterval(async () => {
    try {
      const res = await gmail.users.messages.list({
        userId: "me",
        q: `from:${sender} is:unread`,
        maxResults: 5,
      });

      const messages = res.data.messages || [];

      for (const m of messages) {
        if (seenIds.has(m.id)) continue;
        seenIds.add(m.id);

        const msg = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "full",
        });

        const body = extractPlainText(msg.data);
        const parsed = parseEmailBody(body);

        console.log("📩 New parsed email:", parsed);

        // ✅ mark as read so we don't fetch it again
        await gmail.users.messages.modify({
          userId: "me",
          id: m.id,
          requestBody: { removeLabelIds: ["UNREAD"] },
        });

        // TODO: Save `parsed` to DB here
      }
    } catch (err) {
      console.error("❌ Polling error:", err.message);
    }
  }, intervalMs);
}

const sender = "rrnagar@chessklub.net.com"; // 👈 change this
pollEmails(sender, 30000); // poll every 30s
