import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { FaTimes } from 'react-icons/fa';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
}

const Modal = ({ isOpen, onClose, title, children, size = 'md', showCloseButton = true }: ModalProps) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-primary-900/40 backdrop-blur-md transition-opacity animate-fade-in"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`relative w-full ${sizeClasses[size]} bg-surface rounded-2xl shadow-navy-lg border border-primary-100/30 transform transition-all animate-scale-in`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-primary-100/30 bg-gradient-to-r from-primary-50 to-secondary-50 rounded-t-2xl">
            <h3 className="text-xl font-bold text-text-primary">{title}</h3>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-text-tertiary hover:text-text-primary transition-colors p-2 rounded-xl hover:bg-primary-100/50"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
