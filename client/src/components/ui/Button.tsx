import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'gold';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  children: ReactNode;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const Button = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  isLoading = false,
  disabled,
  fullWidth = false,
  ...props
}: ButtonProps) => {
  const baseClasses =
    'font-semibold rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 select-none';

  const variantClasses = {
    primary:
      'bg-primary-600 text-white hover:bg-primary-500 focus:ring-primary-500 shadow-sm',
    secondary:
      'bg-secondary-600 text-white hover:bg-secondary-500 focus:ring-secondary-500 shadow-sm',
    danger:
      'bg-error-600 text-white hover:bg-error-700 focus:ring-error-500 shadow-sm',
    outline:
      'border border-white/15 text-text-secondary hover:border-white/30 hover:text-text-primary hover:bg-surface-hover focus:ring-primary-500 bg-transparent',
    ghost:
      'text-text-secondary hover:bg-surface-hover hover:text-text-primary focus:ring-primary-500 bg-transparent',
    gold:
      'bg-secondary-600 text-white hover:bg-secondary-500 focus:ring-secondary-500 shadow-sm',
  };

  const sizeClasses = {
    xs: 'px-2.5 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin h-4 w-4 flex-shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Saving…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default Button;
