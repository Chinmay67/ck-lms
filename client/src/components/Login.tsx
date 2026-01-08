import { useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { FaGraduationCap, FaLock, FaEnvelope } from 'react-icons/fa';
import { AuthAPI } from '../services/api';
import type { LoginCredentials } from '../services/api';
import Button from './ui/Button';
import Input from './ui/Input';
import Card from './ui/Card';

interface LoginProps {
  onLoginSuccess: () => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
  });
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await AuthAPI.login(credentials);
      
      if (response.success && response.data) {
        console.log('Login successful:', response.data.user);
        onLoginSuccess();
      } else {
        setError(response.error || 'Login failed. Please try again.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(
        err.response?.data?.error || 
        'Failed to login. Please check your credentials and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-navy-gold p-4">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8 animate-slide-down">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-secondary rounded-2xl shadow-gold-lg mb-4">
            <FaGraduationCap className="text-white text-4xl" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">GyanVibe</h1>
          <p className="text-primary-100 font-medium">Learning Management System</p>
        </div>

        <Card className="p-8 space-y-6 shadow-navy-lg border border-primary-100/20">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-text-primary mb-2">Welcome Back</h2>
            <p className="text-text-secondary">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm animate-slide-down">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-semibold text-text-primary">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaEnvelope className="text-text-tertiary" />
                </div>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@chessklub.com"
                  value={credentials.email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setCredentials({ ...credentials, email: e.target.value })}
                  required
                  disabled={loading}
                  className="w-full pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold text-text-primary">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaLock className="text-text-tertiary" />
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={credentials.password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setCredentials({ ...credentials, password: e.target.value })}
                  required
                  disabled={loading}
                  className="w-full pl-10"
                />
              </div>
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

          <div className="text-center text-sm text-text-secondary bg-primary-50 rounded-xl p-4 border border-primary-100">
            <p className="font-medium text-text-primary mb-1">Default credentials:</p>
            <p className="font-mono text-xs text-primary-600">
              admin@chessklub.com / Admin@123
            </p>
          </div>
        </Card>

        <p className="text-center text-primary-200 text-sm mt-6">
          © 2024 GyanVibe. All rights reserved.
        </p>
      </div>
    </div>
  );
}
