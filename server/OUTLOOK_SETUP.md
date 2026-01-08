# Outlook Email Sync Setup Guide

This guide explains how to set up the Outlook email synchronization using Microsoft Graph API with delegated permissions.

## Overview

The application now syncs student registration emails from Outlook instead of Gmail. It uses Microsoft Graph API with delegated permissions and a refresh token for automated email syncing.

### Key Features

- **Delegated Permissions**: Uses Mail.Read permission to access emails on behalf of a user
- **Refresh Token**: Automatically refreshes access tokens for unattended operation
- **Subject Filtering**: Only processes emails with subject "New Student Registration From CHESS KLUB - RR Nagar"
- **Incremental Sync**: Fetches only new emails since last sync
- **Full Sync**: Can fetch all registration emails from sender

## Prerequisites

1. Azure AD tenant access (Office 365/Microsoft 365 account)
2. Permissions to register applications in Azure AD
3. The email account that receives registration emails

## Step 1: Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: CK-LMS Email Sync (or any descriptive name)
   - **Supported account types**: Select based on your needs
     - "Accounts in this organizational directory only" for single tenant
     - "Accounts in any organizational directory" for multi-tenant
   - **Redirect URI**: 
     - Platform: Web
     - URI: `http://localhost:3000/oauth/callback`
5. Click **Register**

## Step 2: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Select **Delegated permissions**
5. Search and add:
   - `Mail.Read` - Read user mail
   - `offline_access` - Maintain access to data you have given it access to
6. Click **Add permissions**
7. Click **Grant admin consent** (if you have admin rights)
   - If not, ask your admin to grant consent

## Step 3: Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description (e.g., "Email Sync Secret")
4. Select expiration period (recommended: 24 months)
5. Click **Add**
6. **IMPORTANT**: Copy the secret value immediately - you won't be able to see it again!

## Step 4: Gather Credentials

You'll need these values from Azure AD:

1. **Application (client) ID**: Found on the app's Overview page
2. **Directory (tenant) ID**: Found on the app's Overview page
3. **Client Secret**: The secret value you just copied

## Step 5: Configure Environment Variables

Add these to your `server/.env` file:

```env
# Outlook/Microsoft Graph Configuration
OUTLOOK_CLIENT_ID=your_application_client_id
OUTLOOK_CLIENT_SECRET=your_client_secret_value
OUTLOOK_TENANT_ID=your_directory_tenant_id
OUTLOOK_REFRESH_TOKEN=will_be_generated_in_next_step

# Email Sync Configuration
SENDER_EMAIL=rrnagar@chessklub.net
EMAIL_SYNC_INTERVAL=300000
```

## Step 6: Obtain Refresh Token

Run the provided script to get your refresh token:

```bash
cd server
node scripts/GetOutlookRefreshToken.js
```

This will:
1. Display an authorization URL
2. Open it in your browser
3. Sign in with the account that receives registration emails
4. Grant the requested permissions
5. Copy the authorization code from the redirect URL
6. Run the script again with the code:

```bash
node scripts/GetOutlookRefreshToken.js YOUR_AUTH_CODE
```

The script will display your refresh token. Copy it and add to `.env`:

```env
OUTLOOK_REFRESH_TOKEN=your_refresh_token_here
```

## Step 7: Verify Setup

The email sync service will:

1. **Filter by sender**: Only process emails from `SENDER_EMAIL` configured in .env
2. **Filter by subject**: Only process emails with subject containing "New Student Registration From CHESS KLUB"
3. **Parse email body**: Extract student information using the existing parser
4. **Store in database**: Create or update student records

### Email Format Expected

```
Subject: New Student Registration From CHESS KLUB - RR Nagar

Body:
Hi ,

There is a new Registration. Please follow up, complete assessment (if required), and enroll them.

Student Name: PRANAV MITHRAN
Student Date Of Birth: 
Parent Name: VIJAY SENTHIL
Email: vjsenthil@gmail.com
Phone: 089515 34765
Alternate Phone: +919886879890
Alternate Email: kiruthikavijayasekaran@gmail.com
Addess: tf02 SUMUKHA ENCLAVE 5TH CROSS BEML 5TH STAGE RR NAGAR,
Skill Level: Beginner Level - 2
Referred By / Promo Code: 

All the best,

CHESS KLUB
```

## How It Works

### Authentication Flow

1. **Initial Setup**: User authorizes the app via OAuth2 flow
2. **Token Storage**: Refresh token is stored in `.env`
3. **Automatic Refresh**: Access tokens are refreshed automatically before expiry
4. **Unattended Operation**: Service can run without user interaction

### Email Sync Process

1. **Scheduled Sync**: Runs every 5 minutes (configurable via `EMAIL_SYNC_INTERVAL`)
2. **Fetch Emails**: Queries Microsoft Graph API for emails from sender
3. **Filter Registration Emails**: Only processes emails with matching subject
4. **Parse Content**: Extracts student information from email body
5. **Upsert Database**: Creates new student or updates existing based on email address

### API Endpoints

- `POST /api/sync/start` - Start manual sync job
  - Query param: `type=full` for full sync, `type=incremental` for incremental
- `GET /api/sync/status` - Get current sync status
- `GET /api/sync/jobs` - List all sync jobs
- `GET /api/sync/jobs/:id` - Get specific sync job details

## Troubleshooting

### "Missing Outlook credentials" Error

- Verify all four Outlook environment variables are set in `.env`
- Ensure there are no typos in variable names
- Restart the server after updating `.env`

### "Failed to refresh token" Error

- Check that your refresh token is valid
- Verify client secret hasn't expired
- Ensure the user account still has access to the mailbox
- Re-run the GetOutlookRefreshToken.js script to get a new token

### Emails Not Being Processed

- Verify `SENDER_EMAIL` matches the actual sender
- Check that email subject contains "New Student Registration From CHESS KLUB"
- Review server logs for parsing errors
- Ensure the email format matches the expected structure

### Permission Issues

- Verify API permissions are granted in Azure AD
- Ensure admin consent has been granted
- Check that the signed-in user has Mail.Read permissions

## Security Best Practices

1. **Keep Secrets Safe**: Never commit `.env` file to version control
2. **Rotate Secrets**: Regularly rotate client secrets (every 6-12 months)
3. **Minimum Permissions**: Only request Mail.Read, not Mail.ReadWrite
4. **Monitor Access**: Review Azure AD sign-in logs periodically
5. **Secure Storage**: Store refresh token securely (consider Azure Key Vault for production)

## Migration from Gmail

The application previously used Gmail API. The Outlook implementation maintains the same:

- Database schema
- Email parsing logic
- API endpoints
- Sync job tracking

Only the email fetching mechanism has changed from Gmail API to Microsoft Graph API.

## Additional Resources

- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/overview)
- [Delegated Permissions Reference](https://docs.microsoft.com/en-us/graph/permissions-reference)
- [OAuth2 Authorization Flow](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)
