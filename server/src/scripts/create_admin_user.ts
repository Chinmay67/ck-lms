import mongoose from 'mongoose';
import User from '../models/v2/User.js';
import { config } from '../config/index.js';

type AdminRole = 'admin' | 'superadmin';

interface CliArgs {
  email: string;
  password: string;
  name: string;
  role: AdminRole;
  phone?: string;
  updateExisting: boolean;
}

const VALID_ROLES = new Set<AdminRole>(['admin', 'superadmin']);

function printUsage(): void {
  console.log(`
Create or update a CK-LMS admin user.

Usage:
  npm run create-admin -- --email <email> --password <password> --name <name> --role <admin|superadmin> [--phone <phone>] [--update]

Examples:
  npm run create-admin -- --email admin@chessklub.com --password "StrongPass123!" --name "Chess Klub Admin" --role admin
  npm run create-admin -- --email owner@chessklub.com --password "StrongPass123!" --name "Owner" --role superadmin --update

Notes:
  --password is required and is hashed by the User model before saving.
  --update is required if an account with the same email already exists.
`);
}

function getArgValue(args: string[], key: string): string | undefined {
  const inlinePrefix = `${key}=`;
  const inlineValue = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inlineValue) return inlineValue.slice(inlinePrefix.length);

  const index = args.indexOf(key);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const email = getArgValue(args, '--email')?.trim().toLowerCase();
  const password = getArgValue(args, '--password');
  const name = getArgValue(args, '--name')?.trim();
  const role = getArgValue(args, '--role')?.trim().toLowerCase() as AdminRole | undefined;
  const phone = getArgValue(args, '--phone')?.trim();
  const updateExisting = args.includes('--update');

  const missing: string[] = [];
  if (!email) missing.push('--email');
  if (!password) missing.push('--password');
  if (!name) missing.push('--name');
  if (!role) missing.push('--role');

  if (missing.length > 0) {
    throw new Error(`Missing required argument(s): ${missing.join(', ')}`);
  }

  if (!VALID_ROLES.has(role!)) {
    throw new Error('--role must be either "admin" or "superadmin"');
  }

  if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/.test(email!)) {
    throw new Error('--email must be a valid email address');
  }

  if (password!.length < 6) {
    throw new Error('--password must be at least 6 characters long');
  }

  return {
    email: email!,
    password: password!,
    name: name!,
    role: role!,
    phone,
    updateExisting,
  };
}

async function assertSuperadminLimit(role: AdminRole, existingUserId?: string): Promise<void> {
  if (role !== 'superadmin') return;

  const existingSuperadminCount = await User.countDocuments({
    role: 'superadmin',
    ...(existingUserId ? { _id: { $ne: existingUserId } } : {}),
  });

  if (existingSuperadminCount >= config.maxSuperAdmins) {
    throw new Error(
      `Cannot create/promote another superadmin. Current limit is ${config.maxSuperAdmins}. ` +
      'Increase MAX_SUPER_ADMINS or demote/remove an existing superadmin first.'
    );
  }
}

async function createOrUpdateAdminUser(): Promise<void> {
  const cli = parseArgs(process.argv);

  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.mongoUri);

  try {
    const existingUser = await User.findOne({ email: cli.email }).select('+password');

    if (existingUser && !cli.updateExisting) {
      throw new Error(
        `A user with email "${cli.email}" already exists. Re-run with --update to change role/password.`
      );
    }

    await assertSuperadminLimit(cli.role, existingUser?._id?.toString());

    if (existingUser) {
      existingUser.name = cli.name;
      existingUser.role = cli.role;
      existingUser.password = cli.password;
      existingUser.isActive = true;
      existingUser.deletedAt = null;
      if (cli.phone !== undefined) existingUser.phone = cli.phone || undefined;

      await existingUser.save();

      console.log('Admin user updated successfully.');
      console.log(`ID: ${existingUser._id}`);
      console.log(`Email: ${existingUser.email}`);
      console.log(`Name: ${existingUser.name}`);
      console.log(`Role: ${existingUser.role}`);
      console.log(`Active: ${existingUser.isActive}`);
      return;
    }

    const user = await User.create({
      email: cli.email,
      password: cli.password,
      name: cli.name,
      role: cli.role,
      phone: cli.phone || undefined,
      isActive: true,
      deletedAt: null,
    });

    console.log('Admin user created successfully.');
    console.log(`ID: ${user._id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.name}`);
    console.log(`Role: ${user.role}`);
    console.log(`Active: ${user.isActive}`);
  } finally {
    await mongoose.disconnect();
  }
}

createOrUpdateAdminUser().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to create admin user: ${message}`);
  printUsage();

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  process.exit(1);
});
