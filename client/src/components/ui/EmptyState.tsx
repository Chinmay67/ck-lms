import type { ReactNode } from 'react';
import { Inbox, Search, Users, AlertTriangle } from 'lucide-react';

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
    
    const iconClass = "w-10 h-10 text-primary-300 mb-3";
    switch (icon) {
      case 'search':
        return <Search className={iconClass} />
      case 'users':
        return <Users className={iconClass} />
      case 'warning':
        return <AlertTriangle className={iconClass} />
      default:
        return <Inbox className={iconClass} />
    }
  };

  return (
    <div className={`text-center py-10 px-4 ${className}`}>
      <div className="flex flex-col items-center max-w-md mx-auto">
        {getIcon()}
        <h3 className="text-base font-semibold text-text-primary mb-1.5">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-text-secondary mb-5">
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
