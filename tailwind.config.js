/**
 *  @type {import('tailwindcss').Config}
 */
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  // safelist removed to avoid warnings for custom classes
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#47ada8',
          accent: '#d3bc8e',
          dark: '#1d3940'
        },
        yz: {
          bg: '#f0ebe3',
          card: '#ffffff',
          gold: '#d3bc8e',
          'gold-light': '#e8d5b0',
          'gold-dark': '#4a3a20',
          blue: '#5b7fc7',
          'blue-bg': '#eef2fb',
          green: '#5aab76',
          'green-bg': '#edf7f0',
          orange: '#d48c3e',
          'orange-bg': '#fdf4e8',
          red: '#c75b5b',
          'red-bg': '#fbeef0',
          gray: '#888888',
          text: '#1e1f20',
          sub: '#877254'
        }
      },
      boxShadow: {
        card: '0 5px 10px 0 rgba(0,0,0,0.15)'
      }
    }
  }
};
