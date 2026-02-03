/**
 * Analyze Batches in Excel File
 *
 * This script analyzes the Excel file to show how batches would be processed during ingestion.
 * It groups batches by code and start date, applying naming conventions for duplicates.
 *
 * Usage:
 * - Run with Excel file path: npm run analyze-batches <path-to-excel-file>
 * - Default path: /Desktop/Student data_15-jan-2026.xlsx
 */

import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseBatchCode, parseExcelDate, isValidDate } from '../src/utils/batchParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ExcelRow {
  'Batch': string;
  'Batch Start Date': any;
  [key: string]: any; // For dynamic columns
}

interface BatchAnalysis {
  batchCode: string;
  originalBatchCode: string;
  startDate: Date | null;
  status: 'active' | 'draft';
  displayCode: string;
  count: number;
}

/**
 * Parse Excel file
 */
function parseExcelFile(filePath: string): ExcelRow[] {
  console.log(`📖 Reading Excel file: ${filePath}`);

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const data: ExcelRow[] = xlsx.utils.sheet_to_json(sheet);

  console.log(`✅ Parsed ${data.length} rows from Excel`);
  return data;
}

/**
 * Analyze all batches in the Excel file
 */
function analyzeBatches(rows: ExcelRow[]): BatchAnalysis[] {
  const batches = new Map<string, BatchAnalysis>();

  for (const row of rows) {
    const batchCodeRaw = row['Batch']?.toString().trim();
    if (!batchCodeRaw) continue;

    const batchStartDate = parseExcelDate(row['Batch Start Date']);
    const isValidStart = batchStartDate && isValidDate(batchStartDate);
    const status = isValidStart ? 'active' : 'draft';

    // Parse and validate batch code
    const parsedBatch = parseBatchCode(batchCodeRaw);
    if (!parsedBatch.isValid) {
      console.warn(`⚠️  Invalid batch code: ${batchCodeRaw} - skipping`);
      continue;
    }

    const key = `${parsedBatch.batchCode}|${isValidStart ? batchStartDate?.toISOString() || 'invalid' : 'draft'}`;

    if (batches.has(key)) {
      batches.get(key)!.count++;
    } else {
      batches.set(key, {
        batchCode: parsedBatch.batchCode,
        originalBatchCode: batchCodeRaw,
        startDate: isValidStart ? batchStartDate : null,
        status,
        displayCode: parsedBatch.batchCode,
        count: 1
      });
    }
  }

  // Process to handle duplicate codes with different dates
  const batchList = Array.from(batches.values());

  // Group by code first
  const codeGroups = new Map<string, BatchAnalysis[]>();
  for (const batch of batchList) {
    if (!codeGroups.has(batch.batchCode)) {
      codeGroups.set(batch.batchCode, []);
    }
    codeGroups.get(batch.batchCode)!.push(batch);
  }

  // Apply naming convention for duplicates
  for (const [code, group] of codeGroups) {
    if (group.length > 1) {
      // Sort by status (active first), then by start date
      group.sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'active' ? -1 : 1;
        }
        if (a.startDate && b.startDate) {
          return a.startDate.getTime() - b.startDate.getTime();
        }
        return 0;
      });

      // Apply Roman numeral suffixes
      for (let i = 0; i < group.length; i++) {
        const suffix = i > 0 ? `-${getRomanNumeral(i)}` : '';
        group[i].displayCode = `${code}${suffix}`;
      }
    }
  }

  // Flatten back to single list
  return batchList;
}

/**
 * Get Roman numeral representation
 */
function getRomanNumeral(n: number): string {
  const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return romanNumerals[n] || `${n}`;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date | null): string {
  if (!date) return 'N/A';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Print summary
 */
function printSummary(analysis: BatchAnalysis[]): void {
  console.log('\n\n╔═══════════════════════════════════════════════════════╗');
  console.log('║     BATCH ANALYSIS IN EXCEL FILE                      ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  const summary: any = {
    totalBatches: analysis.length,
    activeBatches: analysis.filter(b => b.status === 'active').length,
    draftBatches: analysis.filter(b => b.status === 'draft').length,
    duplicateCodeGroups: 0
  };

  // Count duplicate code groups
  const codeGroups = new Map<string, number>();
  for (const batch of analysis) {
    codeGroups.set(batch.batchCode, (codeGroups.get(batch.batchCode) || 0) + 1);
  }
  summary.duplicateCodeGroups = Array.from(codeGroups.values()).filter(count => count > 1).length;

  console.log(`\n📊 Total Batches: ${summary.totalBatches}`);
  console.log(`   Active Batches: ${summary.activeBatches}`);
  console.log(`   Draft Batches: ${summary.draftBatches}`);
  console.log(`   Batches with duplicate codes: ${summary.duplicateCodeGroups} groups`);

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  BATCH LIST (sorted by code)                        ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  // Sort by batch code
  analysis.sort((a, b) => a.displayCode.localeCompare(b.displayCode));

  for (const batch of analysis) {
    console.log(`\n• Batch Code: ${batch.displayCode}`);
    console.log(`  Original Code: ${batch.originalBatchCode}`);
    console.log(`  Start Date: ${formatDate(batch.startDate)}`);
    console.log(`  Status: ${batch.status.toUpperCase()}`);
    console.log(`  Occurrences: ${batch.count} student${batch.count === 1 ? '' : 's'}`);
  }

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  DUPLICATE CODE GROUPS                              ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  // Group by original code and show duplicates
  const codeMap = new Map<string, BatchAnalysis[]>();
  for (const batch of analysis) {
    if (!codeMap.has(batch.batchCode)) {
      codeMap.set(batch.batchCode, []);
    }
    codeMap.get(batch.batchCode)!.push(batch);
  }

  let hasDuplicates = false;
  for (const [code, groups] of codeMap) {
    if (groups.length > 1) {
      hasDuplicates = true;
      console.log(`\n• Code: ${code} (${groups.length} variations)`);
      for (const group of groups) {
        console.log(`  - ${group.displayCode}: ${formatDate(group.startDate)} (${group.status})`);
      }
    }
  }

  if (!hasDuplicates) {
    console.log('No duplicate batch codes found with different start dates');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
}

/**
 * Main execution
 */
async function main() {
  const filePath = path.join(__dirname, '/../../../Desktop/Student data_15-jan-2026.xlsx');

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║     BATCH ANALYSIS SCRIPT                           ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    const rows = parseExcelFile(filePath);
    const analysis = analyzeBatches(rows);
    printSummary(analysis);

    console.log('\n✅ Analysis completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error during analysis:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { analyzeBatches };