import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Glass-specific palette
        glass: {
          white:  'rgba(255,255,255,0.05)',
          border: 'rgba(255,255,255,0.10)',
          hover:  'rgba(255,255,255,0.08)',
        },
        // Design-token semantic colors (auto-switch via CSS vars)
        canvas: {
          DEFAULT: 'rgb(var(--canvas) / <alpha-value>)',
          subtle:  'rgb(var(--canvas-subtle) / <alpha-value>)',
        },
        'ui-border': {
          DEFAULT: 'rgb(var(--ui-border) / <alpha-value>)',
          subtle:  'rgb(var(--ui-border-subtle) / <alpha-value>)',
        },
        fg: {
          DEFAULT:   'rgb(var(--fg) / <alpha-value>)',
          secondary: 'rgb(var(--fg-secondary) / <alpha-value>)',
          muted:     'rgb(var(--fg-muted) / <alpha-value>)',
          subtle:    'rgb(var(--fg-subtle) / <alpha-value>)',
        },
        shimmer: {
          DEFAULT: 'rgb(var(--shimmer) / <alpha-value>)',
          subtle:  'rgb(var(--shimmer-subtle) / <alpha-value>)',
        },
      },
      backgroundImage: {
        'glass-gradient':  'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
        'purple-glow':     'radial-gradient(ellipse at center, rgba(139,92,246,0.25) 0%, transparent 70%)',
        'app-gradient':    'linear-gradient(135deg, #0f172a 0%, #1e1035 50%, #0f172a 100%)',
        'stat-gradient-1': 'linear-gradient(135deg, rgba(139,92,246,0.20) 0%, rgba(59,130,246,0.12) 100%)',
        'stat-gradient-2': 'linear-gradient(135deg, rgba(16,185,129,0.20) 0%, rgba(5,150,105,0.12) 100%)',
        'stat-gradient-3': 'linear-gradient(135deg, rgba(245,158,11,0.20) 0%, rgba(249,115,22,0.12) 100%)',
        'stat-gradient-4': 'linear-gradient(135deg, rgba(239,68,68,0.20) 0%, rgba(220,38,38,0.12) 100%)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '1rem',
        '2xl': '1.25rem',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass:        '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glass-lg':   '0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.10)',
        'glass-sm':   '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        'purple-glow':'0 0 40px rgba(139,92,246,0.3)',
        'blue-glow':  '0 0 40px rgba(59,130,246,0.3)',
      },
      backdropBlur: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '28px',
        '3xl': '40px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'slide-right': {
          from: { opacity: '0', transform: 'translateX(-16px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'glass-shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 12px rgba(139,92,246,0.3)' },
          '50%':       { boxShadow: '0 0 28px rgba(139,92,246,0.65)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-6px)' },
        },
        'count-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down':  'accordion-down 0.2s ease-out',
        'accordion-up':    'accordion-up 0.2s ease-out',
        'fade-up':         'fade-up 0.5s ease-out both',
        'fade-in':         'fade-in 0.3s ease-out both',
        'scale-in':        'scale-in 0.25s ease-out both',
        'slide-right':     'slide-right 0.4s ease-out both',
        'glass-shimmer':   'glass-shimmer 1.6s ease-in-out infinite',
        'pulse-glow':      'pulse-glow 2.4s ease-in-out infinite',
        float:             'float 4s ease-in-out infinite',
        'count-up':        'count-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
