import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

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
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`relative w-full ${sizeClasses[size]} bg-surface rounded-lg border border-white/8 shadow-navy-lg animate-slide-up`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/7">
            <h3 className="text-base font-semibold text-text-primary tracking-tight">{title}</h3>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-text-tertiary hover:text-text-primary transition-colors p-1.5 rounded-lg hover:bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="px-5 py-4 max-h-[calc(100vh-160px)] overflow-y-auto custom-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
