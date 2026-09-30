import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // `xs` couvre les iPhone SE / mini (320–374 px), où deux colonnes de
      // tuiles ne tiennent plus sans rogner les montants.
      screens: {
        xs: '375px',
      },
      colors: {
        brand: {
          DEFAULT: '#7c3aed',
          light:   '#a78bfa',
          dark:    '#5b21b6',
        },
      },
      // Zones sûres iOS/Android exposées comme espacements : `pt-safe-top`,
      // `pb-safe-bottom`, `pb-tabbar`. Les variables sont définies dans
      // index.css avec un repli à 0 pour les navigateurs sans encoche.
      spacing: {
        'safe-top':    'var(--safe-top)',
        'safe-bottom': 'var(--safe-bottom)',
        'safe-left':   'var(--safe-left)',
        'safe-right':  'var(--safe-right)',
        tabbar:        'var(--tabbar-height)',
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
