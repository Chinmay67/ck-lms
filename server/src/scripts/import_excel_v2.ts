import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Database from '../config/database.js';
import User from '../models/v2/User.js';
import { importExcel } from '../services/v2/excelImportService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const filePath = argValue('--file') || path.join(__dirname, '../../../../Student data_15-jan-2026.xlsx');
  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run') || !apply;
  const resetFreshDb = process.argv.includes('--reset-fresh-db');

  const db = Database.getInstance();
  await db.connect();

  let admin = await User.findOne({ role: 'superadmin' });
  if (!admin) {
    admin = await User.create({
      email: 'system@ck-lms.local',
      password: 'change-me-now',
      name: 'System Superadmin',
      role: 'superadmin',
      isActive: true,
    });
  }

  const summary = await importExcel({
    filePath,
    apply: apply && !dryRun,
    resetFreshDb,
    adminUserId: admin._id.toString(),
  });
  console.log(JSON.stringify(summary, null, 2));
  await db.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
