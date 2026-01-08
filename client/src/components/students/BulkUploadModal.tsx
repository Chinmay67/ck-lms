import { useState, useRef } from 'react';
import { FaUpload, FaDownload, FaFileExcel, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import api from '../../services/api';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadResult {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ row: number; error: string; data: any }>;
}

const BulkUploadModal = ({ isOpen, onClose, onSuccess }: BulkUploadModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    
    if (!validTypes.includes(selectedFile.type)) {
      alert('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setFile(selectedFile);
    setUploadResult(null);
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/students/download-template', {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'students-template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download template:', error);
      alert('Failed to download template. Please try again.');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/students/bulk-upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setUploadResult(response.data.data);
      
      if (response.data.data.successful > 0) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      alert(error.response?.data?.error || 'Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setUploadResult(null);
    setIsUploading(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Upload Students" size="lg">
      <div className="space-y-4 md:space-y-6">
        {/* Instructions */}
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 md:p-4">
          <h4 className="text-sm md:text-base font-semibold text-primary-900 mb-2 md:mb-3">Instructions:</h4>
          <ul className="text-xs md:text-sm text-primary-800 space-y-1 list-disc list-inside">
            <li>Download the template to see the required format</li>
            <li><strong>Required fields:</strong> Name, Contact Number (10-digit Indian mobile), E-mail</li>
            <li><strong>Phone validation:</strong> Must be 10 digits starting with 6-9 (spaces will be removed automatically)</li>
            <li><strong>Email validation:</strong> Must be valid email format (rows with "nan" or empty emails will be skipped)</li>
            <li><strong>Status field:</strong> "discontinued" = Inactive, "irregular" or any other = Active</li>
            <li><strong>Level field:</strong> B1, B2, I1, I2, A1, A2 (Beginner/Intermediate/Advanced 1-3)</li>
            <li><strong>Optional fields:</strong> Parent Name, Date of Birth, Address, Batch, Referred By</li>
            <li>Rows with missing/invalid phone or email will be automatically skipped</li>
            <li>User accounts will be automatically created (email = username, phone = password)</li>
          </ul>
        </div>

        {/* Download Template Button */}
        <div className="flex justify-center">
          <Button
            onClick={handleDownloadTemplate}
            variant="secondary"
            className="flex items-center gap-2 w-full sm:w-auto"
          >
            <FaDownload />
            <span className="text-sm md:text-base">Download Excel Template</span>
          </Button>
        </div>

        {/* File Upload Area */}
        {!uploadResult && (
          <div
            className={`border-2 border-dashed rounded-xl p-4 md:p-8 text-center transition-colors ${
              dragActive
                ? 'border-primary-500 bg-primary-50'
                : 'border-border hover:border-primary-300'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {!file ? (
              <div className="space-y-3 md:space-y-4">
                <div className="flex justify-center">
                  <FaUpload className="w-12 h-12 md:w-16 md:h-16 text-text-tertiary" />
                </div>
                <div>
                  <p className="text-sm md:text-base text-text-primary font-medium">
                    Drag and drop your Excel file here, or
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary-600 hover:text-primary-700 font-medium underline text-sm md:text-base"
                  >
                    browse to choose a file
                  </button>
                </div>
                <p className="text-xs md:text-sm text-text-tertiary">
                  Supported formats: .xlsx, .xls (Max 5MB)
                </p>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                <div className="flex justify-center">
                  <FaFileExcel className="w-12 h-12 md:w-16 md:h-16 text-success-600" />
                </div>
                <div>
                  <p className="text-sm md:text-base text-text-primary font-medium break-all px-2">{file.name}</p>
                  <p className="text-xs md:text-sm text-text-secondary">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row justify-center gap-2 md:gap-3">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="secondary"
                    size="sm"
                    className="w-full sm:w-auto"
                  >
                    Change File
                  </Button>
                  <Button
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto"
                  >
                    {isUploading ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Results */}
        {uploadResult && (
          <div className="space-y-3 md:space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <div className="bg-surface rounded-xl p-3 md:p-4 text-center border border-border">
                <p className="text-xl md:text-2xl font-bold text-text-primary">{uploadResult.total}</p>
                <p className="text-xs md:text-sm text-text-secondary mt-1">Total Rows</p>
              </div>
              <div className="bg-success-50 rounded-xl p-3 md:p-4 text-center border border-success-200">
                <p className="text-xl md:text-2xl font-bold text-success-600">{uploadResult.successful}</p>
                <p className="text-xs md:text-sm text-success-700 mt-1">Successful</p>
              </div>
              <div className="bg-warning-50 rounded-xl p-3 md:p-4 text-center border border-warning-200">
                <p className="text-xl md:text-2xl font-bold text-warning-600">{uploadResult.skipped}</p>
                <p className="text-xs md:text-sm text-warning-700 mt-1">Skipped</p>
              </div>
              <div className="bg-error-50 rounded-xl p-3 md:p-4 text-center border border-error-200">
                <p className="text-xl md:text-2xl font-bold text-error-600">{uploadResult.failed}</p>
                <p className="text-xs md:text-sm text-error-700 mt-1">Failed</p>
              </div>
            </div>

            {/* Errors and Skipped */}
            {uploadResult.errors.length > 0 && (
              <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 md:p-4">
                <h4 className="text-sm md:text-base font-semibold text-warning-900 mb-3 flex items-center gap-2">
                  <FaExclamationCircle />
                  Skipped & Failed Rows ({uploadResult.errors.length})
                </h4>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {uploadResult.errors.map((error, index) => (
                    <div
                      key={index}
                      className="bg-surface rounded-lg p-2 md:p-3 text-xs md:text-sm border border-warning-200"
                    >
                      <p className="font-medium text-warning-700">
                        Row {error.row}: {error.error}
                      </p>
                      {error.data && (
                        <div className="mt-1 text-xs text-text-secondary">
                          <p><strong>Name:</strong> {error.data.name || 'N/A'}</p>
                          <p><strong>Phone:</strong> {error.data.contactNumber || 'N/A'}</p>
                          <p><strong>Email:</strong> {error.data.email || 'N/A'}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Success Message */}
            {uploadResult.successful > 0 && uploadResult.failed === 0 && (
              <div className="bg-success-50 border border-success-200 rounded-xl p-3 md:p-4 flex items-start gap-3">
                <FaCheckCircle className="w-5 h-5 md:w-6 md:h-6 text-success-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm md:text-base font-semibold text-success-900">Upload Successful!</p>
                  <p className="text-xs md:text-sm text-success-700 mt-1">
                    {uploadResult.successful} student(s) have been added successfully.
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3">
              <Button onClick={handleClose} variant="secondary" className="w-full sm:w-auto">
                Close
              </Button>
              <Button onClick={() => setUploadResult(null)} variant="primary" className="w-full sm:w-auto">
                Upload Another File
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BulkUploadModal;
