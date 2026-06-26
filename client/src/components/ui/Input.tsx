import { type InputHTMLAttributes, forwardRef, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-medium text-text-secondary mb-1.5 tracking-wide">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-tertiary">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full h-9 bg-surface-alt border rounded-lg text-sm text-text-primary
              placeholder:text-text-tertiary
              focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors duration-150
              ${error ? 'border-error-600 focus:ring-error-600' : 'border-white/10 hover:border-white/20'}
              ${leftIcon ? 'pl-9 pr-3' : 'px-3'}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-xs text-error-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-xs text-text-tertiary">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
