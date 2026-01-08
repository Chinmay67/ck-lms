/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Navy Blue - Primary
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#1e3a8a',  // Navy Blue - Main Primary
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#172554',
        },
        // Gold - Secondary
        secondary: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',  // Gold - Main Secondary
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Emerald - Accent
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',  // Emerald - Main Accent
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // Backgrounds
        background: '#fefce8',
        surface: '#ffffff',
        'surface-alt': '#f8fafc',
        // Text
        'text-primary': '#1e293b',
        'text-secondary': '#64748b',
        'text-tertiary': '#94a3b8',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
        'gradient-secondary': 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
        'gradient-accent': 'linear-gradient(135deg, #059669 0%, #047857 100%)',
        'gradient-navy-gold': 'linear-gradient(135deg, #1e3a8a 0%, #d97706 100%)',
        'gradient-gold-emerald': 'linear-gradient(135deg, #d97706 0%, #059669 100%)',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(30, 58, 138, 0.3)',
        'glow-lg': '0 0 30px rgba(30, 58, 138, 0.5)',
        'navy': '0 4px 14px 0 rgba(30, 58, 138, 0.15)',
        'navy-lg': '0 10px 25px -5px rgba(30, 58, 138, 0.2), 0 8px 10px -6px rgba(30, 58, 138, 0.1)',
        'gold': '0 4px 14px 0 rgba(217, 119, 6, 0.15)',
        'gold-lg': '0 10px 25px -5px rgba(217, 119, 6, 0.2), 0 8px 10px -6px rgba(217, 119, 6, 0.1)',
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-in-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
