/**
 * Script to obtain Outlook OAuth2 Refresh Token
 * 
 * This script helps you get a refresh token for Outlook using delegated permissions.
 * The refresh token can then be used to automatically sync emails from Outlook.
 * 
 * Steps:
 * 1. Register an app in Azure AD (done - using values from .env)
 * 2. Run this script to get the authorization URL
 * 3. Visit the URL and grant permissions
 * 4. Copy the authorization code from the redirect URL
 * 5. Run this script with the code to get the refresh token
 * 
 * Usage:
 *   node GetOutlookRefreshToken.js              - Get authorization URL
 *   node GetOutlookRefreshToken.js <AUTH_CODE>  - Exchange code for tokens
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CLIENT_ID = process.env.OUTLOOK_CLIENT_ID;
const CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET;
const TENANT_ID = process.env.OUTLOOK_TENANT_ID;
const REDIRECT_URI = 'http://localhost:3000/oauth/callback'; // Must match Azure AD app registration

// Scopes needed for reading emails with delegated permissions
const SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'offline_access' // Required to get refresh token
].join(' ');

async function getAuthorizationUrl() {
  const authEndpoint = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
  
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    response_mode: 'query',
    state: '12345' // Optional state parameter for security
  });

  const authUrl = `${authEndpoint}?${params.toString()}`;
  
  console.log('\n📧 Outlook OAuth2 Setup\n');
  console.log('Step 1: Visit this URL to authorize the application:\n');
  console.log(authUrl);
  console.log('\n');
  console.log('Step 2: After granting permissions, you will be redirected to:');
  console.log(`${REDIRECT_URI}?code=YOUR_AUTH_CODE&state=12345\n`);
  console.log('Step 3: Copy the authorization code from the URL and run:\n');
  console.log('node GetOutlookRefreshToken.js YOUR_AUTH_CODE\n');
}

async function exchangeCodeForTokens(authCode) {
  const tokenEndpoint = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: authCode,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    scope: SCOPES
  });

  try {
    console.log('\n🔄 Exchanging authorization code for tokens...\n');
    
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    console.log('✅ Success! Here are your tokens:\n');
    console.log('Access Token (expires in 1 hour):');
    console.log(data.access_token);
    console.log('\n');
    console.log('🔑 Refresh Token (save this in your .env file):');
    console.log(data.refresh_token);
    console.log('\n');
    console.log('📝 Add this to your .env file:');
    console.log(`OUTLOOK_REFRESH_TOKEN=${data.refresh_token}`);
    console.log('\n');
    console.log('Token expires in:', data.expires_in, 'seconds');
    console.log('Scope:', data.scope);
    
  } catch (error) {
    console.error('❌ Error exchanging code for tokens:', error.message);
    process.exit(1);
  }
}

// Main execution
const authCode = process.argv[2];

if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID) {
  console.error('❌ Error: Missing Outlook credentials in .env file');
  console.error('Please ensure OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, and OUTLOOK_TENANT_ID are set');
  process.exit(1);
}

if (authCode) {
  exchangeCodeForTokens(authCode);
} else {
  getAuthorizationUrl();
}
