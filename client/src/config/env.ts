/**
 * Environment Configuration
 * This module provides type-safe access to environment variables
 */

interface EnvConfig {
  APP_ENV: 'development' | 'production';
  API_BASE_URL: string;
  APP_NAME: string;
  REQUEST_TIMEOUT: number;
  isDevelopment: boolean;
  isProduction: boolean;
}

/**
 * Validate and get environment variable
 */
function getEnvVar(key: string, defaultValue?: string): string {
  const value = import.meta.env[key];
  if (value === undefined && defaultValue === undefined) {
    console.warn(`Environment variable ${key} is not defined`);
    return '';
  }
  return value || defaultValue || '';
}

/**
 * Parse environment configuration
 */
const parseEnvConfig = (): EnvConfig => {
  const appEnv = getEnvVar('VITE_APP_ENV', 'development') as 'development' | 'production';
  const apiBaseUrl = getEnvVar('VITE_API_BASE_URL', 'http://localhost:3000/api');
  const appName = getEnvVar('VITE_APP_NAME', 'CK-LMS');
  const requestTimeout = parseInt(getEnvVar('VITE_REQUEST_TIMEOUT', '10000'), 10);

  return {
    APP_ENV: appEnv,
    API_BASE_URL: apiBaseUrl,
    APP_NAME: appName,
    REQUEST_TIMEOUT: requestTimeout,
    isDevelopment: appEnv === 'development',
    isProduction: appEnv === 'production',
  };
};

/**
 * Environment configuration object
 * All environment variables should be accessed through this object
 */
export const env = parseEnvConfig();

/**
 * Log environment info in development
 */
if (env.isDevelopment) {
  console.log('🔧 Environment Configuration:', {
    environment: env.APP_ENV,
    apiBaseUrl: env.API_BASE_URL,
    appName: env.APP_NAME,
    timeout: env.REQUEST_TIMEOUT,
  });
}

export default env;
