import express, { Request, Response } from 'express';

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

// Note: The update-overdue-fees endpoint has been removed since fee status
// is now computed dynamically based on dueDate and paymentDate fields.
// No scheduled job is needed to update status.

export default router;
