import { useState, useRef } from 'react';
import { FaUpload, FaDownload, FaFileExcel, FaTimes, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { FeesAPI } from '../../services/api';

interface BulkFeeUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadResult {
  total: number;
  successful: number;
  updated: number;
  studentsNotFound: number;
  skipped: number;
  errors: Array<{ row: number; phone: string; error: string; data: any }>;
}

export function BulkFeeUploadModal({ isOpen, onClose, onSuccess }: BulkFeeUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ];
      if (!validTypes.includes(selectedFile.type)) {
        setError('Please upload a valid Excel file (.xlsx or .xls)');
        return;
      }

      // Check file size (5MB limit)
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }

      setFile(selectedFile);
      setError('');
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const response = await FeesAPI.bulkUploadFees(file);

      if (response.success) {
        setUploadResult(response.data as UploadResult);
        if (response.data.successful > 0 || response.data.updated > 0) {
          onSuccess();
        }
      } else {
        setError(response.error || 'Upload failed');
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await FeesAPI.downloadFeesTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fees-template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download template:', err);
      setError('Failed to download template');
    }
  };

  const handleClose = () => {
    setFile(null);
    setUploadResult(null);
    setError('');
    onClose();
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Upload Fees">
      <div className="space-y-4 md:space-y-6">
        {/* Instructions */}
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 md:p-4">
          <h4 className="text-sm md:text-base font-semibold text-primary-900 mb-2 md:mb-3">Instructions:</h4>
          <ol className="list-decimal list-inside space-y-1 text-xs md:text-sm text-primary-800">
            <li>Download the Excel template using the button below</li>
            <li>Fill in the fee data for your students (use phone numbers as identifiers)</li>
            <li>Only students with existing phone numbers in the database will be processed</li>
            <li>Upload the completed Excel file</li>
            <li>Review the results and errors (if any)</li>
          </ol>
        </div>

        {/* Download Template Button */}
        <Button
          variant="secondary"
          onClick={handleDownloadTemplate}
          className="w-full flex items-center justify-center gap-2"
        >
          <FaDownload className="w-4 h-4" />
          <span className="text-sm md:text-base">Download Excel Template</span>
        </Button>

        {/* File Upload Section */}
        <div className="space-y-3 md:space-y-4">
          <div className="border-2 border-dashed border-border rounded-xl p-4 md:p-8 text-center hover:border-primary-300 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />

            {!file ? (
              <div className="space-y-3 md:space-y-4">
                <div className="flex justify-center">
                  <FaUpload className="w-12 h-12 md:w-16 md:h-16 text-text-tertiary" />
                </div>
                <div>
                  <p className="text-sm md:text-base text-text-primary mb-2 font-medium">
                    Drag and drop your Excel file here, or
                  </p>
                  <Button variant="secondary" onClick={handleBrowseClick} className="w-full sm:w-auto">
                    Browse Files
                  </Button>
                </div>
                <p className="text-xs md:text-sm text-text-tertiary">
                  Supported formats: .xlsx, .xls (Max 5MB)
                </p>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-success-600">
                  <FaFileExcel className="w-8 h-8 md:w-10 md:h-10" />
                  <span className="text-sm md:text-base font-medium text-center break-all px-2">{file.name}</span>
                </div>
                <p className="text-xs md:text-sm text-text-secondary">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFile(null);
                    setUploadResult(null);
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2"
                >
                  <FaTimes className="w-4 h-4" />
                  Remove File
                </Button>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-error-50 border border-error-200 rounded-xl p-3 md:p-4 flex items-start gap-3">
              <FaExclamationCircle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs md:text-sm text-error-800">{error}</p>
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className="space-y-3 md:space-y-4">
              <div className="bg-success-50 border border-success-200 rounded-xl p-3 md:p-4">
                <div className="flex items-start gap-3">
                  <FaCheckCircle className="w-5 h-5 md:w-6 md:h-6 text-success-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm md:text-base font-semibold text-success-900 mb-2 md:mb-3">Upload Completed</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs md:text-sm text-success-800">
                      <div>Total Rows: {uploadResult.total}</div>
                      <div>Created: {uploadResult.successful}</div>
                      <div>Updated: {uploadResult.updated}</div>
                      <div>Students Not Found: {uploadResult.studentsNotFound}</div>
                      <div>Skipped: {uploadResult.skipped}</div>
                      <div>Errors: {uploadResult.errors.length}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Details */}
              {uploadResult.errors.length > 0 && (
                <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 md:p-4">
                  <h4 className="text-sm md:text-base font-semibold text-warning-900 mb-2 md:mb-3">Errors ({uploadResult.errors.length})</h4>
                  <div className="max-h-60 overflow-y-auto overflow-x-auto">
                    <table className="min-w-full text-xs md:text-sm">
                      <thead className="bg-warning-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Row</th>
                          <th className="px-3 py-2 text-left">Phone</th>
                          <th className="px-3 py-2 text-left">Error</th>
                        </tr>
                      </thead>
                      <tbody className="text-warning-800">
                        {uploadResult.errors.map((err, idx) => (
                          <tr key={idx} className="border-t border-warning-200">
                            <td className="px-3 py-2">{err.row}</td>
                            <td className="px-3 py-2">{err.phone}</td>
                            <td className="px-3 py-2">{err.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 pt-4 border-t border-primary-100">
          <Button variant="ghost" onClick={handleClose} className="w-full sm:w-auto">
            {uploadResult ? 'Close' : 'Cancel'}
          </Button>
          {!uploadResult && (
            <Button
              variant="primary"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full sm:w-auto"
            >
              {uploading ? 'Uploading...' : 'Upload Fees'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
