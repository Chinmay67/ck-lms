import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { config } from '../config/index.js';
import { DatabaseService } from './DatabaseService.js';
import { EmailParseResult } from '../types/index.js';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export class EmailSyncService {
  private graphClient: Client | null = null;
  private accessToken: string = '';
  private tokenExpiry: number = 0;
  private isRunning: boolean = false;

  constructor() {
    this.initializeOutlookClient();
  }

  /**
   * Initialize Microsoft Graph client with delegated permissions
   */
  private async initializeOutlookClient() {
    const { outlookClientId, outlookClientSecret, outlookTenantId, outlookRefreshToken } = config;

    if (!outlookClientId || !outlookClientSecret || !outlookTenantId || !outlookRefreshToken) {
      throw new Error('Missing Outlook credentials in environment variables');
    }

    // Get initial access token
    await this.refreshAccessToken();

    // Initialize Graph client with custom auth provider
    this.graphClient = Client.init({
      authProvider: async (done) => {
        try {
          // Check if token is expired or about to expire (within 5 minutes)
          const now = Date.now();
          if (now >= this.tokenExpiry - 5 * 60 * 1000) {
            await this.refreshAccessToken();
          }
          done(null, this.accessToken);
        } catch (error: any) {
          done(error, null);
        }
      },
    });
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    const { outlookClientId, outlookClientSecret, outlookTenantId, outlookRefreshToken } = config;

    const tokenEndpoint = `https://login.microsoftonline.com/${outlookTenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams({
      client_id: outlookClientId,
      client_secret: outlookClientSecret,
      refresh_token: outlookRefreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.Read',
    });

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to refresh token: ${response.status} ${errorData}`);
      }

      const data = await response.json() as TokenResponse;
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + data.expires_in * 1000;

      console.log('🔑 Access token refreshed successfully');
    } catch (error: any) {
      throw new Error(`Failed to refresh access token: ${error.message}`);
    }
  }

  /**
   * Extract plain text body from Outlook message
   */
  private extractPlainText(message: any): string {
    if (!message.body) return '';

    // Handle both HTML and plain text content
    if (message.body.contentType === 'text') {
      return message.body.content || '';
    } else if (message.body.contentType === 'html') {
      // For HTML content, we'll use the plain text as-is
      // You could add HTML-to-text conversion if needed
      return message.body.content || '';
    }

    return '';
  }

  /**
   * Parse registration email into structured JSON
   */
  private parseEmailBody(body: string): EmailParseResult {
    const result: EmailParseResult = {
      studentName: '',
      dob: '',
      parentName: '',
      email: '',
      phone: '',
      alternatePhone: '',
      alternateEmail: '',
      address: '',
      skillLevel: '',
      referredBy: ''
    };

    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const fieldMap = {
      'Student Name': 'studentName',
      'Student Date Of Birth': 'dob',
      'Parent Name': 'parentName',
      'Email': 'email',
      'Phone': 'phone',
      'Alternate Phone': 'alternatePhone',
      'Alternate Email': 'alternateEmail',
      'Addess': 'address', // typo kept because template has it
      'Skill Level': 'skillLevel',
      'Referred By / Promo Code': 'referredBy'
    } as const;

    for (const line of lines) {
      for (const [label, key] of Object.entries(fieldMap)) {
        if (line.startsWith(label + ':')) {
          let value = line.replace(label + ':', '').trim();
          if (key === 'referredBy' && value.toLowerCase().startsWith('all the best')) {
            value = ''; // prevent false capture
          }
          (result as any)[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Check if email subject matches the registration pattern
   */
  private isRegistrationEmail(subject: string): boolean {
    if (!subject) return false;
    const pattern = 'New Student Registration From CHESS KLUB';
    return subject.toLowerCase().includes(pattern.toLowerCase());
  }

  /**
   * Sync all emails from sender
   */
  async syncAllEmails(syncJobId: string): Promise<{
    emailsProcessed: number;
    studentsCreated: number;
    studentsUpdated: number;
    errors: string[];
  }> {
    if (this.isRunning) {
      throw new Error('Email sync is already running');
    }

    this.isRunning = true;
    const results = {
      emailsProcessed: 0,
      studentsCreated: 0,
      studentsUpdated: 0,
      errors: [] as string[]
    };

    try {
      console.log(`📧 Starting email sync for job ${syncJobId}`);

      if (!this.graphClient) {
        throw new Error('Graph client not initialized');
      }

      // Build filter for sender email
      const senderFilter = `from/emailAddress/address eq '${config.senderEmail}'`;

      // Fetch messages from Outlook
      const response = await this.graphClient
        .api('/me/messages')
        .filter(senderFilter)
        .select('id,subject,from,receivedDateTime,body')
        .orderby('receivedDateTime desc')
        .top(500)
        .get();

      const messages = response.value || [];
      console.log(`📬 Found ${messages.length} emails from sender`);

      let processedCount = 0;
      let skippedCount = 0;

      for (const message of messages) {
        try {
          // Check if email subject matches registration pattern
          if (!this.isRegistrationEmail(message.subject)) {
            skippedCount++;
            console.log(`⏭️  Skipping non-registration email: "${message.subject}"`);
            continue;
          }

          const body = this.extractPlainText(message);
          const parsed = this.parseEmailBody(body);

          // Skip if email doesn't have required fields
          if (!parsed.email || !parsed.studentName) {
            console.log(`⚠️ Skipping email ${message.id} - missing required fields`);
            continue;
          }

          // Upsert student in database
          const { student, created } = await DatabaseService.upsertStudentFromEmail(
            parsed,
            message.id
          );

          if (created) {
            results.studentsCreated++;
            console.log(`✅ Created new student: ${student.studentName} (${student.email})`);
          } else {
            results.studentsUpdated++;
            console.log(`🔄 Updated existing student: ${student.studentName} (${student.email})`);
          }

          processedCount++;
          results.emailsProcessed++;
        } catch (error: any) {
          const errorMsg = `Failed to process email ${message.id}: ${error.message}`;
          results.errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }

      console.log(`✅ Email sync completed for job ${syncJobId}`);
      console.log(`📊 Results: ${processedCount} registration emails processed, ${skippedCount} non-registration emails skipped`);
      console.log(`📊 Students: ${results.studentsCreated} created, ${results.studentsUpdated} updated, ${results.errors.length} errors`);

      return results;
    } catch (error: any) {
      const errorMsg = `Email sync failed: ${error.message}`;
      results.errors.push(errorMsg);
      throw new Error(errorMsg);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get email date from message
   */
  private getEmailDate(message: any): Date | null {
    if (message.receivedDateTime) {
      return new Date(message.receivedDateTime);
    }
    return null;
  }

  /**
   * Sync new emails (incremental sync based on last sync date)
   */
  async syncNewEmails(syncJobId: string): Promise<{
    emailsProcessed: number;
    studentsCreated: number;
    studentsUpdated: number;
    errors: string[];
  }> {
    if (this.isRunning) {
      throw new Error('Email sync is already running');
    }

    this.isRunning = true;
    const results = {
      emailsProcessed: 0,
      studentsCreated: 0,
      studentsUpdated: 0,
      errors: [] as string[]
    };

    try {
      console.log(`📧 Starting incremental email sync for job ${syncJobId}`);

      if (!this.graphClient) {
        throw new Error('Graph client not initialized');
      }

      // Get last successful sync job
      const lastSync = await DatabaseService.getLatestSyncJob();
      let afterDate: Date | null = null;

      if (lastSync && lastSync.status === 'completed' && lastSync.lastProcessedEmailDate) {
        afterDate = lastSync.lastProcessedEmailDate;
        console.log(`📅 Last sync: ${afterDate.toISOString()}`);
        console.log(`� Fetching emails after: ${afterDate.toLocaleString()}`);
      } else {
        console.log(`📧 No previous sync found. Fetching all emails...`);
      }

      // Build filter
      let filter = `from/emailAddress/address eq '${config.senderEmail}'`;
      
      // Add date filter if we have a last sync date
      if (afterDate) {
        const isoDate = afterDate.toISOString();
        filter += ` and receivedDateTime ge ${isoDate}`;
      }

      console.log(`🔍 Outlook filter: ${filter}`);

      // Fetch messages from Outlook
      const response = await this.graphClient
        .api('/me/messages')
        .filter(filter)
        .select('id,subject,from,receivedDateTime,body')
        .orderby('receivedDateTime desc')
        .top(100)
        .get();

      const messages = response.value || [];
      console.log(`📬 Found ${messages.length} emails to process`);

      let latestEmailDate = afterDate;
      let processedCount = 0;
      let skippedCount = 0;

      for (const message of messages) {
        try {
          // Track latest email date
          const emailDate = this.getEmailDate(message);
          if (emailDate && (!latestEmailDate || emailDate > latestEmailDate)) {
            latestEmailDate = emailDate;
          }

          // Check if email subject matches registration pattern
          if (!this.isRegistrationEmail(message.subject)) {
            skippedCount++;
            console.log(`⏭️  Skipping non-registration email: "${message.subject}"`);
            continue;
          }

          const body = this.extractPlainText(message);
          const parsed = this.parseEmailBody(body);

          // Skip if email doesn't have required fields
          if (!parsed.email || !parsed.studentName) {
            console.log(`⚠️ Skipping email ${message.id} - missing required fields`);
            continue;
          }

          // Upsert student in database
          const { student, created } = await DatabaseService.upsertStudentFromEmail(
            parsed,
            message.id
          );

          if (created) {
            results.studentsCreated++;
            console.log(`✅ Created new student: ${student.studentName} (${student.email})`);
          } else {
            results.studentsUpdated++;
            console.log(`� Updated existing student: ${student.studentName} (${student.email})`);
          }

          processedCount++;
          results.emailsProcessed++;
        } catch (error: any) {
          const errorMsg = `Failed to process email ${message.id}: ${error.message}`;
          results.errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }

      // Update sync job with latest email date
      const syncJob = await DatabaseService.getSyncJobById(syncJobId);
      if (syncJob && latestEmailDate) {
        syncJob.lastProcessedEmailDate = latestEmailDate;
        await syncJob.save();
      }

      console.log(`✅ Incremental sync completed for job ${syncJobId}`);
      console.log(`📊 Results: ${processedCount} registration emails processed, ${skippedCount} non-registration emails skipped`);
      console.log(`📊 Students: ${results.studentsCreated} created, ${results.studentsUpdated} updated, ${results.errors.length} errors`);

      return results;
    } catch (error: any) {
      const errorMsg = `Incremental sync failed: ${error.message}`;
      results.errors.push(errorMsg);
      throw new Error(errorMsg);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run email sync job
   */
  async runSyncJob(syncJobId: string, syncType: 'full' | 'incremental' = 'incremental') {
    try {
      const syncJob = await DatabaseService.getSyncJobById(syncJobId);
      if (!syncJob) {
        throw new Error('Sync job not found');
      }

      // Mark job as running
      await syncJob.markAsRunning();

      let results;
      if (syncType === 'full') {
        results = await this.syncAllEmails(syncJobId);
      } else {
        results = await this.syncNewEmails(syncJobId);
      }

      // Update job with results
      syncJob.emailsProcessed = results.emailsProcessed;
      syncJob.studentsCreated = results.studentsCreated;
      syncJob.studentsUpdated = results.studentsUpdated;
      syncJob.errorLogs = results.errors;
      syncJob.lastProcessedEmailDate = new Date();

      if (syncJob.metadata) {
        syncJob.metadata.totalEmails = results.emailsProcessed;
        syncJob.metadata.successfulParsing = results.emailsProcessed - results.errors.length;
        syncJob.metadata.failedParsing = results.errors.length;
      }

      await syncJob.markAsCompleted();
      
      return results;
    } catch (error: any) {
      const syncJob = await DatabaseService.getSyncJobById(syncJobId);
      if (syncJob) {
        await syncJob.markAsFailed(error.message);
      }
      throw error;
    }
  }

  getRunningStatus(): boolean {
    return this.isRunning;
  }
}
