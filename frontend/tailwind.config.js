/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4fb',
          100: '#d9e6f5',
          200: '#b8cfea',
          300: '#8cb1db',
          400: '#5d8cc8',
          500: '#3b6db3',
          600: '#2c5696',
          700: '#25467a',
          800: '#223c65',
          900: '#1f3454',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
}
