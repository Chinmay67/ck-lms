import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/index.js';
import Database from './config/database.js';
import authRoutes from './routes/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authenticate, authorize } from './middleware/auth.js';
import adminDashboardRoutes from './routes/admin/dashboard.js';
import adminStudentsRoutes from './routes/admin/students.js';
import adminEnrollmentsRouter from './routes/admin/enrollments.js';
import adminCoursesRoutes from './routes/admin/courses.js';
import adminBatchesRoutes from './routes/admin/batches.js';
import adminFeesRoutes from './routes/admin/fees.js';
import adminLeadsRoutes from './routes/admin/leads.js';

// Nest enrollment routes under students/:id/enrollments
adminStudentsRoutes.use('/:id/enrollments', adminEnrollmentsRouter);

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? config.ProdUrl // Replace with actual frontend domain
    : config.DevUrl, // Common dev ports
  credentials: true
}));

// Logging middleware
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  const dbStatus = Database.getInstance().getConnectionStatus();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus ? 'connected' : 'disconnected',
    environment: config.nodeEnv
  });
});

// API routes
app.use('/api/auth', authRoutes);
// V2 admin routes (all require authentication)
app.use('/api/v2/dashboard', authenticate, authorize('admin', 'superadmin'), adminDashboardRoutes);
app.use('/api/v2/students', authenticate, authorize('admin', 'superadmin'), adminStudentsRoutes);
app.use('/api/v2/courses', authenticate, authorize('admin', 'superadmin'), adminCoursesRoutes);
app.use('/api/v2/batches', authenticate, authorize('admin', 'superadmin'), adminBatchesRoutes);
app.use('/api/v2/fees', authenticate, authorize('admin', 'superadmin'), adminFeesRoutes);
app.use('/api/v2/leads', authenticate, authorize('admin', 'superadmin'), adminLeadsRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'CK-LMS Backend API',
    version: '1.0.0',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

// Start server function
async function startServer() {
  try {
    // Connect to database
    const db = Database.getInstance();
    await db.connect();

    // Start server
    app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📱 Environment: ${config.nodeEnv}`);
      console.log(`🌐 Health check: http://localhost:${config.port}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  const db = Database.getInstance();
  await db.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  const db = Database.getInstance();
  await db.disconnect();
  process.exit(0);
});

// Start the server
startServer();
