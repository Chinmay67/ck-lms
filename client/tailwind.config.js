/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#e8eeff',
          100: '#c7d4ff',
          200: '#99aeff',
          300: '#6683ff',
          400: '#4060f5',
          500: '#2c4de8',
          600: '#1e3a8a',
          700: '#172d75',
          800: '#101e55',
          900: '#090f30',
        },
        secondary: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
          400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309',
          800: '#92400e', 900: '#78350f',
        },
        accent: {
          50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7',
          400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857',
          800: '#065f46', 900: '#064e3b',
        },
        error: { 50: '#fef2f2', 100: '#fee2e2', 600: '#dc2626', 700: '#b91c1c' },
        warning: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706' },
        success: { 100: '#d1fae5', 600: '#059669', 700: '#047857', 800: '#065f46' },
        background: '#0d0f14',
        surface: '#13161e',
        'surface-alt': '#1a1e28',
        'surface-hover': '#1f2433',
        border: 'rgba(255,255,255,0.07)',
        'text-primary': '#f0f2f7',
        'text-secondary': '#8b95a8',
        'text-tertiary': '#4e5768',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #1e3a8a 0%, #2c4de8 100%)',
        'gradient-secondary': 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
        'gradient-accent': 'linear-gradient(135deg, #059669 0%, #047857 100%)',
        'gradient-navy-gold': 'linear-gradient(135deg, #1e3a8a 0%, #d97706 100%)',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(44, 77, 232, 0.35)',
        'glow-lg': '0 0 35px rgba(44, 77, 232, 0.5)',
        'navy': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'navy-lg': '0 4px 16px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)',
        'gold': '0 4px 14px rgba(217,119,6,0.2)',
        'gold-lg': '0 10px 25px rgba(217,119,6,0.25)',
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'slide-down': 'slide-down 0.25s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up': { '0%': { transform: 'translateY(12px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        'slide-down': { '0%': { transform: 'translateY(-12px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        'scale-in': { '0%': { transform: 'scale(0.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
    },
  },
  plugins: [],
}
