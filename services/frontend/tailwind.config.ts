import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        term: {
          bg:     '#0a0a0a',
          green:  '#33ff00',
          amber:  '#ffb000',
          muted:  '#1f521f',
          dim:    '#0d2e0d',
          error:  '#ff3333',
          border: '#1f521f',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0px',
        none: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        full: '0px',
      },
      keyframes: {
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      animation: {
        blink: 'blink 1s step-end infinite',
        'blink-fast': 'blink 0.5s step-end infinite',
      },
    },
  },
  plugins: [],
};

export default config;
