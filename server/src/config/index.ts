import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the server root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
    port: process.env.PORT || 3000,
    
    // Gmail Configuration (deprecated - keeping for backward compatibility)
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    redirectUri: process.env.REDIRECT_URI || '',
    refreshToken: process.env.REFRESH_TOKEN || '',
    emailUser: process.env.EMAIL_USER || '',
    emailPass: process.env.EMAIL_PASS || '',
    
    // Outlook/Microsoft Graph Configuration
    outlookClientId: process.env.OUTLOOK_CLIENT_ID || '',
    outlookClientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
    outlookTenantId: process.env.OUTLOOK_TENANT_ID || '',
    outlookRefreshToken: process.env.OUTLOOK_REFRESH_TOKEN || '',
    
    // MongoDB Configuration
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ck-lms',
    
    // Environment
    nodeEnv: process.env.NODE_ENV || 'development',
    DevUrl:process.env.DEV_FRONTEND_URL || 'http://localhost:5173',
    ProdUrl:process.env.PROD_FRONTEND_URL,
    
    // Email Sync Configuration
    emailSyncInterval: parseInt(process.env.EMAIL_SYNC_INTERVAL || '300000', 10), // 5 minutes default
    senderEmail: process.env.SENDER_EMAIL || 'rrnagar@chessklub.net'
} as const;

export type Config = typeof config;
