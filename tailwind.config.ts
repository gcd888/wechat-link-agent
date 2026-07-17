import type { Config } from 'tailwindcss'

export default {
  content: ['./renderer/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  darkMode: ['class', 'html[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        border: 'var(--color-border)',
        input: 'var(--color-input)',
        ring: 'var(--color-ring)',
        background: 'var(--color-bg-app)',
        foreground: 'var(--color-text)',
        muted: {
          DEFAULT: 'var(--color-bg-card)',
          foreground: 'var(--color-text-secondary)',
        },
        card: {
          DEFAULT: 'var(--color-bg-card)',
          foreground: 'var(--color-text)',
        },
        nav: {
          DEFAULT: 'var(--color-bg-nav)',
        },
        panel: {
          DEFAULT: 'var(--color-bg-panel)',
        },
        content: {
          DEFAULT: 'var(--color-bg-content)',
        },
        sidebar: {
          DEFAULT: 'var(--color-bg-panel)',
          hover: 'var(--color-bg-hover)',
          active: 'var(--color-bg-active)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
