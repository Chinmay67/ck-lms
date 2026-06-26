import { useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { GraduationCap, Lock, Mail, AlertCircle } from 'lucide-react';
import { AuthAPI } from '../services/api';
import type { LoginCredentials } from '../services/api';
import Button from './ui/Button';
import Input from './ui/Input';
import Card from './ui/Card';
import { getErrorMessage, isNetworkError } from '../utils/errorHandler';

interface LoginProps {
  onLoginSuccess: () => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
  });
  const [error, setError] = useState<string>('');
  const [errorType, setErrorType] = useState<'validation' | 'auth' | 'network' | 'general'>('general');
  const [loading, setLoading] = useState(false);

  // Client-side validation
  const validateForm = (): string | null => {
    if (!credentials.email.trim()) {
      return 'Please enter your email address';
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(credentials.email.trim())) {
      return 'Please enter a valid email address';
    }
    
    if (!credentials.password) {
      return 'Please enter your password';
    }
    
    if (credentials.password.length < 6) {
      return 'Password must be at least 6 characters';
    }
    
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorType('general');

    // Client-side validation first
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      setErrorType('validation');
      return;
    }

    setLoading(true);

    try {
      const response = await AuthAPI.login({
        email: credentials.email.trim().toLowerCase(),
        password: credentials.password,
      });
      
      if (response.success && response.data) {
        console.log('Login successful:', response.data.user);
        onLoginSuccess();
      } else {
        setError(response.error || 'Login failed. Please try again.');
        setErrorType('auth');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      
      if (isNetworkError(err)) {
        setError('Unable to connect to the server. Please check your internet connection and try again.');
        setErrorType('network');
      } else {
        const errorMessage = getErrorMessage(err);
        setError(errorMessage);
        setErrorType('auth');
      }
    } finally {
      setLoading(false);
    }
  };

  const getErrorIcon = () => {
    switch (errorType) {
      case 'network':
        return '🌐';
      case 'validation':
        return '⚠️';
      default:
        return <AlertCircle className="inline mr-2 w-4 h-4" />;
    }
  };

  const getErrorBgColor = () => {
    switch (errorType) {
      case 'network':
        return 'bg-secondary-600/10 border-secondary-600/20 text-secondary-400';
      case 'validation':
        return 'bg-secondary-600/10 border-secondary-600/20 text-secondary-400';
      default:
        return 'bg-error-600/10 border-error-600/20 text-red-400';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8 animate-slide-down">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-600 rounded-lg shadow-navy mb-4">
            <GraduationCap className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1 tracking-tight">Chess Klub</h1>
          <p className="text-text-tertiary text-sm">Admin Operations Panel</p>
        </div>

        <Card variant="elevated" className="p-6 space-y-5">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-text-primary mb-1 tracking-tight">Welcome back</h2>
            <p className="text-text-tertiary text-sm">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className={`${getErrorBgColor()} border px-4 py-3 rounded-xl text-sm animate-slide-down flex items-start`}>
                <span className="mr-2 flex-shrink-0">{getErrorIcon()}</span>
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-medium text-text-secondary tracking-wide">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="admin@chessklub.com"
                value={credentials.email}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCredentials({ ...credentials, email: e.target.value })}
                required
                disabled={loading}
                leftIcon={<Mail className="w-4 h-4" />}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-medium text-text-secondary tracking-wide">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={credentials.password}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCredentials({ ...credentials, password: e.target.value })}
                required
                disabled={loading}
                leftIcon={<Lock className="w-4 h-4" />}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="w-full py-3 text-base font-semibold"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </Card>

        <p className="text-center text-text-tertiary text-xs mt-6">
          Chess Klub LMS
        </p>
      </div>
    </div>
  );
}
