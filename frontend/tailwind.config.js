/**
 * @type {import('tailwindcss/types/config').Config}
 */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        xs: '320px',
        lg: '860px'
      }
    }
  }
};
