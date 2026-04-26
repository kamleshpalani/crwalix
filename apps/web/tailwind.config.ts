import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#b6d4ff',
          300: '#85b6ff',
          400: '#5290ff',
          500: '#2f6cff',
          600: '#1f4cf0',
          700: '#1a3ad1',
          800: '#1a32a8',
          900: '#1a2f87',
          DEFAULT: '#2f6cff',
          foreground: '#ffffff'
        },
        ink: {
          50: '#f7f8fb',
          100: '#eef0f6',
          200: '#dee2ec',
          300: '#c5cbdb',
          400: '#9aa2b8',
          500: '#6b7390',
          600: '#4a5170',
          700: '#363a55',
          800: '#252840',
          900: '#15172b'
        }
      },
      fontFamily: {
        sans: [
          'InterVariable',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif'
        ],
        display: ['InterVariable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        glass:
          '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px -8px rgba(15,23,42,0.12), 0 2px 6px -2px rgba(15,23,42,0.06)',
        'glass-lg':
          '0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 56px -16px rgba(15,23,42,0.18), 0 6px 16px -8px rgba(15,23,42,0.08)',
        glow: '0 10px 40px -10px rgba(47,108,255,0.45)'
      },
      backgroundImage: {
        'gradient-aurora':
          'radial-gradient(60% 60% at 20% 10%, rgba(120,160,255,0.35) 0%, rgba(120,160,255,0) 60%), radial-gradient(50% 50% at 90% 0%, rgba(180,140,255,0.30) 0%, rgba(180,140,255,0) 65%), radial-gradient(60% 60% at 80% 90%, rgba(140,220,255,0.30) 0%, rgba(140,220,255,0) 60%), linear-gradient(180deg, #f6f8ff 0%, #eef1fb 100%)',
        'gradient-brand': 'linear-gradient(135deg, #2f6cff 0%, #7a5cff 100%)'
      },
      keyframes: {
        floatSlow: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        }
      },
      animation: {
        'float-slow': 'floatSlow 8s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite'
      }
    }
  },
  plugins: [forms]
};
export default config;
