import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#7c3aed',
          light:   '#a78bfa',
          dark:    '#5b21b6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'float':      'float 6s ease-in-out infinite',
        'fade-in':    'fadeIn 0.4s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)'  },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)'    },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
} satisfies Config
