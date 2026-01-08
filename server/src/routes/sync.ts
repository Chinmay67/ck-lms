import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/DatabaseService.js';
import { EmailSyncService } from '../services/EmailSyncService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse, PaginatedResponse, ISyncJob } from '../types/index.js';

const router = Router();

// GET /api/sync/jobs - Get all sync jobs with pagination
router.get('/jobs', asyncHandler(async (req: Request, res: Response<ApiResponse<PaginatedResponse<ISyncJob>>>) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const result = await DatabaseService.getAllSyncJobs({ page, limit });

  return res.json({
    success: true,
    data: result,
    message: `Retrieved ${result.data.length} sync jobs`,
    timestamp: new Date().toISOString()
  });
}));

// GET /api/sync/jobs/latest - Get latest sync job
router.get('/jobs/latest', asyncHandler(async (req: Request, res: Response<ApiResponse<ISyncJob>>) => {
  const latestJob = await DatabaseService.getLatestSyncJob();
  
  if (!latestJob) {
    return res.status(404).json({
      success: false,
      error: 'No sync jobs found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    data: latestJob,
    message: 'Latest sync job retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// GET /api/sync/jobs/running - Get running sync jobs
router.get('/jobs/running', asyncHandler(async (req: Request, res: Response<ApiResponse<ISyncJob[]>>) => {
  const runningJobs = await DatabaseService.getRunningJobs();
  
  return res.json({
    success: true,
    data: runningJobs,
    message: `Found ${runningJobs.length} running sync jobs`,
    timestamp: new Date().toISOString()
  });
}));

// GET /api/sync/jobs/:id - Get sync job by ID
router.get('/jobs/:id', asyncHandler(async (req: Request, res: Response<ApiResponse<ISyncJob>>) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Sync job ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const syncJob = await DatabaseService.getSyncJobById(id);
  
  if (!syncJob) {
    return res.status(404).json({
      success: false,
      error: 'Sync job not found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    data: syncJob,
    message: 'Sync job retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/sync/jobs - Create new sync job
router.post('/jobs', asyncHandler(async (req: Request, res: Response<ApiResponse<ISyncJob>>) => {
  // Check if there are any running jobs
  const runningJobs = await DatabaseService.getRunningJobs();
  
  if (runningJobs.length > 0) {
    return res.status(409).json({
      success: false,
      error: 'Another sync job is currently running. Please wait for it to complete.',
      timestamp: new Date().toISOString()
    });
  }

  const syncJob = await DatabaseService.createSyncJob();
  
  return res.status(201).json({
    success: true,
    data: syncJob,
    message: 'Sync job created successfully',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/sync/trigger - Trigger email sync manually
router.post('/trigger', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  // Check if there are any running jobs
  const runningJobs = await DatabaseService.getRunningJobs();
  
  if (runningJobs.length > 0) {
    return res.status(409).json({
      success: false,
      error: 'Another sync job is currently running. Please wait for it to complete.',
      timestamp: new Date().toISOString()
    });
  }

  // Create a new sync job
  const syncJob = await DatabaseService.createSyncJob();
  
  // Get sync type from query parameter (default to incremental)
  const syncType = (req.query.type as 'full' | 'incremental') || 'incremental';
  
  // Start email sync process asynchronously
  const emailSyncService = new EmailSyncService();
  
  // Run sync job asynchronously
  emailSyncService.runSyncJob(syncJob.id, syncType).catch((error) => {
    console.error('Sync job failed:', error);
  });
  
  return res.json({
    success: true,
    data: { jobId: syncJob.jobId, status: syncJob.status, syncType },
    message: `Email sync triggered successfully (${syncType} sync)`,
    timestamp: new Date().toISOString()
  });
}));

// GET /api/sync/status - Get current sync status
router.get('/status', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const [latestJob, runningJobs, stats] = await Promise.all([
    DatabaseService.getLatestSyncJob(),
    DatabaseService.getRunningJobs(),
    DatabaseService.getSyncJobStats()
  ]);

  const status = {
    isRunning: runningJobs.length > 0,
    runningJobsCount: runningJobs.length,
    lastSyncJob: latestJob ? {
      id: latestJob.id,
      jobId: latestJob.jobId,
      status: latestJob.status,
      startTime: latestJob.startTime,
      endTime: latestJob.endTime,
      studentsCreated: latestJob.studentsCreated,
      studentsUpdated: latestJob.studentsUpdated,
      emailsProcessed: latestJob.emailsProcessed
    } : null,
    stats
  };

  return res.json({
    success: true,
    data: status,
    message: 'Sync status retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// GET /api/sync/stats - Get sync job statistics
router.get('/stats', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const stats = await DatabaseService.getSyncJobStats();
  
  return res.json({
    success: true,
    data: stats,
    message: 'Sync statistics retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

export default router;
