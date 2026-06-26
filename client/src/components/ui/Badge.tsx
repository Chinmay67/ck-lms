import { type ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  className?: string;
}

const Badge = ({ children, variant = 'default', size = 'md', dot = false, className = '' }: BadgeProps) => {
  const variantClasses = {
    success: 'bg-accent-600/15 text-accent-400 border-accent-600/20',
    warning: 'bg-secondary-600/15 text-secondary-400 border-secondary-600/20',
    danger:  'bg-error-600/15 text-red-400 border-error-600/20',
    info:    'bg-primary-600/15 text-primary-300 border-primary-600/20',
    default: 'bg-white/6 text-text-secondary border-white/8',
  };

  const dotColors = {
    success: 'bg-accent-400',
    warning: 'bg-secondary-400',
    danger:  'bg-red-400',
    info:    'bg-primary-400',
    default: 'bg-text-tertiary',
  };

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-0.5 text-xs',
    lg: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full border
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
};

export default Badge;
