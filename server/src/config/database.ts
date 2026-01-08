import mongoose from 'mongoose';
import { config } from './index';

class Database {
  private static instance: Database;
  private isConnected: boolean = false;

  private constructor() {}

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      console.log('📦 Database already connected');
      return;
    }

    try {
      const mongoUri = config.mongoUri;
      
      if (!mongoUri) {
        throw new Error('MongoDB URI not found in environment variables');
      }

      await mongoose.connect(mongoUri);
      
      this.isConnected = true;
      console.log('🚀 MongoDB connected successfully');
      
      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('📦 MongoDB disconnected');
        this.isConnected = false;
      });

    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error);
      process.exit(1);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('📦 MongoDB disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting from MongoDB:', error);
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

export default Database;
