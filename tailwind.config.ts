// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        heebo: ['var(--font-heebo)', 'sans-serif'],
      },
      colors: {
        // Admin design system (Modern Minimal). The CSS variables are defined only inside
        // .admin-ui (src/app/globals.css), so these classes never style the TV display.
        ui: {
          bg: 'var(--ui-bg)',
          surface: 'var(--ui-surface)',
          subtle: 'var(--ui-surface-subtle)',
          border: 'var(--ui-border)',
          'border-strong': 'var(--ui-border-strong)',
          ink: 'var(--ui-ink)',
          'ink-2': 'var(--ui-ink-2)',
          muted: 'var(--ui-muted)',
          faint: 'var(--ui-faint)',
          primary: 'var(--ui-primary)',
          'primary-hover': 'var(--ui-primary-hover)',
          'primary-soft': 'var(--ui-primary-soft)',
          'primary-line': 'var(--ui-primary-line)',
          'primary-ink': 'var(--ui-primary-ink)',
          success: 'var(--ui-success)',
          'success-soft': 'var(--ui-success-soft)',
          warning: 'var(--ui-warning)',
          'warning-soft': 'var(--ui-warning-soft)',
          danger: 'var(--ui-danger)',
          'danger-hover': 'var(--ui-danger-hover)',
          'danger-soft': 'var(--ui-danger-soft)',
        },
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
        // Admin design system (Modern Minimal); values come from the .admin-ui tokens.
        'ui-sm': 'var(--ui-radius-sm)',
        'ui': 'var(--ui-radius)',
        'ui-lg': 'var(--ui-radius-lg)',
      },
      boxShadow: {
        'ui': 'var(--ui-shadow)',
        'ui-lg': 'var(--ui-shadow-lg)',
      },
    },
  },
  plugins: [],
}

export default config
