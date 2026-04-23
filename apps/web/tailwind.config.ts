import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#3b82f6', foreground: '#ffffff' }
      }
    }
  },
  plugins: []
};
export default config;
