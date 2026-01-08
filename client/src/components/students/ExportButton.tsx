import { FaDownload } from 'react-icons/fa';
import Button from '../ui/Button';
import { type Student } from '../../types/student';

interface ExportButtonProps {
  students: Student[];
  filename?: string;
}

const ExportButton = ({ students, filename = 'students-export' }: ExportButtonProps) => {
  const exportToCSV = () => {
    if (students.length === 0) {
      alert('No students to export');
      return;
    }

    // CSV Headers
    const headers = [
      'Name',
      'Email',
      'Phone',
      'Date of Birth',
      'Parent Name',
      'Address',
      'Skills',
      'Skill Level',
      'Referred By',
      'Joined Date',
    ];

    // CSV Rows
    const rows = students.map((student) => [
      student.studentName,
      student.email,
      student.phone || '',
      student.dob || '',
      student.parentName || '',
      student.address || '',
      student.combinedSkill || '',
      student.skillCategory || '',
      student.referredBy || '',
      new Date(student.createdAt).toLocaleDateString(),
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Button variant="outline" onClick={exportToCSV}>
      <FaDownload />
      Export to CSV
    </Button>
  );
};

export default ExportButton;
