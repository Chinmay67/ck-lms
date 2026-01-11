import xlsx from 'xlsx';
import { cleanPhoneNumber, parseExcelDate } from '../src/utils/fieldValidation.js';

interface StudentRow {
  'S.No': any;
  'Name': string;
  'Contact Number': string;
  'E-mail': string;
  'Status': string;
  'Student Start Date': any;
  'Level': string;
  'Duration': any;
  'Batch': string;
  'Timing': string;
  'Batch Start Date': any;
  'Payment Due date': any;
  'Payment Status': string;
  'Payment date': any;
  'Payment Due date.1': any;
  'Payment Status.1': string;
  'Payment date.1': any;
  'Payment Due date.2': any;
  'Payment Status.2': string;
  'Payment date.2': any;
  'Payment Due date.3': any;
  'Payment Status.3': string;
  'Payment date.3': any;
}

interface FormattedStudent {
  'Name': string;
  'Contact Number': string;
  'E-mail': string;
  'Status': string;
  'Student Start Date': string;
  'Level': string;
  'Batch': string;
  'Parent Name': string;
  'Date of Birth': string;
  'Address': string;
  'Referred By': string;
}

interface FormattedFee {
  'student_identifier': string;
  'Payment Due date': string;
  'Payment Status': string;
  'Payment date': string;
  'Payment Due date.1': string;
  'Payment Status.1': string;
  'Payment date.1': string;
  'Payment Due date.2': string;
  'Payment Status.2': string;
  'Payment date.2': string;
  'Payment Due date.3': string;
  'Payment Status.3': string;
  'Payment date.3': string;
}

// Normalize payment status
function normalizeStatus(status: any): string {
  if (!status || status === 'nan' || String(status).toLowerCase() === 'nan' || String(status).trim() === '') {
    return '';
  }
  
  const statusStr = String(status).trim();
  
  if (statusStr.toLowerCase() === 'paid') {
    return 'PAID';
  }
  
  if (statusStr.toLowerCase() === 'discontinued') {
    return 'DISCONTINUED';
  }
  
  if (statusStr.toLowerCase() === 'ab') {
    return '';
  }
  
  return statusStr;
}

// Validate email format
function isValidEmail(email: string): boolean {
  if (!email || String(email).trim() === '') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email).trim());
}

// Format date to YYYY-MM-DD
function formatDate(date: Date | null): string {
  if (!date) return '';
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

async function convertStudentsExcel() {
  try {
    const inputFilePath = '/Users/chinmay.singh/Desktop/Students.xlsx';

    console.log('Reading Students.xlsx from Desktop...');
    const workbook = xlsx.readFile(inputFilePath);

    // Check if "Student" sheet exists
    if (!workbook.SheetNames.includes('Student')) {
      console.error('Error: "Student" sheet not found in the Excel file');
      return;
    }

    const studentSheet = workbook.Sheets['Student'];
    const studentData: StudentRow[] = xlsx.utils.sheet_to_json(studentSheet);

    console.log(`Total rows in Student sheet: ${studentData.length}`);

    const formattedStudents: FormattedStudent[] = [];
    const formattedFees: FormattedFee[] = [];
    let processed = 0;
    let skipped = 0;
    const skippedRows: Array<{ row: number; reason: string; name: string }> = [];

    // Process each student row
    for (let i = 0; i < studentData.length; i++) {
      const row = studentData[i];
      const rowNum = i + 2; // Excel row number (1-indexed + header)

      try {
        // Extract and validate phone and email
        const phone = row['Contact Number'] ? String(row['Contact Number']).trim() : '';
        const email = row['E-mail'] ? String(row['E-mail']).trim() : '';

        // Skip if both phone and email are missing
        if (!phone && !email) {
          skipped++;
          skippedRows.push({
            row: rowNum,
            reason: 'Missing both phone and email',
            name: row['Name'] || 'N/A'
          });
          continue;
        }

        // Clean phone number
        const cleanedPhone = phone ? (cleanPhoneNumber(phone) || '') : '';
        
        // Validate email
        const validEmail = email && isValidEmail(email) ? email : '';

        // If still no valid phone or email after cleaning, skip
        if (!cleanedPhone && !validEmail) {
          skipped++;
          skippedRows.push({
            row: rowNum,
            reason: 'Invalid phone and email format',
            name: row['Name'] || 'N/A'
          });
          continue;
        }

        // Use phone as identifier if available, otherwise email
        const identifier = cleanedPhone || validEmail;

        // Parse student start date
        const startDate = parseExcelDate(row['Student Start Date']);
        const formattedStartDate = startDate ? formatDate(startDate) : '';

        // Combine Batch and Timing if available
        const batch = row['Batch'] ? String(row['Batch']).trim() : '';
        const timing = row['Timing'] ? String(row['Timing']).trim() : '';
        const combinedBatch = (timing && timing !== batch) ? `${batch} ${timing}`.trim() : batch;

        // Create formatted student record
        const formattedStudent: FormattedStudent = {
          'Name': row['Name'] ? String(row['Name']).trim() : '',
          'Contact Number': cleanedPhone,
          'E-mail': validEmail,
          'Status': row['Status'] ? String(row['Status']).trim() : '',
          'Student Start Date': formattedStartDate,
          'Level': row['Level'] ? String(row['Level']).trim() : '',
          'Batch': combinedBatch,
          'Parent Name': '',
          'Date of Birth': '',
          'Address': '',
          'Referred By': ''
        };

        formattedStudents.push(formattedStudent);

        // Process payment cycles
        const cycles = [
          {
            dueDate: row['Payment Due date'],
            status: row['Payment Status'],
            paymentDate: row['Payment date']
          },
          {
            dueDate: row['Payment Due date.1'],
            status: row['Payment Status.1'],
            paymentDate: row['Payment date.1']
          },
          {
            dueDate: row['Payment Due date.2'],
            status: row['Payment Status.2'],
            paymentDate: row['Payment date.2']
          },
          {
            dueDate: row['Payment Due date.3'],
            status: row['Payment Status.3'],
            paymentDate: row['Payment date.3']
          }
        ];

        // Create formatted fee record
        const formattedFee: FormattedFee = {
          'student_identifier': identifier,
          'Payment Due date': '',
          'Payment Status': '',
          'Payment date': '',
          'Payment Due date.1': '',
          'Payment Status.1': '',
          'Payment date.1': '',
          'Payment Due date.2': '',
          'Payment Status.2': '',
          'Payment date.2': '',
          'Payment Due date.3': '',
          'Payment Status.3': '',
          'Payment date.3': ''
        };

        // Fill in payment cycles
        for (let j = 0; j < cycles.length; j++) {
          const cycle = cycles[j];
          const suffix = j === 0 ? '' : `.${j}`;

          const dueDate = parseExcelDate(cycle.dueDate);
          const paymentDate = parseExcelDate(cycle.paymentDate);

          formattedFee[`Payment Due date${suffix}` as keyof FormattedFee] = formatDate(dueDate);
          formattedFee[`Payment Status${suffix}` as keyof FormattedFee] = normalizeStatus(cycle.status);
          formattedFee[`Payment date${suffix}` as keyof FormattedFee] = formatDate(paymentDate);
        }

        formattedFees.push(formattedFee);
        processed++;

      } catch (error: any) {
        skipped++;
        skippedRows.push({
          row: rowNum,
          reason: `Error: ${error.message}`,
          name: row['Name'] || 'N/A'
        });
      }
    }

    // Create new sheets
    const studentsFormattedSheet = xlsx.utils.json_to_sheet(formattedStudents);
    const feesFormattedSheet = xlsx.utils.json_to_sheet(formattedFees);

    // Set column widths for better readability
    studentsFormattedSheet['!cols'] = [
      { wch: 25 }, // Name
      { wch: 15 }, // Contact Number
      { wch: 30 }, // E-mail
      { wch: 12 }, // Status
      { wch: 18 }, // Student Start Date
      { wch: 10 }, // Level
      { wch: 20 }, // Batch
      { wch: 20 }, // Parent Name
      { wch: 15 }, // Date of Birth
      { wch: 30 }, // Address
      { wch: 20 }  // Referred By
    ];

    feesFormattedSheet['!cols'] = [
      { wch: 20 }, // student_identifier
      { wch: 18 }, // Payment Due date
      { wch: 15 }, // Payment Status
      { wch: 18 }, // Payment date
      { wch: 18 }, // Payment Due date.1
      { wch: 15 }, // Payment Status.1
      { wch: 18 }, // Payment date.1
      { wch: 18 }, // Payment Due date.2
      { wch: 15 }, // Payment Status.2
      { wch: 18 }, // Payment date.2
      { wch: 18 }, // Payment Due date.3
      { wch: 15 }, // Payment Status.3
      { wch: 18 }  // Payment date.3
    ];

    // Add new sheets to workbook
    xlsx.utils.book_append_sheet(workbook, studentsFormattedSheet, 'Students_Formatted');
    xlsx.utils.book_append_sheet(workbook, feesFormattedSheet, 'Fees_Formatted');

    // Save modified workbook
    xlsx.writeFile(workbook, inputFilePath);

    // Print summary
    console.log('\n=== Conversion Summary ===');
    console.log(`Total rows processed: ${studentData.length}`);
    console.log(`Successfully converted: ${processed}`);
    console.log(`Skipped: ${skipped}`);
    console.log('\nNew sheets created:');
    console.log('  - Students_Formatted');
    console.log('  - Fees_Formatted');
    console.log(`\nFile saved: ${inputFilePath}`);

    if (skippedRows.length > 0) {
      console.log('\n=== Skipped Rows ===');
      skippedRows.forEach(skip => {
        console.log(`Row ${skip.row} (${skip.name}): ${skip.reason}`);
      });
    }

    console.log('\n=== Next Steps ===');
    console.log('1. Open the modified Students.xlsx file');
    console.log('2. Use "Students_Formatted" sheet to bulk upload students via the UI');
    console.log('3. Use "Fees_Formatted" sheet to bulk upload fees via the UI');

  } catch (error: any) {
    console.error('Error converting Excel file:', error.message);
    throw error;
  }
}

// Run the conversion
convertStudentsExcel()
  .then(() => {
    console.log('\nConversion completed successfully!');
  })
  .catch((error) => {
    console.error('\nConversion failed:', error);
  });
