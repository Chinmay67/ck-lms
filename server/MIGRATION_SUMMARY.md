# Migration Summary: Gmail to Outlook Email Sync

## Overview

Successfully migrated the email synchronization system from Gmail API to Microsoft Graph API (Outlook) with the following improvements:

## Changes Made

### 1. **Configuration Updates**

- **Consolidated config files**: Merged `server/config.ts` into `server/src/config/index.ts`
- **Added Outlook credentials**: 
  - `OUTLOOK_CLIENT_ID`
  - `OUTLOOK_CLIENT_SECRET`
  - `OUTLOOK_TENANT_ID`
  - `OUTLOOK_REFRESH_TOKEN`
- **Maintained backward compatibility**: Kept Gmail config variables for reference

### 2. **Dependencies Installed**

```json
"@microsoft/microsoft-graph-client": "^3.0.7",
"isomorphic-fetch": "^3.0.0"
```

### 3. **Email Sync Service Rewrite** (`server/src/services/EmailSyncService.ts`)

#### Replaced Gmail API with Microsoft Graph API:

**Authentication:**
- Gmail OAuth2 → Microsoft Graph OAuth2 with delegated permissions
- Automatic access token refresh using refresh token
- Token expiry tracking and proactive refresh

**Email Fetching:**
- Gmail API queries → Microsoft Graph `/me/messages` endpoint
- Filter by sender email address
- Filter by received date for incremental sync
- Select specific fields to optimize performance

**New Features Added:**
- **Subject filtering**: Only processes emails with "New Student Registration From CHESS KLUB" in subject
- **Registration-only processing**: Automatically skips non-registration emails
- **Better logging**: Enhanced console output showing what's being processed vs skipped

### 4. **Email Parsing**

Maintained the existing email parsing logic:
- Same field extraction (`Student Name`, `Email`, `Phone`, etc.)
- Same validation rules
- Same database upsert mechanism
- Handles the typo "Addess" in email template

### 5. **Subject Filtering Logic**

```typescript
private isRegistrationEmail(subject: string): boolean {
  if (!subject) return false;
  const pattern = 'New Student Registration From CHESS KLUB';
  return subject.toLowerCase().includes(pattern.toLowerCase());
}
```

This ensures:
- Only processes new student registrations
- Ignores other emails from the same sender
- Case-insensitive matching for reliability

### 6. **Scripts Created**

#### `server/scripts/GetOutlookRefreshToken.js`
- Interactive OAuth2 flow for obtaining refresh token
- Two-step process: get auth URL → exchange code for tokens
- Clear instructions and error handling

### 7. **Documentation Created**

#### `server/OUTLOOK_SETUP.md`
Comprehensive setup guide covering:
- Azure AD app registration
- API permissions configuration
- Client secret creation
- Environment variable setup
- Refresh token acquisition
- Troubleshooting guide
- Security best practices

## Architecture

### Authentication Flow

```
1. Admin runs GetOutlookRefreshToken.js
2. Script generates authorization URL
3. User signs in and grants permissions
4. User copies authorization code
5. Script exchanges code for refresh token
6. Refresh token stored in .env
7. EmailSyncService uses refresh token to get access tokens
8. Access tokens auto-refresh every ~55 minutes
```

### Email Sync Flow

```
1. Sync job created (manual or scheduled)
2. Fetch emails from Microsoft Graph API
   - Filter by sender email
   - Filter by date (for incremental sync)
3. Filter by subject: "New Student Registration From CHESS KLUB"
4. Parse email body to extract student data
5. Upsert student to MongoDB
6. Track sync job progress and results
```

## API Compatibility

All existing API endpoints remain unchanged:
- `POST /api/sync/start?type=full|incremental`
- `GET /api/sync/status`
- `GET /api/sync/jobs`
- `GET /api/sync/jobs/:id`

## Database Schema

No changes to database schema:
- Student model unchanged
- SyncJob model unchanged
- Email parsing results match existing format

## Benefits of Migration

1. **Better filtering**: Subject-based filtering ensures only registration emails are processed
2. **Modern API**: Microsoft Graph is actively maintained and improved
3. **Delegated permissions**: Proper OAuth2 flow with user consent
4. **Automatic token refresh**: No manual intervention needed
5. **Better error handling**: Clearer error messages and logging
6. **Scalability**: Microsoft Graph supports higher rate limits

## Testing Recommendations

1. **Run the refresh token script**:
   ```bash
   cd server
   node scripts/GetOutlookRefreshToken.js
   ```

2. **Update .env with the refresh token**

3. **Start the server**:
   ```bash
   npm run dev
   ```

4. **Trigger a sync**:
   ```bash
   curl -X POST http://localhost:3000/api/sync/start?type=full
   ```

5. **Check logs** for:
   - Token refresh success
   - Emails fetched count
   - Registration emails processed vs skipped
   - Students created/updated
   - Any errors

6. **Verify database**:
   - Check MongoDB for new student records
   - Verify sync job tracking

## Security Considerations

- Refresh token stored in `.env` (not in version control)
- Minimum permissions requested (Mail.Read only)
- Access tokens expire after 1 hour
- Client secrets should be rotated periodically
- Consider using Azure Key Vault for production

## Rollback Plan

If needed to rollback to Gmail:
1. The Gmail configuration is still in `server/src/config/index.ts`
2. Old Gmail scripts are in `server/scripts/`
3. Would need to revert `EmailSyncService.ts` to use Gmail API
4. Install googleapis package: `npm install googleapis`

## Next Steps

1. Run `GetOutlookRefreshToken.js` to obtain refresh token
2. Update `.env` with the refresh token
3. Test the email sync with a sample registration email
4. Monitor logs for any issues
5. Set up scheduled sync jobs if needed
6. Consider implementing email webhooks for real-time sync (optional)

## Support

For issues or questions:
- Review `OUTLOOK_SETUP.md` for detailed setup instructions
- Check server logs for error messages
- Verify Azure AD app permissions
- Ensure refresh token is valid
- Test with the GetOutlookRefreshToken.js script
