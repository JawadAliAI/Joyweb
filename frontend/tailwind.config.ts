import type { Config } from 'tailwindcss';

/**
 * Every colour resolves to a CSS variable defined in `src/app/globals.css`.
 * Nothing in the component tree may hard-code a hex value — re-theming the
 * product is a matter of changing those variables (which the admin branding
 * settings do at runtime).
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
          muted: 'rgb(var(--color-primary) / 0.12)',
        },
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        success: 'rgb(var(--color-primary) / <alpha-value>)',
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
        muted: 'rgb(var(--color-fg-muted) / <alpha-value>)',
        subtle: 'rgb(var(--color-fg-subtle) / <alpha-value>)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
        pill: '999px',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display': ['2.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'balance': ['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
      },
      spacing: {
        'nav': 'var(--bottom-nav-height)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.24)',
        raised: '0 8px 24px -8px rgb(0 0 0 / 0.5)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'sheet-up': 'sheet-up 240ms cubic-bezier(0.32, 0.72, 0, 1)',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
