import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  variant?: 'default' | 'elevated' | 'outlined' | 'glass';
}

const Card = ({ 
  children, 
  className = '', 
  padding = 'md', 
  hover = false,
  variant = 'default'
}: CardProps) => {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const variantClasses = {
    default: 'bg-surface rounded-xl shadow-navy border border-primary-100/20',
    elevated: 'bg-surface rounded-xl shadow-navy-lg border border-primary-100/30',
    outlined: 'bg-surface rounded-xl border-2 border-primary-200/50 shadow-sm',
    glass: 'bg-surface/80 backdrop-blur-md rounded-xl shadow-navy border border-primary-100/20',
  };

  return (
    <div
      className={`
        ${variantClasses[variant]}
        ${paddingClasses[padding]}
        ${hover ? 'card-hover hover:shadow-navy-lg' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

export default Card;
