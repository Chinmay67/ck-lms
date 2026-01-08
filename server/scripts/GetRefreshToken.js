import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

// Only readonly scope - we don't need to modify emails
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3001/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("⚠️ Please set CLIENT_ID and CLIENT_SECRET in .env");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const app = express();

// Step 1: redirect to Google
app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline", // ensures refresh token
    scope: SCOPES,
    prompt: "consent",      // forces new refresh token
  });

  console.log("\n🔐 Redirecting to Google OAuth...");
  res.redirect(url);
});

// Step 2: handle redirect back
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    res.send("❌ No authorization code received. Please try again.");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    console.log("\n" + "=".repeat(60));
    console.log("✅ REFRESH TOKEN GENERATED!");
    console.log("=".repeat(60));
    console.log(`\n🔑 Refresh Token: ${tokens.refresh_token}\n`);
    console.log("=".repeat(60));

    if (tokens.access_token) {
      console.log("\n✅ Access token also received (expires in ~1 hour)");
    }

    // Automatically update .env file
    try {
      let envContent = fs.readFileSync(envPath, 'utf-8');

      // Replace existing REFRESH_TOKEN or add new one
      if (envContent.includes('REFRESH_TOKEN=')) {
        // Replace existing token
        envContent = envContent.replace(
          /REFRESH_TOKEN=.*/,
          `REFRESH_TOKEN=${tokens.refresh_token}`
        );
      } else {
        // Add new token
        envContent += `\nREFRESH_TOKEN=${tokens.refresh_token}\n`;
      }

      fs.writeFileSync(envPath, envContent, 'utf-8');
      console.log("\n✅ .env file updated automatically!");
      console.log(`📁 Updated: ${envPath}`);
    } catch (error) {
      console.error("\n⚠️ Could not automatically update .env file:", error.message);
      console.log("\n📋 Please manually copy this token to your .env file:\n");
      console.log(`REFRESH_TOKEN=${tokens.refresh_token}`);
    }

    res.send(`
      <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              background: #f5f5f5;
            }
            .success {
              background: white;
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { color: #10b981; }
            code {
              background: #f1f5f9;
              padding: 2px 6px;
              border-radius: 3px;
              font-family: monospace;
              display: block;
              margin: 10px 0;
              padding: 15px;
              overflow-wrap: break-word;
            }
            .warning {
              background: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="success">
            <h1>✅ Authentication Successful!</h1>
            <p>Your refresh token has been generated. Check your terminal for the token.</p>

            <div class="warning">
              <strong>⚠️ Next Steps:</strong>
              <ol>
                <li>Copy the REFRESH_TOKEN from your terminal</li>
                <li>Update it in your <code>.env</code> file</li>
                <li>Run the sync script to fetch emails</li>
              </ol>
            </div>

            <p>You can close this window now.</p>
          </div>
        </body>
      </html>
    `);

    // Keep server running for a moment to show the response
    setTimeout(() => {
      console.log("\n✅ Token generation complete. You can now close the browser.");
      console.log("👉 Press Ctrl+C to exit this script.\n");
    }, 2000);

  } catch (error) {
    console.error("\n❌ Error getting tokens:", error.message);
    res.send(`
      <html>
        <body style="font-family: sans-serif; padding: 50px;">
          <h1 style="color: red;">❌ Error</h1>
          <p>Failed to get tokens: ${error.message}</p>
          <p>Please try again by visiting <a href="/auth">/auth</a></p>
        </body>
      </html>
    `);
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Gmail OAuth Token Generator</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #667eea; }
          .button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 30px;
            border-radius: 8px;
            text-decoration: none;
            display: inline-block;
            font-weight: bold;
            margin: 20px 0;
          }
          .button:hover {
            opacity: 0.9;
          }
          .info {
            background: #e0f2fe;
            border-left: 4px solid #0ea5e9;
            padding: 15px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📧 Gmail OAuth Token Generator</h1>

          <div class="info">
            <strong>ℹ️ What this does:</strong>
            <p>This will authenticate your Gmail account and generate a refresh token that allows the LMS to read emails from your inbox.</p>
          </div>

          <p><strong>Email Account:</strong> ${process.env.EMAIL_USER || 'Not configured'}</p>

          <a href="/auth" class="button">🔐 Start OAuth Flow</a>

          <div class="info">
            <strong>📝 Steps:</strong>
            <ol>
              <li>Click the button above</li>
              <li>Sign in with your Google account</li>
              <li>Grant permissions to read emails</li>
              <li>Copy the refresh token from terminal</li>
              <li>Update your .env file</li>
            </ol>
          </div>
        </div>
      </body>
    </html>
  `);
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 Gmail OAuth Token Generator");
  console.log("=".repeat(60));
  console.log(`\n👉 Open your browser and go to:\n`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log("=".repeat(60));
  console.log("\nℹ️  This will help you generate a new Gmail refresh token.");
  console.log("ℹ️  Running on port 3001 to avoid conflict with backend server.\n");
});
