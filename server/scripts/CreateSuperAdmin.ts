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

    // Check how many superadmins exist
    const existingSuperAdmins = await User.find({ role: 'superadmin' });
    const currentCount = existingSuperAdmins.length;
    const maxAllowed = config.maxSuperAdmins;
    
    console.log(`\n📊 Current superadmins: ${currentCount}/${maxAllowed}`);
    
    if (currentCount >= maxAllowed) {
      console.log(`\n⚠️  Maximum number of superadmins (${maxAllowed}) already exists:`);
      existingSuperAdmins.forEach((admin, index) => {
        console.log(`   ${index + 1}. ${admin.name} (${admin.email || admin.phone})`);
      });
      console.log(`\n💡 To create more superadmins:`);
      console.log(`   1. Delete an existing superadmin, OR`);
      console.log(`   2. Increase MAX_SUPER_ADMINS in your .env file (currently: ${maxAllowed})`);
      
      await mongoose.disconnect();
      process.exit(0);
    }

    // Prompt for superadmin details
    console.log(`\n✨ You can create ${maxAllowed - currentCount} more superadmin(s)`);
    console.log('\n📝 Enter superadmin details:');
    
    // Read from command line arguments or use defaults
    const email = process.argv[2];
    const name = process.argv[3] || 'Super Administrator';
    const password = process.argv[4] || 'Admin@123';

    if (!email) {
      console.error('\n❌ Email is required!');
      console.log('Usage: npm run create-superadmin <email> [name] [password]');
      console.log('Example: npm run create-superadmin admin@chessklub.com "John Doe" "SecurePass123"');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.error(`\n❌ A user with email ${email} already exists!`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // Create superadmin user
    const superAdminData = {
      email,
      password,
      name,
      role: 'superadmin' as const,
      isActive: true
    };

    console.log('\n🔄 Creating superadmin user...');
    const superAdmin = await User.create(superAdminData);

    console.log('\n✅ Superadmin user created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('\n⚠️  IMPORTANT: Please change the password after first login!');
    console.log('\n👤 User Details:');
    console.log('   ID:', superAdmin._id);
    console.log('   Name:', superAdmin.name);
    console.log('   Role:', superAdmin.role);
    console.log('   Active:', superAdmin.isActive);
    console.log(`\n📊 Total superadmins: ${currentCount + 1}/${maxAllowed}`);

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
