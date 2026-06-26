import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  variant?: 'default' | 'elevated' | 'outlined' | 'bordered';
}

const Card = ({
  children,
  className = '',
  padding = 'md',
  hover = false,
  variant = 'default',
}: CardProps) => {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-4',
    lg: 'p-5',
  };

  const variantClasses = {
    default:  'bg-surface rounded-lg border border-white/7 shadow-sm',
    elevated: 'bg-surface-alt rounded-lg border border-white/10 shadow-md',
    outlined: 'bg-surface rounded-lg border-2 border-white/10',
    bordered: 'bg-surface rounded-lg border border-primary-600/40 shadow-sm',
  };

  return (
    <div
      className={`
        ${variantClasses[variant]}
        ${paddingClasses[padding]}
        ${hover ? 'transition-all duration-150 hover:border-white/15 hover:bg-surface-hover cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

export default Card;
