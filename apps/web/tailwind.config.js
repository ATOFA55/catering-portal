/** Design tokens follow the reference dashboard in the requirements (UI-02, UI-07). */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1E2A36', 2: '#37414B', 3: '#5A6B7B', 4: '#828C96' },
        brand: { 50: '#EEF6FB', 100: '#DEEEF8', 200: '#BCDCF0', 400: '#5AA3D0', 500: '#3A8DBE', 600: '#286E9B', 700: '#1F5A80', 800: '#18476A' },
        line: '#D7DDE3',
        canvas: '#F3F6F9',
        ok: { DEFAULT: '#2E8B57', bg: '#E6F4EA' },
        warn: { DEFAULT: '#C77700', bg: '#FFF3D6' },
        bad: { DEFAULT: '#C0392B', bg: '#FDE8E8' },
      },
      fontFamily: { sans: ['Inter', 'Cairo', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(30,42,54,.06), 0 1px 3px rgba(30,42,54,.08)' },
    },
  },
  plugins: [],
};
