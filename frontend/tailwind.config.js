/**
 * Design tokens from docs/ui-design-system.md (binding).
 * Colours are replaced, not extended: only these palettes exist.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#FFFFFF',
      neutral: {
        0: '#FFFFFF',
        50: '#FAFAF9',
        100: '#F5F5F4',
        200: '#E7E5E4',
        300: '#D6D3D1',
        400: '#A8A29E',
        500: '#78716C',
        600: '#57534E',
        700: '#44403C',
        800: '#292524',
        900: '#1C1917',
      },
      accent: {
        50: '#EEF3F8',
        100: '#D6E1EC',
        200: '#ADC3D9',
        600: '#264A73',
        700: '#1E3A5F',
        800: '#182F4D',
        900: '#12243B',
      },
      red: { 50: '#FEF3F2', 300: '#FDA29B', 500: '#D92D20', 600: '#B42318' },
      amber: { 50: '#FFFAEB', 500: '#F79009', 700: '#B54708' },
      green: { 50: '#ECFDF3', 500: '#17B26A', 700: '#067647' },
    },
    fontFamily: {
      sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
    },
    fontSize: {
      xs: ['12px', '16px'],
      sm: ['13px', '20px'],
      base: ['14px', '21px'],
      md: ['16px', '24px'],
      lg: ['20px', '28px'],
      xl: ['24px', '32px'],
    },
    fontWeight: { normal: '400', medium: '500', semibold: '600' },
    borderRadius: {
      none: '0',
      sm: '4px',
      DEFAULT: '4px',
      md: '6px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      overlay: '0 4px 12px rgba(28, 25, 23, 0.08)',
    },
    extend: {
      transitionDuration: { DEFAULT: '150ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0, 0, 0.2, 1)' },
      keyframes: {
        enter: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'enter-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        enter: 'enter 150ms cubic-bezier(0, 0, 0.2, 1)',
        'enter-up': 'enter-up 150ms cubic-bezier(0, 0, 0.2, 1)',
      },
      maxWidth: { content: '1280px' },
      width: { sidebar: '232px', 'sidebar-collapsed': '64px' },
      spacing: { sidebar: '232px', 'sidebar-collapsed': '64px' },
    },
  },
  plugins: [],
}
