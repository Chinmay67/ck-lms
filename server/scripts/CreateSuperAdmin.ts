import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User.ts';
import { config } from '../src/config/index.ts';

// Load environment variables
dotenv.config();

async function createSuperAdmin() {
  try {
    // Connect to MongoDB
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(config.mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check if superadmin already exists
    const existingSuperAdmin = await User.findOne({ role: 'superadmin' });
    
    if (existingSuperAdmin) {
      console.log('⚠️  A superadmin user already exists:');
      console.log(`   Email: ${existingSuperAdmin.email}`);
      console.log(`   Name: ${existingSuperAdmin.name}`);
      console.log('\n💡 If you want to create a new superadmin, please delete the existing one first.');
      
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create superadmin user
    const superAdminData = {
      email: 'admin@chessklub.com',
      password: 'Admin@123', // Change this after first login!
      name: 'Super Administrator',
      role: 'superadmin',
      isActive: true
    };

    console.log('\n🔄 Creating superadmin user...');
    const superAdmin = await User.create(superAdminData);

    console.log('\n✅ Superadmin user created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('   Email:', superAdminData.email);
    console.log('   Password:', superAdminData.password);
    console.log('\n⚠️  IMPORTANT: Please change the password after first login!');
    console.log('\n👤 User Details:');
    console.log('   ID:', superAdmin._id);
    console.log('   Name:', superAdmin.name);
    console.log('   Role:', superAdmin.role);
    console.log('   Active:', superAdmin.isActive);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating superadmin:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
createSuperAdmin();
