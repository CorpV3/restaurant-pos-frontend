/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        pos: {
          primary: '#f97316',
          bg: '#111827',
          card: '#1f2937',
          border: '#374151',
        },
      },
    },
  },
  plugins: [],
}
