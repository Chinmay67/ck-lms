import type { ReactNode } from 'react';
import { FaInbox, FaSearch, FaUsers, FaExclamationTriangle } from 'react-icons/fa';

interface EmptyStateProps {
  icon?: 'inbox' | 'search' | 'users' | 'warning' | ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

const EmptyState = ({ 
  icon = 'inbox', 
  title, 
  description, 
  action, 
  className = '' 
}: EmptyStateProps) => {
  const getIcon = () => {
    if (typeof icon === 'object') return icon;
    
    const iconClass = "w-16 h-16 text-primary-300 mb-4";
    switch (icon) {
      case 'search':
        return <FaSearch className={iconClass} />;
      case 'users':
        return <FaUsers className={iconClass} />;
      case 'warning':
        return <FaExclamationTriangle className={iconClass} />;
      default:
        return <FaInbox className={iconClass} />;
    }
  };

  return (
    <div className={`text-center py-12 px-4 ${className}`}>
      <div className="flex flex-col items-center max-w-md mx-auto">
        {getIcon()}
        <h3 className="text-xl font-semibold text-text-primary mb-2">
          {title}
        </h3>
        {description && (
          <p className="text-text-secondary mb-6">
            {description}
          </p>
        )}
        {action && (
          <div className="animate-slide-up">
            {action}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmptyState;
