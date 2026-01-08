import express, { Request, Response } from 'express';
import { FeeService } from '../services/FeeService.js';

const router = express.Router();

// Middleware to verify cron API key
const verifyCronApiKey = (req: Request, res: Response, next: express.NextFunction): void => {
  const apiKey = req.header('X-Cron-API-Key');
  const expectedApiKey = process.env.CRON_API_KEY;

  if (!expectedApiKey) {
    res.status(500).json({
      success: false,
      error: 'Cron API key not configured on server',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized. Invalid or missing cron API key.',
      timestamp: new Date().toISOString()
    });
    return;
  }

  next();
};

/**
 * POST /api/cron/update-overdue-fees
 * Updates all upcoming fees past their due date to overdue status
 * Requires X-Cron-API-Key header for authentication
 */
router.post('/update-overdue-fees', verifyCronApiKey, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('⏰ Cron job triggered: Updating overdue fees');
    
    const updatedCount = await FeeService.updateOverdueFees();
    
    console.log(`✅ Updated ${updatedCount} fees to overdue status`);
    
    res.json({
      success: true,
      message: 'Overdue fees updated successfully',
      data: {
        updatedCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ Failed to update overdue fees:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to update overdue fees',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
